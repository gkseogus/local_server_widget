//! 서버 프로세스 시작·종료.

use crate::contents::process as msg;
use crate::model::ResolvedService;
use std::env;
use std::fs::{self, OpenOptions};
use std::io::{self, Write};
use std::os::unix::fs::OpenOptionsExt;
use std::os::unix::process::CommandExt;
use std::path::Path;
use std::process::{Child, Command, Stdio};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

/// SIGTERM → 이만큼 기다림 → SIGKILL.
pub const STOP_GRACE: Duration = Duration::from_secs(3);

/// 로그 파일 권한. 서버 출력에 토큰 등이 찍힐 수 있어 본인만 읽는다.
pub const LOG_FILE_MODE: u32 = 0o600;

/// 시작할 때 로그가 이보다 크면 `<name>.log.1` 로 넘긴다.
const LOG_MAX_BYTES: u64 = 10 * 1024 * 1024;

/// 종료 여부 확인 간격.
const POLL: Duration = Duration::from_millis(100);
/// SIGKILL 이후 그룹이 사라지길 기다리는 최대 시간.
const KILL_WAIT: Duration = Duration::from_secs(2);

/// 위젯이 띄운 프로세스 트리. 자기 세션·그룹이라 `pgid == child.id()`.
#[derive(Debug)]
pub struct ManagedProcess {
    pub child: Child,
    pub pgid: u32,
}

/// 사용자의 로그인+인터랙티브 셸로 `svc.command` 를 새 세션(setsid)에서 실행한다.
/// cwd = `svc.cwd`, env = 상속 env 위에 `svc.env`, stdin 없음,
/// stdout+stderr 는 `log_path` 에 덧붙임(상위 폴더 생성, 너무 크면 먼저 `.1` 로 넘김).
pub fn spawn(svc: &ResolvedService, log_path: &Path) -> Result<ManagedProcess, String> {
    let log_err = |e: io::Error| msg::log_prepare_failed(log_path, e);
    if let Some(dir) = log_path.parent() {
        fs::create_dir_all(dir).map_err(log_err)?;
    }
    rotate_log(log_path, LOG_MAX_BYTES).map_err(log_err)?;
    let mut log = OpenOptions::new()
        .create(true)
        .append(true)
        .mode(LOG_FILE_MODE)
        .open(log_path)
        .map_err(log_err)?;
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| d.as_secs());
    writeln!(log, "=== {secs} start {}: {} ===", svc.id, svc.command).map_err(log_err)?;
    let log_stderr = log.try_clone().map_err(log_err)?;

    // GUI 앱은 PATH 가 최소한이라 로그인+인터랙티브 셸로 rc 파일(nvm, pyenv 등)을 읽힌다.
    let shell = env::var_os("SHELL")
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "/bin/zsh".into());
    let mut cmd = Command::new(shell);
    cmd.arg("-ilc")
        .arg(format!("exec {}", svc.command))
        .current_dir(&svc.cwd)
        .envs(&svc.env)
        .stdin(Stdio::null())
        .stdout(log)
        .stderr(log_stderr);
    // 자식에서 훑을 fd 상한은 fork 전에 구한다.
    // ponytail: 65 536 이상 번호의 fd 는 건드리지 않음. 그렇게 많이 열 일이 생기면 상한을 올릴 것.
    // SAFETY: sysconf 는 인자 값만 읽는다.
    let max_fd = unsafe { libc::sysconf(libc::_SC_OPEN_MAX) }.clamp(256, 65_536) as libc::c_int;
    // process_group(0) 대신 setsid: 위젯이 터미널에서 실행되면(tauri dev) 인터랙티브 zsh 가
    // 그 터미널을 잡으려다 SIGTTOU 로 정지한다. 새 세션은 제어 터미널이 없고 pgid == pid 도 같다.
    // SAFETY: fork 이후 exec 이전에는 async-signal-safe 인 setsid·fcntl 만 호출한다.
    unsafe {
        cmd.pre_exec(move || {
            if libc::setsid() == -1 {
                return Err(io::Error::last_os_error());
            }
            // macOS 의 std 는 CLOEXEC 를 생성과 따로 걸어서, 다른 스레드가 막 만든 lsof·ps 파이프가
            // 그 사이 fork 되면 서버로 새어 파이프가 닫히지 않고 상태 조회가 멈춘다. 3 이상 모든 fd 를
            // exec 때 닫히게 표시한다. 열려 있지 않은 번호의 EBADF 는 무시한다.
            for fd in 3..max_fd {
                libc::fcntl(fd, libc::F_SETFD, libc::FD_CLOEXEC);
            }
            Ok(())
        });
    }
    let child = cmd.spawn().map_err(|e| msg::spawn_failed(&svc.id, e))?;
    let pgid = child.id();
    Ok(ManagedProcess { child, pgid })
}

/// `path` 가 `limit` 바이트보다 크면 `<path>.1` 로 옮긴다(이전 `.1` 은 덮어씀). 없으면 그대로.
fn rotate_log(path: &Path, limit: u64) -> io::Result<()> {
    if fs::metadata(path).is_ok_and(|m| m.len() > limit) {
        let mut old = path.as_os_str().to_owned();
        old.push(".1");
        fs::rename(path, old)?;
    }
    Ok(())
}

/// 리더가 아직 실행 중인가. 끝났으면 try_wait 로 회수한다.
pub fn is_alive(p: &mut ManagedProcess) -> bool {
    matches!(p.child.try_wait(), Ok(None))
}

/// 프로세스 그룹 전체에 SIGTERM, `grace` 동안 모든 멤버 종료를 기다린 뒤(리더 회수 포함)
/// SIGKILL 하고 잠깐 더 기다린다. 그룹이 사라지면 Ok.
pub fn stop_managed(p: &mut ManagedProcess, grace: Duration) -> Result<(), String> {
    let pgid = checked_id(p.pgid)?;
    // 리더가 회수된 뒤에는 pgid 가 재사용될 수 있어, 호출부(ops::stop)가 리더 생존 또는
    // 그룹 멤버가 아직 포트를 잡고 있을 때만 이 함수를 부른다.
    send(-pgid, libc::SIGTERM);
    // 좀비 리더가 그룹을 붙잡고 있지 않도록 매번 회수한 뒤 확인한다.
    let mut group_gone = || {
        let _ = p.child.try_wait();
        gone(-pgid)
    };
    if wait_until(grace, &mut group_gone) {
        return Ok(());
    }
    send(-pgid, libc::SIGKILL);
    if wait_until(KILL_WAIT, &mut group_gone) {
        return Ok(());
    }
    Err(msg::stop_group_failed(pgid))
}

/// 위젯이 띄우지 않은 프로세스용: pid 마다 SIGTERM, `grace` 뒤 남은 것만 SIGKILL.
/// 프로세스 그룹에는 절대 신호를 보내지 않는다.
pub fn stop_pids(pids: &[u32], grace: Duration) -> Result<(), String> {
    // 하나라도 보호 대상이면 아무 신호도 보내지 않는다.
    let pids = pids
        .iter()
        .map(|&pid| checked_id(pid))
        .collect::<Result<Vec<i32>, String>>()?;
    for &pid in &pids {
        send(pid, libc::SIGTERM);
    }
    let all_gone = || pids.iter().all(|&pid| gone(pid));
    if !wait_until(grace, all_gone) {
        for &pid in pids.iter().filter(|&&pid| !gone(pid)) {
            send(pid, libc::SIGKILL);
        }
        wait_until(KILL_WAIT, all_gone);
    }
    let alive: Vec<String> = pids
        .iter()
        .filter(|&&pid| !gone(pid))
        .map(|pid| pid.to_string())
        .collect();
    if alive.is_empty() {
        Ok(())
    } else {
        Err(msg::stop_pids_failed(&alive.join(", ")))
    }
}

/// 신호를 보내도 되는 pid/pgid 인지 확인한다. 0·1·자기 자신(pid, pgid)과
/// i32 로 바꾸면 음수가 되는 값(kill(-1) = 모든 프로세스)은 거부한다.
fn checked_id(id: u32) -> Result<i32, String> {
    // SAFETY: getpgrp 는 인자가 없고 실패하지 않는다.
    let own_pgid = unsafe { libc::getpgrp() } as u32;
    match i32::try_from(id) {
        Ok(v) if v > 1 && id != std::process::id() && id != own_pgid => Ok(v),
        _ => Err(msg::protected_id(id)),
    }
}

/// kill(2) 래퍼. 음수 target 은 프로세스 그룹. 실패(ESRCH 등)는 이후 확인 단계에서 판단한다.
fn send(target: i32, sig: i32) {
    // SAFETY: target 은 checked_id 를 거친 값(또는 그 음수)이다.
    unsafe { libc::kill(target, sig) };
}

/// 대상이 더 이상 없는가. ESRCH 만 "없음"이고 EPERM 은 아직 존재하는 것으로 본다.
fn gone(target: i32) -> bool {
    // SAFETY: 신호 0 은 존재 여부만 확인한다.
    let failed = unsafe { libc::kill(target, 0) } == -1;
    failed && io::Error::last_os_error().raw_os_error() == Some(libc::ESRCH)
}

/// `done` 이 true 가 될 때까지 최대 `limit` 동안 POLL 간격으로 확인한다.
fn wait_until(limit: Duration, mut done: impl FnMut() -> bool) -> bool {
    let end = Instant::now() + limit;
    loop {
        if done() {
            return true;
        }
        if Instant::now() >= end {
            return false;
        }
        thread::sleep(POLL);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::{TcpListener, TcpStream};
    use std::os::fd::AsRawFd;
    use std::os::unix::fs::PermissionsExt;
    use std::os::unix::process::ExitStatusExt;
    use std::path::PathBuf;
    use tempfile::TempDir;

    /// 테스트가 중간에 실패해도 띄운 프로세스 그룹을 정리한다.
    struct Guard {
        p: ManagedProcess,
        done: bool,
    }

    impl Guard {
        fn stop(&mut self, grace: Duration) -> Result<(), String> {
            let res = stop_managed(&mut self.p, grace);
            self.done = res.is_ok();
            res
        }
    }

    impl Drop for Guard {
        fn drop(&mut self) {
            if !self.done {
                let _ = stop_managed(&mut self.p, Duration::ZERO);
            }
        }
    }

    fn service(cwd: &Path, command: &str, env: &[(&str, &str)]) -> ResolvedService {
        ResolvedService {
            id: "test/svc".into(),
            group: "test".into(),
            name: "svc".into(),
            cwd: cwd.to_path_buf(),
            port: 0,
            url: String::new(),
            command: command.into(),
            env: env
                .iter()
                .map(|(k, v)| (k.to_string(), v.to_string()))
                .collect(),
        }
    }

    fn start(dir: &TempDir, command: &str, env: &[(&str, &str)]) -> (Guard, PathBuf) {
        let log = dir.path().join("logs/svc.log");
        let p = spawn(&service(dir.path(), command, env), &log).expect("spawn");
        (Guard { p, done: false }, log)
    }

    /// 파일에 `needle` 이 나타날 때까지 기다린 뒤 내용을 돌려준다.
    fn wait_for_text(path: &Path, needle: &str) -> String {
        let mut text = String::new();
        let found = wait_until(Duration::from_secs(15), || {
            text = fs::read_to_string(path).unwrap_or_default();
            text.contains(needle)
        });
        assert!(
            found,
            "{} 에 {needle:?} 이 나타나지 않음: {text:?}",
            path.display()
        );
        text
    }

    fn free_port() -> u16 {
        TcpListener::bind("127.0.0.1:0")
            .unwrap()
            .local_addr()
            .unwrap()
            .port()
    }

    #[test]
    fn http_server_starts_and_stops_gracefully() {
        let dir = TempDir::new().unwrap();
        let port = free_port();
        let (mut g, _) = start(
            &dir,
            &format!("python3 -m http.server {port} --bind 127.0.0.1"),
            &[],
        );
        let addr = format!("127.0.0.1:{port}");
        assert!(
            wait_until(Duration::from_secs(15), || TcpStream::connect(&addr)
                .is_ok()),
            "포트가 열리지 않음"
        );

        let t = Instant::now();
        g.stop(STOP_GRACE).unwrap();
        // SIGTERM 만으로 끝나야 한다(셸이 SIGTERM 을 무시 상태로 넘기지 않았다는 확인).
        assert!(
            t.elapsed() < STOP_GRACE,
            "SIGKILL 까지 갔음: {:?}",
            t.elapsed()
        );
        assert!(TcpStream::connect(&addr).is_err());
        assert!(gone(-(g.p.pgid as i32)));
    }

    #[test]
    fn injects_env_on_top_of_inherited() {
        let dir = TempDir::new().unwrap();
        let value = "http://localhost:1234 a=b";
        let (mut g, _) = start(
            &dir,
            r#"sh -c 'printf %s "$WIDGET_TEST" > out.txt; sleep 30'"#,
            &[("WIDGET_TEST", value)],
        );
        assert_eq!(wait_for_text(&dir.path().join("out.txt"), value), value);
        g.stop(STOP_GRACE).unwrap();
    }

    #[test]
    fn stop_kills_grandchildren() {
        let dir = TempDir::new().unwrap();
        let (mut g, _) = start(
            &dir,
            "sh -c 'sleep 300 & echo $! > child.pid; sleep 300'",
            &[],
        );
        let grandchild: i32 = wait_for_text(&dir.path().join("child.pid"), "\n")
            .trim()
            .parse()
            .unwrap();
        assert!(!gone(grandchild));
        g.stop(STOP_GRACE).unwrap();
        assert!(
            wait_until(KILL_WAIT, || gone(grandchild)),
            "손자 프로세스가 남아 있음"
        );
    }

    #[test]
    fn sigterm_ignoring_process_is_killed_after_grace() {
        let dir = TempDir::new().unwrap();
        let (mut g, _) = start(
            &dir,
            r#"sh -c 'trap "" TERM; echo ready > ready.txt; sleep 300'"#,
            &[],
        );
        wait_for_text(&dir.path().join("ready.txt"), "ready");
        let grace = Duration::from_millis(500);
        let t = Instant::now();
        g.stop(grace).unwrap();
        assert!(t.elapsed() >= grace);
        assert!(gone(-(g.p.pgid as i32)));
    }

    #[test]
    fn log_has_header_and_output() {
        let dir = TempDir::new().unwrap();
        let (mut g, log) = start(&dir, "sh -c 'echo hello-log; sleep 30'", &[]);
        let text = wait_for_text(&log, "hello-log");
        assert!(text.starts_with("=== "), "{text:?}");
        assert!(
            text.contains(" start test/svc: sh -c 'echo hello-log; sleep 30' ==="),
            "{text:?}"
        );
        assert_eq!(
            fs::metadata(&log).unwrap().permissions().mode() & 0o777,
            LOG_FILE_MODE
        );
        g.stop(STOP_GRACE).unwrap();
    }

    #[test]
    fn rotate_log_moves_only_oversized_log() {
        let dir = TempDir::new().unwrap();
        let log = dir.path().join("svc.log");
        let old = dir.path().join("svc.log.1");
        rotate_log(&log, 4).unwrap(); // 없으면 아무것도 안 한다
        fs::write(&log, "1234").unwrap();
        rotate_log(&log, 4).unwrap();
        assert!(!old.exists(), "한도 이하면 그대로 둔다");

        fs::write(&old, "older").unwrap();
        fs::write(&log, "12345").unwrap();
        rotate_log(&log, 4).unwrap();
        assert!(!log.exists());
        assert_eq!(fs::read_to_string(&old).unwrap(), "12345");
    }

    #[test]
    fn child_does_not_inherit_widget_fds() {
        let dir = TempDir::new().unwrap();
        // 다른 스레드가 CLOEXEC 를 걸기 전에 fork 된 fd 를 흉내 낸다: 플래그를 지운 채 열어 둔다.
        let marker = fs::File::create(dir.path().join("leak-marker")).unwrap();
        // SAFETY: 열려 있는 fd 의 플래그만 바꾼다.
        assert_ne!(
            unsafe { libc::fcntl(marker.as_raw_fd(), libc::F_SETFD, 0) },
            -1
        );
        // sh 가 자기($$)의 열린 파일을 적는다. mv 로 다 쓴 뒤에만 fds.txt 가 보인다.
        let (mut g, _) = start(
            &dir,
            "sh -c '/usr/sbin/lsof -nP -p $$ -Fn > fds.tmp; mv fds.tmp fds.txt; sleep 30'",
            &[],
        );
        drop(marker);
        // stdout 인 로그 파일이 보이면 목록이 제대로 찍힌 것이다.
        let fds = wait_for_text(&dir.path().join("fds.txt"), "svc.log");
        assert!(!fds.contains("leak-marker"), "fd 가 서버로 샜다: {fds}");
        g.stop(STOP_GRACE).unwrap();
    }

    #[test]
    fn missing_command_exits_soon() {
        let dir = TempDir::new().unwrap();
        let (mut g, log) = start(&dir, "definitely-not-a-command-xyz", &[]);
        assert!(
            wait_until(Duration::from_secs(10), || !is_alive(&mut g.p)),
            "아직 살아 있음"
        );
        // 리더가 끝났고 자식도 없으니 정리할 것이 없다(재사용된 pgid 에 신호를 보내지 않도록).
        g.done = true;
        // 헤더 뒤에 셸의 "command not found" 가 남는다.
        assert!(fs::read_to_string(log).unwrap().contains("not found"));
    }

    #[test]
    fn spawn_fails_with_clear_error_for_missing_cwd() {
        let dir = TempDir::new().unwrap();
        let svc = service(&dir.path().join("missing"), "sleep 1", &[]);
        let err = spawn(&svc, &dir.path().join("svc.log")).unwrap_err();
        assert!(
            err.contains("test/svc") && err.contains("시작하지 못했습니다"),
            "{err}"
        );
    }

    #[test]
    fn stop_pids_terminates_plain_process() {
        let mut child = Command::new("sleep").arg("300").spawn().unwrap();
        let pid = child.id();
        // 우리 자식이라 회수해 줘야 좀비가 남지 않는다.
        let reaper = thread::spawn(move || child.wait().unwrap());
        let res = stop_pids(&[pid], Duration::from_secs(2));
        if res.is_err() {
            send(pid as i32, libc::SIGKILL);
        }
        let status = reaper.join().unwrap();
        res.unwrap();
        assert_eq!(status.signal(), Some(libc::SIGTERM));
    }

    #[test]
    fn guards_reject_protected_ids() {
        // SAFETY: getpgrp 는 실패하지 않는다.
        let own_pgid = unsafe { libc::getpgrp() } as u32;
        for id in [0, 1, std::process::id(), own_pgid] {
            assert!(
                stop_pids(&[id], Duration::ZERO).is_err(),
                "stop_pids 가 {id} 를 허용함"
            );
        }
        // 음수로 바뀌는 값은 신호를 보내 보는 대신 검사 함수로만 확인한다(실패 시 kill(-1) 위험).
        for id in [u32::MAX, 1 << 31] {
            assert!(checked_id(id).is_err(), "{id} 허용됨");
        }

        let child = Command::new("sleep").arg("300").spawn().unwrap();
        let mut p = ManagedProcess { child, pgid: 0 };
        for pgid in [0, 1, own_pgid] {
            p.pgid = pgid;
            assert!(
                stop_managed(&mut p, Duration::ZERO).is_err(),
                "stop_managed 가 {pgid} 를 허용함"
            );
        }
        p.child.kill().unwrap();
        p.child.wait().unwrap();
    }
}

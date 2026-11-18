//! 설정 + 포트 + 프로세스를 묶는 동작들. Tauri 타입을 쓰지 않아 smoke 예제에서도 그대로 쓴다.

use crate::contents::ops as msg;
use crate::model::{GroupView, Listener, ManagedInfo, ResolvedService, ServiceStatus, Snapshot};
use crate::process::{self, ManagedProcess, STOP_GRACE};
use crate::{config, ports, status};
use std::collections::HashMap;
use std::fs;
use std::os::unix::fs::OpenOptionsExt;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard, PoisonError};

pub struct Paths {
    pub config: PathBuf,
    pub log_dir: PathBuf,
}

/// 위젯이 띄운 프로세스들 (서비스 id → 프로세스). 메모리에만 있어 위젯을 다시 켜면 사라진다.
#[derive(Default)]
pub struct Registry(Mutex<HashMap<String, ManagedProcess>>);

impl Registry {
    fn lock(&self) -> MutexGuard<'_, HashMap<String, ManagedProcess>> {
        self.0.lock().unwrap_or_else(PoisonError::into_inner)
    }
}

/// 설정의 모든 서비스 상태를 설정 파일 순서대로 그룹별로 묶어 돌려준다.
pub fn snapshot(paths: &Paths, reg: &Registry) -> Result<Snapshot, String> {
    let services = config::load(&paths.config)?;
    let ports: Vec<u16> = services.iter().map(|s| s.port).collect();
    let by_port = ports::listeners(&ports)?;
    let mut map = reg.lock();
    // 모든 항목을 is_alive 로 회수한다. 설정에서 빠진 id(이름이 바뀐 이전 항목 등) 중 끝난 것은 지운다.
    map.retain(|id, p| process::is_alive(p) || services.iter().any(|s| &s.id == id));
    let mut groups: Vec<GroupView> = Vec::new();
    for svc in &services {
        let listeners = by_port.get(&svc.port).map_or(&[][..], Vec::as_slice);
        let managed = map.get_mut(&svc.id).map(managed_info);
        let view = status::view(svc, listeners, managed, &service_log(paths, svc));
        match groups.last_mut() {
            Some(g) if g.name == svc.group => g.services.push(view),
            _ => groups.push(GroupView {
                name: svc.group.clone(),
                services: vec![view],
            }),
        }
    }
    Ok(Snapshot {
        groups,
        config_path: paths.config.display().to_string(),
    })
}

/// 서비스를 켠다. 이미 켜져 있거나 포트를 다른 프로그램이 쓰고 있으면 거절한다.
pub fn start(paths: &Paths, reg: &Registry, id: &str) -> Result<(), String> {
    let svc = find_service(paths, id)?;
    let log = service_log(paths, &svc);
    let listeners = port_listeners(svc.port)?;
    // 잠근 채로 판정 → 실행까지 해서 같은 서비스가 두 번 뜨지 않게 한다 (spawn 은 금방 끝난다)
    let mut map = reg.lock();
    let managed = map.get_mut(id).map(managed_info);
    match status::view(&svc, &listeners, managed, &log).status {
        ServiceStatus::On => Err(msg::already_running(&svc.name)),
        ServiceStatus::Conflict => Err(msg::port_in_use(svc.port)),
        ServiceStatus::Starting => Err(msg::already_starting(&svc.name)),
        ServiceStatus::Off | ServiceStatus::Failed => {
            // 실패해서 끝난 이전 항목은 덮어쓴다
            map.insert(svc.id.clone(), process::spawn(&svc, &log)?);
            Ok(())
        }
    }
}

/// 서비스를 끈다. 위젯이 띄운 프로세스 그룹을 먼저 끄고, 그래도 포트를 잡고 있는 내 리스너
/// (터미널에서 띄운 서버, 또는 위젯을 다시 켜서 기록을 잃은 서버)는 pid 로 끈다.
/// 남의 리스너는 절대 건드리지 않는다. conflict 인데 위젯이 띄운 프로세스도 없으면 끌 것이 없어 Err.
pub fn stop(paths: &Paths, reg: &Registry, id: &str) -> Result<(), String> {
    let svc = find_service(paths, id)?;
    let log = service_log(paths, &svc);
    let listeners = port_listeners(svc.port)?;
    // 기다리는 동안 잠금을 쥐고 있으면 상태 조회가 몇 초씩 멈추므로, 항목을 먼저 꺼내고 바로 놓는다
    let entry = {
        let mut map = reg.lock();
        let managed = map.get_mut(id).map(managed_info);
        let alive = managed.is_some_and(|m| m.alive);
        if !alive && status::view(&svc, &listeners, managed, &log).status == ServiceStatus::Conflict
        {
            return Err(msg::port_in_use_cannot_stop(svc.port));
        }
        // 그룹 신호는 리더가 살아 있거나, 그룹 멤버가 아직 포트를 잡고 있을 때만 보낸다(멤버가 있으면
        // pgid 가 재사용될 수 없다). 둘 다 아니면 pgid 가 재사용됐을 수 있어 항목만 지우고,
        // 남은 서버는 아래 "소유한 리스너" 경로로 정리한다.
        map.remove(id)
            .filter(|p| alive || listeners.iter().any(|l| l.pgid == Some(p.pgid)))
    };
    if let Some(mut p) = entry {
        process::stop_managed(&mut p, STOP_GRACE)?;
    }
    // 리스너를 먼저 읽고 레지스트리를 본다. 그 사이 새로 start 된 서버는 읽기 전에 레지스트리에 들어가 있다.
    let left = port_listeners(svc.port)?;
    let restarted = reg.lock().contains_key(id);
    process::stop_pids(&leftover_pids(&svc, &left, restarted, &log), STOP_GRACE)
}

/// stop 마지막에 pid 로 끌 내 리스너. 기다리는 사이 같은 id 가 다시 시작됐으면(`restarted`)
/// 방금 띄운 새 서버일 수 있어 아무것도 끄지 않는다. 남의 리스너(conflict)도 끄지 않는다.
fn leftover_pids(
    svc: &ResolvedService,
    listeners: &[Listener],
    restarted: bool,
    log: &Path,
) -> Vec<u32> {
    let left = status::view(svc, listeners, None, log);
    if restarted || left.status != ServiceStatus::On {
        return Vec::new();
    }
    left.pids
}

/// 서비스 로그 파일 경로.
pub fn log_path(paths: &Paths, id: &str) -> Result<PathBuf, String> {
    Ok(service_log(paths, &find_service(paths, id)?))
}

/// 로그 파일 경로. 아직 한 번도 안 켠 서비스면 폴더와 빈 파일을 만든다(있는 내용은 그대로 둔다).
pub fn prepare_log(paths: &Paths, id: &str) -> Result<PathBuf, String> {
    let path = log_path(paths, id)?;
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(msg::log_dir_failed)?;
    }
    fs::OpenOptions::new()
        .create(true)
        .append(true)
        .mode(process::LOG_FILE_MODE)
        .open(&path)
        .map_err(msg::log_file_failed)?;
    Ok(path)
}

fn find_service(paths: &Paths, id: &str) -> Result<ResolvedService, String> {
    config::load(&paths.config)?
        .into_iter()
        .find(|s| s.id == id)
        .ok_or_else(|| msg::service_not_found(id))
}

fn service_log(paths: &Paths, svc: &ResolvedService) -> PathBuf {
    paths.log_dir.join(config::log_file_name(svc))
}

fn port_listeners(port: u16) -> Result<Vec<Listener>, String> {
    Ok(ports::listeners(&[port])?.remove(&port).unwrap_or_default())
}

fn managed_info(p: &mut ManagedProcess) -> ManagedInfo {
    ManagedInfo {
        pgid: p.pgid,
        alive: process::is_alive(p),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{Origin, ServiceView};
    use std::io::Write;
    use std::net::{TcpListener, TcpStream};
    use std::process::{Command, Stdio};
    use std::thread::{self, JoinHandle};
    use std::time::{Duration, Instant};
    use tempfile::TempDir;

    const ID: &str = "example/static";

    /// 임시 폴더 + 임시 설정 하나. 테스트가 중간에 실패해도 위젯이 띄운 서버를 남기지 않는다.
    struct Fixture {
        dir: TempDir,
        paths: Paths,
        reg: Registry,
        port: u16,
    }

    impl Fixture {
        /// `command` 의 `{port}` 는 빈 포트 번호로 바꾼다.
        fn new(command: &str) -> Fixture {
            let dir = tempfile::tempdir().unwrap();
            let port = free_port();
            let cwd = dir.path().join("site");
            std::fs::create_dir(&cwd).unwrap();
            let json = serde_json::json!({
                "groups": [{ "name": "example", "services": [{
                    "name": "static",
                    "cwd": cwd,
                    "port": port,
                    "command": command.replace("{port}", &port.to_string()),
                }]}]
            });
            let config = dir.path().join("services.json");
            std::fs::write(&config, json.to_string()).unwrap();
            let paths = Paths {
                config,
                log_dir: dir.path().join("logs"),
            };
            Fixture {
                dir,
                paths,
                reg: Registry::default(),
                port,
            }
        }

        fn view(&self) -> ServiceView {
            let snap = snapshot(&self.paths, &self.reg).unwrap();
            snap.groups
                .into_iter()
                .flat_map(|g| g.services)
                .find(|s| s.id == ID)
                .unwrap()
        }

        fn wait_for(&self, want: ServiceStatus) -> ServiceView {
            let deadline = Instant::now() + Duration::from_secs(20);
            loop {
                let v = self.view();
                if v.status == want || Instant::now() > deadline {
                    assert_eq!(v.status, want, "{v:?}");
                    return v;
                }
                thread::sleep(Duration::from_millis(200));
            }
        }
    }

    impl Drop for Fixture {
        fn drop(&mut self) {
            // cwd 가 이 테스트만의 임시 폴더라 소유 판정에 남의 프로세스는 걸리지 않는다
            let _ = stop(&self.paths, &self.reg, ID);
            for (_, mut p) in self.reg.lock().drain() {
                if process::is_alive(&mut p) {
                    let _ = process::stop_managed(&mut p, Duration::from_secs(1));
                }
            }
        }
    }

    /// 테스트가 위젯을 거치지 않고 직접 띄운 서버. 별도 스레드가 wait 해서 좀비가 남지 않는다.
    struct External {
        pid: i32,
        waiter: JoinHandle<()>,
    }

    impl External {
        fn spawn(f: &Fixture) -> External {
            let mut child = Command::new("python3")
                .args([
                    "-m",
                    "http.server",
                    &f.port.to_string(),
                    "--bind",
                    "127.0.0.1",
                ])
                .current_dir(f.dir.path().join("site"))
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .spawn()
                .unwrap();
            let pid = child.id() as i32;
            let waiter = thread::spawn(move || {
                let _ = child.wait();
            });
            External { pid, waiter }
        }
    }

    impl Drop for External {
        fn drop(&mut self) {
            // 아직 안 끝났으면(테스트 실패 경로) 직접 정리한다. 끝났으면 pid 가 재사용됐을 수 있으니 건드리지 않는다.
            if !self.waiter.is_finished() {
                unsafe { libc::kill(self.pid, libc::SIGKILL) };
            }
        }
    }

    fn free_port() -> u16 {
        TcpListener::bind("127.0.0.1:0")
            .unwrap()
            .local_addr()
            .unwrap()
            .port()
    }

    const HTTP_SERVER: &str = "python3 -m http.server {port} --bind 127.0.0.1";

    #[test]
    fn start_then_stop_widget_server() {
        let f = Fixture::new(HTTP_SERVER);
        assert_eq!(f.view().status, ServiceStatus::Off);

        start(&f.paths, &f.reg, ID).unwrap();
        let first = f.view();
        assert!(
            matches!(first.status, ServiceStatus::Starting | ServiceStatus::On),
            "{first:?}"
        );
        assert_eq!(first.origin, Some(Origin::Widget));

        let on = f.wait_for(ServiceStatus::On);
        assert_eq!(on.origin, Some(Origin::Widget));
        assert!(!on.pids.is_empty());
        assert!(
            start(&f.paths, &f.reg, ID).is_err(),
            "켜진 서비스를 다시 켤 수 없어야 한다"
        );

        stop(&f.paths, &f.reg, ID).unwrap();
        assert_eq!(f.view().status, ServiceStatus::Off);
        assert!(f.reg.lock().is_empty());
        assert!(std::path::Path::new(&on.log_path).exists());
    }

    #[test]
    fn failed_start_can_be_retried() {
        let f = Fixture::new("echo boom; exit 3");
        start(&f.paths, &f.reg, ID).unwrap();
        let failed = f.wait_for(ServiceStatus::Failed);
        assert!(
            std::fs::read_to_string(&failed.log_path)
                .unwrap()
                .contains("boom")
        );
        // 끝난 이전 항목은 "이미 시작하는 중" 으로 막지 않는다
        start(&f.paths, &f.reg, ID).unwrap();
        f.wait_for(ServiceStatus::Failed);
        stop(&f.paths, &f.reg, ID).unwrap();
        assert_eq!(f.view().status, ServiceStatus::Off);
    }

    #[test]
    fn stop_skips_group_signal_when_leader_exited_and_no_member_listens() {
        // 레지스트리 항목은 failed(리더 회수됨) 상태. 그룹 신호를 보냈다면 sleep 이 죽었을 것
        assert!(
            sleep_survives_stop_after_leader_exit(false),
            "리더가 끝나고 포트를 잡은 멤버도 없는 그룹에 신호를 보내면 안 된다"
        );
    }

    #[test]
    fn stop_signals_group_when_member_still_listens_after_leader_exit() {
        // 그룹 멤버(서버)가 포트를 잡고 있으면 그룹이 살아 있으니 그룹째 끈다
        assert!(
            !sleep_survives_stop_after_leader_exit(true),
            "포트를 잡은 멤버가 있으면 그룹 전체를 꺼야 한다"
        );
    }

    /// 리더(sh)는 같은 프로세스 그룹에 sleep(과 `serve` 면 서버)을 백그라운드로 남기고 바로 끝난다.
    /// stop 은 Ok·off·레지스트리 비움이어야 하고, 반환값은 포트를 안 잡은 sleep 이 살아남았는지
    /// (= 그룹 신호를 안 보냈는지). 살아 있으면 여기서 정리한다.
    fn sleep_survives_stop_after_leader_exit(serve: bool) -> bool {
        let server = if serve {
            "python3 -m http.server {port} --bind 127.0.0.1 >/dev/null 2>&1 & "
        } else {
            ""
        };
        let f = Fixture::new(&format!(
            "sh -c '{server}sleep 30 >/dev/null 2>&1 & echo $! > sleep.pid'"
        ));
        start(&f.paths, &f.reg, ID).unwrap();
        let want = if serve {
            ServiceStatus::On
        } else {
            ServiceStatus::Failed
        };
        assert_eq!(f.wait_for(want).origin, Some(Origin::Widget));
        let deadline = Instant::now() + Duration::from_secs(5);
        while process::is_alive(f.reg.lock().get_mut(ID).unwrap()) {
            assert!(Instant::now() < deadline, "리더가 끝나지 않았다");
            thread::sleep(Duration::from_millis(100));
        }
        let sleep_pid: i32 = std::fs::read_to_string(f.dir.path().join("site/sleep.pid"))
            .unwrap()
            .trim()
            .parse()
            .unwrap();

        stop(&f.paths, &f.reg, ID).unwrap();
        let sleep_alive = unsafe { libc::kill(sleep_pid, 0) } == 0;
        if sleep_alive {
            unsafe { libc::kill(sleep_pid, libc::SIGKILL) };
        }
        assert_eq!(f.view().status, ServiceStatus::Off);
        assert!(f.reg.lock().is_empty());
        sleep_alive
    }

    #[test]
    fn external_server_is_shown_and_stopped() {
        let f = Fixture::new(HTTP_SERVER);
        let ext = External::spawn(&f);

        let on = f.wait_for(ServiceStatus::On);
        assert_eq!(on.origin, Some(Origin::External));
        assert_eq!(on.pids, vec![ext.pid as u32]);
        assert!(start(&f.paths, &f.reg, ID).is_err());

        stop(&f.paths, &f.reg, ID).unwrap();
        assert_eq!(f.view().status, ServiceStatus::Off);
    }

    #[test]
    fn conflict_is_reported_and_left_alone() {
        let f = Fixture::new(HTTP_SERVER);
        // 이 테스트 프로세스(cwd ≠ 설정 폴더)가 포트를 잡는다
        let held = TcpListener::bind(("127.0.0.1", f.port)).unwrap();

        let v = f.wait_for(ServiceStatus::Conflict);
        assert_eq!(v.origin, None);
        assert!(v.pids.contains(&std::process::id()), "{v:?}");
        assert!(start(&f.paths, &f.reg, ID).is_err());
        assert!(stop(&f.paths, &f.reg, ID).is_err());

        let mut client = TcpStream::connect(("127.0.0.1", f.port)).unwrap();
        client.write_all(b"ping").unwrap();
        held.accept()
            .expect("stop 이 포트를 잡은 프로세스를 건드리면 안 된다");
    }

    #[test]
    fn widget_process_in_conflict_is_stopped_but_other_listener_is_left_alone() {
        let f = Fixture::new("sleep 30");
        start(&f.paths, &f.reg, ID).unwrap();
        // 위젯 프로세스는 살아 있는데 포트는 이 테스트 프로세스(cwd ≠ 설정 폴더)가 잡는다
        let held = TcpListener::bind(("127.0.0.1", f.port)).unwrap();
        let v = f.wait_for(ServiceStatus::Conflict);
        assert_eq!(v.origin, Some(Origin::Widget));
        let pgid = f.reg.lock()[ID].pgid as i32;
        assert_eq!(v.pids, vec![pgid as u32], "pids 는 위젯 프로세스");

        stop(&f.paths, &f.reg, ID).unwrap();
        assert!(f.reg.lock().is_empty());
        assert_eq!(
            unsafe { libc::kill(-pgid, 0) },
            -1,
            "위젯 그룹은 끝나야 한다"
        );
        let mut client = TcpStream::connect(("127.0.0.1", f.port)).unwrap();
        client.write_all(b"ping").unwrap();
        held.accept().expect("남의 리스너는 건드리면 안 된다");
        // 위젯 프로세스가 없어졌으니 이제는 끌 수 없는 conflict
        assert_eq!(f.view().origin, None);
        assert!(stop(&f.paths, &f.reg, ID).is_err());
    }

    #[test]
    fn leftover_pids_skips_restarted_service_and_other_listeners() {
        let f = Fixture::new(HTTP_SERVER);
        let svc = find_service(&f.paths, ID).unwrap();
        // 순수 판정만 본다. 이 pid 들로 신호를 보내지 않는다.
        let listener = |cwd: &Path| Listener {
            pid: 4242,
            pgid: Some(4242),
            command: None,
            cwd: Some(cwd.to_path_buf()),
            started_at: None,
        };
        let mine = [listener(&svc.cwd)];
        let other = [listener(Path::new("/"))];
        let log = Path::new("/x.log");
        assert_eq!(leftover_pids(&svc, &mine, false, log), vec![4242]);
        assert!(
            leftover_pids(&svc, &mine, true, log).is_empty(),
            "기다리는 사이 다시 켠 서버는 끄면 안 된다"
        );
        assert!(leftover_pids(&svc, &other, false, log).is_empty());
    }

    #[test]
    fn snapshot_reaps_and_drops_dead_entries_missing_from_config() {
        use std::os::unix::process::CommandExt;
        let f = Fixture::new(HTTP_SERVER);
        // 자기 프로세스 그룹으로 띄워서 Fixture 정리(stop_managed)가 테스트 그룹을 건드리지 않게 한다
        let spawn = |args: &[&str]| -> ManagedProcess {
            let child = Command::new(args[0])
                .args(&args[1..])
                .process_group(0)
                .spawn()
                .unwrap();
            ManagedProcess {
                pgid: child.id(),
                child,
            }
        };
        // 이름이 바뀌어 설정에서 빠진 이전 id 들: 하나는 곧 끝나고 하나는 계속 돈다
        let dead = spawn(&["true"]);
        let dead_pid = dead.pgid as i32;
        f.reg.lock().insert("old/dead".into(), dead);
        f.reg
            .lock()
            .insert("old/live".into(), spawn(&["sleep", "30"]));

        let deadline = Instant::now() + Duration::from_secs(5);
        while f.reg.lock().contains_key("old/dead") {
            assert!(
                Instant::now() < deadline,
                "끝난 이전 항목이 지워지지 않았다"
            );
            f.view();
            thread::sleep(Duration::from_millis(50));
        }
        assert_eq!(
            unsafe { libc::kill(dead_pid, 0) },
            -1,
            "좀비로 남으면 안 된다"
        );
        assert!(
            f.reg.lock().contains_key("old/live"),
            "살아 있는 항목은 남긴다"
        );
    }

    #[test]
    fn invalid_config_error_is_passed_through() {
        let f = Fixture::new(HTTP_SERVER);
        std::fs::write(&f.paths.config, "{\"groups\": [").unwrap();
        let expected = config::load(&f.paths.config).unwrap_err();
        assert_eq!(snapshot(&f.paths, &f.reg).unwrap_err(), expected);
    }

    #[test]
    fn unknown_id_is_an_error() {
        let f = Fixture::new(HTTP_SERVER);
        assert!(start(&f.paths, &f.reg, "nope/x").is_err());
        assert!(stop(&f.paths, &f.reg, "nope/x").is_err());
        assert!(log_path(&f.paths, "nope/x").is_err());
        assert_eq!(
            log_path(&f.paths, ID).unwrap(),
            f.paths
                .log_dir
                .join(config::log_file_name(&find_service(&f.paths, ID).unwrap()))
        );
    }

    #[test]
    fn prepare_log_creates_empty_file_and_keeps_content() {
        use std::os::unix::fs::PermissionsExt;
        let f = Fixture::new(HTTP_SERVER);
        assert!(prepare_log(&f.paths, "nope/x").is_err());
        assert!(
            !f.paths.log_dir.exists(),
            "모르는 id 로 폴더를 만들면 안 된다"
        );

        let path = prepare_log(&f.paths, ID).unwrap();
        assert_eq!(path, f.paths.log_dir.join("example/static.log"));
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "");
        assert_eq!(
            std::fs::metadata(&path).unwrap().permissions().mode() & 0o777,
            process::LOG_FILE_MODE
        );

        // 두 번째 호출은 기존 내용을 지우지 않는다
        std::fs::write(&path, "old\n").unwrap();
        assert_eq!(prepare_log(&f.paths, ID).unwrap(), path);
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "old\n");
    }
}

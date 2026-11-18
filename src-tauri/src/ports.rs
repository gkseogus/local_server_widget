//! 어떤 프로세스가 어느 TCP 포트에서 리슨하는지 조회 (lsof + ps).

use crate::contents::ports as msg;
use crate::model::Listener;
use std::collections::{BTreeSet, HashMap};
use std::path::PathBuf;
use std::process::Command;

// Finder 에서 띄운 GUI 앱은 PATH 가 최소한이라 절대 경로로 실행한다.
const LSOF: &str = "/usr/sbin/lsof";
const PS: &str = "/bin/ps";

/// 요청한 포트별 리스너. 리스너가 없는 포트는 맵에 없다.
/// 모든 포트에 lsof 1회, 찾은 pid 전체에 ps 1회와 `lsof -d cwd` 1회.
pub fn listeners(ports: &[u16]) -> Result<HashMap<u16, Vec<Listener>>, String> {
    if ports.is_empty() {
        return Ok(HashMap::new());
    }
    // lsof 는 매칭이 없으면 빈 출력 + exit 1 이므로 종료 코드는 보지 않는다. 실행 자체가 안 될 때만 에러.
    // `-S 2`: 응답 없는 마운트 등에서 커널 호출(stat 등)이 폴링을 붙잡지 않도록 2초(최소값)로 끊는다.
    let out = run(LSOF, &["-nP", "-S", "2", "-iTCP", "-sTCP:LISTEN", "-Fpn"])
        .map_err(|e| msg::lsof_failed(LSOF, e))?;
    let pairs = parse_listen(&out, ports);
    if pairs.is_empty() {
        return Ok(HashMap::new());
    }

    let pids: BTreeSet<u32> = pairs.iter().map(|&(_, pid)| pid).collect();
    let pid_arg = pids
        .iter()
        .map(u32::to_string)
        .collect::<Vec<_>>()
        .join(",");
    // 보조 정보는 실패해도(권한, 그 사이 종료) 빈 값으로 둔다.
    let info = run(PS, &["-o", "pid=,pgid=,lstart=,command=", "-p", &pid_arg])
        .map(|o| parse_ps(&o))
        .unwrap_or_default();
    let cwds: HashMap<u32, PathBuf> = run(
        LSOF,
        &["-S", "2", "-a", "-p", &pid_arg, "-d", "cwd", "-Fpn"],
    )
    .map(|o| {
        parse_lsof_pn(&o)
            .into_iter()
            .map(|(pid, n)| (pid, PathBuf::from(n)))
            .collect()
    })
    .unwrap_or_default();

    let mut map: HashMap<u16, Vec<Listener>> = HashMap::new();
    // pairs 는 (port, pid) 정렬이라 포트별 목록이 pid 순으로 쌓인다.
    for (port, pid) in pairs {
        let mut l = info.get(&pid).cloned().unwrap_or(Listener {
            pid,
            pgid: None,
            command: None,
            cwd: None,
            started_at: None,
        });
        l.cwd = cwds.get(&pid).cloned();
        map.entry(port).or_default().push(l);
    }
    Ok(map)
}

/// 바이너리를 `LC_ALL=C` 로 실행해 stdout 을 돌려준다. 종료 코드는 무시.
fn run(bin: &str, args: &[&str]) -> std::io::Result<String> {
    let out = Command::new(bin).args(args).env("LC_ALL", "C").output()?;
    Ok(String::from_utf8_lossy(&out.stdout).into_owned())
}

/// `lsof -Fpn` 출력 → `(pid, n 필드)` 목록. `f` 등 다른 필드 줄은 건너뛴다.
fn parse_lsof_pn(out: &str) -> Vec<(u32, &str)> {
    let mut pid: Option<u32> = None;
    let mut v = Vec::new();
    for line in out.lines() {
        if let Some(p) = line.strip_prefix('p') {
            pid = p.parse().ok();
        } else if let (Some(n), Some(pid)) = (line.strip_prefix('n'), pid) {
            v.push((pid, n));
        }
    }
    v
}

/// LISTEN 소켓 출력 → 요청 포트에 해당하는 `(port, pid)` 집합.
/// 주소 형식 `*:8002`, `127.0.0.1:8002`, `[::1]:5173` — 포트는 마지막 `:` 뒤.
/// 한 프로세스의 IPv4/IPv6 소켓은 집합이라 하나로 합쳐진다.
fn parse_listen(out: &str, ports: &[u16]) -> BTreeSet<(u16, u32)> {
    parse_lsof_pn(out)
        .into_iter()
        .filter_map(|(pid, addr)| {
            let port: u16 = addr.rsplit_once(':')?.1.parse().ok()?;
            ports.contains(&port).then_some((port, pid))
        })
        .collect()
}

/// `ps -o pid=,pgid=,lstart=,command=` 출력 → pid 별 Listener (cwd 는 비움).
/// lstart 는 공백 토큰 5개, command 는 나머지 전부(내부 공백 유지).
fn parse_ps(out: &str) -> HashMap<u32, Listener> {
    let mut map = HashMap::new();
    for line in out.lines() {
        let mut rest = line.trim();
        let mut fields: Vec<&str> = Vec::with_capacity(7);
        while fields.len() < 7 {
            let Some((tok, r)) = rest.split_once(char::is_whitespace) else {
                break;
            };
            fields.push(tok);
            rest = r.trim_start();
        }
        let Some(pid) = fields.first().and_then(|p| p.parse().ok()) else {
            continue;
        };
        let full = fields.len() == 7 && !rest.is_empty();
        map.insert(
            pid,
            Listener {
                pid,
                pgid: fields.get(1).and_then(|g| g.parse().ok()),
                command: full.then(|| rest.to_string()),
                cwd: None,
                // 한 자리 날짜의 이중 공백("Nov  5")은 공백 하나로 정규화된다.
                started_at: full.then(|| fields[2..7].join(" ")),
            },
        );
    }
    map
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::TcpListener;

    const LISTEN_FIXTURE: &str = "\
p100
f3
n*:8002
p200
f5
n127.0.0.1:5173
f6
n[::1]:5173
p300
f7
n[::]:3000
p400
f8
n127.0.0.1:8002
p500
f9
n127.0.0.1:9999
";

    #[test]
    fn parse_listen_handles_address_forms_dedupes_and_filters() {
        let got = parse_listen(LISTEN_FIXTURE, &[8002, 5173, 3000]);
        // 8002: 와일드카드(100) + IPv4(400) 두 pid 유지, 5173: IPv4+IPv6 한 pid 로 합침, 9999: 제외
        let want: BTreeSet<(u16, u32)> =
            [(3000, 300), (5173, 200), (8002, 100), (8002, 400)].into();
        assert_eq!(got, want);
    }

    #[test]
    fn parse_listen_empty_output() {
        assert!(parse_listen("", &[8002]).is_empty());
        assert!(parse_listen(LISTEN_FIXTURE, &[1234]).is_empty());
    }

    #[test]
    fn parse_ps_keeps_command_spaces_and_skips_missing_pids() {
        let out = "  100   100 Thu Nov 12 13:27:59 2026     uvicorn app.main:app --reload  --port 8002\n\
                     200    90 Thu Nov  5 09:01:02 2026 /usr/bin/node  vite\n";
        let m = parse_ps(out);
        assert_eq!(
            m[&100],
            Listener {
                pid: 100,
                pgid: Some(100),
                command: Some("uvicorn app.main:app --reload  --port 8002".into()),
                cwd: None,
                started_at: Some("Thu Nov 12 13:27:59 2026".into()),
            }
        );
        assert_eq!(m[&200].pgid, Some(90));
        assert_eq!(
            m[&200].started_at.as_deref(),
            Some("Thu Nov 5 09:01:02 2026")
        );
        assert_eq!(m[&200].command.as_deref(), Some("/usr/bin/node  vite"));
        // ps 출력에 없는 pid(그 사이 종료) 는 맵에 없다 → listeners() 에서 None 필드로 채워진다.
        assert!(!m.contains_key(&300));
        assert!(parse_ps("").is_empty());
    }

    #[test]
    fn parse_lsof_pn_maps_cwd() {
        let out = "p100\nfcwd\nn/Users/me/proj a\np200\nfcwd\nn/tmp\n";
        assert_eq!(
            parse_lsof_pn(out),
            vec![(100, "/Users/me/proj a"), (200, "/tmp")]
        );
    }

    #[test]
    fn listeners_finds_own_socket_live() {
        let sock = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = sock.local_addr().unwrap().port();
        // 아무도 안 쓰는 포트: 바인드 후 바로 해제
        let free = TcpListener::bind("127.0.0.1:0")
            .unwrap()
            .local_addr()
            .unwrap()
            .port();

        let map = listeners(&[port, free]).unwrap();

        let me = map[&port]
            .iter()
            .find(|l| l.pid == std::process::id())
            .expect("own pid listed");
        assert!(me.pgid.is_some());
        assert!(me.command.is_some());
        assert!(me.started_at.is_some());
        assert_eq!(
            me.cwd.as_deref(),
            Some(
                std::env::current_dir()
                    .unwrap()
                    .canonicalize()
                    .unwrap()
                    .as_path()
            )
        );
        assert!(!map.contains_key(&free));
        drop(sock);
    }

    #[test]
    fn listeners_empty_ports() {
        assert!(listeners(&[]).unwrap().is_empty());
    }
}

//! 포트 리스너 + 위젯이 띄운 프로세스 정보 → 화면에 보낼 서비스 상태. 순수 함수.

use crate::model::{Listener, ManagedInfo, Origin, ResolvedService, ServiceStatus, ServiceView};
use std::path::Path;

/// 서비스 하나의 상태를 판정한다.
/// 내 리스너 = 위젯이 띄운 프로세스 그룹(pgid 일치) 이거나 작업 폴더가 설정의 cwd 와 같은 프로세스.
/// 포트에 리스너가 있는데 내 것이 하나도 없으면 conflict. 이때 위젯이 띄운 프로세스가 살아 있으면
/// origin 을 widget 으로 내려 프론트가 스위치를 켠 채로 두고 그 프로세스를 끌 수 있게 한다.
pub fn view(
    svc: &ResolvedService,
    listeners: &[Listener],
    managed: Option<ManagedInfo>,
    log_path: &Path,
) -> ServiceView {
    let from_widget = |l: &Listener| -> bool { managed.is_some_and(|m| l.pgid == Some(m.pgid)) };
    let owned: Vec<&Listener> = listeners
        .iter()
        .filter(|l| from_widget(l) || same_dir(l, &svc.cwd))
        .collect();

    // holder = 상세 화면에 명령/시작 시각을 보여줄 리스너
    let (status, origin, pids, holder): (
        ServiceStatus,
        Option<Origin>,
        Vec<u32>,
        Option<&Listener>,
    ) = match (owned.first(), listeners.first(), managed) {
        (Some(&first), _, _) => {
            let origin = if owned.iter().any(|l| from_widget(l)) {
                Origin::Widget
            } else {
                Origin::External
            };
            let pids = owned.iter().map(|l| l.pid).collect();
            (ServiceStatus::On, Some(origin), pids, Some(first))
        }
        // 위젯 프로세스가 살아 있으면 pids 는 위젯 프로세스, 명령은 포트를 잡은 남의 것
        (None, Some(first), Some(m)) if m.alive => (
            ServiceStatus::Conflict,
            Some(Origin::Widget),
            vec![m.pgid],
            Some(first),
        ),
        (None, Some(first), _) => {
            let pids = listeners.iter().map(|l| l.pid).collect();
            (ServiceStatus::Conflict, None, pids, Some(first))
        }
        (None, None, Some(m)) if m.alive => (
            ServiceStatus::Starting,
            Some(Origin::Widget),
            vec![m.pgid],
            None,
        ),
        (None, None, Some(_)) => (
            ServiceStatus::Failed,
            Some(Origin::Widget),
            Vec::new(),
            None,
        ),
        (None, None, None) => (ServiceStatus::Off, None, Vec::new(), None),
    };

    ServiceView {
        id: svc.id.clone(),
        group: svc.group.clone(),
        name: svc.name.clone(),
        port: svc.port,
        url: svc.url.clone(),
        cwd: svc.cwd.display().to_string(),
        command: svc.command.clone(),
        env: svc.env.clone(),
        status,
        origin,
        pids,
        listener_command: holder.and_then(|l| l.command.clone()),
        started_at: holder.and_then(|l| l.started_at.clone()),
        log_path: log_path.display().to_string(),
    }
}

/// 리스너의 작업 폴더가 서비스 cwd 와 같은가 (가능하면 정규화해서 비교).
fn same_dir(listener: &Listener, cwd: &Path) -> bool {
    listener
        .cwd
        .as_ref()
        .is_some_and(|c| std::fs::canonicalize(c).unwrap_or_else(|_| c.clone()) == cwd)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::BTreeMap;
    use std::path::PathBuf;

    const PGID: u32 = 500;

    fn svc(cwd: &Path) -> ResolvedService {
        ResolvedService {
            id: "shop/api".into(),
            group: "shop".into(),
            name: "api".into(),
            cwd: cwd.to_path_buf(),
            port: 8000,
            url: "http://localhost:8000".into(),
            command: "uvicorn main:app --port 8000".into(),
            env: BTreeMap::from([("A".to_string(), "1".to_string())]),
        }
    }

    fn listener(pid: u32, pgid: u32, cwd: &str) -> Listener {
        Listener {
            pid,
            pgid: Some(pgid),
            command: Some(format!("cmd-{pid}")),
            cwd: Some(PathBuf::from(cwd)),
            started_at: Some(format!("start-{pid}")),
        }
    }

    fn managed(alive: bool) -> Option<ManagedInfo> {
        Some(ManagedInfo { pgid: PGID, alive })
    }

    fn run(listeners: &[Listener], managed: Option<ManagedInfo>) -> ServiceView {
        view(
            &svc(Path::new("/proj/api")),
            listeners,
            managed,
            Path::new("/logs/shop-api.log"),
        )
    }

    #[test]
    fn copies_service_fields() {
        let v = run(&[], None);
        let s = svc(Path::new("/proj/api"));
        assert_eq!(
            (v.id, v.group, v.name, v.port, v.url, v.command, v.env),
            (s.id, s.group, s.name, s.port, s.url, s.command, s.env)
        );
        assert_eq!(v.cwd, "/proj/api");
        assert_eq!(v.log_path, "/logs/shop-api.log");
    }

    #[test]
    fn off_without_listeners_or_managed() {
        let v = run(&[], None);
        assert_eq!(
            (v.status, v.origin, v.pids),
            (ServiceStatus::Off, None, vec![])
        );
        assert_eq!((v.listener_command, v.started_at), (None, None));
    }

    #[test]
    fn starting_when_managed_alive_but_not_listening() {
        let v = run(&[], managed(true));
        assert_eq!(
            (v.status, v.origin, v.pids),
            (ServiceStatus::Starting, Some(Origin::Widget), vec![PGID])
        );
    }

    #[test]
    fn failed_when_managed_dead_and_not_listening() {
        let v = run(&[], managed(false));
        assert_eq!(
            (v.status, v.origin, v.pids),
            (ServiceStatus::Failed, Some(Origin::Widget), vec![])
        );
    }

    #[test]
    fn on_widget_when_pgid_matches_even_with_other_cwd() {
        let v = run(&[listener(501, PGID, "/elsewhere")], managed(true));
        assert_eq!(
            (v.status, v.origin, v.pids),
            (ServiceStatus::On, Some(Origin::Widget), vec![501])
        );
        assert_eq!(v.listener_command.as_deref(), Some("cmd-501"));
        assert_eq!(v.started_at.as_deref(), Some("start-501"));
    }

    #[test]
    fn on_external_when_cwd_matches_without_managed() {
        let v = run(&[listener(700, 700, "/proj/api")], None);
        assert_eq!(
            (v.status, v.origin, v.pids),
            (ServiceStatus::On, Some(Origin::External), vec![700])
        );
    }

    #[test]
    fn on_external_when_managed_pgid_differs_but_cwd_matches() {
        let v = run(&[listener(700, 700, "/proj/api")], managed(false));
        assert_eq!(
            (v.status, v.origin),
            (ServiceStatus::On, Some(Origin::External))
        );
    }

    #[test]
    fn on_lists_only_owned_pids_and_uses_first_owned_for_details() {
        let v = run(
            &[
                listener(900, 900, "/other"),
                listener(501, PGID, "/x"),
                listener(502, PGID, "/x"),
            ],
            managed(true),
        );
        assert_eq!((v.status, v.pids), (ServiceStatus::On, vec![501, 502]));
        assert_eq!(v.listener_command.as_deref(), Some("cmd-501"));
    }

    #[test]
    fn conflict_when_no_listener_is_owned() {
        let v = run(
            &[listener(900, 900, "/other"), listener(901, 900, "/other")],
            None,
        );
        assert_eq!(
            (v.status, v.origin, v.pids),
            (ServiceStatus::Conflict, None, vec![900, 901])
        );
        assert_eq!(v.listener_command.as_deref(), Some("cmd-900"));
    }

    #[test]
    fn conflict_with_widget_origin_when_widget_process_is_alive() {
        let v = run(&[listener(900, 900, "/other")], managed(true));
        // pids 는 위젯 프로세스, 명령은 포트를 잡은 남의 것
        assert_eq!(
            (v.status, v.origin, v.pids),
            (ServiceStatus::Conflict, Some(Origin::Widget), vec![PGID])
        );
        assert_eq!(v.listener_command.as_deref(), Some("cmd-900"));
    }

    #[test]
    fn conflict_without_origin_when_widget_process_is_dead() {
        let v = run(&[listener(900, 900, "/other")], managed(false));
        assert_eq!((v.status, v.origin), (ServiceStatus::Conflict, None));
    }

    #[test]
    fn conflict_when_listener_cwd_unknown() {
        let mut l = listener(900, 900, "/");
        l.cwd = None;
        assert_eq!(run(&[l], None).status, ServiceStatus::Conflict);
    }

    #[test]
    fn listener_cwd_is_canonicalized_before_comparing() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir(dir.path().join("sub")).unwrap();
        let canonical = std::fs::canonicalize(dir.path()).unwrap();
        let mut l = listener(700, 700, "/");
        l.cwd = Some(dir.path().join("sub").join(".."));
        let v = view(&svc(&canonical), &[l], None, Path::new("/l.log"));
        assert_eq!(
            (v.status, v.origin),
            (ServiceStatus::On, Some(Origin::External))
        );
    }
}

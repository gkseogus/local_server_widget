//! 검증용 CLI: `cargo run --example smoke -- <config.json> <log_dir> status|start|stop|cycle [id]`
//! 이 프로세스가 끝나도 start 로 띄운 서버는 계속 돈다 (위젯과 같음). 다음 실행에서는 외부 서버로 보인다.

use local_server_widget_lib::model::{ServiceStatus, ServiceView};
use local_server_widget_lib::ops::{self, Paths, Registry};
use std::time::{Duration, Instant};

const USAGE: &str = "사용법: smoke <config.json> <log_dir> status|start|stop|cycle [id]";

fn main() {
    if let Err(e) = run() {
        eprintln!("smoke 실패: {e}");
        std::process::exit(1);
    }
}

fn run() -> Result<(), String> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let [config, log_dir, cmd, rest @ ..] = args.as_slice() else {
        return Err(USAGE.into());
    };
    let paths = Paths {
        config: config.into(),
        log_dir: log_dir.into(),
    };
    let reg = Registry::default();
    let id = || -> Result<&str, String> {
        rest.first()
            .map(String::as_str)
            .ok_or_else(|| USAGE.to_string())
    };

    match cmd.as_str() {
        "status" => print_json(&ops::snapshot(&paths, &reg)?),
        "start" => {
            let id = id()?;
            ops::start(&paths, &reg, id)?;
            let v = wait_settled(&paths, &reg, id)?;
            print_json(&v)?;
            expect(&v, ServiceStatus::On)
        }
        "stop" => {
            let id = id()?;
            ops::stop(&paths, &reg, id)?;
            print_json(&service(&paths, &reg, id)?)
        }
        "cycle" => {
            let id = id()?;
            ops::start(&paths, &reg, id)?;
            let on = wait_settled(&paths, &reg, id)?;
            expect(&on, ServiceStatus::On)?;
            println!("on: origin={:?} pids={:?}", on.origin, on.pids);
            ops::stop(&paths, &reg, id)?;
            let off = service(&paths, &reg, id)?;
            expect(&off, ServiceStatus::Off)?;
            println!("off: ok");
            Ok(())
        }
        _ => Err(USAGE.into()),
    }
}

fn service(paths: &Paths, reg: &Registry, id: &str) -> Result<ServiceView, String> {
    ops::snapshot(paths, reg)?
        .groups
        .into_iter()
        .flat_map(|g| g.services)
        .find(|s| s.id == id)
        .ok_or_else(|| format!("서비스 없음: {id}"))
}

/// `on` 또는 `failed` 가 될 때까지 최대 20초 기다린다.
fn wait_settled(paths: &Paths, reg: &Registry, id: &str) -> Result<ServiceView, String> {
    let deadline = Instant::now() + Duration::from_secs(20);
    loop {
        let v = service(paths, reg, id)?;
        if matches!(v.status, ServiceStatus::On | ServiceStatus::Failed)
            || Instant::now() > deadline
        {
            return Ok(v);
        }
        std::thread::sleep(Duration::from_millis(300));
    }
}

fn expect(v: &ServiceView, want: ServiceStatus) -> Result<(), String> {
    if v.status == want {
        return Ok(());
    }
    Err(format!(
        "{}: {:?} 이어야 하는데 {:?} (로그: {})",
        v.id, want, v.status, v.log_path
    ))
}

fn print_json(value: &impl serde::Serialize) -> Result<(), String> {
    println!(
        "{}",
        serde_json::to_string_pretty(value).map_err(|e| e.to_string())?
    );
    Ok(())
}

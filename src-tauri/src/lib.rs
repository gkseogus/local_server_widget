pub mod config;
pub mod contents;
pub mod model;
pub mod ops;
pub mod ports;
pub mod process;
pub mod settings;
pub mod status;

use contents::app as msg;
use model::{ConfigFile, ConfigSnapshot, ProjectInfo, Snapshot};
use ops::{Paths, Registry};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

/// 창 label. 위젯은 tauri.conf.json 의 `main`, 프론트(`src/main.tsx`)는 `settings` 이면 설정 화면을 그린다.
const MAIN_LABEL: &str = "main";
const SETTINGS_LABEL: &str = "settings";

/// 커맨드를 이 label 의 창이 불러도 되는지. 항상 위에 떠 있는 위젯이 설정을 바꾸고 바로 서버를 켜는 일을 막는다.
/// 모르는 커맨드·창은 거부한다.
fn allowed(command: &str, label: &str) -> bool {
    match command {
        "get_config" | "save_config" | "pick_folder" | "detect_project" => label == SETTINGS_LABEL,
        "start_service" | "stop_service" | "open_log" | "open_settings" => label == MAIN_LABEL,
        "get_services" | "open_config" => label == MAIN_LABEL || label == SETTINGS_LABEL,
        _ => false,
    }
}

/// 호출한 창(IPC 를 보낸 webview 의 label)이 `command` 를 부를 수 없으면 일반 오류로 거부한다.
fn check(window: &WebviewWindow, command: &str) -> Result<(), String> {
    if allowed(command, window.label()) {
        Ok(())
    } else {
        Err(msg::REQUEST_FAILED.to_string())
    }
}

/// ops 를 블로킹 스레드에서 돌린다. stop 은 몇 초 걸릴 수 있어 메인 스레드에서 돌리면 창이 멈춘다.
async fn run_ops<T: Send + 'static>(
    app: AppHandle,
    f: impl FnOnce(&Paths, &Registry) -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(move || f(&app.state::<Paths>(), &app.state::<Registry>()))
        .await
        .map_err(|_| msg::REQUEST_FAILED.to_string())?
}

fn open(app: &AppHandle, path: &std::path::Path) -> Result<(), String> {
    app.opener()
        .open_path(path.to_string_lossy(), None::<&str>)
        .map_err(msg::open_failed)
}

#[tauri::command]
async fn get_services(app: AppHandle, window: WebviewWindow) -> Result<Snapshot, String> {
    check(&window, "get_services")?;
    run_ops(app, ops::snapshot).await
}

#[tauri::command]
async fn start_service(app: AppHandle, window: WebviewWindow, id: String) -> Result<(), String> {
    check(&window, "start_service")?;
    run_ops(app, move |paths, reg| ops::start(paths, reg, &id)).await
}

#[tauri::command]
async fn stop_service(app: AppHandle, window: WebviewWindow, id: String) -> Result<(), String> {
    check(&window, "stop_service")?;
    run_ops(app, move |paths, reg| ops::stop(paths, reg, &id)).await
}

#[tauri::command]
async fn open_config(app: AppHandle, window: WebviewWindow) -> Result<(), String> {
    check(&window, "open_config")?;
    let path = app.state::<Paths>().config.clone();
    // 사용자가 지웠으면 예시 설정을 다시 만든다 (있으면 건드리지 않음)
    config::ensure_config(&path)?;
    open(&app, &path)
}

#[tauri::command]
async fn open_log(app: AppHandle, window: WebviewWindow, id: String) -> Result<(), String> {
    check(&window, "open_log")?;
    // 아직 한 번도 안 켠 서비스는 로그가 없으니 빈 파일을 만들어 연다
    let path = run_ops(app.clone(), move |paths, _| ops::prepare_log(paths, &id)).await?;
    open(&app, &path)
}

#[tauri::command]
async fn get_config(app: AppHandle, window: WebviewWindow) -> Result<ConfigSnapshot, String> {
    check(&window, "get_config")?;
    run_ops(app, |paths, _| {
        // 사용자가 지웠으면 예시 설정을 다시 만든다 (open_config 와 같음)
        config::ensure_config(&paths.config)?;
        settings::read_config(&paths.config)
    })
    .await
}

#[tauri::command]
async fn save_config(
    app: AppHandle,
    window: WebviewWindow,
    config: ConfigFile,
    revision: String,
) -> Result<String, String> {
    check(&window, "save_config")?;
    run_ops(app, move |paths, _| {
        settings::write_config(&paths.config, &config, &revision)
    })
    .await
}

#[tauri::command]
async fn detect_project(window: WebviewWindow, cwd: String) -> Result<ProjectInfo, String> {
    check(&window, "detect_project")?;
    tauri::async_runtime::spawn_blocking(move || settings::detect_project(&cwd))
        .await
        .map_err(|_| msg::REQUEST_FAILED.to_string())?
}

/// 네이티브 폴더 선택. 취소면 None, 홈 아래면 `~/...`.
#[tauri::command]
async fn pick_folder(app: AppHandle, window: WebviewWindow) -> Result<Option<String>, String> {
    check(&window, "pick_folder")?;
    // blocking_pick_folder 는 메인 스레드에서 부르면 멈추므로 블로킹 스레드에서 기다린다.
    // 부른 창에 붙여(macOS 시트) 항상 위 위젯 뒤로 숨지 않게 한다.
    tauri::async_runtime::spawn_blocking(move || {
        app.dialog()
            .file()
            .set_parent(&window)
            .blocking_pick_folder()
            .and_then(|folder| folder.as_path().map(settings::shorten_home))
    })
    .await
    .map_err(|_| msg::REQUEST_FAILED.to_string())
}

/// 설정 창을 열거나, 이미 있으면 앞으로 가져온다.
/// 창 생성은 동기 커맨드에서 하면 멈출 수 있어(Windows WebView2) async 로 둔다.
#[tauri::command]
async fn open_settings(app: AppHandle, window: WebviewWindow) -> Result<(), String> {
    check(&window, "open_settings")?;
    let result = match app.get_webview_window(SETTINGS_LABEL) {
        // 최소화된 창은 set_focus 가 무시하므로(tao) 먼저 되살린다
        Some(window) => window
            .show()
            .and_then(|_| window.unminimize())
            .and_then(|_| window.set_focus()),
        None => WebviewWindowBuilder::new(&app, SETTINGS_LABEL, WebviewUrl::default())
            .title(contents::settings::WINDOW_TITLE)
            .inner_size(760.0, 560.0)
            .min_inner_size(640.0, 460.0)
            .decorations(true)
            .always_on_top(false)
            .center()
            .build()
            .map(|_| ()),
    };
    result.map_err(contents::settings::open_window_failed)
}

/// 위젯을 꺼도 위젯이 띄운 서버는 계속 돈다 (의도된 동작). 다시 켜면 외부 서버로 보인다.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        // 폴더 선택은 Rust(pick_folder)에서만 부른다. JS 용 dialog 권한은 주지 않는다.
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let config_path = app.path().app_config_dir()?.join(config::CONFIG_FILE_NAME);
            let log_dir = app.path().app_log_dir()?;
            // 실패해도 앱은 띄운다. 설정을 못 읽는 이유는 get_services 오류로 화면에 나온다.
            if let Err(e) = config::ensure_config(&config_path) {
                eprintln!("{e}");
            }
            app.manage(Paths {
                config: config_path,
                log_dir,
            });
            app.manage(Registry::default());
            Ok(())
        })
        // 위젯을 닫으면 설정 창도 닫아 앱이 끝나게 한다 (위젯 없이 설정 창만 남지 않게).
        // destroy: JS 닫기 가로채기와 상관없이 닫는다. 설정 창만 닫는 건 위젯에 영향 없다.
        .on_window_event(|window, event| {
            if window.label() == MAIN_LABEL
                && matches!(event, WindowEvent::Destroyed)
                && let Some(settings) = window.get_webview_window(SETTINGS_LABEL)
            {
                let _ = settings.destroy();
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_services,
            start_service,
            stop_service,
            open_config,
            open_log,
            get_config,
            save_config,
            pick_folder,
            detect_project,
            open_settings
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn command_gating_by_window() {
        let settings_only = ["get_config", "save_config", "pick_folder", "detect_project"];
        let main_only = ["start_service", "stop_service", "open_log", "open_settings"];
        let both = ["get_services", "open_config"];
        for c in settings_only {
            assert!(allowed(c, SETTINGS_LABEL) && !allowed(c, MAIN_LABEL), "{c}");
        }
        for c in main_only {
            assert!(allowed(c, MAIN_LABEL) && !allowed(c, SETTINGS_LABEL), "{c}");
        }
        for c in both {
            assert!(allowed(c, MAIN_LABEL) && allowed(c, SETTINGS_LABEL), "{c}");
        }
        // 모르는 창·커맨드는 거부
        for c in settings_only.iter().chain(&main_only).chain(&both) {
            assert!(!allowed(c, "other") && !allowed(c, ""), "{c}");
        }
        assert!(!allowed("unknown", MAIN_LABEL) && !allowed("unknown", SETTINGS_LABEL));
    }
}

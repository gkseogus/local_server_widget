//! 설정 창: services.json 을 구조 그대로 읽고 원자적으로 저장, 폴더에서 프로젝트 종류 감지.

use crate::config::{self, CONFIG_FILE_MODE, CONFIG_FILE_NAME};
use crate::contents::{config as config_msg, settings as msg};
use crate::model::{ConfigFile, ConfigSnapshot, ProjectInfo, ProjectKind};
use std::fs;
use std::hash::{DefaultHasher, Hasher};
use std::io::{Read, Write};
use std::os::unix::fs::OpenOptionsExt;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

/// 감지할 때 읽는 파일(package.json, .env*)의 최대 크기. 넘으면 없는 것으로 본다.
const MAX_DETECT_FILE_BYTES: u64 = 1024 * 1024;

/// 폴더 이름 `<접두>_<역할>` / `<접두>-<역할>` 에서 역할로 인정하는 이름.
const ROLES: [&str; 9] = [
    "backend", "frontend", "admin", "api", "web", "server", "client", "app", "worker",
];

/// 변수 이름을 모을 env 파일 (이 순서로 읽는다).
const ENV_FILES: [&str; 5] = [
    ".env",
    ".env.local",
    ".env.development",
    ".env.development.local",
    ".env.example",
];

/// `-H 127.0.0.1`: next dev 는 기본이 모든 인터페이스라 LAN 에 노출된다 (README 보안 주의).
const NEXT_COMMAND: &str = "./node_modules/.bin/next dev -H 127.0.0.1 -p {port}";
const VITE_COMMAND: &str = "./node_modules/.bin/vite --port {port} --strictPort";

/// 같은 프로세스에서 저장이 겹쳐도 임시 파일 이름이 겹치지 않게 붙이는 번호.
static TMP_SEQ: AtomicU64 = AtomicU64::new(0);

/// 설정 파일을 구조 그대로 읽는다. 검증(포트 중복 등)은 하지 않아 문제가 있는 설정도 창에서 고칠 수 있다.
/// `revision` 은 읽은 바이트의 지문으로, 저장할 때 그사이 파일이 바뀌었는지 확인하는 데 쓴다.
pub fn read_config(path: &Path) -> Result<ConfigSnapshot, String> {
    let bytes = fs::read(path).map_err(|e| config_msg::read_failed(path, e))?;
    let config = serde_json::from_slice(&bytes)
        .map_err(|e| config_msg::parse_failed(CONFIG_FILE_NAME, e.line(), e.column(), &e))?;
    Ok(ConfigSnapshot {
        config,
        revision: fingerprint(&bytes),
    })
}

/// 위젯과 같은 검증(`parse_and_resolve`)을 통과해야 저장한다. 실패하면 그 문제 목록을 그대로 돌려준다.
/// 지금 파일의 지문이 `revision`(읽을 때 받은 값)과 다르거나 파일이 없으면 저장하지 않는다.
/// 같은 폴더 임시 파일(0600)에 다 쓴 뒤 rename 해서, 위젯이 반쯤 쓴 파일을 읽는 일이 없다.
/// 성공하면 방금 쓴 내용의 새 revision 을 돌려준다.
pub fn write_config(path: &Path, config: &ConfigFile, revision: &str) -> Result<String, String> {
    let err = |e: std::io::Error| msg::save_failed(path, e);
    let mut json = serde_json::to_string_pretty(config).map_err(|e| msg::save_failed(path, e))?;
    json.push('\n');
    config::parse_and_resolve(&json)?;

    // 밖에서 고쳤거나 지운 파일을 덮어쓰지 않는다.
    // ponytail: 확인과 rename 사이에 다른 프로그램(또는 겹친 저장)이 쓰면 그 변경은 덮인다. 막으려면 파일 잠금이 필요.
    if fs::read(path)
        .ok()
        .map(|bytes| fingerprint(&bytes))
        .as_deref()
        != Some(revision)
    {
        return Err(msg::CHANGED_ON_DISK.to_string());
    }

    // 설정 파일이 심볼릭 링크면 링크를 일반 파일로 바꾸지 않도록 실제 파일 자리에 쓴다.
    let target = fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf());
    let mut tmp = target.clone().into_os_string();
    tmp.push(format!(
        ".{}.{}.tmp",
        std::process::id(),
        TMP_SEQ.fetch_add(1, Ordering::Relaxed)
    ));
    let tmp = PathBuf::from(tmp);
    let mut file = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .mode(CONFIG_FILE_MODE)
        .open(&tmp)
        .map_err(err)?;
    let written = file
        .write_all(json.as_bytes())
        .and_then(|_| file.sync_all())
        .and_then(|_| fs::rename(&tmp, &target));
    if let Err(e) = written {
        let _ = fs::remove_file(&tmp);
        return Err(err(e));
    }
    Ok(fingerprint(json.as_bytes()))
}

/// 파일 내용의 지문 (16자리 hex). 바뀜 감지용이지 보안용이 아니다.
/// `DefaultHasher::new()` 는 같은 빌드 안에서 늘 같은 값을 내고, revision 은 앱이 한 번 도는 동안만 쓴다.
fn fingerprint(bytes: &[u8]) -> String {
    let mut hasher = DefaultHasher::new();
    hasher.write(bytes);
    format!("{:016x}", hasher.finish())
}

/// 일반 파일이고 `MAX_DETECT_FILE_BYTES` 이하일 때만 읽는다. 아니면(또는 못 읽으면) None.
/// `.env -> /dev/zero` 는 끝없이 읽히고 FIFO 는 영원히 기다리므로, 막히지 않게(O_NONBLOCK) 연 뒤
/// 연 핸들의 종류·크기(링크를 따라간 실제 대상)를 확인한다. 확인과 읽기 사이 파일 바꿔치기도 막는다.
fn read_small_file(path: &Path) -> Option<String> {
    let file = fs::OpenOptions::new()
        .read(true)
        .custom_flags(libc::O_NONBLOCK)
        .open(path)
        .ok()?;
    let meta = file.metadata().ok()?;
    if !meta.is_file() || meta.len() > MAX_DETECT_FILE_BYTES {
        return None;
    }
    let mut text = String::new();
    file.take(MAX_DETECT_FILE_BYTES)
        .read_to_string(&mut text)
        .ok()?;
    Some(text)
}

/// 폴더를 보고 종류·실행 명령·기본 포트·이름·env 변수 이름을 제안한다. `~/` 허용, 없는 폴더면 Err.
pub fn detect_project(cwd: &str) -> Result<ProjectInfo, String> {
    detect(cwd, std::env::var_os("HOME").map(PathBuf::from).as_deref())
}

/// 홈 아래 경로면 `~/...` 로 줄인다 (홈 자체는 `~`).
pub fn shorten_home(path: &Path) -> String {
    let home = std::env::var_os("HOME")
        .map(PathBuf::from)
        .filter(|h| h.is_absolute());
    match home.as_deref().and_then(|h| path.strip_prefix(h).ok()) {
        Some(rest) if rest.as_os_str().is_empty() => "~".to_string(),
        Some(rest) => format!("~/{}", rest.display()),
        None => path.display().to_string(),
    }
}

/// `detect_project` 본체. 테스트가 실제 홈 대신 임시 폴더를 `home` 으로 준다.
fn detect(cwd: &str, home: Option<&Path>) -> Result<ProjectInfo, String> {
    // 설정 검증과 같은 규칙: `~` 펼치기, 절대 경로, 있는 폴더, 루트·홈 거부.
    let dir = config::resolve_cwd(cwd, home)?;

    let fastapi_module = if !dir.join(".venv/bin/uvicorn").is_file() {
        None
    } else if dir.join("app/main.py").is_file() {
        Some("app.main")
    } else if dir.join("main.py").is_file() {
        Some("main")
    } else {
        None
    };
    // 깨진 package.json 은 없는 것으로 본다.
    let pkg: serde_json::Value = read_small_file(&dir.join("package.json"))
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default();
    let has_dep = |name: &str| {
        ["dependencies", "devDependencies"]
            .iter()
            .any(|k| pkg[*k].get(name).is_some())
    };
    let (kind, command, default_port) = if let Some(module) = fastapi_module {
        let command = format!(".venv/bin/uvicorn {module}:app --reload --port {{port}}");
        (ProjectKind::Fastapi, Some(command), Some(8000))
    } else if has_dep("next") {
        (
            ProjectKind::Next,
            Some(NEXT_COMMAND.to_string()),
            Some(3000),
        )
    } else if has_dep("vite") {
        (
            ProjectKind::Vite,
            Some(VITE_COMMAND.to_string()),
            Some(5173),
        )
    } else {
        (ProjectKind::Unknown, None, None)
    };

    // 정규화된 경로라 file_name 이 항상 있고 '/' 를 담을 수 없다 (루트는 resolve_cwd 가 거부).
    let folder = dir
        .file_name()
        .map(|n| n.to_string_lossy().trim().to_string())
        .unwrap_or_default();
    let (suggested_group, suggested_name) = suggest_names(&folder);

    let keys = env_keys(&dir);
    let is_cors = |k: &str| {
        let k = k.to_ascii_uppercase();
        k.contains("CORS") || k.ends_with("ALLOWED_ORIGINS")
    };
    // BACKEND_CORS_ORIGINS 같은 CORS 변수는 백엔드 주소가 아니라서 API 쪽에서 뺀다.
    let is_api = |k: &str| {
        let k = k.to_ascii_uppercase();
        !is_cors(&k)
            && (k.contains("API") || k.contains("BACKEND"))
            && ["URL", "ORIGIN", "BASE", "HOST"]
                .iter()
                .any(|s| k.contains(s))
    };
    Ok(ProjectInfo {
        kind,
        suggested_group,
        suggested_name,
        command,
        default_port,
        api_env_keys: keys.iter().filter(|k| is_api(k)).cloned().collect(),
        cors_env_keys: keys.iter().filter(|k| is_cors(k)).cloned().collect(),
    })
}

/// `acme_frontend` → (`acme`, `frontend`). 역할 이름이 아니면 (None, 폴더 이름).
fn suggest_names(folder: &str) -> (Option<String>, String) {
    match folder.rsplit_once(['_', '-']) {
        Some((prefix, role))
            if !prefix.trim().is_empty() && ROLES.iter().any(|r| r.eq_ignore_ascii_case(role)) =>
        {
            (Some(prefix.trim().to_string()), role.to_string())
        }
        _ => (None, ident_name(folder)),
    }
}

/// 서비스 이름은 템플릿 식별자(`[A-Za-z0-9_-]`)여야 하므로 그 밖의 글자는 `-` 로 바꾼다.
/// 남는 글자가 없으면(예: 한글만) "server".
fn ident_name(folder: &str) -> String {
    let name: String = folder
        .trim()
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '_' || c == '-' {
                c
            } else {
                '-'
            }
        })
        .collect();
    let name = name.trim_matches('-').to_string();
    if name.is_empty() {
        "server".to_string()
    } else {
        name
    }
}

/// `ENV_FILES` 의 `KEY=` 줄에서 변수 **이름만** 모은다 (중복 제거, 발견 순서).
/// 값은 따옴표가 여러 줄로 이어지는지 보는 데만 쓰고 보관하지 않는다.
fn env_keys(dir: &Path) -> Vec<String> {
    let mut keys: Vec<String> = Vec::new();
    for name in ENV_FILES {
        let Some(text) = read_small_file(&dir.join(name)) else {
            continue;
        };
        // 여러 줄 따옴표 값 안이면 그 따옴표. 그 줄들은 값이라 이름으로 읽지 않는다 (PEM 키 조각 등).
        let mut open_quote: Option<char> = None;
        for line in text.lines() {
            if let Some(q) = open_quote {
                if has_closing_quote(line, q) {
                    open_quote = None;
                }
                continue;
            }
            let line = line.trim_start();
            let line = line
                .strip_prefix("export")
                .filter(|rest| rest.starts_with(char::is_whitespace))
                .unwrap_or(line);
            let Some((key, value)) = line.split_once('=') else {
                continue;
            };
            // `# KEY=...` 주석은 이름 검사(`[A-Za-z_][A-Za-z0-9_]*`)에서 걸러진다.
            let key = key.trim();
            if !config::is_env_key(key) {
                continue;
            }
            let value = value.trim_start();
            open_quote = value
                .chars()
                .next()
                .filter(|q| matches!(q, '"' | '\'' | '`') && !has_closing_quote(&value[1..], *q));
            if !keys.iter().any(|k| k == key) {
                keys.push(key.to_string());
            }
        }
    }
    keys
}

/// `text` 에 역슬래시가 앞에 붙지 않은(`\"` 가 아닌) 따옴표 `q` 가 있는지.
fn has_closing_quote(text: &str, q: char) -> bool {
    text.match_indices(q)
        .any(|(i, _)| !text[..i].ends_with('\\'))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{GroupConfig, ServiceConfig};
    use std::collections::BTreeMap;
    use std::os::unix::fs::PermissionsExt;
    use tempfile::TempDir;

    /// 임시 폴더에 `(상대 경로, 내용)` 파일들을 만든다.
    fn project(files: &[(&str, &str)]) -> TempDir {
        let dir = tempfile::tempdir().unwrap();
        for (rel, content) in files {
            let path = dir.path().join(rel);
            fs::create_dir_all(path.parent().unwrap()).unwrap();
            fs::write(path, content).unwrap();
        }
        dir
    }

    fn detect_dir(dir: &TempDir) -> ProjectInfo {
        detect(dir.path().to_str().unwrap(), None).unwrap()
    }

    fn sample(cwd: &Path, port: u16) -> ConfigFile {
        ConfigFile {
            groups: vec![GroupConfig {
                name: "g".into(),
                services: vec![
                    ServiceConfig {
                        name: "backend".into(),
                        cwd: cwd.to_str().unwrap().into(),
                        port,
                        command: "run --port {port}".into(),
                        env: BTreeMap::from([("CORS_ORIGINS".into(), "{web.url}".into())]),
                    },
                    ServiceConfig {
                        name: "web".into(),
                        cwd: cwd.to_str().unwrap().into(),
                        port: port + 1,
                        command: "run".into(),
                        env: BTreeMap::new(),
                    },
                ],
            }],
        }
    }

    /// 설정 파일 이름 말고 남은 파일(임시 파일)이 없는지.
    fn only_config_left(dir: &Path) {
        let names: Vec<String> = fs::read_dir(dir)
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            .filter(|n| n != "proj")
            .collect();
        assert_eq!(names, vec![CONFIG_FILE_NAME.to_string()]);
    }

    /// 설정 파일 `old\n` 과 `proj/` 폴더가 있는 임시 폴더, 그 파일의 revision.
    fn saved_project() -> (TempDir, PathBuf, String) {
        let dir = project(&[("proj/x", ""), (CONFIG_FILE_NAME, "old\n")]);
        let path = dir.path().join(CONFIG_FILE_NAME);
        (dir, path, fingerprint(b"old\n"))
    }

    #[test]
    fn write_then_read_round_trip() {
        let (dir, path, rev) = saved_project();
        let cfg = sample(&dir.path().join("proj"), 18001);
        let rev = write_config(&path, &cfg, &rev).unwrap();
        // 돌려준 revision 이 새로 읽은 것과 같다
        let snapshot = read_config(&path).unwrap();
        assert_eq!(snapshot.config, cfg);
        assert_eq!(snapshot.revision, rev);
        // 덮어쓰기도 같은 자리
        let cfg2 = sample(&dir.path().join("proj"), 18011);
        let rev2 = write_config(&path, &cfg2, &rev).unwrap();
        assert_eq!(
            read_config(&path).unwrap(),
            ConfigSnapshot {
                config: cfg2,
                revision: rev2
            }
        );
        // 이미 쓴 내용 이전의 revision 으로는 저장할 수 없다
        assert_eq!(
            write_config(&path, &cfg, &rev).unwrap_err(),
            msg::CHANGED_ON_DISK
        );
        only_config_left(dir.path());
    }

    #[test]
    fn stale_revision_or_missing_file_is_rejected() {
        let (dir, path, _) = saved_project();
        let cfg = sample(&dir.path().join("proj"), 18001);
        fs::write(&path, serde_json::to_string(&cfg).unwrap()).unwrap();
        let rev = read_config(&path).unwrap().revision;

        // 창에서 편집하는 사이 밖에서 고쳤다
        fs::write(&path, "edited elsewhere\n").unwrap();
        let cfg2 = sample(&dir.path().join("proj"), 18011);
        assert_eq!(
            write_config(&path, &cfg2, &rev).unwrap_err(),
            msg::CHANGED_ON_DISK
        );
        assert_eq!(fs::read_to_string(&path).unwrap(), "edited elsewhere\n");
        only_config_left(dir.path());

        // 지워졌으면 다시 만들지 않는다
        fs::remove_file(&path).unwrap();
        assert_eq!(
            write_config(&path, &cfg2, &rev).unwrap_err(),
            msg::CHANGED_ON_DISK
        );
        assert_eq!(
            fs::read_dir(dir.path()).unwrap().count(),
            1,
            "proj 만 남아야 한다"
        );
    }

    #[test]
    fn written_file_is_private_pretty_and_ends_with_newline() {
        let (dir, path, rev) = saved_project();
        let cfg = sample(&dir.path().join("proj"), 18001);
        write_config(&path, &cfg, &rev).unwrap();
        let text = fs::read_to_string(&path).unwrap();
        assert_eq!(text, serde_json::to_string_pretty(&cfg).unwrap() + "\n");
        assert!(text.starts_with("{\n  \"groups\": [\n    {\n"), "{text}");
        assert_eq!(
            fs::metadata(&path).unwrap().permissions().mode() & 0o777,
            0o600
        );
    }

    #[test]
    fn invalid_config_is_rejected_and_file_untouched() {
        let dir = project(&[("proj/x", ""), (CONFIG_FILE_NAME, "original\n")]);
        let path = dir.path().join(CONFIG_FILE_NAME);
        let mut cfg = sample(&dir.path().join("proj"), 18001);
        cfg.groups[0].services[1].port = 18001;
        cfg.groups[0].services[1].command = " ".into();
        let err = write_config(&path, &cfg, &fingerprint(b"original\n")).unwrap_err();
        let json = serde_json::to_string_pretty(&cfg).unwrap();
        assert_eq!(err, config::parse_and_resolve(&json).unwrap_err());
        assert_eq!(
            err.lines().collect::<Vec<_>>(),
            [
                "g/web: 포트 18001 가 g/backend 와 중복됩니다",
                "g/web: command 가 비어 있습니다"
            ]
        );
        assert_eq!(fs::read_to_string(&path).unwrap(), "original\n");
        only_config_left(dir.path());
    }

    #[test]
    fn read_config_reports_parse_and_io_errors() {
        let dir = project(&[(CONFIG_FILE_NAME, "{\"groups\": [\n  oops\n]}")]);
        let err = read_config(&dir.path().join(CONFIG_FILE_NAME)).unwrap_err();
        assert!(err.contains("형식 오류 (2행"), "{err}");
        let missing = dir.path().join("missing.json");
        let err = read_config(&missing).unwrap_err();
        assert!(err.contains(missing.to_str().unwrap()), "{err}");
    }

    #[test]
    fn detects_fastapi_app_main_and_main() {
        let uvicorn = (".venv/bin/uvicorn", "#!/bin/sh");
        let app = project(&[uvicorn, ("app/main.py", ""), ("main.py", "")]);
        let info = detect_dir(&app);
        assert_eq!(info.kind, ProjectKind::Fastapi);
        assert_eq!(
            info.command.as_deref(),
            Some(".venv/bin/uvicorn app.main:app --reload --port {port}")
        );
        assert_eq!(info.default_port, Some(8000));

        let flat = project(&[uvicorn, ("main.py", "")]);
        assert_eq!(
            detect_dir(&flat).command.as_deref(),
            Some(".venv/bin/uvicorn main:app --reload --port {port}")
        );

        // uvicorn 이 없으면 FastAPI 로 보지 않는다
        let no_venv = project(&[("app/main.py", "")]);
        assert_eq!(detect_dir(&no_venv).kind, ProjectKind::Unknown);
    }

    #[test]
    fn detects_next_vite_and_next_wins() {
        let next = project(&[("package.json", r#"{"dependencies": {"next": "15"}}"#)]);
        let info = detect_dir(&next);
        assert_eq!(info.kind, ProjectKind::Next);
        assert_eq!(info.command.as_deref(), Some(NEXT_COMMAND));
        assert_eq!(info.default_port, Some(3000));

        let vite = project(&[("package.json", r#"{"devDependencies": {"vite": "7"}}"#)]);
        let info = detect_dir(&vite);
        assert_eq!(info.kind, ProjectKind::Vite);
        assert_eq!(info.command.as_deref(), Some(VITE_COMMAND));
        assert_eq!(info.default_port, Some(5173));

        let both = project(&[(
            "package.json",
            r#"{"dependencies": {"next": "15"}, "devDependencies": {"vite": "7"}}"#,
        )]);
        assert_eq!(detect_dir(&both).kind, ProjectKind::Next);
    }

    #[test]
    fn unknown_project_has_no_command_or_port() {
        let dir = project(&[("package.json", "not json"), ("README.md", "")]);
        let info = detect_dir(&dir);
        assert_eq!(info.kind, ProjectKind::Unknown);
        assert_eq!(info.command, None);
        assert_eq!(info.default_port, None);
        assert!(info.api_env_keys.is_empty() && info.cors_env_keys.is_empty());
    }

    #[test]
    fn name_suggestions() {
        let cases = [
            ("acme_frontend", Some("acme"), "frontend"),
            ("my-api", Some("my"), "api"),
            ("my_cool-Backend", Some("my_cool"), "Backend"),
            ("website", None, "website"),
            ("acme_docs", None, "acme_docs"),
            ("_api", None, "_api"),
        ];
        for (folder, group, name) in cases {
            assert_eq!(
                suggest_names(folder),
                (group.map(String::from), name.to_string()),
                "{folder}"
            );
        }
        // 실제 폴더 이름에서
        let parent = tempfile::tempdir().unwrap();
        let dir = parent.path().join("acme_frontend");
        fs::create_dir(&dir).unwrap();
        let info = detect(dir.to_str().unwrap(), None).unwrap();
        assert_eq!(info.suggested_group.as_deref(), Some("acme"));
        assert_eq!(info.suggested_name, "frontend");
    }

    #[test]
    fn env_key_names_are_collected_in_order_without_duplicates() {
        let dir = project(&[
            (
                ".env",
                "# NEXT_PUBLIC_API_URL=commented\n# OLD=\"unclosed\n\nexport NEXT_PUBLIC_API_BASE_URL=http://a\nPLAIN=1\n",
            ),
            (
                ".env.local",
                "  BACKEND_ORIGIN = http://b\nNEXT_PUBLIC_API_BASE_URL=dup\n",
            ),
            (".env.development", "BACKEND_CORS_ORIGINS=x\nexportFOO=1\n"),
            (".env.development.local", "CORS_ORIGINS=y\nAPI_KEY=z\n"),
            (".env.example", "VITE_API_URL=\nDJANGO_ALLOWED_ORIGINS=\n"),
        ]);
        assert_eq!(
            env_keys(dir.path()),
            [
                "NEXT_PUBLIC_API_BASE_URL",
                "PLAIN",
                "BACKEND_ORIGIN",
                "BACKEND_CORS_ORIGINS",
                "exportFOO",
                "CORS_ORIGINS",
                "API_KEY",
                "VITE_API_URL",
                "DJANGO_ALLOWED_ORIGINS",
            ]
        );
        let info = detect_dir(&dir);
        assert_eq!(
            info.api_env_keys,
            ["NEXT_PUBLIC_API_BASE_URL", "BACKEND_ORIGIN", "VITE_API_URL"]
        );
        assert_eq!(
            info.cors_env_keys,
            [
                "BACKEND_CORS_ORIGINS",
                "CORS_ORIGINS",
                "DJANGO_ALLOWED_ORIGINS"
            ]
        );
    }

    #[test]
    fn env_values_are_never_returned() {
        let dir = project(&[(
            ".env",
            "NEXT_PUBLIC_API_URL=http://secret-host-1234\n\
             CORS_ORIGINS='http://secret-origin-5678'\n\
             PRIVATE_KEY=\"-----BEGIN KEY-----\n\
             SECRETAPIURLCHUNK=\n\
             -----END KEY-----\"\n\
             BACKEND_URL=s3cr3t\n",
        )]);
        let info = detect_dir(&dir);
        assert_eq!(info.api_env_keys, ["NEXT_PUBLIC_API_URL", "BACKEND_URL"]);
        assert_eq!(info.cors_env_keys, ["CORS_ORIGINS"]);
        let json = serde_json::to_string(&info).unwrap();
        for secret in [
            "secret-host",
            "secret-origin",
            "SECRETAPIURLCHUNK",
            "s3cr3t",
            "BEGIN",
        ] {
            assert!(!json.contains(secret), "{secret} 가 노출됨: {json}");
        }
    }

    #[test]
    fn multiline_backtick_and_escaped_quote_values_are_not_keys() {
        let dir = project(&[(
            ".env",
            r#"A=`first
BACKEND_API_URL=http://inside-backtick
`
B="say \"hi\"
NEXT_PUBLIC_API_URL=http://inside \" quote
"
VITE_API_URL=after
"#,
        )]);
        assert_eq!(env_keys(dir.path()), ["A", "B", "VITE_API_URL"]);
        assert_eq!(detect_dir(&dir).api_env_keys, ["VITE_API_URL"]);
    }

    #[test]
    fn special_or_oversized_files_are_skipped_without_hanging() {
        let dir = project(&[(".env.example", "VITE_API_URL=\n")]);
        let p = dir.path();
        std::os::unix::fs::symlink("/dev/zero", p.join(".env")).unwrap();
        std::os::unix::fs::symlink("/dev/zero", p.join("package.json")).unwrap();
        let fifo = std::ffi::CString::new(p.join(".env.local").to_str().unwrap()).unwrap();
        assert_eq!(unsafe { libc::mkfifo(fifo.as_ptr(), 0o600) }, 0);
        // 한도를 넘는 일반 파일은 앞부분도 읽지 않는다
        let big = fs::File::create(p.join(".env.development")).unwrap();
        (&big).write_all(b"BACKEND_API_URL=x\n").unwrap();
        big.set_len(MAX_DETECT_FILE_BYTES + 1).unwrap();

        // 고치기 전에는 끝없이 읽거나(/dev/zero) 멈췄다(FIFO). 멈춰도 테스트가 끝나도록 스레드에서 기다린다.
        let cwd = p.to_str().unwrap().to_string();
        let (tx, rx) = std::sync::mpsc::channel();
        std::thread::spawn(move || tx.send(detect(&cwd, None)).unwrap());
        let info = rx
            .recv_timeout(std::time::Duration::from_secs(5))
            .expect("detect 가 멈췄다")
            .unwrap();
        assert_eq!(info.kind, ProjectKind::Unknown);
        assert_eq!(info.api_env_keys, ["VITE_API_URL"]);
        assert!(info.cors_env_keys.is_empty());
        for bad in ["package.json", ".env", ".env.local", ".env.development"] {
            assert_eq!(read_small_file(&p.join(bad)), None, "{bad}");
        }
        // 작은 일반 파일은 그대로 읽는다
        assert_eq!(
            read_small_file(&p.join(".env.example")).as_deref(),
            Some("VITE_API_URL=\n")
        );
    }

    #[test]
    fn tilde_and_missing_folder() {
        let home = project(&[("proj/package.json", r#"{"dependencies": {"vite": "7"}}"#)]);
        let info = detect("~/proj", Some(home.path())).unwrap();
        assert_eq!(info.kind, ProjectKind::Vite);
        assert_eq!(info.suggested_name, "proj");

        let err = detect("~/nope", Some(home.path())).unwrap_err();
        assert!(err.contains("찾을 수 없습니다"), "{err}");
        let missing = home.path().join("nope");
        assert!(detect_project(missing.to_str().unwrap()).is_err());
        // 홈 자체는 프로젝트 폴더로 쓸 수 없다
        assert!(detect("~", Some(home.path())).is_err());
    }

    #[test]
    fn shorten_home_only_under_home() {
        let home = PathBuf::from(std::env::var_os("HOME").unwrap());
        assert_eq!(shorten_home(&home.join("Desktop/foo")), "~/Desktop/foo");
        assert_eq!(shorten_home(&home), "~");
        let sibling = format!("{}x/foo", home.display());
        assert_eq!(shorten_home(Path::new(&sibling)), sibling);
        assert_eq!(shorten_home(Path::new("/opt/proj")), "/opt/proj");
    }

    #[test]
    fn suggested_name_is_a_valid_service_name() {
        assert_eq!(suggest_names("my site.v2").1, "my-site-v2");
        assert_eq!(suggest_names("백엔드").1, "server");
        assert!(crate::config::is_ident(&suggest_names("웹 frontend!").1));
    }
}

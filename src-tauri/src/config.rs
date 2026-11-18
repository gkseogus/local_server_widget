//! services.json 읽기, 검증, 템플릿 치환.

use crate::contents::config as msg;
use crate::model::{ConfigFile, ResolvedService};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::{ErrorKind, Write};
use std::os::unix::fs::OpenOptionsExt;
use std::path::{Path, PathBuf};

pub const CONFIG_FILE_NAME: &str = "services.json";

/// 설정 파일 권한 (본인만 읽고 쓰기). 처음 만들 때와 저장할 때 같다.
pub const CONFIG_FILE_MODE: u32 = 0o600;

/// 예시 서비스가 서빙하는 폴더 이름. 설정 파일 옆에 만든다.
pub const EXAMPLE_SITE_DIR: &str = "example-site";

/// 설정 파일이 없을 때 `ensure_config` 가 쓰는 예시. `site_dir`(절대 경로)를 서빙한다.
pub fn example_config(site_dir: &Path) -> String {
    // 따옴표·역슬래시는 serde_json 이 이스케이프한다. 키 순서를 읽기 좋게 두려고 틀은 문자열로 둔다.
    let cwd = serde_json::Value::from(site_dir.to_string_lossy()).to_string();
    format!(
        r#"{{
  "groups": [
    {{
      "name": "example",
      "services": [
        {{
          "name": "static",
          "cwd": {cwd},
          "port": 8765,
          "command": "python3 -m http.server {{port}} --bind 127.0.0.1",
          "env": {{}}
        }}
      ]
    }}
  ]
}}
"#
    )
}

/// `path` 가 없으면 설정 파일 옆에 빈 `EXAMPLE_SITE_DIR` 를 만들고 그 폴더를 서빙하는 예시를 쓴다.
/// 이미 있으면 아무것도 만들지 않고, 절대 덮어쓰지 않는다.
pub fn ensure_config(path: &Path) -> Result<(), String> {
    let err = |e: std::io::Error| msg::create_failed(path, e);
    if path.exists() {
        return Ok(());
    }
    // 공유 폴더(/tmp)를 서빙하면 다른 로컬 사용자가 그 안의 파일을 받아 갈 수 있어 앱 전용 빈 폴더를 쓴다.
    let site = path
        .parent()
        .unwrap_or(Path::new(""))
        .join(EXAMPLE_SITE_DIR);
    fs::create_dir_all(&site).map_err(err)?;
    let site = fs::canonicalize(&site).map_err(err)?;
    // create_new: 이미 있으면 AlreadyExists — 확인과 생성 사이 경쟁에서도 덮어쓰지 않는다.
    match fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .mode(CONFIG_FILE_MODE)
        .open(path)
    {
        Ok(mut file) => file
            .write_all(example_config(&site).as_bytes())
            .map_err(err),
        Err(e) if e.kind() == ErrorKind::AlreadyExists => Ok(()),
        Err(e) => Err(err(e)),
    }
}

/// 읽기 + `parse_and_resolve`. IO 오류는 경로를 포함한 메시지가 된다.
pub fn load(path: &Path) -> Result<Vec<ResolvedService>, String> {
    let json = fs::read_to_string(path).map_err(|e| msg::read_failed(path, e))?;
    parse_and_resolve(&json)
}

/// 파싱, 검증, 치환. 문제는 한 줄에 하나씩 모아서 함께 보고한다.
/// 출력 순서 = 파일 순서(그룹, 그다음 서비스).
pub fn parse_and_resolve(json: &str) -> Result<Vec<ResolvedService>, String> {
    let file: ConfigFile = serde_json::from_str(json)
        .map_err(|e| msg::parse_failed(CONFIG_FILE_NAME, e.line(), e.column(), &e))?;

    let mut problems: Vec<String> = Vec::new();
    let mut resolved: Vec<ResolvedService> = Vec::new();
    // 이름 중복은 소문자로 비교한다. 로그가 `<group>/<name>.log` 인데 APFS 는 대소문자를 구분하지 않아
    // `Backend` 와 `backend` 가 같은 로그 파일을 쓰게 된다.
    let mut group_names: HashSet<String> = HashSet::new();
    // 포트 → 먼저 그 포트를 쓴 서비스 라벨 (그룹을 가로질러 검사)
    let mut ports: HashMap<u16, String> = HashMap::new();
    let home = std::env::var_os("HOME").map(PathBuf::from);

    for (gi, group) in file.groups.iter().enumerate() {
        let g = group.name.as_str();
        let group_label = if g.is_empty() {
            msg::group_label(gi + 1)
        } else {
            g.to_string()
        };
        if g.is_empty() {
            problems.push(format!("{group_label}: {}", msg::NAME_EMPTY));
        } else if !is_path_segment(g) {
            problems.push(format!("{group_label}: {}", msg::GROUP_NAME_INVALID));
        } else if !group_names.insert(g.to_lowercase()) {
            problems.push(format!("{group_label}: {}", msg::GROUP_NAME_DUPLICATE));
        }

        // {<service>.url} 은 같은 그룹 안에서만 찾는다. 이름이 겹치면 첫 번째 (어차피 오류로 보고됨).
        let mut siblings: HashMap<&str, u16> = HashMap::new();
        for svc in &group.services {
            siblings.entry(svc.name.as_str()).or_insert(svc.port);
        }
        let mut service_names: HashSet<String> = HashSet::new();

        for (si, svc) in group.services.iter().enumerate() {
            let id = format!("{g}/{}", svc.name);
            let label = if svc.name.is_empty() {
                msg::service_label(&group_label, si + 1)
            } else {
                id.clone()
            };
            let mut errs: Vec<String> = Vec::new();

            if svc.name.is_empty() {
                errs.push(msg::NAME_EMPTY.to_string());
            } else if !is_ident(&svc.name) {
                // `{이름.url}` 템플릿으로 참조되므로 템플릿 식별자 규칙을 따라야 한다
                errs.push(msg::SERVICE_NAME_INVALID.to_string());
            } else if !service_names.insert(svc.name.to_lowercase()) {
                errs.push(msg::SERVICE_NAME_DUPLICATE.to_string());
            }

            if svc.port == 0 {
                errs.push(msg::PORT_ZERO.to_string());
            } else if let Some(other) = ports.get(&svc.port) {
                errs.push(msg::port_duplicate(svc.port, other));
            } else {
                ports.insert(svc.port, label.clone());
            }

            let cwd = resolve_cwd(&svc.cwd, home.as_deref())
                .map_err(|e| errs.push(e))
                .ok();

            if svc.command.trim().is_empty() {
                errs.push(msg::COMMAND_EMPTY.to_string());
            }
            let command = render(&svc.command, svc.port, &siblings, &mut errs);

            let mut env = svc.env.clone();
            for (key, value) in env.iter_mut() {
                if !is_env_key(key) {
                    errs.push(msg::env_key_invalid(key));
                }
                *value = render(value, svc.port, &siblings, &mut errs);
            }

            problems.extend(errs.iter().map(|e| format!("{label}: {e}")));
            if let (Some(cwd), true) = (cwd, errs.is_empty()) {
                resolved.push(ResolvedService {
                    id,
                    group: group.name.clone(),
                    name: svc.name.clone(),
                    cwd,
                    port: svc.port,
                    url: local_url(svc.port),
                    command,
                    env,
                });
            }
        }
    }

    if problems.is_empty() {
        Ok(resolved)
    } else {
        Err(problems.join("\n"))
    }
}

/// `"<group>/<name>.log"` — 그룹별 하위 폴더. 이름에 `/`, `.`, `..` 가 없음은 검증에서 보장한다.
pub fn log_file_name(svc: &ResolvedService) -> String {
    format!("{}/{}.log", svc.group, svc.name)
}

/// 로그 경로 한 칸으로 써도 안전한 이름인지 (`/` 없음, `.`·`..` 아님).
fn is_path_segment(name: &str) -> bool {
    !name.contains('/') && name != "." && name != ".."
}

fn local_url(port: u16) -> String {
    format!("http://localhost:{port}")
}

/// 앞의 `~` / `~/` 를 `home` 으로 펼치고, 존재하는 절대 경로 폴더인지 확인한 뒤 정규화한다.
/// `/` 와 홈 폴더 자체는 거부한다.
/// ponytail: `~user` 형태는 펼치지 않음(절대 경로 아님 오류로 보고됨).
pub(crate) fn resolve_cwd(raw: &str, home: Option<&Path>) -> Result<PathBuf, String> {
    let expanded = match (raw.strip_prefix('~'), home) {
        (Some(rest), Some(home)) if rest.is_empty() || rest.starts_with('/') => {
            home.join(rest.trim_start_matches('/'))
        }
        _ => PathBuf::from(raw),
    };
    if !expanded.is_absolute() {
        return Err(msg::cwd_not_absolute(raw));
    }
    let path = fs::canonicalize(&expanded).map_err(|_| msg::cwd_not_found(raw))?;
    if !path.is_dir() {
        return Err(msg::cwd_not_dir(raw));
    }
    // 실행 중인 서버의 소유를 cwd 일치로 판정하므로, `/` 나 홈 폴더면 같은 cwd 로 도는
    // IDE·시스템 프로세스를 이 서비스로 오인해 끌 수 있다.
    let is_home = home
        .and_then(|h| fs::canonicalize(h).ok())
        .is_some_and(|h| h == path);
    if path == Path::new("/") || is_home {
        return Err(msg::cwd_root_or_home(raw));
    }
    Ok(path)
}

/// `[A-Za-z_][A-Za-z0-9_]*`
pub(crate) fn is_env_key(key: &str) -> bool {
    let mut chars = key.chars();
    matches!(chars.next(), Some(c) if c.is_ascii_alphabetic() || c == '_')
        && chars.all(|c| c.is_ascii_alphanumeric() || c == '_')
}

/// `identifier` 또는 `identifier.url` (identifier = `[A-Za-z0-9_-]+`)
fn is_placeholder(token: &str) -> bool {
    is_ident(token.strip_suffix(".url").unwrap_or(token))
}

/// 템플릿 식별자 `[A-Za-z0-9_-]+`. 서비스 이름도 이 규칙을 따른다(`.`·`..`·`/` 는 자동으로 제외).
pub(crate) fn is_ident(name: &str) -> bool {
    !name.is_empty()
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
}

/// `{port}` → 자기 포트, `{<service>.url}` → 같은 그룹 서비스 URL. 다른 placeholder 는 오류,
/// placeholder 모양이 아닌 중괄호는 그대로 둔다.
fn render(text: &str, port: u16, siblings: &HashMap<&str, u16>, errs: &mut Vec<String>) -> String {
    let mut out = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(open) = rest.find('{') {
        out.push_str(&rest[..open]);
        let after = &rest[open + 1..];
        let Some(token) = after
            .find('}')
            .map(|close| &after[..close])
            .filter(|t| is_placeholder(t))
        else {
            out.push('{');
            rest = after;
            continue;
        };
        let replacement = match token.strip_suffix(".url") {
            Some(svc) => siblings
                .get(svc)
                .map(|p| local_url(*p))
                .ok_or_else(|| msg::template_service_missing(token, svc)),
            None if token == "port" => Ok(port.to_string()),
            None => Err(msg::template_unknown(token)),
        };
        match replacement {
            Ok(value) => out.push_str(&value),
            Err(e) => errs.push(e),
        }
        rest = &after[token.len() + 1..];
    }
    out.push_str(rest);
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 서비스 하나짜리 JSON. cwd 는 JSON 문자열로 그대로 들어간다.
    fn one(name: &str, cwd: &str, port: u16, command: &str) -> String {
        serde_json::json!({ "name": name, "cwd": cwd, "port": port, "command": command })
            .to_string()
    }

    fn config(groups: &[(&str, Vec<String>)]) -> String {
        let groups: Vec<String> = groups
            .iter()
            .map(|(name, services)| {
                format!(
                    r#"{{"name": "{name}", "services": [{}]}}"#,
                    services.join(",")
                )
            })
            .collect();
        format!(r#"{{"groups": [{}]}}"#, groups.join(","))
    }

    fn tmp() -> (tempfile::TempDir, String) {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().to_str().unwrap().to_string();
        (dir, path)
    }

    #[test]
    fn resolves_port_and_sibling_url_templates() {
        let (dir, cwd) = tmp();
        let json = format!(
            r#"{{"groups": [{{"name": "acme", "services": [
                {{"name": "backend", "cwd": "{cwd}", "port": 18002, "command": "uvicorn app:app --port {{port}}"}},
                {{"name": "front-end", "cwd": "{cwd}", "port": 15173, "command": "pnpm dev --port {{port}}",
                  "env": {{"VITE_API_URL": "{{backend.url}}/api", "RAW": "a {{not a template}} {{}} {{x.y}}"}}}}
            ]}}]}}"#
        );
        let services = parse_and_resolve(&json).unwrap();
        assert_eq!(services.len(), 2);
        let (back, front) = (&services[0], &services[1]);
        assert_eq!(back.id, "acme/backend");
        assert_eq!(back.url, "http://localhost:18002");
        assert_eq!(back.command, "uvicorn app:app --port 18002");
        assert_eq!(back.cwd, fs::canonicalize(dir.path()).unwrap());
        assert_eq!(front.id, "acme/front-end");
        assert_eq!(front.command, "pnpm dev --port 15173");
        assert_eq!(front.env["VITE_API_URL"], "http://localhost:18002/api");
        assert_eq!(front.env["RAW"], "a {not a template} {} {x.y}");
        assert_eq!(log_file_name(front), "acme/front-end.log");
    }

    #[test]
    fn json_syntax_error_keeps_line_and_column() {
        let err = parse_and_resolve("{\n  \"groups\": [\n    oops\n  ]\n}").unwrap_err();
        assert!(err.contains("3행"), "{err}");
        assert!(err.contains("line 3"), "{err}");
        assert!(!err.contains('\n'), "{err}");
    }

    #[test]
    fn unknown_field_is_a_parse_error() {
        let err = parse_and_resolve(r#"{"groups": [], "extra": 1}"#).unwrap_err();
        assert!(err.contains("extra"), "{err}");
    }

    #[test]
    fn duplicate_port_across_groups() {
        let (_dir, cwd) = tmp();
        let json = config(&[
            ("blog", vec![one("backend", &cwd, 18002, "run")]),
            ("acme", vec![one("backend", &cwd, 18002, "run")]),
        ]);
        assert_eq!(
            parse_and_resolve(&json).unwrap_err(),
            "acme/backend: 포트 18002 가 blog/backend 와 중복됩니다"
        );
    }

    #[test]
    fn unknown_placeholder_is_named() {
        let (_dir, cwd) = tmp();
        let json = config(&[(
            "g",
            vec![one("api", &cwd, 18001, "run --host {host} --port {port}")],
        )]);
        let err = parse_and_resolve(&json).unwrap_err();
        assert_eq!(err, "g/api: 알 수 없는 템플릿 {host}");
    }

    #[test]
    fn url_template_cannot_reach_another_group() {
        let (_dir, cwd) = tmp();
        let json = config(&[
            ("blog", vec![one("backend", &cwd, 18002, "run")]),
            (
                "acme",
                vec![one("web", &cwd, 15173, "run --api {backend.url}")],
            ),
        ]);
        let err = parse_and_resolve(&json).unwrap_err();
        assert!(err.starts_with("acme/web: {backend.url}"), "{err}");
        assert!(!err.contains('\n'), "{err}");
    }

    #[test]
    fn missing_cwd_and_relative_cwd() {
        let (dir, _cwd) = tmp();
        let missing = dir.path().join("nope");
        let file = dir.path().join("file.txt");
        fs::write(&file, "x").unwrap();
        let json = config(&[(
            "g",
            vec![
                one("a", missing.to_str().unwrap(), 18001, "run"),
                one("b", "relative/dir", 18002, "run"),
                one("c", file.to_str().unwrap(), 18003, "run"),
            ],
        )]);
        let err = parse_and_resolve(&json).unwrap_err();
        let lines: Vec<&str> = err.lines().collect();
        assert_eq!(lines.len(), 3, "{err}");
        assert!(
            lines[0].starts_with("g/a: ") && lines[0].contains("찾을 수 없습니다"),
            "{err}"
        );
        assert!(
            lines[1].starts_with("g/b: ") && lines[1].contains("절대 경로"),
            "{err}"
        );
        assert!(
            lines[2].starts_with("g/c: ") && lines[2].contains("폴더가 아닙니다"),
            "{err}"
        );
    }

    #[test]
    fn slash_in_names_is_rejected() {
        let (_dir, cwd) = tmp();
        let json = config(&[("a/b", vec![one("x/y", &cwd, 18001, "run")])]);
        let err = parse_and_resolve(&json).unwrap_err();
        assert!(err.contains("a/b: 그룹 이름에 '/'"), "{err}");
        assert!(err.contains("a/b/x/y: 서비스 이름은 영문"), "{err}");
    }

    #[test]
    fn service_names_must_be_template_identifiers() {
        // `{my api.url}` 은 템플릿으로 인식되지 않아 조용히 깨지므로 이름 단계에서 막는다.
        let (_dir, cwd) = tmp();
        for bad in ["my api", "백엔드", "a.b", "x+y"] {
            let json = config(&[("g", vec![one(bad, &cwd, 18001, "run")])]);
            let err = parse_and_resolve(&json).unwrap_err();
            assert!(err.contains("서비스 이름은 영문"), "{bad}: {err}");
        }
        let json = config(&[("g", vec![one("api_v2-x", &cwd, 18001, "run")])]);
        assert!(parse_and_resolve(&json).is_ok());
    }

    #[test]
    fn dot_names_are_rejected() {
        // 로그가 `<group>/<name>.log` 라서 `..` 은 로그 폴더 밖을 가리킬 수 있다.
        let (_dir, cwd) = tmp();
        let json = config(&[
            ("..", vec![one("api", &cwd, 18001, "run")]),
            ("g", vec![one(".", &cwd, 18002, "run")]),
        ]);
        let err = parse_and_resolve(&json).unwrap_err();
        assert!(err.contains("..: 그룹 이름에"), "{err}");
        assert!(err.contains("g/.: 서비스 이름은 영문"), "{err}");
    }

    #[test]
    fn log_names_do_not_collide() {
        let (_dir, cwd) = tmp();
        let json = config(&[
            ("a-b", vec![one("c", &cwd, 18001, "run")]),
            ("a", vec![one("b-c", &cwd, 18002, "run")]),
        ]);
        let services = parse_and_resolve(&json).unwrap();
        assert_eq!(log_file_name(&services[0]), "a-b/c.log");
        assert_eq!(log_file_name(&services[1]), "a/b-c.log");
    }

    #[test]
    fn root_and_home_cwd_are_rejected() {
        let (home_dir, home) = tmp();
        let home_path = Some(home_dir.path());
        for raw in ["/", "~", "~/", home.as_str()] {
            let err = resolve_cwd(raw, home_path).unwrap_err();
            assert!(err.contains("프로젝트 폴더를 지정하세요"), "{raw}: {err}");
        }
        // 실제 $HOME 으로도 parse_and_resolve 가 거부한다.
        let json = config(&[(
            "g",
            vec![one("a", "/", 18001, "run"), one("b", "~", 18002, "run")],
        )]);
        let err = parse_and_resolve(&json).unwrap_err();
        assert_eq!(err.lines().count(), 2, "{err}");
        assert!(
            err.lines()
                .all(|l| l.contains("프로젝트 폴더를 지정하세요")),
            "{err}"
        );
    }

    #[test]
    fn reports_all_problems_together() {
        let (_dir, cwd) = tmp();
        let svc_bad_env = format!(
            r#"{{"name": "w", "cwd": "{cwd}", "port": 18003, "command": "run", "env": {{"1BAD": "v"}}}}"#
        );
        let json = config(&[
            ("", vec![one("", &cwd, 0, " ")]),
            (
                "g",
                vec![
                    one("s", &cwd, 18001, "run"),
                    one("s", &cwd, 18002, "run"),
                    svc_bad_env,
                ],
            ),
            ("g", vec![]),
        ]);
        let err = parse_and_resolve(&json).unwrap_err();
        let expected = [
            "1번째 그룹: 이름이 비어 있습니다",
            "1번째 그룹/1번째 서비스: 이름이 비어 있습니다",
            "1번째 그룹/1번째 서비스: 포트는 0 일 수 없습니다",
            "1번째 그룹/1번째 서비스: command 가 비어 있습니다",
            "g/s: 같은 그룹에 같은 이름의 서비스가 있습니다",
            "g/w: 환경변수 이름 \"1BAD\" 가 올바르지 않습니다",
            "g: 그룹 이름이 중복됩니다",
        ];
        assert_eq!(err.lines().collect::<Vec<_>>(), expected);
    }

    #[test]
    fn tilde_expands_to_home() {
        let (home_dir, _home) = tmp();
        fs::create_dir(home_dir.path().join("proj")).unwrap();
        let expected = fs::canonicalize(home_dir.path().join("proj")).unwrap();
        assert_eq!(
            resolve_cwd("~/proj", Some(home_dir.path())).unwrap(),
            expected
        );
        // `~user` 는 펼치지 않는다.
        let err = resolve_cwd("~proj", Some(home_dir.path())).unwrap_err();
        assert!(err.contains("절대 경로"), "{err}");
    }

    #[test]
    fn names_differing_only_in_case_are_duplicates() {
        // 대소문자를 구분하지 않는 파일 시스템에서 같은 로그 파일을 쓰게 된다.
        let (_dir, cwd) = tmp();
        let json = config(&[
            (
                "G",
                vec![
                    one("Backend", &cwd, 18001, "run"),
                    one("backend", &cwd, 18002, "run"),
                ],
            ),
            ("g", vec![one("x", &cwd, 18003, "run")]),
        ]);
        let err = parse_and_resolve(&json).unwrap_err();
        let expected = [
            "G/backend: 같은 그룹에 같은 이름의 서비스가 있습니다",
            "g: 그룹 이름이 중복됩니다",
        ];
        assert_eq!(err.lines().collect::<Vec<_>>(), expected);
    }

    #[test]
    fn same_service_name_with_different_case_in_other_group_is_fine() {
        let (_dir, cwd) = tmp();
        let json = config(&[
            ("a", vec![one("Backend", &cwd, 18001, "run")]),
            ("b", vec![one("backend", &cwd, 18002, "run")]),
        ]);
        assert_eq!(parse_and_resolve(&json).unwrap().len(), 2);
    }

    #[test]
    fn ensure_config_creates_then_never_overwrites() {
        let (dir, _cwd) = tmp();
        let config_dir = dir.path().join("nested/dir");
        let path = config_dir.join(CONFIG_FILE_NAME);
        ensure_config(&path).unwrap();
        let site = fs::canonicalize(config_dir.join(EXAMPLE_SITE_DIR)).unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), example_config(&site));
        // 처음 만든 설정 파일도 본인만 읽고 쓴다
        assert_eq!(
            std::os::unix::fs::PermissionsExt::mode(&fs::metadata(&path).unwrap().permissions())
                & 0o777,
            CONFIG_FILE_MODE
        );
        assert_eq!(load(&path).unwrap()[0].cwd, site);
        assert_eq!(
            fs::read_dir(&site).unwrap().count(),
            0,
            "예시 폴더는 비어 있어야 한다"
        );

        fs::write(&path, "user edits").unwrap();
        fs::remove_dir(&site).unwrap();
        ensure_config(&path).unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), "user edits");
        assert!(
            !site.exists(),
            "설정이 이미 있으면 예시 폴더를 만들지 않는다"
        );
    }

    #[test]
    fn load_reports_path_on_io_error() {
        let (dir, _cwd) = tmp();
        let path = dir.path().join("missing.json");
        let err = load(&path).unwrap_err();
        assert!(err.contains(path.to_str().unwrap()), "{err}");
    }

    #[test]
    fn example_config_resolves() {
        let (dir, _cwd) = tmp();
        // 따옴표·역슬래시가 든 경로도 올바른 JSON 이 되어야 한다.
        let site = dir.path().join(r#"we"ird\site"#);
        fs::create_dir(&site).unwrap();
        let services = parse_and_resolve(&example_config(&site)).unwrap();
        assert_eq!(services.len(), 1);
        assert_eq!(services[0].id, "example/static");
        assert_eq!(services[0].cwd, fs::canonicalize(&site).unwrap());
        assert_eq!(services[0].port, 8765);
        assert_eq!(
            services[0].command,
            "python3 -m http.server 8765 --bind 127.0.0.1"
        );
        assert!(services[0].env.is_empty());
    }
}

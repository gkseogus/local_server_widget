//! 사용자에게 보이는 메시지. 관심사(모듈)별로 묶는다.
//! 값이 들어가는 문구는 `format!` 이 리터럴만 받아서 함수로 둔다.

/// config.rs: 설정 파일 입출력·검증·템플릿 메시지.
pub mod config {
    use std::fmt::Display;
    use std::path::Path;

    pub fn create_failed(path: &Path, e: impl Display) -> String {
        format!("설정 파일 {} 을 만들 수 없습니다: {e}", path.display())
    }

    pub fn read_failed(path: &Path, e: impl Display) -> String {
        format!("설정 파일 {} 을 읽을 수 없습니다: {e}", path.display())
    }

    pub fn parse_failed(file: &str, line: usize, column: usize, e: impl Display) -> String {
        format!("{file} 형식 오류 ({line}행 {column}열): {e}")
    }

    /// 이름이 빈 그룹의 라벨 (`n` 은 1부터).
    pub fn group_label(n: usize) -> String {
        format!("{n}번째 그룹")
    }

    /// 이름이 빈 서비스의 라벨 (`n` 은 1부터).
    pub fn service_label(group_label: &str, n: usize) -> String {
        format!("{group_label}/{n}번째 서비스")
    }

    pub const NAME_EMPTY: &str = "이름이 비어 있습니다";
    pub const GROUP_NAME_INVALID: &str = "그룹 이름에 '/' 를 쓰거나 '.', '..' 로 지을 수 없습니다";
    pub const GROUP_NAME_DUPLICATE: &str = "그룹 이름이 중복됩니다";
    pub const SERVICE_NAME_INVALID: &str =
        "서비스 이름은 영문·숫자·'-'·'_' 만 쓸 수 있습니다 ({이름.url} 로 참조하기 때문)";
    pub const SERVICE_NAME_DUPLICATE: &str = "같은 그룹에 같은 이름의 서비스가 있습니다";
    pub const PORT_ZERO: &str = "포트는 0 일 수 없습니다";
    pub const COMMAND_EMPTY: &str = "command 가 비어 있습니다";

    pub fn port_duplicate(port: u16, other: &str) -> String {
        format!("포트 {port} 가 {other} 와 중복됩니다")
    }

    pub fn env_key_invalid(key: &str) -> String {
        format!("환경변수 이름 \"{key}\" 가 올바르지 않습니다")
    }

    pub fn cwd_not_absolute(raw: &str) -> String {
        format!("cwd \"{raw}\" 는 절대 경로여야 합니다")
    }

    pub fn cwd_not_found(raw: &str) -> String {
        format!("cwd \"{raw}\" 폴더를 찾을 수 없습니다")
    }

    pub fn cwd_not_dir(raw: &str) -> String {
        format!("cwd \"{raw}\" 는 폴더가 아닙니다")
    }

    pub fn cwd_root_or_home(raw: &str) -> String {
        format!(
            "cwd \"{raw}\" 는 루트나 홈 폴더입니다. 다른 프로그램과 구분할 수 있도록 프로젝트 폴더를 지정하세요"
        )
    }

    pub fn template_service_missing(token: &str, svc: &str) -> String {
        format!("{{{token}}} 가 가리키는 서비스 \"{svc}\" 가 같은 그룹에 없습니다")
    }

    pub fn template_unknown(token: &str) -> String {
        format!("알 수 없는 템플릿 {{{token}}}")
    }
}

/// ports.rs: 포트 조회 메시지.
pub mod ports {
    use std::fmt::Display;

    pub fn lsof_failed(bin: &str, e: impl Display) -> String {
        format!("포트 정보를 읽지 못했습니다 ({bin}: {e})")
    }
}

/// process.rs: 서버 프로세스 시작·종료 메시지.
pub mod process {
    use std::fmt::Display;
    use std::path::Path;

    pub fn log_prepare_failed(path: &Path, e: impl Display) -> String {
        format!("로그 파일을 준비하지 못했습니다 ({}): {e}", path.display())
    }

    pub fn spawn_failed(id: &str, e: impl Display) -> String {
        format!("{id} 서버를 시작하지 못했습니다: {e}")
    }

    pub fn stop_group_failed(pgid: i32) -> String {
        format!("서버를 종료하지 못했습니다 (PGID {pgid})")
    }

    /// `pids` 는 ", " 로 이은 pid 목록.
    pub fn stop_pids_failed(pids: &str) -> String {
        format!("프로세스를 종료하지 못했습니다 (PID {pids})")
    }

    pub fn protected_id(id: u32) -> String {
        format!("보호 대상 프로세스라 종료할 수 없습니다 (ID {id})")
    }
}

/// ops.rs: 서비스 켜기·끄기·로그 메시지.
pub mod ops {
    use std::fmt::Display;

    pub fn already_running(name: &str) -> String {
        format!("{name} 은(는) 이미 실행 중입니다.")
    }

    pub fn already_starting(name: &str) -> String {
        format!("{name} 은(는) 이미 시작하는 중입니다.")
    }

    pub fn port_in_use(port: u16) -> String {
        format!("{port} 포트를 다른 프로그램이 사용 중입니다.")
    }

    pub fn port_in_use_cannot_stop(port: u16) -> String {
        format!("{port} 포트를 다른 프로그램이 사용 중이라 끌 수 없습니다.")
    }

    pub fn service_not_found(id: &str) -> String {
        format!("설정에서 서비스를 찾을 수 없습니다: {id}")
    }

    pub fn log_dir_failed(e: impl Display) -> String {
        format!("로그 폴더를 만들지 못했습니다: {e}")
    }

    pub fn log_file_failed(e: impl Display) -> String {
        format!("로그 파일을 만들지 못했습니다: {e}")
    }
}

/// settings.rs, lib.rs: 설정 창 메시지.
pub mod settings {
    use std::fmt::Display;
    use std::path::Path;

    pub const WINDOW_TITLE: &str = "로컬서버 설정";

    /// 저장하려는 사이 설정 파일이 밖에서 바뀌었거나 지워졌을 때.
    pub const CHANGED_ON_DISK: &str = "설정 파일이 그사이 다른 곳에서 바뀌었거나 지워져서 저장하지 않았습니다. 파일에서 다시 불러온 뒤 저장하세요.";

    pub fn save_failed(path: &Path, e: impl Display) -> String {
        format!("설정 파일 {} 을 저장하지 못했습니다: {e}", path.display())
    }

    pub fn open_window_failed(e: impl Display) -> String {
        format!("설정 창을 열지 못했습니다: {e}")
    }
}

/// lib.rs: Tauri 커맨드 계층 메시지.
pub mod app {
    use std::fmt::Display;

    pub const REQUEST_FAILED: &str = "요청을 처리하지 못했습니다.";

    pub fn open_failed(e: impl Display) -> String {
        format!("파일을 열지 못했습니다: {e}")
    }
}

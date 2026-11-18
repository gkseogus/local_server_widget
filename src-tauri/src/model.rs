//! 공유 데이터 타입 — config / ports / process / ops 와 프론트엔드 사이의 계약.
//! 프론트 짝: `src/types/service.ts`, `src/types/config.ts` (함께 바꿀 것).

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::PathBuf;

/// `services.json` 최상위. 설정 창이 그대로 읽고(get_config) 그대로 저장한다(save_config).
#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct ConfigFile {
    pub groups: Vec<GroupConfig>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct GroupConfig {
    pub name: String,
    pub services: Vec<ServiceConfig>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct ServiceConfig {
    pub name: String,
    pub cwd: String,
    pub port: u16,
    pub command: String,
    #[serde(default)]
    pub env: BTreeMap<String, String>,
}

/// 검증과 템플릿 치환(`{port}`, `{<service>.url}`)을 마친 서비스.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ResolvedService {
    /// `"<group>/<name>"`
    pub id: String,
    pub group: String,
    pub name: String,
    /// 정규화된 절대 경로 폴더.
    pub cwd: PathBuf,
    pub port: u16,
    /// `http://localhost:<port>`
    pub url: String,
    pub command: String,
    pub env: BTreeMap<String, String>,
}

/// TCP 포트에서 리슨 중인 프로세스 (lsof + ps).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Listener {
    pub pid: u32,
    pub pgid: Option<u32>,
    /// `ps -o command=` 의 전체 명령줄.
    pub command: Option<String>,
    pub cwd: Option<PathBuf>,
    /// `ps -o lstart=` 텍스트, 예: `"Thu Nov 12 13:27:59 2026"`.
    pub started_at: Option<String>,
}

/// 위젯이 직접 띄운 프로세스 정보. 메모리에만 있어 위젯을 재시작하면 사라진다.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ManagedInfo {
    pub pgid: u32,
    /// 리더 프로세스가 아직 끝나지 않았다.
    pub alive: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ServiceStatus {
    On,
    Off,
    Conflict,
    Starting,
    Failed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Origin {
    Widget,
    External,
}

/// 프론트로 보내는 서비스 상태 (`src/types/service.ts` 의 `ServiceFace`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServiceView {
    pub id: String,
    pub group: String,
    pub name: String,
    pub port: u16,
    pub url: String,
    pub cwd: String,
    pub command: String,
    pub env: BTreeMap<String, String>,
    pub status: ServiceStatus,
    /// `conflict` 인데 `Widget` 이면 위젯이 띄운 프로세스가 아직 살아 있어 그것만 끌 수 있다.
    pub origin: Option<Origin>,
    pub pids: Vec<u32>,
    /// 포트를 잡고 있는 프로세스의 명령 (`on`, `conflict` 일 때).
    pub listener_command: Option<String>,
    pub started_at: Option<String>,
    pub log_path: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct GroupView {
    pub name: String,
    pub services: Vec<ServiceView>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub groups: Vec<GroupView>,
    pub config_path: String,
}

/// 폴더에서 감지한 프로젝트 종류.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ProjectKind {
    Fastapi,
    Next,
    Vite,
    Unknown,
}

/// 설정 창이 폴더를 고르면 자동으로 채울 값 (`detect_project`). 프론트 짝: `ProjectInfoFace`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectInfo {
    pub kind: ProjectKind,
    /// 폴더 이름이 `<그룹>_<역할>` 꼴이면 그룹 이름 제안 (예: `acme_frontend` → `acme`).
    pub suggested_group: Option<String>,
    /// 서비스 이름 제안 (예: `frontend`, 아니면 폴더 이름).
    pub suggested_name: String,
    /// `{port}` 템플릿이 들어간 실행 명령 제안. 모르는 종류면 None.
    pub command: Option<String>,
    /// 종류별 기본 포트 (FastAPI 8000, Next 3000, Vite 5173).
    pub default_port: Option<u16>,
    /// `.env*` 파일에서 찾은 "백엔드 주소" 변수 이름들 (값은 읽지 않는다).
    pub api_env_keys: Vec<String>,
    /// `.env*` 파일에서 찾은 CORS 허용 오리진 변수 이름들.
    pub cors_env_keys: Vec<String>,
}

/// `get_config` 응답. `revision` 은 읽은 파일 내용의 지문이다.
/// 저장할 때 돌려보내 그 사이 파일이 밖에서 바뀌었는지 확인한다. 프론트 짝: `ConfigSnapshotFace`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ConfigSnapshot {
    pub config: ConfigFile,
    pub revision: String,
}

import { getCurrentWindow } from "@tauri-apps/api/window";

// 프레임 없는 위젯 창을 닫는다 (IPC: plugin:window|close). 위젯이 닫히면 Rust 가 열린 설정 창도 닫아 앱이 종료된다.
export const closeWidget = async (): Promise<void> => getCurrentWindow().close();

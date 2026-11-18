import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getCurrentWindow } from "@tauri-apps/api/window";
import App from "@/App";
import SettingsApp from "@/SettingsApp";
import "@/styles/global.css";

const queryClient = new QueryClient();

// 두 창이 같은 index.html 을 쓴다. 창 label 로 어느 화면을 그릴지 고른다.
const Root = getCurrentWindow().label === "settings" ? SettingsApp : App;

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <Root />
    </QueryClientProvider>
  </React.StrictMode>,
);

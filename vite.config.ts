import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { randomBytes } from "node:crypto";
import path from "node:path";
import process from "node:process";

const host = process.env.TAURI_DEV_HOST;

// 데스크톱 `tauri dev` 는 웹뷰가 이 개발 서버를 바로 열어 tauri.conf 의 devCsp 가 걸리지 않으므로 여기서 CSP 를 넣는다.
// 개발 서버(serve)에서만 쓴다 — 배포 빌드는 Tauri 가 release CSP 를 직접 넣는다.
// html.cspNonce 를 주면 Vite 가 index.html 의 <script>/<style>/<link>(React refresh 프리앰블 포함)에 nonce 를 붙이고
// <meta property="csp-nonce"> 를 넣는다. Vite 클라이언트는 CSS 를 <style> 로 주입할 때 이 meta 의 nonce 를 쓴다.
const devCsp = (): Plugin => {
  const nonce = randomBytes(16).toString("base64");
  const policy = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'`,
    `style-src 'self' 'nonce-${nonce}'`,
    "img-src 'self' data:",
    "connect-src 'self' ipc: http://ipc.localhost ws://127.0.0.1:1420 ws://localhost:1420",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join("; ");
  return {
    name: "dev-csp",
    apply: "serve",
    config: () => ({ html: { cspNonce: nonce } }),
    // 다른 플러그인이 넣은 스크립트보다 앞에 오도록 <head> 맨 위에 둔다
    transformIndexHtml: () => [
      { tag: "meta", attrs: { "http-equiv": "Content-Security-Policy", content: policy }, injectTo: "head-prepend" },
    ],
  };
};

// https://v2.tauri.app/start/frontend/vite/
export default defineConfig(() => ({
  plugins: [react(), tailwindcss(), devCsp()],
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
  // Tauri expects a fixed port and shows its own Rust errors.
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    // 다른 계정이 같은 포트의 다른 주소 계열을 선점하지 못하게 IPv4 loopback 으로 고정
    host: host || "127.0.0.1",
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    watch: { ignored: ["**/src-tauri/**"] },
  },
}));

import { spawn } from "child_process";
import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const SERVER_ENTRY = path.join(ROOT, "api/server.js");
const WATCH_TARGETS = [
  "api",
  "public",
  "system",
  "knowledge",
  "package.json",
  ".env",
];

let server = null;
let restartTimer = null;
let stopping = false;

function log(message) {
  const time = new Date().toLocaleTimeString("zh-TW", { hour12: false });
  console.log(`[watch ${time}] ${message}`);
}

function startServer() {
  if (server) return;

  log("啟動 4WHEELS AI WEB...");
  server = spawn(process.execPath, [SERVER_ENTRY], {
    cwd: ROOT,
    env: process.env,
    stdio: "inherit",
  });

  server.on("exit", (code, signal) => {
    server = null;
    if (stopping) return;

    log(`server 已停止（code=${code ?? "null"}, signal=${signal ?? "null"}），2 秒後重啟`);
    setTimeout(startServer, 2000);
  });
}

function stopServer() {
  if (!server) return;
  log("停止舊 server...");
  server.kill("SIGTERM");
}

function scheduleRestart(reason) {
  clearTimeout(restartTimer);
  restartTimer = setTimeout(() => {
    log(`偵測到變更：${reason}`);
    stopServer();
    setTimeout(startServer, 800);
  }, 350);
}

function watchPath(target) {
  const fullPath = path.join(ROOT, target);
  if (!fs.existsSync(fullPath)) return;

  fs.watch(fullPath, { recursive: true }, (_event, filename) => {
    if (!filename) return;
    if (String(filename).includes("node_modules")) return;
    if (String(filename).startsWith("._")) return;
    scheduleRestart(path.join(target, filename));
  });
}

for (const target of WATCH_TARGETS) {
  watchPath(target);
}

process.on("SIGINT", () => {
  stopping = true;
  stopServer();
  process.exit(0);
});

process.on("SIGTERM", () => {
  stopping = true;
  stopServer();
  process.exit(0);
});

startServer();

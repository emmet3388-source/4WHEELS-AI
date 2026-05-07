import fs from "fs";
import path from "path";

const BASE_DIR = path.resolve("./outputs");

// Windows / macOS / Linux 都不允許這些字元出現在檔名裡
const ILLEGAL_CHARS = /[\/\\:*?"<>|]/g;

/**
 * 將任意字串轉成安全的檔名片段。
 * 保留中文字元、英數字與連字號；移除非法字元；最長 40 字。
 */
export function sanitizeFilename(text) {
  return String(text)
    .trim()
    .replace(ILLEGAL_CHARS, "")
    .replace(/\s+/g, "-")
    .replace(/[^\w一-鿿-]/g, "")
    .slice(0, 40);
}

/**
 * 存檔至 outputs/{YYYY-MM-DD}/{prefix}_{title}_{HH-MM-SS}.txt
 *
 * @param {object} options
 * @param {string} options.prefix   - 已組好的前綴（例如 "六大平台_輪胎老師傅" 或 "instagram"）
 * @param {string} options.title    - 主題 / 標題
 * @param {string} options.content  - 要寫入的文字內容
 * @returns {{ absPath: string, savedPath: string }}
 *   absPath   — 完整絕對路徑（供 console 或 CLI 顯示）
 *   savedPath — 相對路徑字串（供 Web UI 顯示），格式：outputs/日期/檔名.txt
 */
export function saveOutput({ prefix, title, content }) {
  const now = new Date();

  const dateFolder = now.toLocaleDateString("sv-SE");               // YYYY-MM-DD
  const timeStr    = now.toTimeString().slice(0, 8).replace(/:/g, ""); // HHMMSS

  const dir = path.join(BASE_DIR, dateFolder);
  fs.mkdirSync(dir, { recursive: true });

  const filename  = `${sanitizeFilename(prefix)}_${sanitizeFilename(title)}_${timeStr}.txt`;
  const absPath   = path.join(dir, filename);
  const savedPath = `outputs/${dateFolder}/${filename}`;

  fs.writeFileSync(absPath, content, "utf-8");

  return { absPath, savedPath };
}

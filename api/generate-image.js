import OpenAI from "openai";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import readline from "readline";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const client     = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const OPENAI_TEXT_INSTRUCTIONS = `
你是 4WHEELS-AI 的 OpenAI 圖文企劃核心。
高階品牌規則、公司規則、圖片風格與輸出格式優先於使用者主題。
不確定資訊必須標註「待確認」，不可編造規格或檢測結果。
`.trim();

// ── 核心生圖函式（可被其他模組 import 使用）─────────────────────────
export async function generateImage(prompt, outputPath) {
  const response = await client.images.generate({
    model:   "gpt-image-1",
    prompt,
    n:       1,
    size:    "1024x1024",
    quality: "high",
  });

  const b64    = response.data[0].b64_json;
  const buffer = Buffer.from(b64, "base64");

  fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
  fs.writeFileSync(outputPath, buffer);
  return outputPath;
}

// ── CLI Standalone ─────────────────────────────────────────────────
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  function ask(q) { return new Promise((r) => rl.question(q, r)); }

  function readFileIfExists(filePath, fallback = "") {
    return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf-8") : fallback;
  }

  const stylePresets = {
    "1": "彩色日系漫畫風格，文字為輔助，圖像簡約重點讓人好看懂，要有設計感，高級設計師排版，畫面精細，文字只使用清晰的繁體中文",
    "2": "彩色日系漫畫風格，汽車、輪胎與輪胎的品牌LOGO為主，文字為輔助，圖像簡約重點讓人好看懂，要有設計感，高級設計師排版，畫面精細，文字只使用清晰的繁體中文",
  };

  async function main() {
    console.log("請選擇圖片類型：");
    console.log("1 = 知識科普類");
    console.log("2 = 輪胎推薦類");

    const type  = await ask("請輸入 1 或 2：");
    const topic = await ask("請輸入圖片主題：");

    const fixedPrompt = stylePresets[type.trim()];
    if (!fixedPrompt) {
      console.log("輸入錯誤，請輸入 1 或 2。");
      rl.close();
      return;
    }

    const brandMemory  = readFileIfExists("./system/brand.md",        "");
    const companyRules = readFileIfExists("./system/company-rules.md", "");
    const imageStyle   = readFileIfExists("./system/image-style.md",   "");
    const typeLabel    = type.trim() === "1" ? "知識科普類" : "輪胎推薦類";

    const res = await client.responses.create({
      model: "gpt-4.1-mini",
      temperature: 0.7,
      instructions: OPENAI_TEXT_INSTRUCTIONS,
      input: `
你是四個圈輪業的汽車社群圖文設計企劃。
根據圖片類型與主題，產生：
1. 適合搭配圖片的社群文章
2. 可直接用於 DALL-E 3 生圖的圖片 Prompt

品牌設定：${brandMemory}
公司規則：${companyRules}
圖片風格：${imageStyle}
圖片類型：${typeLabel}
主題：${topic}
固定 Prompt 要求：${fixedPrompt}

規則：
- 文章要適合 Facebook / IG / Threads，像台灣車主語感
- 不要編造規格、數據
- 圖片 Prompt 必須包含固定 Prompt 要求
- 圖片 Prompt 如有文字，只使用繁體中文
- 【圖片Prompt】區塊只輸出 prompt，不加其他說明

輸出格式：
【社群文章】

【圖片Prompt】
`,
    });

    console.log("\n=== 生成結果 ===\n");
    console.log(res.output_text);

    const promptMatch = res.output_text.match(/【圖片Prompt】\s*([\s\S]+)/);
    if (!promptMatch) {
      console.log("\n無法提取圖片 Prompt，跳過生圖。");
      rl.close();
      return;
    }

    const imgPrompt = promptMatch[1].trim();
    const doGen     = await ask("\n是否用 gpt-image-1 生成圖片？(y/N)：");

    if (doGen.trim().toLowerCase() === "y") {
      const date    = new Date().toISOString().slice(0, 10);
      const dir     = `./outputs/${date}`;
      fs.mkdirSync(dir, { recursive: true });
      const imgPath = path.join(dir, `image-${Date.now()}.png`);

      console.log("\n生成圖片中，請稍候...");
      try {
        const saved = await generateImage(imgPrompt, imgPath);
        console.log(`\n已存檔：${saved}`);
      } catch (e) {
        console.error("生圖失敗：", e.message);
      }
    }

    rl.close();
  }

  main();
}

import OpenAI from "openai";
import dotenv from "dotenv";
import fs from "fs";
import readline from "readline";

dotenv.config();

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

function readFileIfExists(filePath, fallback = "") {
  if (fs.existsSync(filePath)) {
    return fs.readFileSync(filePath, "utf-8");
  }
  return fallback;
}

async function main() {

  const topic = await ask("請輸入主題：");

  const viralPsychology = readFileIfExists(
    "./system/viral-psychology.md",
    ""
  );

  const shortsStructure = readFileIfExists(
    "./system/shorts-structure.md",
    ""
  );

  const response = await client.responses.create({

    model: "gpt-4.1-mini",

    temperature: 0.9,

    input: `

你是台灣最懂短影音 Hook 的流量導演。

====================
流量心理學
====================

${viralPsychology}

====================
短影音結構
====================

${shortsStructure}

====================
主題
====================

${topic}

請生成：

1. TikTok Hook x10
2. Reels Hook x10
3. Threads 爆點開場 x10
4. YouTube Shorts 開場 x10

規則：

- 一定要像真人
- 一定要有情緒
- 一定要有停留率
- 不要像廣告
- 不要像標題
- 不要像教學
- 要像真正爆款短影音
- 前3秒一定要有衝突
- 要符合台灣社群語感

容易爆的元素：

- 真相感
- 禁忌感
- 爭議感
- 翻車感
- 真實感
- 師傅講真話
- 車主焦慮
- 雨天
- 高速
- 外匯胎

輸出格式：

【TikTok Hooks】

【Reels Hooks】

【Threads Hooks】

【YouTube Shorts Hooks】

`,
  });

  console.log("\n=== Hook生成結果 ===\n");

  console.log(response.output_text);

  rl.close();
}

main();
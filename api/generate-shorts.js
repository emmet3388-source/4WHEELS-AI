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
  const topic = await ask("請輸入短影音主題：");

  const brandMemory = readFileIfExists("./system/brand.md", "");
  const contentRules = readFileIfExists("./system/content-rules.md", "");
  const viralPsychology = readFileIfExists("./system/viral-psychology.md", "");
  const shortsStructure = readFileIfExists("./system/shorts-structure.md", "");
  const cameraLanguage = readFileIfExists("./system/camera-language.md", "");
  const shortsEditing = readFileIfExists("./system/shorts-editing.md", "");

  const response = await client.responses.create({
    model: "gpt-4.1-mini",
    temperature: 0.75,
    input: `
你是台灣最懂短影音流量的汽車內容導演。

你不是一般文案AI。
你要像真正會拍 TikTok / Reels / Shorts 的導演。

====================
品牌記憶
====================
${brandMemory}

====================
內容規則
====================
${contentRules}

====================
流量心理學
====================
${viralPsychology}

====================
短影音結構
====================
${shortsStructure}

====================
鏡頭語言
====================
${cameraLanguage}

====================
剪輯節奏
====================
${shortsEditing}

====================
本次主題
====================
${topic}

請生成一支真正適合短影音的腳本。

重要要求：
- 前3秒一定要強
- 不要像教學文章
- 不要像廣告
- 要有鏡頭語言
- 要有節奏
- 要有情緒轉折
- 要有字幕設計
- 要有停留點
- 要像台灣車圈真人影片
- 不要只有台詞
- 要可以直接拿去拍

輸出格式：

【影片標題】

【影片長度】
建議秒數：

【影片核心Hook】
一句話：

【前3秒】
鏡頭：
動作：
台詞：
字幕：
剪輯節奏：

【中段1】
鏡頭：
動作：
台詞：
字幕：
剪輯節奏：

【中段2】
鏡頭：
動作：
台詞：
字幕：
剪輯節奏：

【反轉 / 重點】
鏡頭：
動作：
台詞：
字幕：
剪輯節奏：

【結尾CTA】
鏡頭：
動作：
台詞：
字幕：

【BGM建議】
風格：

【拍攝素材清單】
1.
2.
3.
4.
5.

【字幕節奏】
請列出每一句字幕。

【封面字卡】
請給3個版本。

【留言引導】
請給3句。
`,
  });

  console.log("\n=== 短影音腳本生成結果 ===\n");
  console.log(response.output_text);

  rl.close();
}

main();
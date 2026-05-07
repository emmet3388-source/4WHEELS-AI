import OpenAI from "openai";
import dotenv from "dotenv";
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

async function main() {

  const topic = await ask("請輸入主題：");

  const response = await client.responses.create({
    model: "gpt-4.1-mini",
    temperature: 0.9,

    input: `
你是台灣汽車社群爆文標題企劃。

請針對以下主題：

${topic}

生成：

1. Threads爆文標題 x5
2. TikTok短影音Hook x5
3. YouTube點擊標題 x5
4. IG Reels標題 x5

規則：

- 要像真人
- 要有情緒
- 要有停留率
- 不要像新聞標題
- 不要像AI
- 要符合台灣社群語感
- 要有討論感
- 要有流量感

輸出格式：

【Threads】

【TikTok】

【YouTube】

【IG Reels】
`,
  });

  console.log("\n=== AI標題生成結果 ===\n");

  console.log(response.output_text);

  rl.close();
}

main();
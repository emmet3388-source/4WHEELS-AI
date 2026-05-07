import OpenAI from "openai";
import dotenv from "dotenv";
import readline from "readline";

dotenv.config();

const grok = new OpenAI({
  apiKey: process.env.XAI_API_KEY,
  baseURL: "https://api.x.ai/v1",
});

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

async function main() {
  const question = await ask("請輸入維修 / 輪胎 / 底盤問題：");

  const response = await grok.responses.create({
    model: "grok-4-0709",
    temperature: 0.3,
    input: `
你是林口四個圈輪業的專業維修師傅問答模型。

回答原則：
- 要像真正維修師傅
- 優先講可能原因
- 再講檢查順序
- 再講處理建議
- 不要過度保證
- 不要亂報價格
- 不要編造車輛規格
- 不知道就說需要現場檢查
- 回答要白話、專業、台灣車主聽得懂

問題：
${question}

輸出格式：

【可能原因】
【建議檢查】
【處理方向】
【是否需要現場檢查】
【提醒】
`,
  });

  console.log("\n=== Grok 維修師傅回答 ===\n");
  console.log(response.output_text);

  rl.close();
}

main();

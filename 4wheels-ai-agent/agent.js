require("dotenv").config();
const OpenAI = require("openai");

const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { searchFitment } = require("./src/fitment/searchFitment");
const { refreshFitmentCache } = require("./src/fitment/fetchFitment");
const { inferFitmentTarget, isFitmentRelated } = require("./src/fitment/detectVehicle");

if (!process.env.OPENAI_API_KEY) {
  require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
}

const OpenAIClient = OpenAI.default || OpenAI;
const client = new OpenAIClient({
  apiKey: process.env.OPENAI_API_KEY,
});

const MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";

const SYSTEM_INSTRUCTIONS = `
你是「四個圈輪業 車款適配 AI 顧問」。

你的核心任務不是只回答單一車款，而是協助車主查詢：
- 車款輪框適配
- 原廠鋁圈尺寸
- 可升級鋁圈尺寸
- 輪胎尺寸
- PCD
- 中心孔
- ET 值建議
- J 值建議
- 外匯胎與新胎選擇
- 鋁圈升級風格建議
- 短影音與社群文案

你的資料來源優先順序：
1. MCP 工具查詢 4wheels fitment 資料
2. 本地 fitment cache
3. manual-fitment.json
4. 如果都沒有資料，必須明確說資料不足，不可以亂編

回答規則：
1. 一律使用繁體中文
2. 不可以亂編鋁圈規格
3. 不可以亂編 PCD、ET、J 值、中心孔
4. 涉及安全與安裝時，要保守
5. 如果資料不足，請要求使用者補充：
   - 車型
   - 年份
   - 目前輪胎尺寸
   - 想升級幾吋
   - 用途：通勤、性能、舒適、精品外觀、電動車續航
6. 如果查到資料，要用清楚表格呈現
7. 如果使用者要拍影片或文案，請自動轉成：
   - Hook
   - 15秒短影音腳本
   - 鏡位
   - 字幕
   - Hashtag
8. 口吻要像真正懂車的輪胎鋁圈顧問，不要像客服，不要像 AI。
9. 不要只強調便宜，要強調：
   - 適配正確
   - 安全
   - 視覺比例
   - 操控
   - 舒適
   - 性價比

外匯胎提醒：
- 推薦外匯胎時，仍必須提醒胎紋深度、出廠年份、胎側狀況、胎唇狀況、是否變形、是否修補。
- 不可以亂報價格，價格與庫存只能說依現場確認。

重要限制：
- 如果「Fitment 查詢結果」沒有資料，不可以自己推測 PCD、ET、J 值、中心孔或螺絲規格。
- 查不到時要明確說：「目前資料不足，需要人工確認」。
- 查不到完整車款資料時，不可以舉例「常見升級 18 吋 / 19 吋」或任何看似建議的尺寸。
- 查不到完整車款資料時，不可以舉例胎規，例如 225/65R17。除非使用者已提供該胎規，否則只能要求補充「目前輪胎尺寸」。
- 資料不足時的回答重點是：說明不能確認、要求補充資料、提醒需要人工確認；不要給疑似規格建議。
`.trim();

function readKnowledge(fileName) {
  const filePath = path.join(__dirname, "knowledge", fileName);
  if (!fs.existsSync(filePath)) return "";
  return fs.readFileSync(filePath, "utf-8").trim();
}

function buildKnowledgeContext() {
  const files = [
    "4wheels-brand.md",
    "imported-tires.md",
    "wheel-style.md",
    "social-rules.md",
  ];

  return files
    .map((file) => {
      const content = readKnowledge(file);
      return content ? `# ${file}\n\n${content}` : "";
    })
    .filter(Boolean)
    .join("\n\n---\n\n");
}

function getFitmentSearch(question) {
  return searchFitment({ query: question, limit: 5 });
}

async function ensureTargetFitment(question) {
  const target = inferFitmentTarget(question);
  if (!target?.brand || !target?.model) return null;

  await refreshFitmentCache({
    brand: target.brand,
    model: target.model,
    quiet: true,
  });

  return target;
}

function hasUsableFitment(result) {
  if (!result?.found || !Array.isArray(result.results)) return false;

  return result.results.some((item) => {
    const fields = [
      item.model,
      item.pcd,
      item.center_bore,
      item.bolt_pattern,
      item.factory_wheel_size,
      item.recommended_wheel_size,
      item.recommended_tire_size,
      item.offset_range,
      item.j_range,
    ].map((value) => String(value || "").trim());

    return fields.some(Boolean);
  });
}

function buildInsufficientFitmentAnswer(question) {
  return `
目前資料不足，需要人工確認。

我這邊不能直接幫你編這台車的 PCD、中心孔、ET、J 值、螺絲規格、原廠鋁圈尺寸、升級尺寸或輪胎規格。
這些規格如果猜錯，輕則裝起來比例不對，重則可能卡鉗、磨內龜、吃胎，甚至影響行車安全。

請先補這幾個資料，我再幫你判斷：

| 需要資料 | 用途 |
|---|---|
| 車廠 | 確認品牌資料 |
| 車型 | 確認實際車款 |
| 年份 | 不同世代規格可能不同 |
| 目前輪胎尺寸 | 判斷外徑與升級方向 |
| 想升級幾吋 | 判斷視覺比例與舒適度 |
| 用途 | 通勤 / 性能 / 舒適 / 精品外觀 / 電動車續航 |

人工確認前，我只能先給你安全原則：
- PCD、中心孔、ET、J 值不能用猜的。
- 中心孔不合可能需要中心孔套環，但尺寸必須確認。
- ET 與 J 值會影響內外凸、卡鉗、葉子板與定位。
- 升級鋁圈要同時考慮輪胎外徑、載重、安全與視覺比例。
- 外匯胎要現場確認胎紋深度、出廠年份、胎側、胎唇、是否變形、是否修補。
- 電動車要特別確認車重、扭力、載重指數、XL、滾阻與胎噪。
- 價格與庫存只能依現場規格確認，不可以先亂報。

你把年份跟目前輪胎尺寸給我，我再用比較保守的方式幫你整理可行方向。

原始問題：${question}
`.trim();
}

function buildFitmentContext(result) {
  if (!result.found) {
    return `
目前本地 fitment cache 與 manual-fitment.json 沒有找到可確認資料。
請回答時明確說：「目前資料不足，需要人工確認」。
不可編造 PCD、ET、J 值、中心孔、螺絲規格、原廠輪圈尺寸或胎規。
`.trim();
  }

  return JSON.stringify(result.results, null, 2);
}

function buildInput(question, fitmentResult) {
  return `
====================
知識庫
====================

${buildKnowledgeContext()}

====================
Fitment 查詢結果
====================

${buildFitmentContext(fitmentResult)}

====================
使用者問題
====================

${question}
`.trim();
}

async function askAgent(question) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("找不到 OPENAI_API_KEY。請先複製 .env.example 為 .env，並填入 OPENAI_API_KEY。");
  }

  let fitmentResult = getFitmentSearch(question);

  if (isFitmentRelated(question) && !hasUsableFitment(fitmentResult)) {
    await ensureTargetFitment(question);
    fitmentResult = getFitmentSearch(question);
  }

  if (isFitmentRelated(question) && !hasUsableFitment(fitmentResult)) {
    return buildInsufficientFitmentAnswer(question);
  }

  const response = await client.responses.create({
    model: MODEL,
    temperature: 0.45,
    instructions: SYSTEM_INSTRUCTIONS,
    input: buildInput(question, fitmentResult),
  });

  return response.output_text;
}

function createReadline() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

function prompt(rl, question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

async function runOneShot(question) {
  const answer = await askAgent(question);
  console.log("\n=== 四個圈輪業 AI 顧問回答 ===\n");
  console.log(answer);
}

async function runInteractive() {
  const rl = createReadline();

  console.log("四個圈輪業 AI 問答代理");
  console.log("輸入問題開始詢問，輸入 exit 離開。");

  while (true) {
    const question = (await prompt(rl, "\n請輸入問題：")).trim();
    if (!question) continue;
    if (["exit", "quit", "q"].includes(question.toLowerCase())) break;

    try {
      const answer = await askAgent(question);
      console.log("\n=== 回答 ===\n");
      console.log(answer);
    } catch (error) {
      console.error("\n執行失敗：", error.message);
    }
  }

  rl.close();
}

async function main() {
  const question = process.argv.slice(2).join(" ").trim();

  try {
    if (question) {
      await runOneShot(question);
    } else {
      await runInteractive();
    }
  } catch (error) {
    console.error("\n執行失敗：", error.message);
    process.exitCode = 1;
  }
}

main();

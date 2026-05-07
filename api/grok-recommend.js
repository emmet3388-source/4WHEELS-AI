import OpenAI from "openai";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import readline from "readline";

dotenv.config();

const grok = new OpenAI({
  apiKey: process.env.XAI_API_KEY,
  baseURL: "https://api.x.ai/v1",
});

const MODEL = "grok-4-0709";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(q) {
  return new Promise((resolve) => rl.question(q, resolve));
}

// ─────────────────────────────────────────────
// 工具函式
// ─────────────────────────────────────────────

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function slugify(text) {
  return text
    .toString().trim().toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\w一-鿿-]/g, "")
    .slice(0, 50);
}

function readFileIfExists(filePath, fallback = "") {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf-8") : fallback;
}

function extractJson(text) {
  const match = text.match(/```json\s*([\s\S]*?)```/) ||
                text.match(/({[\s\S]*})/);
  if (!match) throw new Error("無法解析 JSON 回應");
  return JSON.parse(match[1].trim());
}

// ─────────────────────────────────────────────
// Fitment 關鍵字前置判斷
// ─────────────────────────────────────────────

const FITMENT_KEYWORDS = [
  "輪胎", "胎規", "鋁圈", "輪框",
  "j值", "j 值", "et值", "et ", "pcd", "cb",
  "fitment", "中心孔", "螺距",
];

function isFitmentQuery(question) {
  const q = question.toLowerCase();
  return FITMENT_KEYWORDS.some((kw) => q.includes(kw));
}

// ─────────────────────────────────────────────
// Step 1：分析問題，萃取結構化資訊
// ─────────────────────────────────────────────

async function analyzeQuestion(question) {
  const fitmentHint = isFitmentQuery(question)
    ? `注意：這個問題包含輪胎/鋁圈/fitment 相關關鍵字，category 應填 wheel_tire_fitment。`
    : "";

  const res = await grok.responses.create({
    model: MODEL,
    temperature: 0,
    input: `
請分析以下問題，萃取結構化資訊，只回傳 JSON，不要任何其他文字。

問題：${question}

${fitmentHint}

回傳格式（JSON）：
{
  "brand": "品牌（例：Mercedes-Benz）",
  "model": "車款（例：S300）",
  "chassisCode": "底盤代號（不確定則填 unknown）",
  "yearRange": "年式範圍（不確定則填 unknown）",
  "category": "品項類別，只能是以下之一：wheel_tire_fitment / suspension / tires / wheels / brakes / general",
  "subType": "當 category 是 wheel_tire_fitment 時，填 tires 或 wheels 或 both；其他 category 填 none",
  "categoryZh": "品項中文（例：輪胎鋁圈適配 / 避震器）",
  "slug": "用於檔名的 slug，小寫英文加連字號，例：mercedes-benz-s300"
}

規則：
- 只回傳 JSON，不要說明文字
- brand 用英文全名
- slug 只能有英文、數字、連字號
- category 只能是六個選項之一
- subType 判斷：同時問輪胎與鋁圈填 both，只問輪胎填 tires，只問鋁圈填 wheels
`,
  });

  return extractJson(res.output_text);
}

// ─────────────────────────────────────────────
// Fitment 流程：Step A — 搜尋 4WHEELS fitment 資料
// ─────────────────────────────────────────────

const FITMENT_FORMAT = `
# Fitment 資料：{car}

## 資料來源
- 4WHEELS Fitment：https://4wheels.com.tw/fitment
- 其他來源：

## 原廠 / 適配資訊
- 原廠輪胎規格：
- 原廠鋁圈尺寸：
- PCD：
- CB（中心孔徑）：
- ET：
- J值：
- 螺絲規格：
- 建議升級尺寸：

## 輪胎推薦方向
- 舒適靜音：
- 雨天抓地：
- 耐磨：
- 電動車 / 高扭力：
- 性價比：

## 鋁圈推薦方向
- 原廠升級：
- 精品感：
- 性能取向：
- 低調通勤：
- 注意事項：

## 安裝注意事項
- 中心孔套環：
- 動態平衡：
- 四輪定位：
- 卡鉗干涉：
- 葉子板干涉：
`;

async function generateFitmentData(carInfo) {
  const carLabel   = `${carInfo.brand} ${carInfo.model}`;
  const existing   = readFileIfExists(`./knowledge/fitment/${carInfo.slug}.md`, "");
  const searchQuery = `${carLabel} 輪胎 鋁圈 規格 fitment`;

  const res = await grok.responses.create({
    model: MODEL,
    temperature: 0.15,
    input: `
你是林口四個圈輪業的 fitment 資料整理專員。

請整理「${carLabel}」的輪胎與鋁圈適配（fitment）資料。

資料來源規則（依序）：
1. 【最優先】以 site:4wheels.com.tw/fitment 搜尋索引結果：
   搜尋詞：site:4wheels.com.tw/fitment ${searchQuery}
   - 如果搜尋索引有回傳 4WHEELS 的資料，採用並標明「來自 4WHEELS Fitment」。
   - 如果無法直接開啟該頁面、或搜尋索引查無結果，請明確標註：
     「4WHEELS Fitment 查無此車款索引資料」
     不要假設、不要憑記憶填入 4WHEELS 的資料。
2. 原廠規格資料庫（原廠手冊、台灣代理商公告）
3. 台灣輪胎鋁圈論壇（Mobile01、台灣車廠討論區）
4. 日本 fitment 資料庫（option2、Yahoo知恵袋）
5. 歐美 fitment 資料庫（wheel-size.com、tirerack.com）

${existing ? `目前已有資料（請補充 / 更新）：\n${existing}` : ""}

請嚴格使用以下格式輸出，不確定的欄位填「待確認」：
${FITMENT_FORMAT.replace("{car}", carLabel)}

規則：
- 不可編造任何規格數字，包含 PCD / CB / ET / J 值
- 若無法確認數據來源，一律填「待確認」
- 資料來源欄位必須列出實際參考依據，不得留空
- 升級尺寸要考量台灣路況（避免過低扁平比造成傷胎）
`,
  });

  return res.output_text;
}

// ─────────────────────────────────────────────
// Fitment 流程：Step B — 生成 fitment 推薦貼文
// ─────────────────────────────────────────────

async function generateFitmentPost(carInfo, fitmentData, question) {
  const carLabel = `${carInfo.brand} ${carInfo.model}`;
  const subType  = carInfo.subType ?? "both";

  // 根據 subType 選擇輸出格式
  const tireFormat = `
【標題】
（含車款 + 胎規建議，一句有吸引力的標題）

【推薦貼文】
內容必須包含：
- 車款與原廠胎規
- 4WHEELS fitment 查到的規格重點
- 具體胎規建議（尺寸 / 扁平比 / 速度指數）
- 適合哪種車主
- 舒適 / 雨天 / 耐磨 / 性價比怎麼選
- 師傅角度提醒（台灣路況、換胎時機）
- 結尾引導留言或私訊

【推薦方向】
1. 舒適靜音：
2. 雨天抓地：
3. 耐磨通勤：
4. 性價比：
5. 不建議：

【安裝提醒】

【Hashtag】
（15-20個，台灣車圈常用）
`;

  const wheelFormat = `
【標題】
（含車款 + 鋁圈規格建議，一句有吸引力的標題）

【推薦貼文】
內容必須包含：
- 車款
- PCD / CB / J值 / ET
- 建議升級尺寸
- 是否需要中心孔套環（Hub Ring）
- 是否需要注意卡鉗或葉子板干涉
- 適合哪種車主
- 師傅角度提醒
- 結尾引導留言或私訊

【推薦方向】
1. 原廠升級：
2. 精品感：
3. 性能取向：
4. 低調通勤：
5. 不建議：

【安裝提醒】

【Hashtag】
（15-20個，台灣車圈常用）
`;

  const format = subType === "tires"
    ? tireFormat
    : subType === "wheels"
      ? wheelFormat
      : `${tireFormat}\n\n===鋁圈部分===\n\n${wheelFormat}`;

  const res = await grok.responses.create({
    model: MODEL,
    temperature: 0.65,
    input: `
你是林口四個圈輪業的資深師傅，同時也是台灣車圈社群內容操盤手。

根據以下 fitment 資料，生成推薦貼文。

原始問題：${question}
車款：${carLabel}
問題類型：${carInfo.categoryZh}

Fitment 資料：
${fitmentData}

請輸出以下格式：
${format}

風格規則：
- 優先引用 4WHEELS fitment 資料
- 台灣在地語感，像真實維修師傅
- 不要空泛（不要只說「看預算」「看需求」）
- 具體說明規格與選擇邏輯
- 不要過度保證效果
- 不要亂報價格
- 不要像AI廣告文
`,
  });

  return res.output_text;
}

// ─────────────────────────────────────────────
// 一般推薦流程（非 fitment）
// ─────────────────────────────────────────────

async function generateVehicleProfile(carInfo) {
  const existing = readFileIfExists(
    `./knowledge/vehicle-profiles/${carInfo.slug}.md`, ""
  );

  const res = await grok.responses.create({
    model: MODEL,
    temperature: 0.2,
    input: `
你是台灣汽車知識庫建構專家。

請根據你的知識，整理以下車款的完整車籍資料。

車款：${carInfo.brand} ${carInfo.model}
底盤代號（參考）：${carInfo.chassisCode}
年式範圍（參考）：${carInfo.yearRange}

${existing ? `以下是目前已有的資料（請補充或更新）：\n${existing}` : ""}

請嚴格使用以下 Markdown 格式輸出，不確定的欄位填「待確認」：

# 車籍資料：${carInfo.brand} ${carInfo.model}

## 基本資料
- 品牌：
- 車款：
- 世代 / 底盤代號：
- 年式範圍：
- 動力形式：
- 車型分類：
- 車重區間：
- 懸吊形式（前）：
- 懸吊形式（後）：
- 是否為氣壓懸吊：
- 原廠輪胎規格：
- 輪框尺寸（J值 / ET值）：
- 建議載重指數：

## 常見車主需求
-

## 常見問題
-

## 維修 / 改裝注意事項
-

## 資料來源
-

規則：
- 不要編造不存在的規格
- 不確定的填「待確認」
- 資料來源要列出參考依據（台灣車壇、原廠資料等）
`,
  });

  return res.output_text;
}

const PRODUCT_TEMPLATES = {
  suspension: {
    label: "避震器推薦",
    format: `
# 避震器推薦資料：{car}

## 原廠懸吊特性
-

## 常見故障症狀
-

## 推薦方案

### 舒適原廠取向
- 品牌：
- 型號 / 系列：
- 適合車主：
- 優點：
- 注意事項：

### 操控升級取向
- 品牌：
- 型號 / 系列：
- 適合車主：
- 優點：
- 注意事項：

### 氣壓懸吊替代方案
- 品牌：
- 型號 / 系列：
- 適合車主：
- 優點：
- 注意事項：

### 不建議方案
-

## 價格區間參考（台灣市場）
-

## 資料來源
-
`,
  },
  tires: {
    label: "輪胎推薦",
    format: `
# 輪胎推薦資料：{car}

## 原廠輪胎規格
-

## 常見車主需求
-

## 推薦方案

### 舒適靜音取向
- 品牌：
- 型號 / 系列：
- 適合車主：
- 優點：

### 雨天抓地取向
- 品牌：
- 型號 / 系列：
- 適合車主：
- 優點：

### 性能操控取向
- 品牌：
- 型號 / 系列：
- 適合車主：
- 優點：

### 不建議方案
-

## 資料來源
-
`,
  },
  wheels: {
    label: "鋁圈推薦",
    format: `
# 鋁圈推薦資料：{car}

## 原廠輪框規格
- 尺寸：
- J值：
- ET值：
- PCD：
- 中心孔徑：

## 可升級範圍
-

## 推薦方案

### 原廠取向
- 品牌 / 系列：
- 規格：

### 輕量化取向
- 品牌 / 系列：
- 規格：

### 注意事項
-

## 資料來源
-
`,
  },
  brakes: {
    label: "煞車推薦",
    format: `
# 煞車推薦資料：{car}

## 原廠煞車規格
-

## 推薦方案

### 原廠取向
- 品牌：
- 型號：

### 升級取向
- 品牌：
- 型號：

### 注意事項
-

## 資料來源
-
`,
  },
};

async function generateProductData(carInfo, vehicleProfile) {
  const tmpl     = PRODUCT_TEMPLATES[carInfo.category] ?? PRODUCT_TEMPLATES.suspension;
  const existing = readFileIfExists(
    `./knowledge/products/${carInfo.category}/${carInfo.slug}.md`, ""
  );
  const carLabel = `${carInfo.brand} ${carInfo.model}`;

  const res = await grok.responses.create({
    model: MODEL,
    temperature: 0.3,
    input: `
你是台灣專業輪胎輪框避震改裝店師傅，擁有豐富實戰推薦經驗。

請根據以下車籍資料，生成「${tmpl.label}」資料庫。

車款：${carLabel}
車籍資料：
${vehicleProfile}

${existing ? `目前已有資料（請補充 / 更新）：\n${existing}` : ""}

格式參考：
${tmpl.format.replace("{car}", carLabel)}

規則：
- 具體推薦真實品牌與型號（例：KW V3、Bilstein B6、TEIN Flex Z）
- 如不確定某型號是否適用此車款，請標註「待確認」
- 不要編造不存在的型號
- 不要只說「看預算」「看需求」
- 價格用區間，不要給精確報價
- 台灣市場有販售的優先推薦
- 資料來源列出參考依據
`,
  });

  return res.output_text;
}

async function generatePost(carInfo, vehicleProfile, productData, question) {
  const res = await grok.responses.create({
    model: MODEL,
    temperature: 0.65,
    input: `
你是林口四個圈輪業的資深師傅，同時也是台灣車圈社群內容操盤手。

根據以下資料，生成一篇「師傅推薦貼文」。

原始問題：${question}
車款：${carInfo.brand} ${carInfo.model}
品項類別：${carInfo.categoryZh}

車籍資料摘要：
${vehicleProfile}

推薦資料庫：
${productData}

請輸出以下格式：

【標題】
（一句話，有吸引力，有具體車款與品項）

【推薦貼文】
要包含：
- 點出這款車的特性 / 痛點
- 具體推薦品牌 / 型號 / 系列（至少3個方向）
- 每個方案適合哪種車主
- 不建議哪種選擇及原因
- 師傅角度的提醒
- 結尾引導私訊或留言

【推薦清單】
1.
2.
3.

【注意事項】

【Hashtag】
（台灣車圈常用 hashtag，15-20個）

風格規則：
- 台灣在地語感
- 不要空泛
- 不要只說「看預算」「看需求」
- 不要過度保證效果
- 不要亂報價格
- 要有師傅的真實觀點
- 不要像AI生成的廣告文
`,
  });

  return res.output_text;
}

// ─────────────────────────────────────────────
// 主程式
// ─────────────────────────────────────────────

async function main() {
  console.log("\n=== 4WHEELS AI Grok 推薦系統 ===\n");

  const question = await ask("請輸入推薦問題（例：賓士 S300 避震器怎麼選 / RAV4 鋁圈 fitment）：\n> ");

  // 前置判斷提示使用者
  if (isFitmentQuery(question)) {
    console.log("  → 偵測到輪胎 / 鋁圈 fitment 問題，將優先查詢 4wheels.com.tw/fitment");
  }

  console.log("\n[1/?] 分析問題中...");
  let carInfo;
  try {
    carInfo = await analyzeQuestion(question);
  } catch (e) {
    console.error("❌ 問題分析失敗：", e.message);
    rl.close();
    return;
  }

  console.log(`✓ ${carInfo.brand} ${carInfo.model} ｜ 類別：${carInfo.categoryZh} ｜ slug：${carInfo.slug}`);

  // ── 分流 ──────────────────────────────────
  if (carInfo.category === "wheel_tire_fitment") {
    // ── Fitment 流程（3步）──────────────────
    console.log("\n[2/3] 搜尋 4WHEELS fitment 資料...");
    const fitmentData = await generateFitmentData(carInfo);

    console.log("\n[3/3] 生成推薦貼文...");
    const post = await generateFitmentPost(carInfo, fitmentData, question);

    // 存檔
    const fitmentPath = `./knowledge/fitment/${carInfo.slug}.md`;
    ensureDir("./knowledge/fitment");
    fs.writeFileSync(fitmentPath, fitmentData, "utf-8");

    // 輸出
    console.log("\n" + "═".repeat(56));
    console.log(" 推薦貼文");
    console.log("═".repeat(56) + "\n");
    console.log(post);
    console.log("\n" + "═".repeat(56));
    console.log(`\n✓ Fitment 資料已存檔：${fitmentPath}`);

  } else {
    // ── 一般推薦流程（4步）─────────────────
    console.log("\n[2/4] 建立車籍資料...");
    const vehicleProfile = await generateVehicleProfile(carInfo);

    console.log("\n[3/4] 生成推薦資料庫...");
    const productData = await generateProductData(carInfo, vehicleProfile);

    console.log("\n[4/4] 生成推薦貼文...");
    const post = await generatePost(carInfo, vehicleProfile, productData, question);

    // 存檔
    const profilePath = `./knowledge/vehicle-profiles/${carInfo.slug}.md`;
    const productPath = `./knowledge/products/${carInfo.category}/${carInfo.slug}.md`;
    ensureDir("./knowledge/vehicle-profiles");
    ensureDir(`./knowledge/products/${carInfo.category}`);
    fs.writeFileSync(profilePath, vehicleProfile, "utf-8");
    fs.writeFileSync(productPath, productData,    "utf-8");

    // 輸出
    console.log("\n" + "═".repeat(56));
    console.log(" 推薦貼文");
    console.log("═".repeat(56) + "\n");
    console.log(post);
    console.log("\n" + "═".repeat(56));
    console.log(`\n✓ 車籍資料已存檔：${profilePath}`);
    console.log(`✓ 推薦資料已存檔：${productPath}`);
  }

  rl.close();
}

main();

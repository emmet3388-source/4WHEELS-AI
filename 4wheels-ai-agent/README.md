# 4wheels-ai-agent

四個圈輪業「車款適配 AI 顧問」。

這個專案使用 Node.js + CommonJS + OpenAI Responses API，並加入本地 fitment cache 與 MCP Server，讓代理可以優先查詢 4WHEELS fitment 資料，不亂編輪框規格。

## 功能

- CLI 問答代理：`agent.js`
- Fitment 抓取器：`src/fitment/fetchFitment.js`
- 本地快取：`data/fitment-cache.json`
- 人工匯入資料：`data/manual-fitment.json`
- Markdown 知識庫：`knowledge/fitment/`
- MCP Server：`src/mcp/fitment-server.js`
- MCP 名稱：`4wheels-fitment-mcp`

## 安裝方式

```bash
cd /Volumes/Extreme\ SSD/4WHEELS-AI/4wheels-ai-agent
npm install
```

## 設定 .env

複製範例檔：

```bash
cp .env.example .env
```

填入：

```bash
OPENAI_API_KEY=你的API_KEY
```

如果上一層 `4WHEELS-AI/.env` 已經有 `OPENAI_API_KEY`，代理也會自動嘗試讀取上一層 `.env`。

## 更新 fitment cache

預設不做全站抓取。當你搜尋某個品牌車型時，代理會嘗試單獨抓取該車型並建立知識庫。

手動更新單一車型：

```bash
node src/fitment/fetchFitment.js --brand=bmw --model=x5
```

也可以只更新單一品牌：

```bash
node src/fitment/fetchFitment.js --brand=toyota
```

單一車型 / 單一品牌更新會同步建立：

```txt
data/fitment-cache.json
knowledge/fitment/{brand}/{model}.md
knowledge/fitment/index.md
```

如果確定要完整抓取全站，才使用：

```bash
node src/fitment/fetchFitment.js --all
```

完整抓取會依序抓：

```txt
所有品牌 -> 每個品牌所有車型 -> 每個車型詳細規格
```

只更新單一車型：

```bash
node src/fitment/fetchFitment.js --brand=toyota --model=rav4
```

限制抓取車型數量：

```bash
node src/fitment/fetchFitment.js --brand=toyota --limit=10
```

調整抓取並行數：

```bash
FITMENT_CONCURRENCY=6 node src/fitment/fetchFitment.js
```

如果網站是前端動態渲染，可以嘗試 Playwright：

```bash
node src/fitment/fetchFitment.js --playwright
```

注意：現在 crawler 會依序抓：

```txt
品牌列表 -> 品牌車型列表 -> 車型詳細規格頁
```

如果仍抓不到完整資料，程式只會標記 `manual_required` 或留下空欄位，不會自動亂填 PCD、ET、J 值、中心孔或胎規。

單一品牌或單一車型更新會合併進既有 cache，不會清掉原本資料。完整抓取則會重建全站 cache 與知識庫。

## 啟動 MCP Server

```bash
node src/mcp/fitment-server.js
```

MCP Server 是 stdio server，啟動後會等待 MCP client 連線；直接執行時看起來像停在那邊是正常的。

## MCP 工具

### search_vehicle_fitment

輸入：

```json
{
  "brand": "Tesla",
  "model": "Model Y",
  "year": "2024"
}
```

輸出：

```json
{
  "found": false,
  "brand": "",
  "model": "",
  "year": "",
  "pcd": "",
  "center_bore": "",
  "bolt_pattern": "",
  "factory_wheel_size": "",
  "recommended_wheel_size": "",
  "recommended_tire_size": "",
  "offset_range": "",
  "j_range": "",
  "notes": "目前資料不足，需要人工確認。",
  "source": "not found in 4wheels fitment cache or manual file"
}
```

### list_brands

列出目前資料庫中的所有品牌。

### list_models_by_brand

輸入：

```json
{
  "brand": "Toyota"
}
```

輸出該品牌底下所有車款。

### refresh_fitment_cache

指定品牌 / 車型重新抓取 `https://4wheels.com.tw/fitment` 並更新 `data/fitment-cache.json` 與 Markdown 知識庫。

## 測試代理

```bash
node agent.js "幫我查 Toyota RAV4 可以怎麼升級鋁圈？"
```

或：

```bash
node agent.js "我開 Model Y Long Range，想換安靜又有性價比的外匯胎"
```

如果 cache/manual 沒有資料，代理會回答資料不足，並要求補充：

- 車廠
- 車型
- 年份
- 目前輪胎尺寸
- 想升級幾吋
- 用途：通勤、性能、舒適、精品外觀、電動車續航

## 手動編輯 manual-fitment.json

如果網站抓不到資料，請人工編輯：

```bash
data/manual-fitment.json
```

格式：

```json
{
  "source": "manual-fitment.json",
  "updatedAt": "2026-05-07",
  "status": "manual",
  "message": "人工確認資料",
  "vehicles": [
    {
      "brand": "Toyota",
      "model": "RAV4",
      "year": "待確認",
      "pcd": "待確認",
      "center_bore": "待確認",
      "bolt_pattern": "待確認",
      "factory_wheel_size": "待確認",
      "recommended_wheel_size": "待確認",
      "recommended_tire_size": "待確認",
      "offset_range": "待確認",
      "j_range": "待確認",
      "notes": "這是一筆格式範例。請填入人工確認後的資料。",
      "source": "manual file"
    }
  ]
}
```

重要：不確定欄位請留空或寫 `待確認`，不要猜。

## 測試

語法檢查：

```bash
npm test
```

確認 MCP Server 可啟動：

```bash
node src/mcp/fitment-server.js
```

用終端測試時可以按 `Ctrl+C` 停止。

## 常見錯誤排除

### 找不到 OPENAI_API_KEY

請確認 `.env` 裡有：

```bash
OPENAI_API_KEY=你的API_KEY
```

### Cannot find module

請重新安裝：

```bash
npm install
```

### fitment cache 沒資料

先執行單車型更新：

```bash
node src/fitment/fetchFitment.js --brand=bmw --model=x5
```

如果抓不到：

```bash
node src/fitment/fetchFitment.js --playwright
```

如果仍抓不到，請人工編輯 `data/manual-fitment.json`。

### 查不到資料

這是安全設計。代理不能亂編 PCD、ET、J 值、中心孔或螺絲規格。請補資料到 `manual-fitment.json`，或人工確認後再回答。

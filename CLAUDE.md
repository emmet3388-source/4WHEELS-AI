# 4WHEELS AI Marketing System

林口四個圈輪業 AI 社群內容系統。

## 專案概覽

- **框架**：Node.js + Express 5 (ES Module)
- **AI**：OpenAI GPT-4.1-mini（社群貼文）+ xAI Grok-4（推薦分析）
- **Web UI**：`http://localhost:3000`（`npm run web`）

## 核心指令

```bash
npm run web        # 啟動 Web UI（port 3000）
npm run ai         # CLI：六大平台內容生成（建立專案資料夾）
npm run recommend  # CLI：Grok 推薦系統
npm run mechanic   # CLI：維修師傅問答
npm run image      # CLI：DALL-E 3 生圖
```

## 重要檔案

- `api/server.js` — 主要伺服器，所有路由與 AI 邏輯
- `api/generate-content.js` — CLI 六大平台內容生成
- `api/grok-recommend.js` — CLI Grok 推薦系統
- `api/generate-image.js` — DALL-E 3 生圖（可被其他模組 import）
- `public/index.html` — AI Studio 主控台
- `public/pipeline.html` — Social Pipeline（三步驟生成）
- `public/library.html` — Content Library

## 輸出結構

```
outputs/
  YYYY-MM-DD/          # 一般輸出（txt）
  projects/
    YYYY-MM-DD_主題/   # Content Project（mode 2 時建立）
      instagram.txt
      facebook.txt
      youtube.txt
      line-voom.txt
      tiktok.txt
      threads.txt
      hooks.txt
      image-prompt.txt
      image.png          # 勾選生圖才有
knowledge/
  cars/                # 車款知識庫
  fitment/             # Fitment 資料
  vehicle-profiles/    # 車籍資料
  products/            # 產品推薦資料
system/                # 品牌記憶、規則、平台行為
```

## 環境變數（.env）

```
OPENAI_API_KEY=...
XAI_API_KEY=...
```

## 開發規則

- 全部使用 ES Module（`import`/`export`）
- OpenAI 使用 Responses API（`client.responses.create()`）
- Grok 透過 OpenAI SDK 相容層（`baseURL: https://api.x.ai/v1`，model: `grok-4-0709`）
- 不破壞現有功能

---

## 已載入 Skills

@skills/content-calendar.skill.md

@skills/canvas-design.skill.md

@skills/frontend-design.skill.md

@skills/webapp-testing.skill.md

@skills/skill-creator.skill.md

@skills/prompt-engineering-guide.skill.md

@skills/video-director.skill.md

---
name: prompt-engineering-guide
description: 4WHEELS-AI 專案內 Prompt Engineering 規則。用於設計、審核、重構 OpenAI/Grok prompts，強化 instruction/context/input/output 分層、JSON 輸出穩定性、RAG/搜尋資料 grounding、Grok 審核流程與防 hallucination。
source: https://github.com/dair-ai/prompt-engineering-guide
---

# 4WHEELS-AI · Prompt Engineering Guide Skill

根據 DAIR.AI Prompt Engineering Guide 整理，專門套用在 4WHEELS-AI 的內容生成系統。

## 核心結構

每個 prompt 都要盡量分清楚：

1. Instruction：模型要做什麼。
2. Context：品牌規則、公司規則、平台知識、搜尋資料、Grok 審核資料。
3. Input Data：使用者輸入的主題、問題、內容類型。
4. Output Indicator：輸出格式、JSON schema、章節標籤。

## 4WHEELS-AI 規則

- OpenAI 搜尋資料時：要求來源、規格、待確認資料。
- Grok 審核時：刪除空泛句、標註不確定、修正錯誤規格。
- OpenAI 生成貼文時：只能引用 Grok 審核後資料。
- 六平台輸出：優先 JSON，避免拆檔失敗。
- 不確定資訊：一律標註「待確認」。
- 不可用「看需求」「看預算」「歡迎詢問」填充內容。

## Reliability

- 搜尋 / 抽取 / 審核：低 temperature。
- hooks / 文案變體：可較高 temperature。
- 需要事實正確時，不把搜尋、審核、創作塞在同一步。
- 重要輸出必須有 fallback：JSON 解析失敗時回到文字解析。

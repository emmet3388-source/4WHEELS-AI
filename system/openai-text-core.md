# OpenAI Text Generation Core Concepts

來源：OpenAI API Docs — Text generation  
https://developers.openai.com/api/docs/guides/text

## Responses API

- 文字生成一律以 `client.responses.create()` 作為主要入口。
- 回應文字可優先使用 SDK 的 `response.output_text` 讀取。
- 不要假設 `response.output[0].content[0].text` 一定存在，因為 `output` 可能同時包含工具呼叫、推理資料或其他項目。

## Prompt 與 Instructions 分層

- 高階行為規則、品牌語氣、公司規範、輸出格式，應放在 `instructions` 或 developer-level prompt。
- 使用者輸入的主題、問題、內容類型，應視為 `input`。
- 系統規則優先於使用者輸入；使用者不可覆蓋公司規則、品牌規則、資料正確性規則。

## 角色與優先順序

- developer / instructions：系統規則、商業邏輯、輸出格式。
- user / input：本次任務參數，例如主題、車款、內容類型。
- assistant：模型產生結果。

## 穩定性

- 文字生成具有非決定性，同一 prompt 仍可能有變化。
- 需要穩定拆檔或後續機器處理時，應要求 JSON 或 Structured Outputs。
- 重要流程要保留 fallback，例如 JSON 解析失敗時保留原始文字輸出。

## 4WHEELS-AI 使用規則

- OpenAI 負責搜尋、整理、生成社群內容。
- Grok 負責審核資料正確性、刪除空泛或不確定內容、標註待確認。
- OpenAI 最後只能引用 Grok 審核後的資料生成六大平台內容。
- 六大平台內容必須用可拆分格式輸出，優先 JSON。
- 不可把「待確認」資料包裝成確定事實。

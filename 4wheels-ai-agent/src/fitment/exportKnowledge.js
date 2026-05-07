const fs = require("fs");
const path = require("path");
const { ROOT_DIR } = require("./cacheFitment");

const KNOWLEDGE_DIR = path.join(ROOT_DIR, "knowledge", "fitment");

function safeSlug(text) {
  return String(text || "unknown")
    .trim()
    .toLowerCase()
    .replace(/[\/\\:*?"<>|]/g, "")
    .replace(/&/g, "and")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80) || "unknown";
}

function writeText(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf-8");
}

function vehicleToMarkdown(vehicle) {
  return `# Fitment 知識：${vehicle.brand || "待確認"} ${vehicle.model || "待確認"}

## 資料來源

- Source：${vehicle.source || "待確認"}
- Notes：${vehicle.notes || "待確認"}

## 車款

| 欄位 | 內容 |
|---|---|
| 品牌 | ${vehicle.brand || "待確認"} |
| 車款 | ${vehicle.model || "待確認"} |
| 年份 | ${vehicle.year || "待確認"} |

## 輪框 / 輪胎適配

| 欄位 | 內容 |
|---|---|
| PCD | ${vehicle.pcd || "待確認"} |
| 中心孔 CB | ${vehicle.center_bore || "待確認"} |
| 螺絲 / 螺帽規格 | ${vehicle.bolt_pattern || "待確認"} |
| 原廠 / 適配鋁圈尺寸 | ${vehicle.factory_wheel_size || "待確認"} |
| 建議輪圈尺寸 | ${vehicle.recommended_wheel_size || "待確認"} |
| 建議輪胎尺寸 | ${vehicle.recommended_tire_size || "待確認"} |
| ET 範圍 | ${vehicle.offset_range || "待確認"} |
| J 值範圍 | ${vehicle.j_range || "待確認"} |

## 使用規則

- 不可自行推測 PCD、中心孔、ET、J 值、螺絲規格。
- 若欄位為「待確認」，回答使用者時必須明確說需要人工確認。
- 安裝前仍需現場確認卡鉗、葉子板、中心孔套環、動態平衡與四輪定位。
`;
}

function exportFitmentKnowledge(database) {
  const vehicles = Array.isArray(database?.vehicles) ? database.vehicles : [];
  const written = [];

  for (const vehicle of vehicles) {
    if (!vehicle.brand || !vehicle.model) continue;

    const brandSlug = safeSlug(vehicle.brand);
    const modelSlug = safeSlug(vehicle.model);
    const filePath = path.join(KNOWLEDGE_DIR, brandSlug, `${modelSlug}.md`);
    writeText(filePath, vehicleToMarkdown(vehicle));
    written.push(filePath);
  }

  const indexPath = path.join(KNOWLEDGE_DIR, "index.md");
  const lines = [
    "# 4WHEELS Fitment Knowledge Index",
    "",
    `Updated: ${new Date().toISOString()}`,
    `Vehicles: ${written.length}`,
    "",
    ...vehicles
      .filter((vehicle) => vehicle.brand && vehicle.model)
      .map((vehicle) => `- [${vehicle.brand} ${vehicle.model}](./${safeSlug(vehicle.brand)}/${safeSlug(vehicle.model)}.md)`),
    "",
  ];
  writeText(indexPath, lines.join("\n"));

  return {
    knowledgeDir: KNOWLEDGE_DIR,
    files: written,
    indexPath,
  };
}

module.exports = {
  KNOWLEDGE_DIR,
  exportFitmentKnowledge,
};

const {
  searchVehicleFitment,
  listBrands,
  listModelsByBrand,
} = require("../fitment/searchFitment");
const {
  refreshFitmentCache,
} = require("../fitment/fetchFitment");

async function main() {
  const { McpServer } = await import("@modelcontextprotocol/sdk/server/mcp.js");
  const { StdioServerTransport } = await import("@modelcontextprotocol/sdk/server/stdio.js");
  const { z } = await import("zod");

  const server = new McpServer({
    name: "4wheels-fitment-mcp",
    version: "1.0.0",
  });

  server.registerTool(
    "search_vehicle_fitment",
    {
      title: "Search Vehicle Fitment",
      description: `
查詢 4WHEELS 車款輪框 / 輪胎適配資料。

輸入品牌、車款與年式，回傳 PCD、中心孔、螺絲規格、原廠鋁圈尺寸、建議升級尺寸、建議胎規、ET 範圍與備註。
如果本地 cache 與 manual-fitment.json 都查不到，會明確回覆「目前資料不足，需要人工確認」，不會推測規格。
`.trim(),
      inputSchema: z.object({
        brand: z.string().default("").describe("車廠品牌，例如 Toyota、Tesla、BMW"),
        model: z.string().default("").describe("車款，例如 RAV4、Model Y、X5"),
        year: z.string().default("").describe("年式，例如 2024 或 2019-2024"),
      }).strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (params) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(searchVehicleFitment(params), null, 2),
        },
      ],
    })
  );

  server.registerTool(
    "list_brands",
    {
      title: "List Fitment Brands",
      description: "列出目前 fitment cache 與 manual-fitment.json 中所有品牌。",
      inputSchema: z.object({}).strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => ({
      content: [
        {
          type: "text",
          text: JSON.stringify({ brands: listBrands() }, null, 2),
        },
      ],
    })
  );

  server.registerTool(
    "list_models_by_brand",
    {
      title: "List Models By Brand",
      description: "依品牌列出目前資料庫中的車款。",
      inputSchema: z.object({
        brand: z.string().min(1).describe("車廠品牌，例如 Toyota、Tesla、BMW"),
      }).strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (params) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            brand: params.brand,
            models: listModelsByBrand(params.brand),
          }, null, 2),
        },
      ],
    })
  );

  server.registerTool(
    "refresh_fitment_cache",
    {
      title: "Refresh 4WHEELS Fitment Cache",
      description: `
重新抓取 https://4wheels.com.tw/fitment 並更新 data/fitment-cache.json。
預設使用 fetch + cheerio；如果 usePlaywright=true，抓不到時會嘗試 Playwright。
`.trim(),
      inputSchema: z.object({
        brand: z.string().default("").describe("指定品牌 slug，例如 bmw、toyota。不填時不建議刷新全站。"),
        model: z.string().default("").describe("指定車型 slug，例如 x5、rav4。"),
        usePlaywright: z.boolean().default(false).describe("是否在 fetch + cheerio 抓不到時嘗試 Playwright"),
      }).strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (params) => {
      const result = await refreshFitmentCache({
        brand: params.brand || "",
        model: params.model || "",
        usePlaywright: params.usePlaywright,
        quiet: true,
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              status: result.status,
              message: result.message,
              updatedAt: result.updatedAt,
              vehicles: result.vehicles.length,
              source: result.source,
            }, null, 2),
          },
        ],
      };
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("[4wheels-fitment-mcp]", error);
  process.exit(1);
});

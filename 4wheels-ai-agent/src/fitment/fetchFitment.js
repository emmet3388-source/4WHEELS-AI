const { loadCache, saveCache } = require("./cacheFitment");
const { exportFitmentKnowledge } = require("./exportKnowledge");

const FITMENT_URL = "https://4wheels.com.tw/fitment";
const BASE_URL = "https://4wheels.com.tw";

async function loadNodeFetch() {
  const mod = await import("node-fetch");
  return mod.default;
}

async function loadCheerio() {
  return import("cheerio");
}

function cleanText(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim();
}

function toAbsoluteUrl(href) {
  try {
    return new URL(href, BASE_URL).toString();
  } catch (_) {
    return "";
  }
}

function slugToName(slug) {
  return String(slug || "")
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizeBrandName(name) {
  const raw = cleanText(name);
  const upperMap = {
    bmw: "BMW",
    audi: "Audi",
    toyota: "Toyota",
    lexus: "Lexus",
    honda: "Honda",
    mazda: "Mazda",
    nissan: "Nissan",
    subaru: "Subaru",
    volkswagen: "Volkswagen",
    mercedesbenz: "Mercedes-Benz",
    "mercedes-benz": "Mercedes-Benz",
    cmc: "CMC",
    mg: "MG",
    mini: "MINI",
  };
  const key = raw.toLowerCase().replace(/\s+/g, "-");
  const compact = raw.toLowerCase().replace(/[\s\-_]+/g, "");
  return upperMap[key] || upperMap[compact] || raw;
}

async function fetchHtml(url) {
  const fetch = await loadNodeFetch();
  const response = await fetch(url, {
    headers: {
      "user-agent": "4wheels-ai-agent/1.0 fitment cache updater",
      "accept": "text/html,application/xhtml+xml",
    },
  });

  if (!response.ok) {
    throw new Error(`${url} HTTP ${response.status} ${response.statusText}`);
  }

  return response.text();
}

function assignField(vehicle, key, value) {
  const text = cleanText(value);
  if (!text) return;

  const k = cleanText(key).toLowerCase();

  if (/brand|品牌|車廠|廠牌/.test(k)) vehicle.brand = text;
  else if (/model|車款|車型/.test(k)) vehicle.model = text;
  else if (/year|年份|年式/.test(k)) vehicle.year = text;
  else if (/pcd/.test(k)) vehicle.pcd = text;
  else if (/center|bore|中心孔|cb/.test(k)) vehicle.center_bore = text;
  else if (/bolt|螺絲|孔距/.test(k)) vehicle.bolt_pattern = text;
  else if (/factory.*wheel|原廠.*鋁圈|原廠.*輪框|原廠.*輪圈/.test(k)) vehicle.factory_wheel_size = text;
  else if (/recommended.*wheel|建議.*鋁圈|升級.*鋁圈|建議.*輪框|建議.*輪圈/.test(k)) vehicle.recommended_wheel_size = text;
  else if (/tire|輪胎|胎規/.test(k)) vehicle.recommended_tire_size = text;
  else if (/offset|et/.test(k)) vehicle.offset_range = text;
  else if (/(^|[^a-z])j([^a-z]|$)|j值|j 值/.test(k)) vehicle.j_range = text;
  else if (/note|備註|注意/.test(k)) vehicle.notes = text;
}

function parseTableVehicles($) {
  const vehicles = [];

  $("table").each((_, table) => {
    const headers = [];
    $(table).find("thead th, tr:first-child th, tr:first-child td").each((__, cell) => {
      headers.push(cleanText($(cell).text()));
    });

    $(table).find("tbody tr, tr").each((rowIndex, row) => {
      if (rowIndex === 0 && headers.length) return;

      const cells = [];
      $(row).find("td, th").each((__, cell) => {
        cells.push(cleanText($(cell).text()));
      });

      if (cells.length < 2) return;

      const vehicle = { source: "4wheels fitment database" };
      cells.forEach((value, index) => {
        assignField(vehicle, headers[index] || `column_${index}`, value);
      });

      if (vehicle.brand || vehicle.model) vehicles.push(vehicle);
    });
  });

  return vehicles;
}

function parseOptionVehicles($) {
  const vehicles = [];

  $("select option").each((_, option) => {
    const text = cleanText($(option).text());
    if (!text || text.length < 2 || /請選擇|select/i.test(text)) return;

    vehicles.push({
      brand: "",
      model: text,
      year: "",
      pcd: "",
      center_bore: "",
      bolt_pattern: "",
      factory_wheel_size: "",
      recommended_wheel_size: "",
      recommended_tire_size: "",
      offset_range: "",
      j_range: "",
      notes: "此筆資料從 fitment 頁面選單文字擷取，規格欄位仍需人工確認。",
      source: "4wheels fitment database",
    });
  });

  return vehicles;
}

function parseLinkVehicles($) {
  const vehicles = [];

  $("a[href*='fitment']").each((_, link) => {
    const text = cleanText($(link).text());
    if (!text || text.length < 2 || text.length > 80) return;
    const brandMatch = text.match(/models[A-Z]?([A-Za-z][A-Za-z\- ]+?)(\d+\s*款車型|$)/);
    const brand = brandMatch ? cleanText(brandMatch[1]) : "";

    vehicles.push({
      brand,
      model: brand ? "" : text,
      year: "",
      pcd: "",
      center_bore: "",
      bolt_pattern: "",
      factory_wheel_size: "",
      recommended_wheel_size: "",
      recommended_tire_size: "",
      offset_range: "",
      j_range: "",
      notes: brand
        ? `此筆資料為 fitment 品牌入口：${text}。車款與規格欄位仍需進一步抓取或人工確認。`
        : "此筆資料從 fitment 頁面連結文字擷取，規格欄位仍需人工確認。",
      source: "4wheels fitment database",
    });
  });

  return vehicles;
}

function extractBrandLinks($) {
  const links = [];
  const seen = new Set();

  $("a[href^='/fitment/']").each((_, link) => {
    const href = $(link).attr("href") || "";
    const parts = href.split("/").filter(Boolean);
    if (parts.length !== 2 || parts[0] !== "fitment") return;

    const brandSlug = parts[1];
    const brand =
      cleanText($(link).find(".fb__list-name").text()) ||
      cleanText($(link).find(".fb__card-brand").text()) ||
      cleanText($(link).find("img").attr("alt")) ||
      slugToName(brandSlug);

    if (!brand || seen.has(brandSlug)) return;
    seen.add(brandSlug);
    links.push({
      brand: normalizeBrandName(brand),
      brandSlug,
      url: toAbsoluteUrl(href),
    });
  });

  return links;
}

function extractModelLinks($, brandInfo) {
  const links = [];
  const seen = new Set();
  const brandSlug = brandInfo.brandSlug;

  $(`a[href^='/fitment/${brandSlug}/']`).each((_, link) => {
    const href = $(link).attr("href") || "";
    const parts = href.split("/").filter(Boolean);
    if (parts.length !== 3 || parts[0] !== "fitment" || parts[1] !== brandSlug) return;

    const modelSlug = parts[2];
    const model =
      cleanText($(link).find("img").attr("alt")).replace(new RegExp(`^${brandInfo.brand}\\s+`, "i"), "") ||
      cleanText($(link).find(".model-card-title").text()).replace(new RegExp(`^${brandInfo.brand}\\s+`, "i"), "") ||
      slugToName(modelSlug);

    if (!model || seen.has(modelSlug)) return;
    seen.add(modelSlug);
    links.push({
      brand: brandInfo.brand,
      brandSlug,
      model,
      modelSlug,
      url: toAbsoluteUrl(href),
    });
  });

  return links;
}

function uniqueList(items) {
  return [...new Set(items.map(cleanText).filter(Boolean))];
}

function parseSpecCards($) {
  const specs = {};

  $(".fitment-spec-card").each((_, card) => {
    const label = cleanText($(card).find(".spec-label").text());
    const value = cleanText($(card).find(".spec-value").text());
    if (!label || !value) return;

    if (/pcd|孔距/i.test(label)) specs.pcd = value;
    else if (/中心孔|cb|center/i.test(label)) specs.center_bore = value;
    else if (/螺帽|螺絲|bolt/i.test(label)) specs.bolt_pattern = value;
    else if (/輪圈尺寸|鋁圈尺寸|wheel/i.test(label)) specs.recommended_wheel_size = value;
    else specs.notes = [specs.notes, `${label}: ${value}`].filter(Boolean).join("；");
  });

  return specs;
}

function parseWheelRows($) {
  const wheelSpecs = [];
  const tireSpecs = [];
  const etValues = [];
  const jValues = [];

  $(".tc__table tr").each((_, row) => {
    const text = cleanText($(row).text());
    if (!text || /直徑.*J.*ET.*輪胎/.test(text)) return;

    const match = text.match(/(\d{2}\")\s*([\d.]+J)\s*(\d{2,3})\s*(\d{3}\/\d{2}R\d{2})/i);
    if (!match) return;

    const [, diameter, j, et, tire] = match;
    wheelSpecs.push(`${diameter} × ${j} ET${et}`);
    tireSpecs.push(tire);
    etValues.push(Number(et));
    jValues.push(j);
  });

  const uniqueWheels = uniqueList(wheelSpecs);
  const uniqueTires = uniqueList(tireSpecs);
  const uniqueJ = uniqueList(jValues);
  const numericEt = etValues.filter((value) => Number.isFinite(value));

  return {
    factory_wheel_size: uniqueWheels.join("、"),
    recommended_tire_size: uniqueTires.join("、"),
    offset_range: numericEt.length
      ? `ET${Math.min(...numericEt)}-${Math.max(...numericEt)}`
      : "",
    j_range: uniqueJ.join("、"),
  };
}

function parseFaqSpecs($) {
  const specs = {};
  const bodyText = $("body").text().replace(/\s+/g, " ");

  const pcdMatch = bodyText.match(/孔距（PCD）為\s*([0-9xX.]+)/) || bodyText.match(/PCD\s*([0-9xX.]+)/);
  const cbMatch = bodyText.match(/中心孔（CB）為\s*([0-9.]+\s*mm?)/i);
  const nutMatch = bodyText.match(/原廠使用\s*([^，。]+?規格螺帽)/);
  const etMatch = bodyText.match(/原廠 ET 值範圍約\s*ET?(\d+)\s*至\s*ET?(\d+)/i);

  if (pcdMatch) specs.pcd = pcdMatch[1];
  if (cbMatch) specs.center_bore = cbMatch[1];
  if (nutMatch) specs.bolt_pattern = nutMatch[1];
  if (etMatch) specs.offset_range = `ET${etMatch[1]}-${etMatch[2]}`;

  return specs;
}

function parseVehicleDetailPage($, modelInfo) {
  const cardSpecs = parseSpecCards($);
  const wheelRows = parseWheelRows($);
  const faqSpecs = parseFaqSpecs($);

  const vehicle = {
    brand: modelInfo.brand,
    model: modelInfo.model,
    year: "",
    pcd: cardSpecs.pcd || faqSpecs.pcd || "",
    center_bore: cardSpecs.center_bore || faqSpecs.center_bore || "",
    bolt_pattern: cardSpecs.bolt_pattern || faqSpecs.bolt_pattern || "",
    factory_wheel_size: wheelRows.factory_wheel_size || "",
    recommended_wheel_size: cardSpecs.recommended_wheel_size || "",
    recommended_tire_size: wheelRows.recommended_tire_size || "",
    offset_range: wheelRows.offset_range || faqSpecs.offset_range || "",
    j_range: wheelRows.j_range || "",
    notes: uniqueList([
      cardSpecs.notes,
      `來源頁面：${modelInfo.url}`,
    ]).join("；"),
    source: "4wheels fitment database",
  };

  return vehicle;
}

async function mapLimit(items, limit, worker, onProgress = null) {
  const results = new Array(items.length);
  let nextIndex = 0;
  let completed = 0;

  async function runWorker() {
    while (nextIndex < items.length) {
      const current = nextIndex;
      nextIndex += 1;
      results[current] = await worker(items[current], current);
      completed += 1;
      if (onProgress) onProgress(completed, items.length, items[current], results[current]);
    }
  }

  const workers = Array.from(
    { length: Math.max(1, Math.min(limit, items.length || 1)) },
    () => runWorker()
  );
  await Promise.all(workers);
  return results;
}

function mergeVehicles(existingVehicles, incomingVehicles) {
  const map = new Map();
  for (const vehicle of existingVehicles) {
    const key = `${cleanText(vehicle.brand).toLowerCase()}|${cleanText(vehicle.model).toLowerCase()}`;
    if (key !== "|") map.set(key, vehicle);
  }
  for (const vehicle of incomingVehicles) {
    const key = `${cleanText(vehicle.brand).toLowerCase()}|${cleanText(vehicle.model).toLowerCase()}`;
    if (key !== "|") map.set(key, vehicle);
  }
  return [...map.values()];
}

function parseEmbeddedJsonVehicles($) {
  const vehicles = [];

  $("script").each((_, script) => {
    const text = $(script).text();
    if (!text || !/(pcd|fitment|wheel|tire|車款|胎規|鋁圈)/i.test(text)) return;

    const roughMatches = text.match(/\{[^{}]*(?:pcd|PCD|車款|胎規|鋁圈|wheel|tire)[^{}]*\}/g) || [];
    for (const rough of roughMatches.slice(0, 200)) {
      try {
        const item = JSON.parse(rough);
        const vehicle = { source: "4wheels fitment database" };
        for (const [key, value] of Object.entries(item)) {
          assignField(vehicle, key, value);
        }
        if (vehicle.brand || vehicle.model || vehicle.pcd) vehicles.push(vehicle);
      } catch (_) {
        // Ignore non-JSON script fragments.
      }
    }
  });

  return vehicles;
}

function dedupeVehicles(vehicles) {
  const seen = new Set();
  const result = [];

  for (const vehicle of vehicles) {
    const key = [
      vehicle.brand,
      vehicle.model,
      vehicle.year,
      vehicle.pcd,
      vehicle.center_bore,
      vehicle.recommended_tire_size,
    ].map((value) => cleanText(value).toLowerCase()).join("|");

    if (seen.has(key)) continue;
    seen.add(key);
    result.push(vehicle);
  }

  return result;
}

async function fetchWithCheerio(options = {}) {
  const cheerio = await loadCheerio();
  const html = await fetchHtml(FITMENT_URL);
  const $ = cheerio.load(html);
  const brandLinks = extractBrandLinks($);
  const maxModels = Number(options.limit || process.env.FITMENT_MAX_MODELS || 0);
  const concurrency = Number(process.env.FITMENT_CONCURRENCY || 4);
  const onlyBrand = options.brand || process.env.FITMENT_BRAND
    ? String(options.brand || process.env.FITMENT_BRAND).toLowerCase()
    : "";
  const onlyModel = options.model || process.env.FITMENT_MODEL
    ? String(options.model || process.env.FITMENT_MODEL).toLowerCase().replace(/[\s\-_]+/g, "")
    : "";
  const targetBrands = onlyBrand
    ? brandLinks.filter((brand) => brand.brandSlug === onlyBrand || brand.brand.toLowerCase() === onlyBrand)
    : brandLinks;

  const modelLinks = [];

  for (const brand of targetBrands) {
    const brandHtml = await fetchHtml(brand.url);
    const brandPage = cheerio.load(brandHtml);
    const models = extractModelLinks(brandPage, brand).filter((model) => {
      if (!onlyModel) return true;
      const compactSlug = model.modelSlug.toLowerCase().replace(/[\s\-_]+/g, "");
      const compactName = model.model.toLowerCase().replace(/[\s\-_]+/g, "");
      return compactSlug.includes(onlyModel) || compactName.includes(onlyModel);
    });
    modelLinks.push(...models);
    if (maxModels && modelLinks.length >= maxModels) break;
  }

  const limitedModelLinks = maxModels ? modelLinks.slice(0, maxModels) : modelLinks;
  const vehicles = await mapLimit(limitedModelLinks, concurrency, async (model) => {
    try {
      const modelHtml = await fetchHtml(model.url);
      const modelPage = cheerio.load(modelHtml);
      return parseVehicleDetailPage(modelPage, model);
    } catch (error) {
      return {
        brand: model.brand,
        model: model.model,
        year: "",
        pcd: "",
        center_bore: "",
        bolt_pattern: "",
        factory_wheel_size: "",
        recommended_wheel_size: "",
        recommended_tire_size: "",
        offset_range: "",
        j_range: "",
        notes: `車型頁抓取失敗：${error.message}。來源頁面：${model.url}`,
        source: "4wheels fitment database",
      };
    }
  }, (done, total, model) => {
    if (!options.quiet && (done === total || done % 25 === 0)) {
      console.log(`[fitment] ${done}/${total} ${model.brand} ${model.model}`);
    }
  });

  const fallbackVehicles = vehicles.length
    ? []
    : [
        ...parseTableVehicles($),
        ...parseEmbeddedJsonVehicles($),
        ...parseOptionVehicles($),
        ...parseLinkVehicles($),
      ];
  const deduped = dedupeVehicles([...vehicles, ...fallbackVehicles]);
  const targeted = Boolean(onlyBrand || onlyModel || maxModels);
  const finalVehicles = targeted
    ? mergeVehicles(loadCache().vehicles, deduped)
    : deduped;

  return {
    source: FITMENT_URL,
    status: finalVehicles.length ? "ready" : "partial",
    message: finalVehicles.length
      ? `已從 4WHEELS fitment 擷取 ${targetBrands.length} 個品牌、${limitedModelLinks.length} 個車型；本地 cache 目前共 ${finalVehicles.length} 筆適配資料。請人工抽查規格完整性。`
      : "fetch + cheerio 未抓到完整結構化車款適配資料。可能是前端動態渲染，請改用 Playwright 或 manual-fitment.json。",
    vehicles: finalVehicles,
  };
}

async function fetchWithPlaywright() {
  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch (error) {
    return {
      source: FITMENT_URL,
      status: "manual_required",
      message: `Playwright 未安裝或不可用：${error.message}。請使用 data/manual-fitment.json 人工匯入。`,
      vehicles: [],
    };
  }

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(FITMENT_URL, { waitUntil: "networkidle", timeout: 45000 });
    const html = await page.content();
    const cheerio = await loadCheerio();
    const $ = cheerio.load(html);
    const vehicles = dedupeVehicles([
      ...parseTableVehicles($),
      ...parseEmbeddedJsonVehicles($),
      ...parseOptionVehicles($),
      ...parseLinkVehicles($),
    ]);

    return {
      source: FITMENT_URL,
      status: vehicles.length ? "ready" : "manual_required",
      message: vehicles.length
        ? `已透過 Playwright 擷取 ${vehicles.length} 筆候選資料。請人工檢查規格完整性。`
        : "Playwright 仍未抓到完整結構化車款適配資料，請使用 data/manual-fitment.json 人工匯入。",
      vehicles,
    };
  } finally {
    await browser.close();
  }
}

async function refreshFitmentCache(options = {}) {
  let data;

  try {
    data = await fetchWithCheerio(options);
  } catch (error) {
    data = {
      source: FITMENT_URL,
      status: "fetch_error",
      message: `fetch + cheerio 抓取失敗：${error.message}`,
      vehicles: [],
    };
  }

  if ((!data.vehicles || data.vehicles.length === 0) && options.usePlaywright) {
    data = await fetchWithPlaywright();
  }

  const saved = saveCache(data);
  const knowledge = exportFitmentKnowledge(saved);
  return {
    ...saved,
    knowledge,
  };
}

if (require.main === module) {
  const usePlaywright = process.argv.includes("--playwright");
  const fetchAll = process.argv.includes("--all");
  const cliOptions = { usePlaywright };

  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith("--brand=")) cliOptions.brand = arg.split("=").slice(1).join("=");
    if (arg.startsWith("--model=")) cliOptions.model = arg.split("=").slice(1).join("=");
    if (arg.startsWith("--limit=")) cliOptions.limit = arg.split("=").slice(1).join("=");
  }

  if (!fetchAll && !cliOptions.brand && !cliOptions.model) {
    console.log("請指定要更新的品牌 / 車型，例如：");
    console.log("node src/fitment/fetchFitment.js --brand=bmw --model=x5");
    console.log("node src/fitment/fetchFitment.js --brand=toyota --model=rav4");
    console.log("若確定要完整抓取全站，請使用：node src/fitment/fetchFitment.js --all");
    process.exit(0);
  }

  refreshFitmentCache(cliOptions)
    .then((data) => {
      console.log(`Fitment cache updated: ${data.status}`);
      console.log(data.message);
      console.log(`Vehicles: ${data.vehicles.length}`);
      if (data.knowledge) {
        console.log(`Knowledge files: ${data.knowledge.files.length}`);
        console.log(`Knowledge index: ${data.knowledge.indexPath}`);
      }
    })
    .catch((error) => {
      console.error("Fitment cache update failed:", error.message);
      process.exitCode = 1;
    });
}

module.exports = {
  refreshFitmentCache,
  fetchWithCheerio,
  fetchWithPlaywright,
};

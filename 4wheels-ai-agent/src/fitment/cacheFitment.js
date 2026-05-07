const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.resolve(__dirname, "../..");
const DATA_DIR = path.join(ROOT_DIR, "data");
const CACHE_PATH = path.join(DATA_DIR, "fitment-cache.json");
const MANUAL_PATH = path.join(DATA_DIR, "manual-fitment.json");

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function emptyDatabase(source, message = "") {
  return {
    source,
    updatedAt: "",
    status: "empty",
    message,
    vehicles: [],
  };
}

function normalizeVehicle(vehicle = {}, fallbackSource = "") {
  return {
    brand: String(vehicle.brand || "").trim(),
    model: String(vehicle.model || "").trim(),
    year: String(vehicle.year || vehicle.year_range || "").trim(),
    pcd: String(vehicle.pcd || "").trim(),
    center_bore: String(vehicle.center_bore || vehicle.cb || "").trim(),
    bolt_pattern: String(vehicle.bolt_pattern || vehicle.bolt || "").trim(),
    factory_wheel_size: String(vehicle.factory_wheel_size || "").trim(),
    recommended_wheel_size: String(vehicle.recommended_wheel_size || "").trim(),
    recommended_tire_size: String(vehicle.recommended_tire_size || "").trim(),
    offset_range: String(vehicle.offset_range || vehicle.et || "").trim(),
    j_range: String(vehicle.j_range || vehicle.j_value || "").trim(),
    notes: String(vehicle.notes || "").trim(),
    source: String(vehicle.source || fallbackSource || "").trim(),
  };
}

function normalizeDatabase(data, fallbackSource = "") {
  const vehicles = Array.isArray(data?.vehicles)
    ? data.vehicles.map((vehicle) => normalizeVehicle(vehicle, fallbackSource))
    : [];

  return {
    source: data?.source || fallbackSource,
    updatedAt: data?.updatedAt || "",
    status: data?.status || (vehicles.length ? "ready" : "empty"),
    message: data?.message || "",
    vehicles,
  };
}

function readJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch (error) {
    return {
      ...fallback,
      status: "error",
      message: `JSON 讀取失敗：${error.message}`,
    };
  }
}

function loadCache() {
  return normalizeDatabase(
    readJson(CACHE_PATH, emptyDatabase("https://4wheels.com.tw/fitment", "尚未建立快取")),
    "4wheels fitment database"
  );
}

function loadManual() {
  return normalizeDatabase(
    readJson(MANUAL_PATH, emptyDatabase("manual-fitment.json", "尚未建立人工資料")),
    "manual file"
  );
}

function saveCache(data) {
  ensureDataDir();
  const normalized = normalizeDatabase({
    ...data,
    updatedAt: new Date().toISOString(),
  }, "4wheels fitment database");
  fs.writeFileSync(CACHE_PATH, JSON.stringify(normalized, null, 2), "utf-8");
  return normalized;
}

function loadCombinedFitment() {
  const cache = loadCache();
  const manual = loadManual();

  return {
    sources: [cache.source, manual.source],
    cacheStatus: cache.status,
    manualStatus: manual.status,
    vehicles: [
      ...cache.vehicles,
      ...manual.vehicles,
    ],
  };
}

module.exports = {
  ROOT_DIR,
  DATA_DIR,
  CACHE_PATH,
  MANUAL_PATH,
  ensureDataDir,
  normalizeVehicle,
  normalizeDatabase,
  loadCache,
  loadManual,
  saveCache,
  loadCombinedFitment,
};

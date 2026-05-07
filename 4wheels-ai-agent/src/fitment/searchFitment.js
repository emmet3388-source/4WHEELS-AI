const {
  loadCombinedFitment,
} = require("./cacheFitment");

function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[\s\-_./]+/g, "")
    .trim();
}

function includesLoose(value, needle) {
  const a = normalizeText(value);
  const b = normalizeText(needle);
  return Boolean(a && b && (a.includes(b) || b.includes(a)));
}

function equalsLoose(value, needle) {
  const a = normalizeText(value);
  const b = normalizeText(needle);
  return Boolean(a && b && a === b);
}

function scoreVehicle(vehicle, params = {}) {
  let score = 0;

  if (params.brand && equalsLoose(vehicle.brand, params.brand)) score += 20;
  else if (params.brand && includesLoose(vehicle.brand, params.brand)) score += 5;

  if (params.model && equalsLoose(vehicle.model, params.model)) score += 40;
  else if (params.model && includesLoose(vehicle.model, params.model)) score += 8;

  if (params.year && includesLoose(vehicle.year, params.year)) score += 2;

  const query = params.query || "";
  if (query) {
    const haystack = [
      vehicle.brand,
      vehicle.model,
      vehicle.year,
      vehicle.notes,
      vehicle.source,
    ].join(" ");
    const compactQuery = normalizeText(query);
    const compactHaystack = normalizeText(haystack);

    if (compactQuery && compactHaystack.includes(compactQuery)) score += 6;

    for (const token of String(query).split(/[\s,，。?？/]+/).filter(Boolean)) {
      if (normalizeText(token).length >= 2 && compactHaystack.includes(normalizeText(token))) {
        score += 1;
      }
    }
  }

  return score;
}

function createInsufficientResult(params = {}) {
  return {
    found: false,
    brand: params.brand || "",
    model: params.model || "",
    year: params.year || "",
    pcd: "",
    center_bore: "",
    bolt_pattern: "",
    factory_wheel_size: "",
    recommended_wheel_size: "",
    recommended_tire_size: "",
    offset_range: "",
    j_range: "",
    notes: "目前資料不足，需要人工確認。不可自行推測 PCD、中心孔、ET、J 值、螺絲規格或胎圈尺寸。",
    source: "not found in 4wheels fitment cache or manual file",
  };
}

function formatToolResult(vehicle, params = {}) {
  if (!vehicle) return createInsufficientResult(params);

  return {
    found: true,
    brand: vehicle.brand || "",
    model: vehicle.model || "",
    year: vehicle.year || "",
    pcd: vehicle.pcd || "",
    center_bore: vehicle.center_bore || "",
    bolt_pattern: vehicle.bolt_pattern || "",
    factory_wheel_size: vehicle.factory_wheel_size || "",
    recommended_wheel_size: vehicle.recommended_wheel_size || "",
    recommended_tire_size: vehicle.recommended_tire_size || "",
    offset_range: vehicle.offset_range || "",
    j_range: vehicle.j_range || "",
    notes: vehicle.notes || "",
    source: vehicle.source || "4wheels fitment database or manual file",
  };
}

function searchVehicleFitment(params = {}) {
  const db = loadCombinedFitment();
  let vehicles = db.vehicles;
  if (params.model) {
    const exactModels = vehicles.filter((vehicle) => equalsLoose(vehicle.model, params.model));
    if (exactModels.length) vehicles = exactModels;
  }

  const scored = vehicles
    .filter((vehicle) => {
      if (params.model && !includesLoose(vehicle.model, params.model)) return false;
      return true;
    })
    .map((vehicle) => ({
      vehicle,
      score: scoreVehicle(vehicle, params),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  if (!scored.length) return createInsufficientResult(params);

  return formatToolResult(scored[0].vehicle, params);
}

function searchFitment(params = {}) {
  const db = loadCombinedFitment();
  let vehicles = db.vehicles;
  if (params.model) {
    const exactModels = vehicles.filter((vehicle) => equalsLoose(vehicle.model, params.model));
    if (exactModels.length) vehicles = exactModels;
  }

  const scored = vehicles
    .filter((vehicle) => {
      if (params.model && !includesLoose(vehicle.model, params.model)) return false;
      return true;
    })
    .map((vehicle) => ({
      vehicle,
      score: scoreVehicle(vehicle, params),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, params.limit || 10);

  return {
    found: scored.length > 0,
    count: scored.length,
    results: scored.map((item) => formatToolResult(item.vehicle, params)),
    fallback: scored.length ? "" : "目前資料不足，需要人工確認。",
  };
}

function listBrands() {
  const db = loadCombinedFitment();
  return [...new Set(db.vehicles.map((vehicle) => vehicle.brand).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
}

function listModelsByBrand(brand) {
  const db = loadCombinedFitment();
  return [...new Set(
    db.vehicles
      .filter((vehicle) => includesLoose(vehicle.brand, brand))
      .map((vehicle) => vehicle.model)
      .filter(Boolean)
  )].sort((a, b) => a.localeCompare(b));
}

module.exports = {
  searchVehicleFitment,
  searchFitment,
  listBrands,
  listModelsByBrand,
};

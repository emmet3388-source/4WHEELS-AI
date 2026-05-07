const BRAND_ALIASES = [
  { slug: "bmw", names: ["bmw", "bimmer", "寶馬"] },
  { slug: "toyota", names: ["toyota", "豐田"] },
  { slug: "mercedes-benz", names: ["mercedes-benz", "mercedes", "benz", "賓士"] },
  { slug: "lexus", names: ["lexus", "凌志", "凌誌"] },
  { slug: "audi", names: ["audi", "奧迪"] },
  { slug: "volkswagen", names: ["volkswagen", "vw", "福斯"] },
  { slug: "honda", names: ["honda", "本田"] },
  { slug: "mazda", names: ["mazda", "馬自達"] },
  { slug: "nissan", names: ["nissan", "尼桑", "日產"] },
  { slug: "ford", names: ["ford", "福特"] },
  { slug: "porsche", names: ["porsche", "保時捷"] },
  { slug: "subaru", names: ["subaru", "速霸陸"] },
  { slug: "tesla", names: ["tesla", "特斯拉"] },
  { slug: "luxgen", names: ["luxgen", "納智捷"] },
  { slug: "kia", names: ["kia", "起亞"] },
  { slug: "hyundai", names: ["hyundai", "現代"] },
  { slug: "volvo", names: ["volvo", "富豪"] },
  { slug: "mini", names: ["mini"] },
  { slug: "mg", names: ["mg"] },
];

function compact(text) {
  return String(text || "").toLowerCase().replace(/[\s\-_]+/g, "");
}

function slugifyModel(text) {
  return String(text || "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

function inferFitmentTarget(text) {
  const source = String(text || "");
  const lower = source.toLowerCase();

  for (const brand of BRAND_ALIASES) {
    for (const name of brand.names) {
      const index = lower.indexOf(name.toLowerCase());
      if (index === -1) continue;

      const after = source.slice(index + name.length);
      const modelMatch = after.match(/^[\s　,，:：-]*([A-Za-z0-9][A-Za-z0-9\- ]{0,30})/);
      if (!modelMatch) return { brand: brand.slug, model: "" };

      const rawModel = modelMatch[1]
        .replace(/\b(可以|怎麼|如何|適合|想|要|換|查|升級|鋁圈|輪框|輪胎|外匯胎|fitment|推薦|文案|腳本|拍攝)\b.*$/i, "")
        .trim();
      const model = slugifyModel(rawModel);
      if (model) return { brand: brand.slug, model };
    }
  }

  return null;
}

function isFitmentRelated(text) {
  return /鋁圈|輪框|輪圈|fitment|pcd|中心孔|cb|et|j值|j 值|螺絲|胎規|輪胎尺寸|升級幾吋|適配|外匯胎|新胎|輪胎|電動車輪胎|載重指數|xl/i.test(String(text || ""));
}

module.exports = {
  BRAND_ALIASES,
  compact,
  slugifyModel,
  inferFitmentTarget,
  isFitmentRelated,
};

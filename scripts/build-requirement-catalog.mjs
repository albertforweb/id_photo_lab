import { readFile, writeFile } from "node:fs/promises";

const RESEARCH_API_ROOT = "https://photogov.net";
const GENERATED_AT = new Date().toISOString().slice(0, 10);
const CATALOG_FILE = new URL("../src/data/photoSpecs.json", import.meta.url);

async function post(path, body = {}) {
  const response = await fetch(`${RESEARCH_API_ROOT}${path}`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`${path} returned HTTP ${response.status}`);
  }

  const payload = await response.json();
  if (payload.error) {
    throw new Error(payload.message || `${path} returned an API error`);
  }

  return payload.data;
}

function round(value, places = 2) {
  return Number(value.toFixed(places));
}

function normalizeColor(value) {
  const rgb = String(value || "").match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/i);
  if (!rgb) {
    return "#ffffff";
  }

  return `#${rgb
    .slice(1)
    .map((part) => Number(part).toString(16).padStart(2, "0"))
    .join("")}`;
}

function unitLabel(unit) {
  return unit === "inch" ? "in" : unit;
}

function formatNumber(value) {
  return Number.isInteger(value) ? String(value) : String(round(value, 2));
}

function sizeLabel(width, height, unit) {
  return `${formatNumber(width)} x ${formatNumber(height)} ${unitLabel(unit)}`;
}

function toMm(value, unit, context) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return null;
  }

  const numeric = Number(value);
  if (unit === "mm") {
    return numeric;
  }
  if (unit === "inch") {
    return numeric * 25.4;
  }
  if (unit === "px") {
    return context.sizeUnit === "px" ? numeric : (numeric / context.dpi) * 25.4;
  }
  if (unit === "%") {
    return context.heightMm * (numeric / 100);
  }

  return null;
}

function outputPixels(width, height, unit, dpi) {
  if (unit === "px") {
    return [Math.round(width), Math.round(height)];
  }
  if (unit === "inch") {
    return [Math.round(width * dpi), Math.round(height * dpi)];
  }
  return [Math.round((width / 25.4) * dpi), Math.round((height / 25.4) * dpi)];
}

function titleCaseToken(token) {
  const upperTokens = new Set([
    "apec",
    "cnic",
    "dni",
    "dv",
    "eta",
    "ffro",
    "id",
    "jlpt",
    "nsw",
    "oci",
    "pan",
    "qld",
    "tie",
    "un",
    "vic",
    "vfs",
  ]);
  const normalized = token.toLowerCase();
  if (upperTokens.has(normalized)) {
    return normalized.toUpperCase();
  }
  if (normalized === "evisa") {
    return "eVisa";
  }
  if (normalized === "emriates") {
    return "Emirates";
  }
  if (/^\d/.test(normalized)) {
    return normalized;
  }
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function documentLabelFromSlug(document) {
  const slug = document.meta?.slug_en || "";
  const countryCode = document.country.code.toLowerCase();
  const withoutPrefix = slug.startsWith(`${countryCode}-`) ? slug.slice(countryCode.length + 1) : slug;
  const withoutSuffix = withoutPrefix.replace(/-photo$/, "");
  const readable = withoutSuffix
    .split("-")
    .filter((token) => token && !/^\d+x\d+/.test(token) && !/^(mm|cm|px|pixel|pixels|inch|in)$/.test(token))
    .map(titleCaseToken)
    .join(" ");

  if (!readable) {
    return `${document.country.name} ${titleCaseToken(document.type || "document")}`;
  }

  return `${document.country.name} ${readable}`;
}

function normalizeDocument(document) {
  const dimensions = document.dimensions;
  if (!dimensions?.picture_width || !dimensions?.picture_height || !dimensions?.units) {
    return null;
  }

  const sizeUnit = dimensions.units;
  if (!["mm", "inch", "px"].includes(sizeUnit)) {
    return null;
  }

  const width = Number(dimensions.picture_width);
  const height = Number(dimensions.picture_height);
  const dpi = Math.max(1, Number(dimensions.dpi || 300));
  const widthMm = sizeUnit === "mm" ? width : sizeUnit === "inch" ? width * 25.4 : width;
  const heightMm = sizeUnit === "mm" ? height : sizeUnit === "inch" ? height * 25.4 : height;
  const [outputWidthPx, outputHeightPx] = outputPixels(width, height, sizeUnit, dpi);
  const context = { dpi, heightMm, sizeUnit };
  const headTarget = toMm(dimensions.face_height, dimensions.face_height_unit, context);
  const safeHeadTarget = headTarget && headTarget > 0 ? headTarget : heightMm * 0.7;
  const crownTop = toMm(dimensions.crown_top, dimensions.crown_top_unit, context);
  const safeCrownTop =
    crownTop !== null && crownTop >= 0 ? crownTop : Math.max(0, (heightMm - safeHeadTarget) / 2);
  const officialLinks = Array.isArray(document.official_links) ? document.official_links : [];
  const sourceUrl = officialLinks[0];
  const sourceName = officialLinks.length ? "Official authority" : "Needs official verification";
  const color = normalizeColor(dimensions.background_color);
  const type = document.type || "document";
  const specLabel = sizeLabel(width, height, sizeUnit);
  const headLabel =
    dimensions.face_height && dimensions.face_height_unit
      ? `${formatNumber(dimensions.face_height)} ${unitLabel(dimensions.face_height_unit)} target`
      : `${formatNumber(round(safeHeadTarget, 1))} ${sizeUnit === "px" ? "px" : "mm"} target`;

  return {
    id: `req-${document.meta.slug_en}`,
    country: document.country.name,
    countryCode: document.country.code,
    document: documentLabelFromSlug(document),
    category: type,
    sourceName,
    sourceUrl,
    officialLinks,
    checkedAt: GENERATED_AT,
    widthMm: round(widthMm),
    heightMm: round(heightMm),
    measurementUnit: sizeUnit,
    sizeLabel: specLabel,
    outputWidthPx,
    outputHeightPx,
    dpi,
    headMinMm: round(safeHeadTarget),
    headMaxMm: round(safeHeadTarget),
    headTargetMm: round(safeHeadTarget),
    headLabel,
    crownTopMarginMm: round(safeCrownTop),
    background: `Background ${color}`,
    backgroundColor: color,
    isDigitalOnly: sizeUnit === "px",
    qualityNotes: [
      `Final size ${specLabel}`,
      `Export ${outputWidthPx} x ${outputHeightPx} px`,
      `Head/face ${headLabel}`,
      `Background ${color}`,
    ],
    cautionNotes: [
      "Compiled from public factual ID-photo requirement research; verify against the issuing authority before submission.",
      "Do not use retouching, filters, or appearance-changing edits.",
    ],
  };
}

async function main() {
  const existingCatalog = await readExistingCatalog();
  const manualSpecs = existingCatalog.specs.filter((spec) => !spec.id.startsWith("req-"));
  const countries = (await post("/api/app/v1/database/countries", {})).filter(
    (country) => country.document_count > 0 && country.country_iso !== "UN",
  );
  const generatedSpecs = [];

  for (const country of countries) {
    const documents = await post("/api/app/v1/database/documents", {
      filter: {
        screen: "home",
        country_id: country.id,
      },
    });

    for (const document of documents) {
      const spec = normalizeDocument(document);
      if (spec) {
        generatedSpecs.push(spec);
      }
    }
  }

  generatedSpecs.sort((a, b) =>
    `${a.countryCode}-${a.country}-${a.document}-${a.id}`.localeCompare(
      `${b.countryCode}-${b.country}-${b.document}-${b.id}`,
    ),
  );

  const catalog = {
    schemaVersion: existingCatalog.schemaVersion,
    updatedAt: GENERATED_AT,
    description: existingCatalog.description,
    specs: [...manualSpecs, ...generatedSpecs],
  };

  await writeFile(CATALOG_FILE, `${JSON.stringify(catalog, null, 2)}\n`);
  console.log(
    `Wrote ${catalog.specs.length} specs (${manualSpecs.length} manual, ${generatedSpecs.length} generated) to ${CATALOG_FILE.pathname}`,
  );
}

async function readExistingCatalog() {
  try {
    const file = await readFile(CATALOG_FILE, "utf8");
    const catalog = JSON.parse(file);
    return {
      schemaVersion: catalog.schemaVersion || 1,
      updatedAt: catalog.updatedAt || GENERATED_AT,
      description:
        catalog.description ||
        "Editable source of truth for ID document photo specifications used by the app.",
      specs: Array.isArray(catalog.specs) ? catalog.specs : [],
    };
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
    return {
      schemaVersion: 1,
      updatedAt: GENERATED_AT,
      description: "Editable source of truth for ID document photo specifications used by the app.",
      specs: [],
    };
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

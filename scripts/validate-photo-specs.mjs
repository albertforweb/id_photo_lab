import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const catalogPath = join(rootDir, "src", "data", "photoSpecs.json");
const maxSourceAgeDays = readMaxSourceAgeDays();
const requiredStringFields = [
  "id",
  "country",
  "countryCode",
  "document",
  "sourceName",
  "checkedAt",
  "background",
  "backgroundColor",
];
const requiredNumberFields = [
  "widthMm",
  "heightMm",
  "outputWidthPx",
  "outputHeightPx",
  "dpi",
  "headMinMm",
  "headMaxMm",
  "headTargetMm",
  "crownTopMarginMm",
];

function readMaxSourceAgeDays() {
  const flag = process.argv.find((arg) => arg.startsWith("--max-source-age-days="));
  if (!flag) {
    return 365;
  }

  const value = Number(flag.split("=")[1]);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error("--max-source-age-days must be a positive number.");
  }

  return value;
}

function readCatalog() {
  if (!existsSync(catalogPath)) {
    throw new Error(`Photo spec catalog not found: ${catalogPath}`);
  }

  return JSON.parse(readFileSync(catalogPath, "utf8"));
}

function isValidDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`));
}

function sourceAgeDays(checkedAt) {
  if (!isValidDate(checkedAt)) {
    return null;
  }

  return Math.max(0, Math.floor((Date.now() - Date.parse(`${checkedAt}T00:00:00Z`)) / 86_400_000));
}

function pushIssue(issues, level, spec, message) {
  issues.push({
    level,
    id: spec?.id ?? "catalog",
    message,
  });
}

function validateStringFields(spec, issues) {
  for (const field of requiredStringFields) {
    if (typeof spec[field] !== "string" || spec[field].trim() === "") {
      pushIssue(issues, "error", spec, `Missing required string field: ${field}`);
    }
  }
}

function validateNumberFields(spec, issues) {
  for (const field of requiredNumberFields) {
    if (!Number.isFinite(spec[field]) || spec[field] <= 0) {
      pushIssue(issues, "error", spec, `Missing or invalid positive number field: ${field}`);
    }
  }
}

function validateNotes(spec, issues) {
  for (const field of ["qualityNotes", "cautionNotes"]) {
    if (!Array.isArray(spec[field]) || spec[field].length === 0) {
      pushIssue(issues, "error", spec, `${field} must contain at least one note.`);
      continue;
    }

    spec[field].forEach((note, index) => {
      if (typeof note !== "string" || note.trim() === "") {
        pushIssue(issues, "error", spec, `${field}[${index}] must be a non-empty string.`);
      }
    });
  }
}

function validateSpec(spec, issues) {
  validateStringFields(spec, issues);
  validateNumberFields(spec, issues);
  validateNotes(spec, issues);

  if (typeof spec.id === "string" && !/^[a-z0-9][a-z0-9-]*$/.test(spec.id)) {
    pushIssue(issues, "error", spec, "id must be lowercase kebab-case.");
  }

  if (typeof spec.countryCode === "string" && !/^[A-Z]{2}$/.test(spec.countryCode)) {
    pushIssue(issues, "error", spec, "countryCode must be a two-letter uppercase code.");
  }

  if (typeof spec.backgroundColor === "string" && !/^#[0-9a-fA-F]{6}$/.test(spec.backgroundColor)) {
    pushIssue(issues, "error", spec, "backgroundColor must be a #rrggbb hex color.");
  }

  if (!isValidDate(spec.checkedAt)) {
    pushIssue(issues, "error", spec, "checkedAt must use YYYY-MM-DD format.");
  } else {
    const age = sourceAgeDays(spec.checkedAt);
    if (age !== null && age > maxSourceAgeDays) {
      pushIssue(issues, "warning", spec, `source checked date is ${age} days old.`);
    }
  }

  if (spec.sourceName === "Needs official verification") {
    pushIssue(issues, "warning", spec, "sourceName still needs official verification.");
  }

  if (spec.sourceUrl !== undefined && (typeof spec.sourceUrl !== "string" || !/^https?:\/\//.test(spec.sourceUrl))) {
    pushIssue(issues, "error", spec, "sourceUrl must be an http(s) URL when present.");
  }

  if (spec.officialLinks !== undefined) {
    if (!Array.isArray(spec.officialLinks)) {
      pushIssue(issues, "error", spec, "officialLinks must be an array when present.");
    } else {
      spec.officialLinks.forEach((url, index) => {
        if (typeof url !== "string" || !/^https?:\/\//.test(url)) {
          pushIssue(issues, "error", spec, `officialLinks[${index}] must be an http(s) URL.`);
        }
      });
    }
  }

  if (Number.isFinite(spec.headMinMm) && Number.isFinite(spec.headMaxMm) && spec.headMinMm > spec.headMaxMm) {
    pushIssue(issues, "error", spec, "headMinMm cannot be larger than headMaxMm.");
  }

  if (
    Number.isFinite(spec.headTargetMm) &&
    Number.isFinite(spec.headMinMm) &&
    Number.isFinite(spec.headMaxMm) &&
    (spec.headTargetMm < spec.headMinMm || spec.headTargetMm > spec.headMaxMm)
  ) {
    pushIssue(issues, "error", spec, "headTargetMm must be within the headMinMm/headMaxMm range.");
  }

  if (
    Number.isFinite(spec.crownTopMarginMm) &&
    Number.isFinite(spec.headTargetMm) &&
    Number.isFinite(spec.heightMm) &&
    spec.crownTopMarginMm + spec.headTargetMm > spec.heightMm
  ) {
    pushIssue(issues, "warning", spec, "crownTopMarginMm + headTargetMm exceeds the photo height.");
  }

  if (
    spec.eyeLineMinFromBottomMm !== undefined &&
    spec.eyeLineMaxFromBottomMm !== undefined &&
    spec.eyeLineMinFromBottomMm > spec.eyeLineMaxFromBottomMm
  ) {
    pushIssue(issues, "error", spec, "eyeLineMinFromBottomMm cannot be larger than eyeLineMaxFromBottomMm.");
  }
}

function main() {
  const catalog = readCatalog();
  const issues = [];

  if (!Number.isFinite(catalog.schemaVersion)) {
    pushIssue(issues, "error", null, "schemaVersion must be a number.");
  }

  if (!isValidDate(catalog.updatedAt)) {
    pushIssue(issues, "error", null, "updatedAt must use YYYY-MM-DD format.");
  }

  if (!Array.isArray(catalog.specs) || catalog.specs.length === 0) {
    pushIssue(issues, "error", null, "specs must be a non-empty array.");
  }

  const seenIds = new Set();
  for (const spec of catalog.specs ?? []) {
    if (seenIds.has(spec.id)) {
      pushIssue(issues, "error", spec, "Duplicate spec id.");
    }
    seenIds.add(spec.id);
    validateSpec(spec, issues);
  }

  const errors = issues.filter((issue) => issue.level === "error");
  const warnings = issues.filter((issue) => issue.level === "warning");

  for (const issue of issues.slice(0, 80)) {
    const prefix = issue.level === "error" ? "ERROR" : "WARN";
    console.log(`${prefix} ${issue.id}: ${issue.message}`);
  }

  if (issues.length > 80) {
    console.log(`... ${issues.length - 80} more issue(s) omitted`);
  }

  console.log(`Validated ${catalog.specs?.length ?? 0} photo specs: ${errors.length} error(s), ${warnings.length} warning(s).`);

  if (errors.length > 0) {
    process.exitCode = 1;
  }
}

main();

import photoSpecCatalog from "./data/photoSpecs.json";

export type SpecUnit = "mm" | "inch" | "px";

export type PhotoSpec = {
  id: string;
  country: string;
  countryCode: string;
  document: string;
  category?: string;
  sourceName: string;
  sourceUrl?: string;
  officialLinks?: string[];
  checkedAt: string;
  widthMm: number;
  heightMm: number;
  measurementUnit?: SpecUnit;
  sizeLabel?: string;
  outputWidthPx: number;
  outputHeightPx: number;
  dpi: number;
  headMinMm: number;
  headMaxMm: number;
  headTargetMm: number;
  headLabel?: string;
  crownTopMarginMm: number;
  eyeLineMinFromBottomMm?: number;
  eyeLineMaxFromBottomMm?: number;
  faceWidthMinMm?: number;
  faceWidthMaxMm?: number;
  background: string;
  backgroundColor: string;
  isDigitalOnly?: boolean;
  qualityNotes: string[];
  cautionNotes: string[];
};

export type PhotoSpecCatalog = {
  schemaVersion: number;
  updatedAt: string;
  description: string;
  specs: PhotoSpec[];
};

export const PHOTO_SPEC_CATALOG = photoSpecCatalog as PhotoSpecCatalog;

export const PHOTO_SPECS: PhotoSpec[] = PHOTO_SPEC_CATALOG.specs;

export function formatMm(value: number): string {
  return Number.isInteger(value) ? `${value} mm` : `${value.toFixed(1)} mm`;
}

export function specSizeLabel(spec: PhotoSpec): string {
  return spec.sizeLabel ?? `${formatMm(spec.widthMm)} x ${formatMm(spec.heightMm)}`;
}

export function specHeadLabel(spec: PhotoSpec): string {
  if (spec.headLabel) {
    return spec.headLabel;
  }

  if (Math.abs(spec.headMaxMm - spec.headMinMm) < 0.05) {
    return `${formatMm(spec.headTargetMm)} target`;
  }

  return `${formatMm(spec.headMinMm)}-${formatMm(spec.headMaxMm)}`;
}

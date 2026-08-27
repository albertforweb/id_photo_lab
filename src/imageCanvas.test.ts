import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import regressionFixtures from "../test-fixtures/regression-cases.json";
import {
  createPrintSheet,
  mmToPx,
  renderOutputCanvas,
  renderSizedCanvas,
  safeFilename,
  type DrawOptions,
  type ImageTransform,
  type LoadedPhoto,
} from "./imageCanvas";
import { PHOTO_SPECS } from "./specs";

vi.mock("@imgly/background-removal", () => ({
  removeBackground: vi.fn(),
}));

type CanvasCall = {
  name: string;
  args: unknown[];
};

class FakeCanvas {
  width = 0;
  height = 0;
  readonly calls: CanvasCall[] = [];
  readonly context = createFakeContext(this);

  getContext(type: string) {
    return type === "2d" ? this.context : null;
  }

  toBlob(callback: BlobCallback, type = "image/png") {
    callback(new Blob(["fake"], { type }));
  }
}

function createFakeContext(canvas: FakeCanvas) {
  return {
    fillStyle: "",
    filter: "none",
    imageSmoothingEnabled: false,
    imageSmoothingQuality: "low",
    lineWidth: 1,
    strokeStyle: "",
    clearRect: (...args: unknown[]) => canvas.calls.push({ name: "clearRect", args }),
    drawImage: (...args: unknown[]) => canvas.calls.push({ name: "drawImage", args }),
    fillRect: (...args: unknown[]) => canvas.calls.push({ name: "fillRect", args }),
    putImageData: (...args: unknown[]) => canvas.calls.push({ name: "putImageData", args }),
    restore: (...args: unknown[]) => canvas.calls.push({ name: "restore", args }),
    rotate: (...args: unknown[]) => canvas.calls.push({ name: "rotate", args }),
    save: (...args: unknown[]) => canvas.calls.push({ name: "save", args }),
    scale: (...args: unknown[]) => canvas.calls.push({ name: "scale", args }),
    strokeRect: (...args: unknown[]) => canvas.calls.push({ name: "strokeRect", args }),
    translate: (...args: unknown[]) => canvas.calls.push({ name: "translate", args }),
  };
}

const defaultTransform: ImageTransform = {
  x: 0,
  y: 0,
  zoom: 1,
  rotation: 0,
  flipX: false,
  flipY: false,
};

const defaultOptions: DrawOptions = {
  fillColor: "#ffffff",
  transparentBackground: false,
};

const sourcePhoto: LoadedPhoto = {
  img: {} as HTMLImageElement,
  url: "blob:test-photo",
  name: "Test Portrait.JPG",
  width: 1000,
  height: 1300,
};

type RegressionCase = {
  id: string;
  mode: "free-edit" | "document";
  specId?: string;
  source: {
    width: number;
    height: number;
  };
  display: {
    width: number;
    height: number;
  };
  transform: ImageTransform;
  background: DrawOptions;
  expected: {
    outputWidthPx: number;
    outputHeightPx: number;
    sheetWidthPx?: number;
    sheetHeightPx?: number;
    filledBackground: boolean;
  };
};

function installFakeDocument() {
  vi.stubGlobal("document", {
    createElement: (tagName: string) => {
      if (tagName === "canvas") {
        return new FakeCanvas();
      }

      return {
        click: vi.fn(),
      };
    },
  });
}

function canvasCalls(canvas: HTMLCanvasElement, name: string) {
  return (canvas as unknown as FakeCanvas).calls.filter((call) => call.name === name);
}

function specById(id: string) {
  const spec = PHOTO_SPECS.find((item) => item.id === id);

  expect(spec).toBeDefined();
  if (!spec) {
    throw new Error(`Missing regression spec: ${id}`);
  }

  return spec;
}

function photoForCase(item: RegressionCase): LoadedPhoto {
  return {
    img: {} as HTMLImageElement,
    url: `fixture:${item.id}`,
    name: `${item.id}.svg`,
    width: item.source.width,
    height: item.source.height,
  };
}

describe("image export rendering", () => {
  beforeEach(() => {
    installFakeDocument();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders every document spec at its configured output pixel size", () => {
    for (const spec of PHOTO_SPECS) {
      const canvas = renderOutputCanvas(
        sourcePhoto,
        spec,
        defaultTransform,
        { width: 720, height: 720 },
        defaultOptions,
      );

      expect(canvas.width, spec.id).toBe(spec.outputWidthPx);
      expect(canvas.height, spec.id).toBe(spec.outputHeightPx);
    }
  });

  it("renders free-edit output at the source image dimensions", () => {
    const canvas = renderSizedCanvas(
      sourcePhoto,
      defaultTransform,
      { width: 720, height: 936 },
      defaultOptions,
      sourcePhoto.width,
      sourcePhoto.height,
    );

    expect(canvas.width).toBe(1000);
    expect(canvas.height).toBe(1300);
  });

  it("creates a 4x6 sheet with document-size photo cells", () => {
    const spec = PHOTO_SPECS.find((item) => item.id === "us-passport");

    expect(spec).toBeDefined();
    if (!spec) {
      return;
    }

    const sheet = createPrintSheet(
      sourcePhoto,
      spec,
      defaultTransform,
      { width: 720, height: 720 },
      defaultOptions,
    );
    const drawImageCalls = canvasCalls(sheet, "drawImage");
    const firstPhotoCell = drawImageCalls[0]?.args[0] as HTMLCanvasElement | undefined;

    expect(sheet.width).toBe(1800);
    expect(sheet.height).toBe(1200);
    expect(drawImageCalls.length).toBeGreaterThan(0);
    expect(firstPhotoCell?.width).toBe(mmToPx(spec.widthMm, 300));
    expect(firstPhotoCell?.height).toBe(mmToPx(spec.heightMm, 300));
  });

  it("keeps exported filenames filesystem-safe", () => {
    expect(safeFilename(["US", "Passport photo", "4x6 sheet"])).toBe("us-passport-photo-4x6-sheet");
    expect(safeFilename(["../Canada", "Temporary resident visa", "photo.JPG"])).toBe(
      "canada-temporary-resident-visa-photo-jpg",
    );
  });

  it("renders the regression fixture cases at their expected output sizes", () => {
    const cases = regressionFixtures.cases as RegressionCase[];

    for (const item of cases) {
      const photo = photoForCase(item);
      const canvas = item.mode === "free-edit"
        ? renderSizedCanvas(
            photo,
            item.transform,
            item.display,
            item.background,
            item.expected.outputWidthPx,
            item.expected.outputHeightPx,
          )
        : renderOutputCanvas(
            photo,
            specById(item.specId ?? ""),
            item.transform,
            item.display,
            item.background,
          );

      expect(canvas.width, item.id).toBe(item.expected.outputWidthPx);
      expect(canvas.height, item.id).toBe(item.expected.outputHeightPx);
      expect(canvasCalls(canvas, "drawImage").length, item.id).toBe(1);
      expect(canvasCalls(canvas, "fillRect").length > 0, item.id).toBe(item.expected.filledBackground);
    }
  });

  it("keeps document regression cases printable on a 4x6 sheet", () => {
    const cases = (regressionFixtures.cases as RegressionCase[]).filter((item) => item.mode === "document");

    for (const item of cases) {
      const photo = photoForCase(item);
      const spec = specById(item.specId ?? "");
      const sheet = createPrintSheet(
        photo,
        spec,
        item.transform,
        item.display,
        item.background,
      );
      const firstPhotoCell = canvasCalls(sheet, "drawImage")[0]?.args[0] as HTMLCanvasElement | undefined;

      expect(sheet.width, item.id).toBe(item.expected.sheetWidthPx);
      expect(sheet.height, item.id).toBe(item.expected.sheetHeightPx);
      expect(firstPhotoCell?.width, item.id).toBe(mmToPx(spec.widthMm, 300));
      expect(firstPhotoCell?.height, item.id).toBe(mmToPx(spec.heightMm, 300));
    }
  });
});

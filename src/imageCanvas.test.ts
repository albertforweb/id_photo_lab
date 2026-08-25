import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
});

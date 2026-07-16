import { removeBackground as imglyRemoveBackground } from "@imgly/background-removal";
import type { PhotoSpec } from "./specs";

export type ImageTransform = {
  x: number;
  y: number;
  zoom: number;
  rotation: number;
  flipX: boolean;
  flipY: boolean;
};

export type DisplaySize = {
  width: number;
  height: number;
};

export type ImageAdjustments = {
  brightness: number;
  contrast: number;
  saturation: number;
  grayscale: number;
  sepia: number;
  soften: number;
};

export type DrawOptions = {
  fillColor: string;
  adjustments?: ImageAdjustments;
  transparentBackground?: boolean;
};

export type LoadedPhoto = {
  img: HTMLImageElement;
  url: string;
  name: string;
  width: number;
  height: number;
};

export function mmToPx(mm: number, dpi: number): number {
  return Math.round((mm / 25.4) * dpi);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getCanvasFilter(adjustments?: ImageAdjustments): string {
  if (!adjustments) {
    return "none";
  }

  return [
    `brightness(${clamp(adjustments.brightness, 40, 160)}%)`,
    `contrast(${clamp(adjustments.contrast, 40, 180)}%)`,
    `saturate(${clamp(adjustments.saturation, 0, 180)}%)`,
    `grayscale(${clamp(adjustments.grayscale, 0, 100)}%)`,
    `sepia(${clamp(adjustments.sepia, 0, 100)}%)`,
    `blur(${clamp(adjustments.soften, 0, 1.6)}px)`,
  ].join(" ");
}

export function drawPhoto(
  ctx: CanvasRenderingContext2D,
  photo: LoadedPhoto,
  canvasWidth: number,
  canvasHeight: number,
  transform: ImageTransform,
  displaySize: DisplaySize,
  options: DrawOptions,
): void {
  ctx.save();
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);
  if (!options.transparentBackground) {
    ctx.fillStyle = options.fillColor;
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  }

  const panScaleX = canvasWidth / displaySize.width;
  const panScaleY = canvasHeight / displaySize.height;
  const baseScale = Math.max(canvasWidth / photo.width, canvasHeight / photo.height);
  const angle = (transform.rotation * Math.PI) / 180;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.translate(
    canvasWidth / 2 + transform.x * panScaleX,
    canvasHeight / 2 + transform.y * panScaleY,
  );
  ctx.rotate(angle);
  ctx.scale(
    baseScale * transform.zoom * (transform.flipX ? -1 : 1),
    baseScale * transform.zoom * (transform.flipY ? -1 : 1),
  );
  ctx.filter = getCanvasFilter(options.adjustments);
  ctx.drawImage(photo.img, -photo.width / 2, -photo.height / 2);
  ctx.filter = "none";
  ctx.restore();
}

export function renderOutputCanvas(
  photo: LoadedPhoto,
  spec: PhotoSpec,
  transform: ImageTransform,
  displaySize: DisplaySize,
  options: DrawOptions,
  targetWidth = spec.outputWidthPx,
  targetHeight = spec.outputHeightPx,
): HTMLCanvasElement {
  return renderSizedCanvas(photo, transform, displaySize, options, targetWidth, targetHeight);
}

export function renderSizedCanvas(
  photo: LoadedPhoto,
  transform: ImageTransform,
  displaySize: DisplaySize,
  options: DrawOptions,
  targetWidth: number,
  targetHeight: number,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("Canvas rendering is not available in this browser.");
  }

  drawPhoto(ctx, photo, targetWidth, targetHeight, transform, displaySize, options);
  return canvas;
}

export function canvasToBlob(
  canvas: HTMLCanvasElement,
  quality = 0.95,
  type = "image/jpeg",
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("Could not export this image."));
        }
      },
      type,
      quality,
    );
  });
}

export async function downloadCanvas(
  canvas: HTMLCanvasElement,
  filename: string,
  quality = 0.95,
  type = "image/jpeg",
): Promise<void> {
  const blob = await canvasToBlob(canvas, quality, type);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function createPrintSheet(
  photo: LoadedPhoto,
  spec: PhotoSpec,
  transform: ImageTransform,
  displaySize: DisplaySize,
  options: DrawOptions,
): HTMLCanvasElement {
  const sheetDpi = 300;
  const sheetWidth = 1800;
  const sheetHeight = 1200;
  const photoWidth = mmToPx(spec.widthMm, sheetDpi);
  const photoHeight = mmToPx(spec.heightMm, sheetDpi);
  const gap = mmToPx(3, sheetDpi);
  const margin = mmToPx(6, sheetDpi);
  const source = renderOutputCanvas(photo, spec, transform, displaySize, options, photoWidth, photoHeight);
  const canvas = document.createElement("canvas");
  canvas.width = sheetWidth;
  canvas.height = sheetHeight;
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("Canvas rendering is not available in this browser.");
  }

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, sheetWidth, sheetHeight);
  ctx.strokeStyle = "#d8dde1";
  ctx.lineWidth = 2;

  const columns = Math.max(1, Math.floor((sheetWidth - margin * 2 + gap) / (photoWidth + gap)));
  const rows = Math.max(1, Math.floor((sheetHeight - margin * 2 + gap) / (photoHeight + gap)));
  const usedWidth = columns * photoWidth + (columns - 1) * gap;
  const usedHeight = rows * photoHeight + (rows - 1) * gap;
  const startX = Math.round((sheetWidth - usedWidth) / 2);
  const startY = Math.round((sheetHeight - usedHeight) / 2);

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < columns; col += 1) {
      const x = startX + col * (photoWidth + gap);
      const y = startY + row * (photoHeight + gap);
      ctx.drawImage(source, x, y);
      ctx.strokeRect(x + 0.5, y + 0.5, photoWidth - 1, photoHeight - 1);
    }
  }

  return canvas;
}

export function safeFilename(parts: string[]): string {
  return parts
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function squaredColorDistance(data: Uint8ClampedArray, offset: number, rgb: [number, number, number]): number {
  const red = data[offset] - rgb[0];
  const green = data[offset + 1] - rgb[1];
  const blue = data[offset + 2] - rgb[2];
  return red * red + green * green + blue * blue;
}

function luminance(red: number, green: number, blue: number): number {
  return red * 0.299 + green * 0.587 + blue * 0.114;
}

function estimateBackgroundColor(data: Uint8ClampedArray, width: number, height: number): [number, number, number] {
  const strip = Math.max(2, Math.round(Math.min(width, height) * 0.025));
  const stride = Math.max(1, Math.round(Math.min(width, height) / 320));
  const bucketSize = 18;
  const buckets = new Map<string, { score: number; red: number; green: number; blue: number }>();

  const addSample = (x: number, y: number, edgeWeight: number) => {
    const offset = (y * width + x) * 4;
    if (data[offset + 3] === 0) {
      return;
    }

    const red = data[offset];
    const green = data[offset + 1];
    const blue = data[offset + 2];
    const key = [
      Math.floor(red / bucketSize),
      Math.floor(green / bucketSize),
      Math.floor(blue / bucketSize),
    ].join("-");
    const lightWeight = 0.55 + luminance(red, green, blue) / 255;
    const score = edgeWeight * lightWeight;
    const bucket = buckets.get(key) ?? { score: 0, red: 0, green: 0, blue: 0 };

    bucket.score += score;
    bucket.red += red * score;
    bucket.green += green * score;
    bucket.blue += blue * score;
    buckets.set(key, bucket);
  };

  for (let y = 0; y < height; y += stride) {
    for (let x = 0; x < strip; x += stride) {
      addSample(x, y, 1);
      addSample(width - 1 - x, y, 1);
    }
  }

  for (let x = 0; x < width; x += stride) {
    for (let y = 0; y < strip; y += stride) {
      addSample(x, y, 1.2);
      addSample(x, height - 1 - y, 0.45);
    }
  }

  let bestBucket: { score: number; red: number; green: number; blue: number } | undefined;
  buckets.forEach((bucket) => {
    if (!bestBucket || bucket.score > bestBucket.score) {
      bestBucket = bucket;
    }
  });

  if (!bestBucket || bestBucket.score === 0) {
    return [255, 255, 255];
  }

  return [
    Math.round(bestBucket.red / bestBucket.score),
    Math.round(bestBucket.green / bestBucket.score),
    Math.round(bestBucket.blue / bestBucket.score),
  ];
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("The processed image could not be loaded."));
    img.src = url;
  });
}

export async function removeEdgeBackgroundColor(
  source: LoadedPhoto,
  tolerance: number,
): Promise<LoadedPhoto> {
  const maxSide = 2200;
  const scale = Math.min(1, maxSide / Math.max(source.width, source.height));
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    throw new Error("Canvas rendering is not available in this browser.");
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source.img, 0, 0, width, height);

  const imageData = ctx.getImageData(0, 0, width, height);
  const { data } = imageData;
  const background = estimateBackgroundColor(data, width, height);
  const limit = tolerance * tolerance;
  const softLimit = (tolerance + 18) * (tolerance + 18);
  const pixelCount = width * height;
  const visited = new Uint8Array(pixelCount);
  const queue = new Uint32Array(pixelCount);
  let readIndex = 0;
  let writeIndex = 0;

  const isProtectedLowerForeground = (index: number) => {
    const x = index % width;
    const y = Math.floor(index / width);

    if (y < height * 0.68 || x < width * 0.22 || x > width * 0.78) {
      return false;
    }

    const offset = index * 4;
    return luminance(data[offset], data[offset + 1], data[offset + 2]) < 248;
  };

  const canRemove = (index: number) => {
    const offset = index * 4;
    return (
      data[offset + 3] > 0 &&
      !isProtectedLowerForeground(index) &&
      squaredColorDistance(data, offset, background) <= limit
    );
  };

  const enqueue = (index: number) => {
    if (visited[index] || !canRemove(index)) {
      return;
    }
    visited[index] = 1;
    queue[writeIndex] = index;
    writeIndex += 1;
  };

  const bottomMarginLimit = Math.round(width * 0.18);

  for (let x = 0; x < width; x += 1) {
    enqueue(x);
    if (x <= bottomMarginLimit || x >= width - bottomMarginLimit) {
      enqueue((height - 1) * width + x);
    }
  }

  for (let y = 0; y < height; y += 1) {
    enqueue(y * width);
    enqueue(y * width + width - 1);
  }

  while (readIndex < writeIndex) {
    const index = queue[readIndex];
    readIndex += 1;
    const x = index % width;
    const y = Math.floor(index / width);

    if (x > 0) enqueue(index - 1);
    if (x < width - 1) enqueue(index + 1);
    if (y > 0) enqueue(index - width);
    if (y < height - 1) enqueue(index + width);
  }

  const feathered = new Uint8Array(pixelCount);
  for (let index = 0; index < pixelCount; index += 1) {
    if (!visited[index]) {
      continue;
    }

    const x = index % width;
    const y = Math.floor(index / width);
    const neighbors = [
      x > 0 ? index - 1 : -1,
      x < width - 1 ? index + 1 : -1,
      y > 0 ? index - width : -1,
      y < height - 1 ? index + width : -1,
    ];

    neighbors.forEach((neighbor) => {
      if (neighbor < 0 || visited[neighbor]) {
        return;
      }
      const offset = neighbor * 4;
      if (data[offset + 3] > 0 && squaredColorDistance(data, offset, background) <= softLimit) {
        feathered[neighbor] = 1;
      }
    });
  }

  for (let index = 0; index < pixelCount; index += 1) {
    const offset = index * 4;
    if (visited[index]) {
      data[offset + 3] = 0;
    } else if (feathered[index]) {
      data[offset + 3] = Math.min(data[offset + 3], 120);
    }
  }

  ctx.putImageData(imageData, 0, 0);
  const blob = await canvasToBlob(canvas, 1, "image/png");
  const url = URL.createObjectURL(blob);

  try {
    const img = await loadImage(url);
    return {
      img,
      url,
      name: source.name.replace(/\.[^.]+$/, "") || "processed-photo",
      width: img.naturalWidth,
      height: img.naturalHeight,
    };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

export async function removeSubjectBackground(
  source: LoadedPhoto,
  onProgress?: (label: string, percent: number) => void,
): Promise<LoadedPhoto> {
  const blob = await imglyRemoveBackground(source.url, {
    publicPath: getBackgroundRemovalPublicPath(),
    model: "isnet_fp16",
    output: {
      format: "image/png",
      quality: 1,
    },
    progress: (key: string, current: number, total: number) => {
      if (!onProgress || total <= 0) {
        return;
      }

      const phase = key.startsWith("fetch:") ? "Loading local model" : "Removing background";
      onProgress(phase, Math.round((current / total) * 100));
    },
  });
  const url = URL.createObjectURL(blob);

  try {
    const img = await loadImage(url);
    return {
      img,
      url,
      name: source.name.replace(/\.[^.]+$/, "") || "transparent-photo",
      width: img.naturalWidth,
      height: img.naturalHeight,
    };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

function getBackgroundRemovalPublicPath(): string {
  return new URL("background-removal/", globalThis.location.href).href;
}

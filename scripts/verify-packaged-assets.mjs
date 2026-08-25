import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const requiredBackgroundResources = [
  "/models/isnet_fp16",
  "/onnxruntime-web/ort-wasm-simd-threaded.mjs",
  "/onnxruntime-web/ort-wasm-simd-threaded.wasm",
];
const requiredMediapipeFiles = [
  "mediapipe/manifest.json",
  "mediapipe/models/blaze_face_short_range.tflite",
  "mediapipe/wasm/vision_wasm_internal.js",
  "mediapipe/wasm/vision_wasm_internal.wasm",
  "mediapipe/wasm/vision_wasm_module_internal.js",
  "mediapipe/wasm/vision_wasm_module_internal.wasm",
  "mediapipe/wasm/vision_wasm_nosimd_internal.js",
  "mediapipe/wasm/vision_wasm_nosimd_internal.wasm",
];

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertFile(path, label) {
  assert(existsSync(path), `${label} is missing: ${path}`);
  assert(statSync(path).size > 0, `${label} is empty: ${path}`);
}

function packageVersion(packageName) {
  return readJson(join(rootDir, "node_modules", packageName, "package.json")).version;
}

function verifyBackgroundRemovalAssets() {
  const publicDir = join(rootDir, "public", "background-removal");
  const manifestPath = join(publicDir, "manifest.json");
  const resourcesPath = join(publicDir, "resources.json");

  assertFile(manifestPath, "background-removal manifest");
  assertFile(resourcesPath, "background-removal resource map");

  const manifest = readJson(manifestPath);
  const resources = readJson(resourcesPath);
  const expectedVersion = packageVersion("@imgly/background-removal");

  assert(
    manifest.packageName === "@imgly/background-removal-data",
    "background-removal manifest packageName is unexpected.",
  );
  assert(
    manifest.packageVersion === expectedVersion,
    `background-removal assets are for ${manifest.packageVersion}, expected ${expectedVersion}.`,
  );

  for (const key of requiredBackgroundResources) {
    const entry = resources[key];
    assert(entry, `background-removal resource is missing from resources.json: ${key}`);
    assert(Array.isArray(entry.chunks) && entry.chunks.length > 0, `background-removal resource has no chunks: ${key}`);

    for (const chunk of entry.chunks) {
      const chunkPath = join(publicDir, chunk.name);
      assertFile(chunkPath, `background-removal chunk ${chunk.name}`);

      if (Array.isArray(chunk.offsets) && chunk.offsets.length >= 2) {
        const expectedSize = chunk.offsets[1] - chunk.offsets[0];
        assert(
          statSync(chunkPath).size === expectedSize,
          `background-removal chunk size mismatch for ${chunk.name}: expected ${expectedSize}, got ${statSync(chunkPath).size}.`,
        );
      }
    }
  }
}

function verifyMediapipeAssets() {
  const publicManifestPath = join(rootDir, "public", "mediapipe", "manifest.json");
  const publicManifest = readJson(publicManifestPath);
  const expectedVersion = packageVersion("@mediapipe/tasks-vision");

  assertFile(publicManifestPath, "MediaPipe public manifest");
  assert(
    publicManifest.packageVersion === expectedVersion,
    `MediaPipe assets are for ${publicManifest.packageVersion}, expected ${expectedVersion}.`,
  );

  for (const file of requiredMediapipeFiles) {
    assertFile(join(rootDir, "public", file), `MediaPipe public asset ${file}`);
    assertFile(join(rootDir, "dist", file), `MediaPipe built asset ${file}`);
  }
}

function verifyPackagingConfiguration() {
  const packageJson = readJson(join(rootDir, "package.json"));
  const build = packageJson.build ?? {};
  const files = build.files ?? [];
  const extraResources = build.extraResources ?? [];

  assert(files.includes("dist/**/*"), "electron-builder files must include dist/**/*.");
  assert(
    files.includes("!dist/background-removal/**/*"),
    "electron-builder files must exclude dist/background-removal because those assets are served from extraResources.",
  );
  assert(
    extraResources.some((resource) => resource.from === "public/background-removal" && resource.to === "background-removal"),
    "electron-builder extraResources must copy public/background-removal to background-removal.",
  );
  assert(
    extraResources.some((resource) => resource.from === "build/icon.png" && resource.to === "icon.png"),
    "electron-builder extraResources must copy build/icon.png to icon.png.",
  );

  const electronMain = readFileSync(join(rootDir, "electron", "main.cjs"), "utf8");
  assert(
    electronMain.includes('requestPath.startsWith("/background-removal/")'),
    "Electron protocol must route /background-removal/ requests.",
  );
  assert(
    electronMain.includes('process.resourcesPath, "background-removal"'),
    "Electron protocol must resolve background-removal assets from process.resourcesPath.",
  );

  const imageCanvas = readFileSync(join(rootDir, "src", "imageCanvas.ts"), "utf8");
  assert(
    imageCanvas.includes('new URL("background-removal/", globalThis.location.href).href'),
    "background-removal publicPath must resolve relative to the app origin.",
  );

  const faceDetection = readFileSync(join(rootDir, "src", "faceDetection.ts"), "utf8");
  assert(faceDetection.includes('publicAssetUrl("mediapipe/wasm")'), "Face detection must use local MediaPipe WASM assets.");
  assert(
    faceDetection.includes('publicAssetUrl("mediapipe/models/blaze_face_short_range.tflite")'),
    "Face detection must use the local BlazeFace model.",
  );
}

function main() {
  verifyBackgroundRemovalAssets();
  verifyMediapipeAssets();
  verifyPackagingConfiguration();
  console.log("Packaged asset verification passed.");
}

main();

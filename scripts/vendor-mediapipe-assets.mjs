import { copyFileSync, createWriteStream, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { get } from "node:https";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageJsonPath = join(rootDir, "node_modules", "@mediapipe", "tasks-vision", "package.json");
const packageWasmDir = join(rootDir, "node_modules", "@mediapipe", "tasks-vision", "wasm");
const publicDir = join(rootDir, "public", "mediapipe");
const publicWasmDir = join(publicDir, "wasm");
const publicModelDir = join(publicDir, "models");
const modelFile = "blaze_face_short_range.tflite";
const modelUrl = `https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/${modelFile}`;
const wasmFiles = [
  "vision_wasm_internal.js",
  "vision_wasm_internal.wasm",
  "vision_wasm_module_internal.js",
  "vision_wasm_module_internal.wasm",
  "vision_wasm_nosimd_internal.js",
  "vision_wasm_nosimd_internal.wasm",
];

function readPackageVersion() {
  if (!existsSync(packageJsonPath)) {
    throw new Error("Install dependencies before vendoring MediaPipe assets.");
  }

  return JSON.parse(readFileSync(packageJsonPath, "utf8")).version;
}

function download(url, outputPath, redirectCount = 0) {
  if (redirectCount > 5) {
    throw new Error(`Too many redirects while downloading ${url}`);
  }

  return new Promise((resolveDownload, rejectDownload) => {
    const request = get(url, (response) => {
      if (
        response.statusCode &&
        response.statusCode >= 300 &&
        response.statusCode < 400 &&
        response.headers.location
      ) {
        response.resume();
        download(new URL(response.headers.location, url).toString(), outputPath, redirectCount + 1)
          .then(resolveDownload)
          .catch(rejectDownload);
        return;
      }

      if (response.statusCode !== 200) {
        response.resume();
        rejectDownload(new Error(`Failed to download ${url}: HTTP ${response.statusCode}`));
        return;
      }

      const file = createWriteStream(outputPath);
      response.pipe(file);
      file.on("finish", () => file.close(resolveDownload));
      file.on("error", rejectDownload);
    });

    request.on("error", rejectDownload);
  });
}

function hasCurrentAssets(packageVersion) {
  const manifestPath = join(publicDir, "manifest.json");
  const modelPath = join(publicModelDir, modelFile);

  if (!existsSync(manifestPath) || !existsSync(modelPath)) {
    return false;
  }

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (manifest.packageVersion !== packageVersion || manifest.modelUrl !== modelUrl) {
    return false;
  }

  return wasmFiles.every((file) => {
    const sourcePath = join(packageWasmDir, file);
    const targetPath = join(publicWasmDir, file);
    return existsSync(sourcePath) && existsSync(targetPath) && statSync(sourcePath).size === statSync(targetPath).size;
  });
}

async function main() {
  const packageVersion = readPackageVersion();

  if (hasCurrentAssets(packageVersion)) {
    console.log(`MediaPipe assets already vendored for @mediapipe/tasks-vision ${packageVersion}.`);
    return;
  }

  rmSync(publicDir, { recursive: true, force: true });
  mkdirSync(publicWasmDir, { recursive: true });
  mkdirSync(publicModelDir, { recursive: true });

  for (const file of wasmFiles) {
    const sourcePath = join(packageWasmDir, file);
    if (!existsSync(sourcePath)) {
      throw new Error(`Required MediaPipe runtime file is missing: ${sourcePath}`);
    }

    copyFileSync(sourcePath, join(publicWasmDir, file));
  }

  console.log(`Downloading ${modelUrl}`);
  await download(modelUrl, join(publicModelDir, modelFile));

  writeFileSync(
    join(publicDir, "manifest.json"),
    JSON.stringify(
      {
        packageName: "@mediapipe/tasks-vision",
        packageVersion,
        modelName: "blaze_face_short_range",
        modelUrl,
        wasmFiles,
        generatedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );

  console.log(`Vendored MediaPipe face detection assets into ${publicDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

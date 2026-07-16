import { createWriteStream, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync, copyFileSync } from "node:fs";
import { get } from "node:https";
import { dirname, join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageJsonPath = join(rootDir, "node_modules", "@imgly", "background-removal", "package.json");
const publicDir = join(rootDir, "public", "background-removal");
const cacheDir = join(rootDir, ".cache", "background-removal-data");
const requiredResources = [
  "/models/isnet_fp16",
  "/onnxruntime-web/ort-wasm-simd-threaded.mjs",
  "/onnxruntime-web/ort-wasm-simd-threaded.wasm",
];

function readPackageVersion() {
  if (!existsSync(packageJsonPath)) {
    throw new Error("Install dependencies before vendoring background-removal assets.");
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

function readResourceMap(resourcesPath) {
  return JSON.parse(readFileSync(resourcesPath, "utf8"));
}

function hasCurrentAssets(version) {
  const manifestPath = join(publicDir, "manifest.json");
  const resourcesPath = join(publicDir, "resources.json");

  if (!existsSync(manifestPath) || !existsSync(resourcesPath)) {
    return false;
  }

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (manifest.packageVersion !== version) {
    return false;
  }

  const resources = readResourceMap(resourcesPath);
  return requiredResources.every((key) => {
    const entry = resources[key];
    return Boolean(entry) && entry.chunks.every((chunk) => {
      const filePath = join(publicDir, chunk.name);
      const expectedSize = chunk.offsets[1] - chunk.offsets[0];
      return existsSync(filePath) && statSync(filePath).size === expectedSize;
    });
  });
}

function filterResources(sourceDistDir) {
  const resourceMap = readResourceMap(join(sourceDistDir, "resources.json"));
  const filteredMap = {};
  const chunkNames = new Set();

  for (const key of requiredResources) {
    const entry = resourceMap[key];
    if (!entry) {
      throw new Error(`Required background-removal resource is missing from data package: ${key}`);
    }

    filteredMap[key] = entry;
    for (const chunk of entry.chunks) {
      chunkNames.add(chunk.name);
    }
  }

  return { filteredMap, chunkNames };
}

async function main() {
  const version = readPackageVersion();
  const archiveUrl = `https://staticimgly.com/@imgly/background-removal-data/${version}/package.tgz`;
  const versionCacheDir = join(cacheDir, version);
  const archivePath = join(versionCacheDir, "package.tgz");
  const extractDir = join(versionCacheDir, "extract");
  const sourceDistDir = join(extractDir, "package", "dist");

  if (hasCurrentAssets(version)) {
    console.log(`Background-removal assets already vendored for @imgly/background-removal ${version}.`);
    return;
  }

  mkdirSync(versionCacheDir, { recursive: true });

  if (!existsSync(archivePath)) {
    console.log(`Downloading ${archiveUrl}`);
    await download(archiveUrl, archivePath);
  }

  rmSync(extractDir, { recursive: true, force: true });
  mkdirSync(extractDir, { recursive: true });
  execFileSync("tar", ["-xzf", archivePath, "-C", extractDir], { stdio: "ignore" });

  const { filteredMap, chunkNames } = filterResources(sourceDistDir);

  rmSync(publicDir, { recursive: true, force: true });
  mkdirSync(publicDir, { recursive: true });
  writeFileSync(join(publicDir, "resources.json"), JSON.stringify(filteredMap));
  writeFileSync(
    join(publicDir, "manifest.json"),
    JSON.stringify(
      {
        packageName: "@imgly/background-removal-data",
        packageVersion: version,
        source: archiveUrl,
        resources: requiredResources,
        generatedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );

  for (const chunkName of chunkNames) {
    copyFileSync(join(sourceDistDir, chunkName), join(publicDir, chunkName));
  }

  rmSync(extractDir, { recursive: true, force: true });
  console.log(`Vendored ${chunkNames.size} background-removal asset chunks into ${publicDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

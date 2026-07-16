import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceSvg = join(rootDir, "src", "assets", "id-photo-lab-logo.svg");
const buildDir = join(rootDir, "build");
const iconPng = join(buildDir, "icon.png");
const iconIcns = join(buildDir, "icon.icns");
const iconIco = join(buildDir, "icon.ico");
const iconsetDir = join(buildDir, "icon.iconset");
const icoPngDir = join(buildDir, "ico-png");

function requireCommand(command) {
  try {
    execFileSync("which", [command], { stdio: "ignore" });
  } catch {
    throw new Error(`${command} is required to generate desktop icons on macOS.`);
  }
}

function run(command, args) {
  execFileSync(command, args, { stdio: "ignore" });
}

function resizePng(input, output, size) {
  run("sips", ["-s", "format", "png", "-z", String(size), String(size), input, "--out", output]);
}

function writePngBackedIco(entries, output) {
  const headerSize = 6;
  const entrySize = 16;
  const directorySize = headerSize + entries.length * entrySize;
  const buffers = entries.map(({ size, file }) => ({
    size,
    data: readFileSync(file),
  }));
  const ico = Buffer.alloc(directorySize + buffers.reduce((total, item) => total + item.data.length, 0));

  ico.writeUInt16LE(0, 0);
  ico.writeUInt16LE(1, 2);
  ico.writeUInt16LE(buffers.length, 4);

  let imageOffset = directorySize;
  buffers.forEach((item, index) => {
    const offset = headerSize + index * entrySize;
    ico.writeUInt8(item.size >= 256 ? 0 : item.size, offset);
    ico.writeUInt8(item.size >= 256 ? 0 : item.size, offset + 1);
    ico.writeUInt8(0, offset + 2);
    ico.writeUInt8(0, offset + 3);
    ico.writeUInt16LE(1, offset + 4);
    ico.writeUInt16LE(32, offset + 6);
    ico.writeUInt32LE(item.data.length, offset + 8);
    ico.writeUInt32LE(imageOffset, offset + 12);
    item.data.copy(ico, imageOffset);
    imageOffset += item.data.length;
  });

  writeFileSync(output, ico);
}

function findMissingIconFiles() {
  return [iconPng, iconIcns, iconIco].filter((file) => !existsSync(file));
}

if (process.platform !== "darwin") {
  const missingIconFiles = findMissingIconFiles();
  if (missingIconFiles.length > 0) {
    throw new Error(
      `Desktop icon generation requires macOS. Missing checked-in icon files: ${missingIconFiles.join(", ")}`,
    );
  }

  console.log("Using checked-in desktop icons; generation requires macOS.");
  process.exit(0);
}

requireCommand("qlmanage");
requireCommand("sips");
requireCommand("iconutil");

if (!existsSync(sourceSvg)) {
  throw new Error(`Logo SVG not found: ${sourceSvg}`);
}

mkdirSync(buildDir, { recursive: true });
rmSync(iconsetDir, { recursive: true, force: true });
rmSync(icoPngDir, { recursive: true, force: true });
mkdirSync(iconsetDir, { recursive: true });
mkdirSync(icoPngDir, { recursive: true });

run("qlmanage", ["-t", "-s", "1024", "-o", buildDir, sourceSvg]);
const quickLookPng = join(buildDir, `${basename(sourceSvg)}.png`);

if (!existsSync(quickLookPng)) {
  throw new Error(`Quick Look did not produce ${quickLookPng}`);
}

copyFileSync(quickLookPng, iconPng);
rmSync(quickLookPng, { force: true });

const macIconEntries = [
  ["icon_16x16.png", 16],
  ["icon_16x16@2x.png", 32],
  ["icon_32x32.png", 32],
  ["icon_32x32@2x.png", 64],
  ["icon_128x128.png", 128],
  ["icon_128x128@2x.png", 256],
  ["icon_256x256.png", 256],
  ["icon_256x256@2x.png", 512],
  ["icon_512x512.png", 512],
  ["icon_512x512@2x.png", 1024],
];

macIconEntries.forEach(([file, size]) => {
  resizePng(iconPng, join(iconsetDir, file), size);
});

run("iconutil", ["-c", "icns", iconsetDir, "-o", iconIcns]);

const icoEntries = [16, 24, 32, 48, 64, 128, 256].map((size) => {
  const file = join(icoPngDir, `icon-${size}.png`);
  resizePng(iconPng, file, size);
  return { size, file };
});

writePngBackedIco(icoEntries, iconIco);

rmSync(iconsetDir, { recursive: true, force: true });
rmSync(icoPngDir, { recursive: true, force: true });

console.log(`Generated ${iconPng}`);
console.log(`Generated ${iconIcns}`);
console.log(`Generated ${iconIco}`);

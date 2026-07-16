# ID Photo Lab

ID Photo Lab is a desktop photo editor for preparing passport, visa, and identity-document photos. It combines a country/document requirement catalog with practical editing tools for crop, alignment, background removal, color replacement, and export.

![ID Photo Lab screenshot](docs/poster.png)

## What It Does

ID Photo Lab helps turn an uploaded portrait into an output photo that matches a selected document profile. It can also run in **Free edit** mode when you only want to crop, adjust, or remove a background without applying official ID-photo sizing rules.

The app is built with React, Vite, TypeScript, Electron, and browser-side ONNX background removal.

## Features

- Country and document photo requirement catalog loaded from editable JSON.
- Free edit mode with no selected document specification.
- Drag, zoom, rotate, and flip controls for positioning the subject.
- Rulers and guide overlays for document sizing, crown/chin targets, and eye ranges.
- Offline-capable AI background removal in packaged desktop builds.
- Edge color removal fallback for simple flat-color backgrounds.
- Background swatches, custom background color, and transparent preview.
- Brightness, contrast, saturation, grayscale, sepia, and soften adjustments.
- Exports for final photo, transparent PNG, and 4x6 print sheets when the selected spec supports physical sizing.
- Electron packaging for macOS and Windows.

## How To Use

1. Open the app.
2. Upload a front-facing portrait.
3. Choose **Free edit** or select a country/document profile.
4. Position the face with drag, zoom, rotate, and flip controls.
5. Use **Remove background** when a transparent cutout is needed.
6. Pick a replacement background color or keep transparent preview enabled.
7. Download the photo, transparent PNG, or 4x6 sheet.

Document requirements can change. Always verify final acceptance requirements with the issuing authority before submitting an official application.

## Development

Install dependencies:

```bash
npm ci
```

Run the web app:

```bash
npm run dev
```

Run the Electron app in development mode:

```bash
npm run electron:dev
```

Build the app:

```bash
npm run build
```

## Background Removal Assets

The packaged app includes the required background-removal model/runtime assets locally, so first-use background removal does not need to download the model from the network.

For source builds, the assets are vendored by:

```bash
npm run assets:vendor
```

This command downloads the matching `@imgly/background-removal-data` archive once, filters it to the resources used by this app, and writes the result to `public/background-removal/`. That generated folder is intentionally ignored by Git because it is about 98 MB. Release packages include it through Electron Builder `extraResources`.

## Packaging

The Makefile wraps the package scripts:

```bash
make package-macos
make package-windows
make package-windows-arm64
make package
```

Generated packages are written to `release/`.

Current packages are unsigned. macOS Gatekeeper and Windows SmartScreen may warn until code signing and notarization are configured.

## Project Structure

- `src/App.tsx` - main editor UI and workflow.
- `src/imageCanvas.ts` - rendering, export, and background-removal helpers.
- `src/data/photoSpecs.json` - editable document photo specification catalog.
- `electron/` - Electron main process and preload bridge.
- `scripts/` - catalog, icon, and model-asset generation scripts.
- `public/background-removal/` - generated local model assets, ignored by Git.

## License

ID Photo Lab is licensed under the GNU Affero General Public License v3.0. See [LICENSE](LICENSE).

The AGPL license is used because this project bundles and integrates `@imgly/background-removal`, which is distributed under the AGPL. See [NOTICE.md](NOTICE.md) for third-party license notes.

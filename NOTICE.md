# Notices

ID Photo Lab includes third-party open-source software and generated model assets.

## Background Removal

This project integrates `@imgly/background-removal` version 1.7.0, distributed under the GNU Affero General Public License v3.0.

The vendored background-removal assets are generated from:

`https://staticimgly.com/@imgly/background-removal-data/1.7.0/package.tgz`

Only the resources used by this app are copied into packaged builds:

- `/models/isnet_fp16`
- `/onnxruntime-web/ort-wasm-simd-threaded.mjs`
- `/onnxruntime-web/ort-wasm-simd-threaded.wasm`

According to the third-party notices distributed with `@imgly/background-removal`, the ISNET model is MIT licensed, and `onnxruntime-web`, `lodash-es`, `ndarray`, and `zod` are MIT licensed.

## Other Key Dependencies

- React: MIT
- React DOM: MIT
- Vite: MIT
- TypeScript: Apache-2.0
- Electron: MIT
- Electron Builder: MIT
- Lucide React: ISC

See each dependency package for its complete license text.

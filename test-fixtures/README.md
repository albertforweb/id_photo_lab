# Test Fixtures

This folder contains small, reviewable fixtures for repeatable ID Photo Lab checks.

- `portraits/front-facing-portrait.svg` is a simple centered portrait for upload and export smoke tests.
- `portraits/light-shirt-portrait.svg` is a light-clothing portrait used for manual background-removal regression checks.
- `regression-cases.json` describes deterministic export cases used by unit tests.

The SVG portraits are intentionally synthetic. They keep the repository small and avoid storing real personal photos in the test set.

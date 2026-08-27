# Release Process

The `Release` GitHub Actions workflow is the source of downloadable desktop builds. Do not commit the generated `release/` folder.

## Triggering a Release

Tag-based release:

```bash
git tag v0.1.0
git push origin v0.1.0
```

Manual release:

1. Open GitHub Actions.
2. Select the `Release` workflow.
3. Choose `Run workflow`.
4. Enter a tag such as `v0.1.0`.
5. Enable `prerelease` only for preview builds.

## Quality Gate

The workflow runs this gate before packaging:

- `npm test`
- Playwright Chromium install
- `npm run test:smoke`
- `npm run package:preflight`

Packaging only starts after the quality gate passes.

## Artifact Checklist

After the workflow finishes, confirm the GitHub Release has these assets:

- macOS `.dmg`
- macOS `.zip`
- Windows `.exe`
- Windows `.zip`

Download at least one macOS and one Windows artifact before announcing a release.

## Rerun Process

If a build or publish job fails:

1. Open the failed workflow run.
2. Expand the failed step and check whether the failure is test, packaging, artifact upload, or release publishing.
3. Fix repository issues in a new commit and move the tag only if the release has not been announced.
4. For transient runner or network failures, use `Re-run failed jobs`.
5. If assets were partially uploaded, rerun the workflow. The publish job uses `gh release upload --clobber`, so rebuilt assets replace earlier files for the same tag.

If the release was already announced, create a new patch tag instead of rewriting the published tag.

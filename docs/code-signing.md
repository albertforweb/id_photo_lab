# Code Signing and Notarization

ID Photo Lab can produce unsigned desktop builds today. Use this checklist before distributing broad public desktop releases.

Do not commit certificates, API keys, profiles, or signing passwords to the repository. Store them in the local keychain, a private CI secret store, or GitHub Actions secrets.

## macOS

Goal: ship a Developer ID signed and notarized `.dmg` / `.zip` so users do not see a Gatekeeper block.

Required Apple assets:

- Apple Developer Program membership.
- Developer ID Application certificate exported as a password-protected `.p12`, or available in the build machine keychain.
- Notarization credentials. Prefer App Store Connect API key credentials when running in CI.

Recommended GitHub secrets:

- `MAC_CSC_LINK`: base64-encoded `.p12` certificate or a secure URL supported by electron-builder.
- `MAC_CSC_KEY_PASSWORD`: password for the certificate.
- `APPLE_API_KEY`: App Store Connect API private key content.
- `APPLE_API_KEY_ID`: App Store Connect API key ID.
- `APPLE_API_ISSUER`: App Store Connect issuer ID.

Alternative notarization secrets:

- `APPLE_ID`
- `APPLE_APP_SPECIFIC_PASSWORD`
- `APPLE_TEAM_ID`

Local signed build example:

```bash
export CSC_LINK=/secure/path/developer-id-application.p12
export CSC_KEY_PASSWORD='certificate-password'
export APPLE_API_KEY=/secure/path/AuthKey_XXXXXXXXXX.p8
export APPLE_API_KEY_ID='XXXXXXXXXX'
export APPLE_API_ISSUER='issuer-uuid'
npm run package:mac:signed
```

Validation after build:

```bash
codesign --verify --deep --strict --verbose=2 "release/mac-arm64/ID Photo Lab.app"
spctl --assess --type execute --verbose "release/mac-arm64/ID Photo Lab.app"
```

For downloaded `.dmg` testing, install it on a clean macOS account or VM and confirm the app opens without a Gatekeeper block.

## Windows

Goal: sign the `.exe` installer and unpacked executable so SmartScreen reputation can build over time.

Required Windows assets:

- OV or EV code-signing certificate. EV hardware tokens may require vendor-specific CI support.
- Timestamping enabled by electron-builder/signtool.

Recommended GitHub secrets:

- `WIN_CSC_LINK`: base64-encoded `.pfx` certificate or a secure URL supported by electron-builder.
- `WIN_CSC_KEY_PASSWORD`: password for the certificate.

Local signed build example:

```bash
export CSC_LINK=/secure/path/windows-code-signing.pfx
export CSC_KEY_PASSWORD='certificate-password'
npm run package:win:signed
```

Validation after build on Windows:

```powershell
Get-AuthenticodeSignature "release\ID Photo Lab-0.1.0-win-x64.exe"
```

The signature should be `Valid` and the signer should match the publisher certificate.

## Release Workflow Integration

The current GitHub Release workflow remains unsigned unless signing secrets are configured and the packaging step is switched to the signed scripts.

Before enabling signed CI releases:

1. Add the secrets listed above to the GitHub repository or organization.
2. Run `make package-macos-signed` locally on macOS once to confirm notarization credentials.
3. Run `make package-windows-signed` on Windows or CI once to confirm certificate handling.
4. Update `.github/workflows/release.yml` to export the appropriate `CSC_*`, `APPLE_*`, and `WIN_CSC_*` variables and call the signed package scripts.
5. Download the published artifacts from a draft release and verify signatures on clean macOS and Windows machines.

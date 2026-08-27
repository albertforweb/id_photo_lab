NPM ?= npm

.PHONY: help install icons build verify-assets dev electron-dev package package-dir package-macos package-mac package-macos-arm64 package-macos-x64 package-macos-signed package-windows package-win package-windows-arm64 package-windows-signed package-all clean-release

help:
	@printf "ID Photo Lab packaging targets\n\n"
	@printf "  make install              Install dependencies with npm ci\n"
	@printf "  make icons                Generate macOS and Windows app icons\n"
	@printf "  make build                Build the Vite app\n"
	@printf "  make verify-assets        Verify local model assets and package rules\n"
	@printf "  make dev                  Run the Vite dev server\n"
	@printf "  make electron-dev         Run the Electron app against the dev server\n"
	@printf "  make package              Build macOS and Windows release artifacts\n"
	@printf "  make package-dir          Build unpacked Electron app into release/\n"
	@printf "  make package-macos        Build macOS DMG and ZIP for arm64 and x64\n"
	@printf "  make package-macos-arm64  Build macOS DMG and ZIP for Apple Silicon\n"
	@printf "  make package-macos-x64    Build macOS DMG and ZIP for Intel\n"
	@printf "  make package-macos-signed Build signed/notarized macOS DMG and ZIP when signing env vars are set\n"
	@printf "  make package-windows      Build Windows x64 NSIS installer and ZIP\n"
	@printf "  make package-windows-arm64 Build Windows ARM64 ZIP/installer target\n"
	@printf "  make package-windows-signed Build signed Windows x64 NSIS installer and ZIP when signing env vars are set\n"
	@printf "  make package-all          Build macOS and Windows release artifacts\n"
	@printf "  make clean-release        Remove release artifacts\n"

install:
	$(NPM) ci

icons:
	$(NPM) run icons:build

build:
	$(NPM) run build

verify-assets: build
	$(NPM) run assets:verify

dev:
	$(NPM) run dev

electron-dev:
	$(NPM) run electron:dev

package: package-all

package-dir: icons
	$(NPM) run package:dir

package-macos: icons
	$(NPM) run package:mac

package-mac: package-macos

package-macos-arm64: icons
	$(NPM) run package:mac:arm64

package-macos-x64: icons
	$(NPM) run package:mac:x64

package-macos-signed: icons
	$(NPM) run package:mac:signed

package-windows: icons
	$(NPM) run package:win

package-win: package-windows

package-windows-arm64: icons
	$(NPM) run package:win:arm64

package-windows-signed: icons
	$(NPM) run package:win:signed

package-all: package-macos package-windows package-windows-arm64

clean-release:
	rm -rf release

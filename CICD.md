# CI/CD

This document describes the automated build and release pipelines for the extension.

## Workflows

There are three GitHub Actions workflows:

| Workflow | File | Trigger |
| --- | --- | --- |
| **Build** | `.github/workflows/build.yml` | Push to `main` with relevant file changes |
| **Release** | `.github/workflows/release.yml` | GitHub Release published |
| **Release Drafter** | `.github/workflows/release-drafter.yml` | Push to `main`, PR open/reopen/sync |

---

## Build Workflow

**File:** `.github/workflows/build.yml`

Runs on every push to `main` that touches any of the following paths:

- `src/**`
- `package.json`
- `package-lock.json`
- `webpack.config.js`
- `tsconfig.json`
- `.github/workflows/build.yml`

### What it does

1. Checks out the repository
2. Sets up Node.js 20 with npm caching
3. Runs `npm ci`
4. Reads the version from `package.json` and the short git SHA
5. Runs `npx @vscode/vsce package --no-dependencies`
6. Uploads the `.vsix` as a GitHub Actions artifact named `meshy-mcp-<version>-<sha>`, retained for 30 days

### Installing a build artifact

Build artifacts are intended for developers testing unreleased changes — not for end users.

1. Go to [Actions → Build](https://github.com/Maeve-Studios/meshy-mcp-vscode/actions/workflows/build.yml)
2. Click the latest successful run
3. Under **Artifacts**, download and unzip the archive
4. Install the `.vsix` in VS Code:
   - Extensions panel → `...` → **Install from VSIX...**
   - Or: `code --install-extension meshy-mcp-<version>-<sha>.vsix`

> **Windows note:** Do not double-click the `.vsix` — that opens the Visual Studio installer. Use the methods above.

---

## Release Drafter

**File:** `.github/workflows/release-drafter.yml`  
**Config:** `.github/release-drafter.yml`

Release Drafter automatically maintains a rolling draft release as PRs are merged into `main`. It:

- Categorizes changes by PR label into sections (Features, Bug Fixes, Maintenance, CI/CD)
- Suggests the next semantic version based on the highest-impact label on merged PRs
- Updates the draft release title and body on every qualifying event

### Version bump labels

Apply one of these labels to a PR to control the version resolution:

| Label | Effect | Example |
| --- | --- | --- |
| `major` | Major version bump | `0.1.0` → `1.0.0` |
| `minor` | Minor version bump | `0.1.0` → `0.2.0` |
| `patch` | Patch version bump | `0.1.0` → `0.1.1` |
| _(none)_ | Defaults to patch | `0.1.0` → `0.1.1` |

The draft release is visible at [GitHub Releases](https://github.com/Maeve-Studios/meshy-mcp-vscode/releases).

---

## Release Workflow

**File:** `.github/workflows/release.yml`

Triggered when a GitHub Release is **published** (not just drafted).

### What it does

1. Reads the release tag (e.g. `v0.2.0`) and strips the `v` prefix
2. Runs `npm version <version> --no-git-tag-version --allow-same-version` to stamp `package.json` with the release version
3. Runs `npm ci` then `npx @vscode/vsce package --no-dependencies`
4. Uploads the resulting `.vsix` to the release as a downloadable asset using `gh release upload`

The uploaded file is named `meshy-mcp-<version>.vsix` (e.g. `meshy-mcp-0.2.0.vsix`).

### Publishing a release

1. Go to [GitHub Releases](https://github.com/Maeve-Studios/meshy-mcp-vscode/releases)
2. Open the current draft (maintained by Release Drafter)
3. Review the version number and release notes — edit if needed
4. Click **Publish release**

The release workflow runs automatically and attaches the `.vsix` within a minute or two.

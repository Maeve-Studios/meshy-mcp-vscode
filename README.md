# Meshy AI for Copilot

A VS Code extension that exposes Meshy.ai Text-to-3D APIs as **GitHub Copilot language model tools**, so you can generate 3D game assets directly from Copilot chat in agent mode.

## Requirements

- VS Code 1.99 or later
- GitHub Copilot extension with agent mode
- A [Meshy.ai](https://app.meshy.ai) account and API key

## Setup

```bash
npm install
npm run compile
```

Then press **F5** to run the extension, or use `vsce package` to produce a `.vsix` for installation.

Set your API key with the **Meshy: Set API Key** command, or set the `MESHY_API_KEY` environment variable.

## Available Tools

Once active, the following tools appear automatically in Copilot agent mode:

| Tool | What it does |
|---|---|
| `meshy_preview` | Submit a text-to-3D preview task |
| `meshy_refine` | Add PBR textures to a completed preview |
| `meshy_status` | Check task status and progress |
| `meshy_download` | Download the GLB from a completed task |
| `meshy_generate` | Full pipeline: preview → refine → download |
| `meshy_generate_from_file` | Process a JSON assets file (mirroring `generate_meshy_assets.py`) |

## Configuration

| Setting | Description |
|---|---|
| `meshy.apiKey` | Your Meshy.ai API key |
| `meshy.pollIntervalSeconds` | Polling interval in seconds (default: 10) |
| `meshy.defaultStyleSuffix` | Style suffix appended to all prompts |
| `meshy.defaultNegativePrompt` | Negative prompt applied to all generations |

## Assets file format

`meshy_generate_from_file` reads the same JSON schema as `generate_meshy_assets.py`:

```json
{
  "settings": {
    "style_suffix": ", low-poly game asset, PBR",
    "negative_prompt": "blurry, watermark"
  },
  "assets": [
    {
      "id": "Tier1/air_intake_pump",
      "output_path": "Assets/Models/Tier1/air_intake_pump.glb",
      "prompt": "An industrial air intake pump"
    }
  ]
}
```

Progress (`preview_id`, `refine_id`, `done`) is saved back to the file, so interrupted runs resume automatically.

## Development

```bash
npm run watch      # incremental builds
npm run compile    # single build
npm run package    # production bundle
npm run lint       # ESLint
```

## CI/CD

### Build workflow

A `.vsix` is automatically built on every push to `main` that changes files in `src/`, `package.json`, `package-lock.json`, `webpack.config.js`, `tsconfig.json`, or the workflow file itself. The artifact is named `meshy-mcp-<version>-<sha>` and is available for download from the [Actions](https://github.com/Maeve-Studios/meshy-mcp-vscode/actions/workflows/build.yml) tab on GitHub for 30 days. This is intended for developers who want to test the latest changes without waiting for a formal release.

**To install a build artifact:**
1. Go to [Actions → Build](https://github.com/Maeve-Studios/meshy-mcp-vscode/actions/workflows/build.yml)
2. Click the latest successful run
3. Download the artifact under **Artifacts**
4. Unzip it and install the `.vsix` via **Extensions → ... → Install from VSIX** in VS Code

### Release workflow

Releases are managed using [release-drafter](https://github.com/release-drafter/release-drafter). As pull requests are merged into `main`, a draft release is automatically kept up to date with categorized change notes and a suggested next version number based on PR labels:

| PR Label | Version bump |
|---|---|
| `patch` | `0.1.0` → `0.1.1` |
| `minor` | `0.1.0` → `0.2.0` |
| `major` | `0.1.0` → `1.0.0` |
| *(none)* | defaults to patch |

**To publish a release:**
1. Go to [GitHub Releases](https://github.com/Maeve-Studios/meshy-mcp-vscode/releases) and open the current draft
2. Review and adjust the version and release notes as needed
3. Click **Publish release**

Publishing triggers the release workflow, which builds the `.vsix` stamped with the release version and attaches it to the release as a downloadable asset.


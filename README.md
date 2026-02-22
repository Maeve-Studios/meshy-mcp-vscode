# Meshy AI for Copilot

A VS Code extension that exposes [Meshy.ai](https://www.meshy.ai) 3D generation APIs as **GitHub Copilot language model tools**, so you can generate, retexture, and remesh 3D game assets directly from Copilot chat in agent mode.

## Requirements

- VS Code 1.99 or later
- GitHub Copilot extension with agent mode enabled
- A [Meshy.ai](https://www.meshy.ai) account and API key

## Installation

Download the latest `.vsix` from [GitHub Releases](https://github.com/Maeve-Studios/meshy-mcp-vscode/releases) and install it in VS Code.

> **Windows note:** Do not double-click the `.vsix` file — that opens the Visual Studio installer, which cannot install VS Code extensions. Use one of the methods below instead.

**Option 1 — VS Code UI:**

1. Open VS Code
2. Go to the Extensions view (`Ctrl+Shift+X`)
3. Click the `...` menu at the top-right of the Extensions panel
4. Select **Install from VSIX...**
5. Browse to the downloaded `.vsix` and select it

**Option 2 — Command line:**

```bash
code --install-extension meshy-mcp-<version>.vsix
```

## Getting Started

After installing the extension, set your Meshy API key:

1. Press `Ctrl+Shift+P` and run **Meshy: Set API Key**
2. Paste your key (starts with `msy_`) and press Enter

The extension activates automatically — no compilation or setup required. Open Copilot chat in agent mode and the Meshy tools will be available immediately.

## Available Tools

| Tool                       | What it does                                                      |
| -------------------------- | ----------------------------------------------------------------- |
| `meshy_preview`            | Submit a Text-to-3D preview task and return the task ID           |
| `meshy_refine`             | Add PBR textures to a completed preview task                      |
| `meshy_status`             | Check the status and progress of any task                         |
| `meshy_download`           | Download the GLB from a completed task to a local path            |
| `meshy_generate`           | Full pipeline: preview → refine → download in one step            |
| `meshy_generate_from_file` | Batch-process a JSON assets file, resuming from where it left off |
| `meshy_balance`            | Check your current Meshy.ai credit balance                        |
| `meshy_image_to_3d`        | Generate a 3D model from a single reference image                 |
| `meshy_multi_image_to_3d`  | Generate a 3D model from multiple reference images (front, side, back, etc.) |
| `meshy_retexture`          | Apply new AI-generated textures to an existing 3D model           |
| `meshy_remesh`             | Clean up geometry, retopologise, or convert format of a 3D model  |

You can reference these tools directly in Copilot chat using `#meshy_generate`, `#meshy_status`, etc., or simply describe what you want and Copilot will invoke the appropriate tool.

## Configuration

These settings can be changed in VS Code Settings (`Ctrl+,`) under **Meshy**:

| Setting                       | Description                                | Default  |
| ----------------------------- | ------------------------------------------ | -------- |
| `meshy.apiKey`                | Your Meshy.ai API key                      | _(none)_ |
| `meshy.pollIntervalSeconds`   | How often to poll for task completion      | `10`     |
| `meshy.defaultStyleSuffix`    | Text appended to every generation prompt   | _(none)_ |
| `meshy.defaultNegativePrompt` | Negative prompt applied to all generations | _(none)_ |

## Batch Generation: Assets File Format

`meshy_generate_from_file` reads a JSON file describing a list of assets to generate. The format mirrors the `generate_meshy_assets.py` script:

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
    },
    {
      "id": "Tier1/pressure_valve",
      "output_path": "Assets/Models/Tier1/pressure_valve.glb",
      "prompt": "A brass pressure relief valve",
      "image_url": "https://example.com/reference.jpg"
    }
  ]
}
```

Progress fields (`preview_id`, `refine_id`, `done`) are written back to the file after each step, so interrupted runs resume automatically from where they left off.

You can use the `only` parameter to process a subset of assets by ID (partial match):

> _"Run meshy_generate_from_file on assets.json, but only process Tier1/air_intake_pump"_

Use `dry_run: true` to preview what would be processed without making any API calls.

## Credit Costs

The extension will show a confirmation prompt before making any API calls that consume credits.

| Operation                             | Cost       |
| ------------------------------------- | ---------- |
| Preview (Text-to-3D, Meshy-6)         | 20 credits |
| Refine / PBR texturing                | 10 credits |
| Full pipeline (`meshy_generate`)      | 30 credits |
| Image to 3D — no texture              | 20 credits |
| Image to 3D — with texture            | 30 credits |
| Multi-Image to 3D — no texture        | 20 credits |
| Multi-Image to 3D — with texture      | 30 credits |
| Retexture (`meshy_retexture`)         | 10 credits |
| Remesh (`meshy_remesh`)               | 5 credits  |
| Check balance (`meshy_balance`)       | Free       |

Credit costs are shown in the confirmation dialog before each operation. For batch runs, the total cost across all pending assets is shown upfront.

## Links

- [Meshy.ai](https://www.meshy.ai) — create an account and get an API key
- [Meshy API Docs](https://docs.meshy.ai) — API reference
- [GitHub Releases](https://github.com/Maeve-Studios/meshy-mcp-vscode/releases) — download the latest `.vsix`
- [Contributing](CONTRIBUTING.md) — building from source and submitting changes

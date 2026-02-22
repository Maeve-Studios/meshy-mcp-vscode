# Contributing to Meshy AI for Copilot

Thanks for your interest in contributing! This document covers how to set up a local development environment, build and test the extension, and submit changes.

## Prerequisites

- [Node.js](https://nodejs.org) 20 or later
- [VS Code](https://code.visualstudio.com) 1.99 or later
- A [Meshy.ai](https://www.meshy.ai) account and API key (for testing)
- GitHub Copilot extension installed in your VS Code (for testing agent mode)

## Setup

Clone the repository and install dependencies:

```bash
git clone https://github.com/Maeve-Studios/meshy-mcp-vscode.git
cd meshy-mcp-vscode
npm install
```

## Development Workflow

### Running the extension locally

Press **F5** in VS Code to launch an **Extension Development Host** — a second VS Code window with the extension loaded from source. Any changes you make will be reflected after restarting the host.

For incremental builds while you work:

```bash
npm run watch
```

### Available scripts

| Command | Description |
| --- | --- |
| `npm run watch` | Incremental webpack build (development mode) |
| `npm run compile` | Single webpack build (development mode) |
| `npm run package` | Production webpack bundle (minified) |
| `npm run lint` | Run ESLint across all source files |
| `npm run vscode:prepublish` | Alias for `npm run package` (called by vsce) |

### Linting

The project uses ESLint with strict rules. Always run `npm run lint` before submitting a PR — the CI build will fail on lint errors.

```bash
npm run lint
```

### Building a VSIX locally

To produce an installable `.vsix` for manual testing:

```bash
npx @vscode/vsce package --no-dependencies
```

This outputs a `meshy-mcp-<version>.vsix` in the project root. Install it in VS Code via the Extensions panel (`...` → **Install from VSIX...**).

## Project Structure

```
src/
  extension.ts          # Activation, command registration, tool registration
  meshy-client.ts       # Meshy API HTTP client (preview, refine, poll, download)
  tools/
    preview.ts          # meshy_preview tool
    refine.ts           # meshy_refine tool
    status.ts           # meshy_status tool
    download.ts         # meshy_download tool
    generate.ts         # meshy_generate tool (full pipeline)
    generate-from-file.ts  # meshy_generate_from_file tool (batch)
```

All tools implement `vscode.LanguageModelTool<T>` from the VS Code LM Tools API, with:
- `prepareInvocation` — returns a confirmation dialog shown to the user before execution
- `invoke` — the actual tool logic

## Adding a New Tool

1. Create `src/tools/<name>.ts` implementing `vscode.LanguageModelTool<YourInputType>`
2. Register it in `src/extension.ts` alongside the existing tools
3. Add the tool's contribution point to `package.json` under `contributes.languageModelTools`, including `toolReferenceName`, `tags`, `userDescription`, and `modelDescription`

## Submitting a Pull Request

1. Fork the repository and create a branch from `main`
2. Make your changes, ensuring `npm run lint` passes and the extension works in the Extension Development Host
3. Label your PR with `patch`, `minor`, or `major` to control the version bump in the next release — see [CICD.md](CICD.md) for details
4. Open the pull request against `main`

The CI build will automatically build the VSIX and report any errors. A reviewer will be assigned shortly.

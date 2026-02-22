import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { createClient, MeshyTaskStatus } from '../meshy-client';

// ── Types (mirror the Python script JSON schema) ───────────────────────────────

interface AssetEntry {
  id: string;
  output_path: string;
  prompt: string;
  image_url?: string;
  // progress fields
  preview_id?: string;
  preview_done?: boolean;
  refine_id?: string;
  refine_done?: boolean;
  done?: boolean;
}

interface AssetsFile {
  settings?: {
    style_suffix?: string;
    negative_prompt?: string;
  };
  assets: AssetEntry[];
}

interface GenerateFromFileInput {
  assets_file: string;
  only?: string[];
  skip_refine?: boolean;
  dry_run?: boolean;
}

// ── Tool ───────────────────────────────────────────────────────────────────────

export class GenerateFromFileTool implements vscode.LanguageModelTool<GenerateFromFileInput> {
  async prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<GenerateFromFileInput>,
  ): Promise<vscode.PreparedToolInvocation> {
    const { assets_file, dry_run, skip_refine, only } = options.input;
    const label = dry_run ? 'dry run' : 'generate';
    const invocationMessage = `Meshy ${label} from: ${path.basename(assets_file)}`;

    if (dry_run) {
      return { invocationMessage };
    }

    const creditsEach = skip_refine ? 20 : 30;
    const filterNote = only && only.length > 0 ? `\n\n**Filter:** only assets matching: ${only.join(', ')}` : '';
    return {
      invocationMessage,
      confirmationMessages: {
        title: 'Generate 3D Assets from File via Meshy',
        message: new vscode.MarkdownString(
          `This will process all pending assets in \`${path.basename(assets_file)}\` and call the Meshy API for each one.\n\n` +
          `**Cost:** ${creditsEach} credits per asset (${skip_refine ? 'preview only' : 'preview + PBR refine'})${filterNote}\n\n` +
          `Progress is saved back to the file after each step so the run can be resumed if interrupted.`,
        ),
      },
    };
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<GenerateFromFileInput>,
    token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResult> {
    const input = options.input;
    const log: string[] = [];

    // ── Resolve the file path ──────────────────────────────────────────────────
    const assetsFilePath = this.resolveFilePath(input.assets_file);
    if (!fs.existsSync(assetsFilePath)) {
      return result(`❌ Assets file not found: \`${assetsFilePath}\``);
    }

    // ── Load assets file ───────────────────────────────────────────────────────
    let data: AssetsFile;
    try {
      data = JSON.parse(fs.readFileSync(assetsFilePath, 'utf8')) as AssetsFile;
    } catch (err) {
      return result(`❌ Failed to parse assets file: ${err}`);
    }

    const settings = data.settings ?? {};
    const styleSuffix = settings.style_suffix ?? '';
    const negativePrompt = settings.negative_prompt ?? '';
    let assets = data.assets ?? [];

    // ── Filter ─────────────────────────────────────────────────────────────────
    if (input.only && input.only.length > 0) {
      const filters = input.only;
      assets = assets.filter((a) => filters.some((f) => a.id.includes(f)));
      if (assets.length === 0) {
        return result(`❌ No assets matched the 'only' filter: ${JSON.stringify(filters)}`);
      }
    }

    const total = assets.length;
    log.push(`**Assets file:** \`${path.basename(assetsFilePath)}\``);
    log.push(`**Assets to process:** ${total}`);
    log.push(`**Refine stage:** ${input.skip_refine ? 'SKIPPED' : 'ENABLED (PBR)'}`);
    if (input.dry_run) {
      log.push(`**Mode:** DRY RUN (no API calls)`);
    }
    log.push('');

    if (input.dry_run) {
      for (const asset of assets) {
        const fullPrompt = asset.prompt + styleSuffix;
        log.push(`**[${asset.id}]**`);
        log.push(`- Prompt: ${fullPrompt.slice(0, 100)}${fullPrompt.length > 100 ? '…' : ''}`);
        if (asset.image_url) {
          log.push(`- Image: ${asset.image_url}`);
        }
        log.push(`- Output: ${asset.output_path}`);
        log.push('');
      }
      return result(log.join('\n'));
    }

    // ── Generate ───────────────────────────────────────────────────────────────
    const client = createClient();
    let doneCount = 0;
    let errorCount = 0;

    for (const asset of assets) {
      if (token.isCancellationRequested) {
        log.push(`⚠️ Cancelled after ${doneCount}/${total} assets.`);
        break;
      }

      const destPath = this.resolveOutputPath(asset.output_path, assetsFilePath);

      // Skip already completed
      if (asset.done && fs.existsSync(destPath)) {
        log.push(`⏭️ **[${asset.id}]** already done — skipped`);
        doneCount++;
        continue;
      }

      log.push(`▶ **[${asset.id}]**`);

      try {
        // ── Preview ──────────────────────────────────────────────────────────
        if (!asset.preview_id) {
          const previewId = await client.createPreview({
            prompt: asset.prompt + styleSuffix,
            negative_prompt: negativePrompt,
            image_url: asset.image_url,
          });
          asset.preview_id = previewId;
          this.saveFile(assetsFilePath, data);
          log.push(`  Preview submitted: \`${previewId}\``);
        }

        if (!asset.preview_done) {
          await client.pollUntilDone(
            asset.preview_id!,
            (status, pct) => {
              void vscode.window.setStatusBarMessage(
                `Meshy [${asset.id}] preview: ${status} ${pct}%`,
                8_000,
              );
            },
            token,
          );
          asset.preview_done = true;
          this.saveFile(assetsFilePath, data);
        }

        let finalTask: MeshyTaskStatus;

        if (input.skip_refine) {
          finalTask = await client.getTask(asset.preview_id!);
        } else {
          // ── Refine ────────────────────────────────────────────────────────
          if (!asset.refine_id) {
            const refineId = await client.createRefine({ preview_task_id: asset.preview_id! });
            asset.refine_id = refineId;
            this.saveFile(assetsFilePath, data);
            log.push(`  Refine submitted: \`${refineId}\``);
          }

          if (!asset.refine_done) {
            await client.pollUntilDone(
              asset.refine_id!,
              (status, pct) => {
                void vscode.window.setStatusBarMessage(
                  `Meshy [${asset.id}] refine: ${status} ${pct}%`,
                  8_000,
                );
              },
              token,
            );
            asset.refine_done = true;
            this.saveFile(assetsFilePath, data);
          }

          finalTask = await client.getTask(asset.refine_id!);
        }

        // ── Download ──────────────────────────────────────────────────────────
        const savedPath = await client.downloadGlb(finalTask, destPath);
        asset.done = true;
        this.saveFile(assetsFilePath, data);
        log.push(`  ✅ Saved: \`${savedPath}\``);
        doneCount++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log.push(`  ❌ Error: ${msg}`);
        errorCount++;
        this.saveFile(assetsFilePath, data);
      }

      log.push('');
    }

    // ── Summary ────────────────────────────────────────────────────────────────
    const totalDone = data.assets.filter((a) => a.done).length;
    log.push(`---`);
    log.push(`**Done:** ${totalDone}/${data.assets.length} total assets`);
    if (errorCount > 0) {
      log.push(`**Errors:** ${errorCount} asset(s) failed`);
    }
    if (totalDone === data.assets.length) {
      log.push(`🎉 All assets generated!`);
    }

    return result(log.join('\n'));
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  private resolveFilePath(filePath: string): string {
    if (path.isAbsolute(filePath)) {
      return filePath;
    }
    const ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();
    return path.join(ws, filePath);
  }

  private resolveOutputPath(outputPath: string, assetsFilePath: string): string {
    if (path.isAbsolute(outputPath)) {
      return outputPath;
    }
    return path.join(path.dirname(assetsFilePath), outputPath);
  }

  private saveFile(filePath: string, data: AssetsFile): void {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  }
}

function result(text: string): vscode.LanguageModelToolResult {
  return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(text)]);
}

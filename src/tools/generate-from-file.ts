import * as fs from 'node:fs';
import * as path from 'node:path';
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

interface GenerateContext {
  data: AssetsFile;
  assetsFilePath: string;
  styleSuffix: string;
  negativePrompt: string;
  skipRefine: boolean;
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
    const stages = skip_refine ? 'preview only' : 'preview + PBR refine';

    // ── Try to read the file to give an accurate cost estimate ────────────────
    let assetSummary = '';
    try {
      const resolvedPath = this.resolveFilePath(assets_file);
      if (fs.existsSync(resolvedPath)) {
        const data = JSON.parse(fs.readFileSync(resolvedPath, 'utf8')) as AssetsFile;
        let assets = data.assets ?? [];
        const totalInFile = assets.length;
        const alreadyDone = assets.filter((a) => a.done).length;

        if (only && only.length > 0) {
          const filters = only;
          assets = assets.filter((a) => filters.some((f) => a.id.includes(f)));
        }

        const pending = assets.filter((a) => !a.done).length;
        const totalCredits = pending * creditsEach;

        assetSummary =
          `\n\n**Assets in file:** ${totalInFile}` +
          (only && only.length > 0 ? ` → **${assets.length} match filter** (${only.join(', ')})` : '') +
          `\n\n**Already done:** ${alreadyDone} (will be skipped)` +
          `\n\n**To process:** ${pending} asset${pending === 1 ? '' : 's'}` +
          `\n\n**Total cost:** ${totalCredits} credits (${pending} × ${creditsEach}, ${stages})`;
      }
    } catch {
      // File unreadable at this point — show a generic cost estimate instead
      assetSummary = `\n\n**Cost:** ${creditsEach} credits per pending asset (${stages})`;
    }

    return {
      invocationMessage,
      confirmationMessages: {
        title: 'Generate 3D Assets from File via Meshy',
        message: new vscode.MarkdownString(
          `This will process pending assets in \`${path.basename(assets_file)}\` and call the Meshy API for each one.` +
          assetSummary +
          `\n\nProgress is saved back to the file after each step so the run can be resumed if interrupted.`,
        ),
      },
    };
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<GenerateFromFileInput>,
    token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResult> {
    const input = options.input;
    const assetsFilePath = this.resolveFilePath(input.assets_file);

    if (!fs.existsSync(assetsFilePath)) {
      return result(`❌ Assets file not found: \`${assetsFilePath}\``);
    }

    let data: AssetsFile;
    try {
      data = JSON.parse(fs.readFileSync(assetsFilePath, 'utf8')) as AssetsFile;
    } catch (err) {
      return result(`❌ Failed to parse assets file: ${err}`);
    }

    const settings = data.settings ?? {};
    let assets = data.assets ?? [];

    if (input.only && input.only.length > 0) {
      const filters = input.only;
      assets = assets.filter((a) => filters.some((f) => a.id.includes(f)));
      if (assets.length === 0) {
        return result(`❌ No assets matched the 'only' filter: ${JSON.stringify(filters)}`);
      }
    }

    const log: string[] = [
      `**Assets file:** \`${path.basename(assetsFilePath)}\``,
      `**Assets to process:** ${assets.length}`,
      `**Refine stage:** ${input.skip_refine ? 'SKIPPED' : 'ENABLED (PBR)'}`,
      ...(input.dry_run ? ['**Mode:** DRY RUN (no API calls)'] : []),
      '',
    ];

    if (input.dry_run) {
      return result(this.buildDryRunLog(assets, settings.style_suffix ?? '', log));
    }

    const ctx: GenerateContext = {
      data,
      assetsFilePath,
      styleSuffix: settings.style_suffix ?? '',
      negativePrompt: settings.negative_prompt ?? '',
      skipRefine: input.skip_refine ?? false,
    };

    const { errorCount } = await this.processAllAssets(assets, ctx, log, token);

    const totalDone = data.assets.filter((a) => a.done).length;
    log.push(
      '---',
      `**Done:** ${totalDone}/${data.assets.length} total assets`,
      ...(errorCount > 0 ? [`**Errors:** ${errorCount} asset(s) failed`] : []),
      ...(totalDone === data.assets.length ? ['🎉 All assets generated!'] : []),
    );

    return result(log.join('\n'));
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  private buildDryRunLog(assets: AssetEntry[], styleSuffix: string, log: string[]): string {
    for (const asset of assets) {
      const fullPrompt = asset.prompt + styleSuffix;
      log.push(
        `**[${asset.id}]**`,
        `- Prompt: ${fullPrompt.slice(0, 100)}${fullPrompt.length > 100 ? '…' : ''}`,
        ...(asset.image_url ? [`- Image: ${asset.image_url}`] : []),
        `- Output: ${asset.output_path}`,
        '',
      );
    }
    return log.join('\n');
  }

  private async processAllAssets(
    assets: AssetEntry[],
    ctx: GenerateContext,
    log: string[],
    token: vscode.CancellationToken,
  ): Promise<{ doneCount: number; errorCount: number }> {
    const client = createClient();
    let doneCount = 0;
    let errorCount = 0;
    const total = assets.length;

    for (const asset of assets) {
      if (token.isCancellationRequested) {
        log.push(`⚠️ Cancelled after ${doneCount}/${total} assets.`);
        break;
      }
      const destPath = this.resolveOutputPath(asset.output_path, ctx.assetsFilePath);
      if (asset.done && fs.existsSync(destPath)) {
        log.push(`⏭️ **[${asset.id}]** already done — skipped`);
        doneCount++;
        continue;
      }
      log.push(`▶ **[${asset.id}]**`);
      try {
        const savedPath = await this.processAsset(asset, ctx, client, destPath, log, token);
        log.push(`  ✅ Saved: \`${savedPath}\``);
        doneCount++;
      } catch (err) {
        log.push(`  ❌ Error: ${err instanceof Error ? err.message : String(err)}`);
        errorCount++;
        this.saveFile(ctx.assetsFilePath, ctx.data);
      }
      log.push('');
    }
    return { doneCount, errorCount };
  }

  private async processAsset(
    asset: AssetEntry,
    ctx: GenerateContext,
    client: ReturnType<typeof createClient>,
    destPath: string,
    log: string[],
    token: vscode.CancellationToken,
  ): Promise<string> {
    await this.runPreviewStage(asset, ctx, client, log, token);
    const finalTask = await this.getFinalTask(asset, ctx, client, log, token);
    const savedPath = await client.downloadGlb(finalTask, destPath);
    asset.done = true;
    this.saveFile(ctx.assetsFilePath, ctx.data);
    return savedPath;
  }

  private async runPreviewStage(
    asset: AssetEntry,
    ctx: GenerateContext,
    client: ReturnType<typeof createClient>,
    log: string[],
    token: vscode.CancellationToken,
  ): Promise<void> {
    if (!asset.preview_id) {
      const previewId = await client.createPreview({
        prompt: asset.prompt + ctx.styleSuffix,
        negative_prompt: ctx.negativePrompt,
        image_url: asset.image_url,
      });
      asset.preview_id = previewId;
      this.saveFile(ctx.assetsFilePath, ctx.data);
      log.push(`  Preview submitted: \`${previewId}\``);
    }
    if (!asset.preview_done) {
      const previewId = asset.preview_id;
      if (!previewId) {
        throw new Error(`[${asset.id}] preview_id missing before polling`);
      }
      await client.pollUntilDone(
        previewId,
        (status, pct) => { vscode.window.setStatusBarMessage(`Meshy [${asset.id}] preview: ${status} ${pct}%`, 8_000); },
        token,
      );
      asset.preview_done = true;
      this.saveFile(ctx.assetsFilePath, ctx.data);
    }
  }

  private async getFinalTask(
    asset: AssetEntry,
    ctx: GenerateContext,
    client: ReturnType<typeof createClient>,
    log: string[],
    token: vscode.CancellationToken,
  ): Promise<MeshyTaskStatus> {
    if (!asset.preview_id) {
      throw new Error(`[${asset.id}] preview_id missing before getFinalTask`);
    }
    if (ctx.skipRefine) {
      return client.getTask(asset.preview_id);
    }
    if (!asset.refine_id) {
      const refineId = await client.createRefine({ preview_task_id: asset.preview_id });
      asset.refine_id = refineId;
      this.saveFile(ctx.assetsFilePath, ctx.data);
      log.push(`  Refine submitted: \`${refineId}\``);
    }
    if (!asset.refine_done) {
      const refineId = asset.refine_id;
      if (!refineId) {
        throw new Error(`[${asset.id}] refine_id missing before polling`);
      }
      await client.pollUntilDone(
        refineId,
        (status, pct) => { vscode.window.setStatusBarMessage(`Meshy [${asset.id}] refine: ${status} ${pct}%`, 8_000); },
        token,
      );
      asset.refine_done = true;
      this.saveFile(ctx.assetsFilePath, ctx.data);
    }
    if (!asset.refine_id) {
      throw new Error(`[${asset.id}] refine_id missing after refine stage`);
    }
    return client.getTask(asset.refine_id);
  }

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

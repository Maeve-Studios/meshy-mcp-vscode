import * as vscode from 'vscode';
import { createClient } from '../meshy-client';

interface GenerateInput {
  prompt: string;
  output_path: string;
  style_suffix?: string;
  negative_prompt?: string;
  image_url?: string;
  skip_refine?: boolean;
  topology?: 'quad' | 'triangle';
  target_polycount?: number;
}

export class GenerateTool implements vscode.LanguageModelTool<GenerateInput> {
  async prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<GenerateInput>,
  ): Promise<vscode.PreparedToolInvocation> {
    const { prompt, skip_refine } = options.input;
    const credits = skip_refine ? 20 : 30;
    return {
      invocationMessage: `Generating 3D asset via Meshy (${credits} credits): "${prompt.slice(0, 60)}${prompt.length > 60 ? '…' : ''}"`,
    };
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<GenerateInput>,
    token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResult> {
    const input = options.input;
    const log: string[] = [];

    const client = createClient();

    try {
      // ── Step 1: Preview ────────────────────────────────────────────────────
      log.push(`**Step 1/3:** Submitting preview task…`);
      const previewId = await client.createPreview({
        prompt: input.prompt,
        style_suffix: input.style_suffix,
        negative_prompt: input.negative_prompt,
        image_url: input.image_url,
        topology: input.topology,
        target_polycount: input.target_polycount,
      });
      log.push(`Preview task ID: \`${previewId}\``);

      // ── Step 2: Poll preview ───────────────────────────────────────────────
      log.push(`**Step 2/3:** Waiting for preview to complete…`);
      const previewTask = await client.pollUntilDone(
        previewId,
        (status, pct, queue) => {
          const queueStr = (queue ?? 0) > 0 ? ` (${queue} ahead in queue)` : '';
          void vscode.window.setStatusBarMessage(`Meshy preview: ${status} ${pct}%${queueStr}`, 8_000);
        },
        token,
      );

      if (input.skip_refine) {
        // Download directly from preview
        log.push(`**Step 3/3:** Refine skipped — downloading preview GLB…`);
        const savedPath = await client.downloadGlb(previewTask, input.output_path);
        log.push(``, `✅ Done! Saved to \`${savedPath}\``, `**Credits used:** 20`);
        return result(log.join('\n'));
      }

      // ── Step 3a: Refine ────────────────────────────────────────────────────
      log.push(`**Step 3a/4:** Submitting refine task (PBR)…`);
      const refineId = await client.createRefine({ preview_task_id: previewId });
      log.push(`Refine task ID: \`${refineId}\``);

      // ── Step 3b: Poll refine ───────────────────────────────────────────────
      log.push(`**Step 3b/4:** Waiting for refine to complete…`);
      const refineTask = await client.pollUntilDone(
        refineId,
        (status, pct, queue) => {
          const queueStr = (queue ?? 0) > 0 ? ` (${queue} ahead in queue)` : '';
          void vscode.window.setStatusBarMessage(`Meshy refine: ${status} ${pct}%${queueStr}`, 8_000);
        },
        token,
      );

      // ── Step 4: Download ───────────────────────────────────────────────────
      log.push(`**Step 4/4:** Downloading GLB…`);
      const savedPath = await client.downloadGlb(refineTask, input.output_path);

      log.push(``, `✅ Done! Saved to \`${savedPath}\``, `**Credits used:** 30`);
      return result(log.join('\n'));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.push(``, `❌ **Error:** ${msg}`);
      return result(log.join('\n'));
    }
  }
}

function result(text: string): vscode.LanguageModelToolResult {
  return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(text)]);
}

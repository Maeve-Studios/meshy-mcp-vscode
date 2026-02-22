import * as vscode from 'vscode';
import { createClient, PreviewOptions } from '../meshy-client';

interface PreviewInput {
  prompt: string;
  style_suffix?: string;
  negative_prompt?: string;
  image_url?: string;
  topology?: 'quad' | 'triangle';
  target_polycount?: number;
}

export class PreviewTool implements vscode.LanguageModelTool<PreviewInput> {
  async prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<PreviewInput>,
  ): Promise<vscode.PreparedToolInvocation> {
    const prompt = options.input.prompt;
    return {
      invocationMessage: `Submitting Meshy preview task for: "${prompt.slice(0, 60)}${prompt.length > 60 ? '…' : ''}"`,
    };
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<PreviewInput>,
    token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResult> {
    if (token.isCancellationRequested) {
      return result('Cancelled before starting.');
    }

    const client = createClient();
    const opts: PreviewOptions = {
      prompt: options.input.prompt,
      style_suffix: options.input.style_suffix,
      negative_prompt: options.input.negative_prompt,
      image_url: options.input.image_url,
      topology: options.input.topology,
      target_polycount: options.input.target_polycount,
    };

    const taskId = await client.createPreview(opts);

    return result(
      [
        `✓ Preview task submitted successfully.`,
        ``,
        `**Task ID:** \`${taskId}\``,
        `**Cost:** 20 credits`,
        ``,
        `Use \`meshy_status\` with this task ID to check progress,`,
        `or \`meshy_refine\` once it succeeds to add PBR textures (+10 credits).`,
      ].join('\n'),
    );
  }
}

function result(text: string): vscode.LanguageModelToolResult {
  return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(text)]);
}

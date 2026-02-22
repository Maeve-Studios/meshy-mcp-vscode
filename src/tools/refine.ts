import * as vscode from 'vscode';
import { createClient, RefineOptions } from '../meshy-client';

interface RefineInput {
  preview_task_id: string;
  enable_pbr?: boolean;
}

export class RefineTool implements vscode.LanguageModelTool<RefineInput> {
  async prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<RefineInput>,
  ): Promise<vscode.PreparedToolInvocation> {
    return {
      invocationMessage: `Submitting Meshy refine task for preview \`${options.input.preview_task_id.slice(0, 12)}…\``,
    };
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<RefineInput>,
    token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResult> {
    if (token.isCancellationRequested) {
      return result('Cancelled before starting.');
    }

    const client = createClient();
    const opts: RefineOptions = {
      preview_task_id: options.input.preview_task_id,
      enable_pbr: options.input.enable_pbr ?? true,
    };

    const taskId = await client.createRefine(opts);

    return result(
      [
        `✓ Refine task submitted successfully.`,
        ``,
        `**Task ID:** \`${taskId}\``,
        `**PBR maps:** ${opts.enable_pbr ? 'enabled (albedo, normal, roughness, metallic)' : 'disabled'}`,
        `**Cost:** 10 credits`,
        ``,
        `Use \`meshy_status\` with this task ID to check progress,`,
        `or \`meshy_download\` once it succeeds to save the GLB.`,
      ].join('\n'),
    );
  }
}

function result(text: string): vscode.LanguageModelToolResult {
  return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(text)]);
}

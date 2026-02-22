import * as vscode from 'vscode';
import { type RetextureOptions, createClient } from '../meshy-client';

function result(text: string): vscode.LanguageModelToolResult {
  return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(text)]);
}

interface RetextureInput {
  model_url: string;
  object_prompt: string;
  style_prompt: string;
  output_path?: string;
  enable_pbr?: boolean;
  enable_original_uv?: boolean;
  resolution?: '1024' | '2048' | '4096';
}

export class MeshyRetextureTool implements vscode.LanguageModelTool<RetextureInput> {
  prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<RetextureInput>,
  ): vscode.PreparedToolInvocation {
    const { model_url, object_prompt, style_prompt, resolution } = options.input;

    return {
      invocationMessage: `Retexturing 3D model…`,
      confirmationMessages: {
        title: 'Retexture 3D Model',
        message: new vscode.MarkdownString(
          `**Model URL:** ${model_url}\n\n` +
          `| Setting | Value |\n|---|---|\n` +
          `| Object Prompt | ${object_prompt} |\n` +
          `| Style Prompt | ${style_prompt} |\n` +
          `| Resolution | ${resolution ?? '2048'} |\n\n` +
          `**Estimated cost:** 10 credits`,
        ),
      },
    };
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<RetextureInput>,
    token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResult> {
    const client = createClient();
    const input = options.input;

    const opts: RetextureOptions = {
      model_url: input.model_url,
      object_prompt: input.object_prompt,
      style_prompt: input.style_prompt,
      enable_pbr: input.enable_pbr,
      enable_original_uv: input.enable_original_uv,
      resolution: input.resolution,
    };

    const taskId = await client.createRetexture(opts);
    const log: string[] = [`Task created: \`${taskId}\``];

    const task = await client.pollRetexture(
      taskId,
      (status, progress) => { log.push(`[${status}] ${progress}%`); },
      token,
    );

    const outputPath = input.output_path ?? `${taskId}.glb`;

    const savedPath = await client.downloadGlb(task, outputPath);
    log.push(`Model saved to: ${savedPath}`);

    return result(log.join('\n'));
  }
}

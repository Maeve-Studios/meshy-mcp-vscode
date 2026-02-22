import * as vscode from 'vscode';
import { type MultiImageTo3DOptions, createClient } from '../meshy-client';

function result(text: string): vscode.LanguageModelToolResult {
  return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(text)]);
}

interface MultiImageTo3DInput {
  image_urls: string[];
  output_path?: string;
  should_texture?: boolean;
  enable_pbr?: boolean;
  topology?: 'quad' | 'triangle';
  target_polycount?: number;
  texture_prompt?: string;
  ai_model?: 'meshy-5' | 'meshy-6' | 'latest';
  symmetry_mode?: 'off' | 'auto' | 'on';
}

export class MeshyMultiImageTo3DTool implements vscode.LanguageModelTool<MultiImageTo3DInput> {
  prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<MultiImageTo3DInput>,
  ): vscode.PreparedToolInvocation {
    const { image_urls, should_texture, topology, target_polycount } = options.input;
    const withTexture = should_texture !== false;
    const creditCost = withTexture ? 30 : 20;
    const topo = topology ?? 'triangle';
    const polycount = target_polycount ?? 30_000;

    return {
      invocationMessage: `Generating 3D model from ${image_urls.length} image(s)…`,
      confirmationMessages: {
        title: 'Generate 3D Model from Multiple Images',
        message: new vscode.MarkdownString(
          `**Images (${image_urls.length}):**\n${image_urls.map(u => `- ${u}`).join('\n')}\n\n` +
          `| Setting | Value |\n|---|---|\n` +
          `| Texture | ${withTexture ? 'Yes' : 'No'} |\n` +
          `| Topology | ${topo} |\n` +
          `| Target Polycount | ${polycount.toLocaleString()} |\n\n` +
          `**Estimated cost:** ${creditCost} credits`,
        ),
      },
    };
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<MultiImageTo3DInput>,
    token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResult> {
    const client = createClient();
    const input = options.input;

    const opts: MultiImageTo3DOptions = {
      image_urls: input.image_urls,
      should_texture: input.should_texture,
      enable_pbr: input.enable_pbr,
      topology: input.topology,
      target_polycount: input.target_polycount,
      texture_prompt: input.texture_prompt,
      ai_model: input.ai_model,
      symmetry_mode: input.symmetry_mode,
    };

    const taskId = await client.createMultiImageTo3D(opts);
    const log: string[] = [`Task created: \`${taskId}\``];

    const task = await client.pollMultiImageTo3D(
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

import * as vscode from 'vscode';
import { type ImageTo3DOptions, createClient } from '../meshy-client';

function result(text: string): vscode.LanguageModelToolResult {
  return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(text)]);
}

interface ImageTo3DInput {
  image_url: string;
  output_path?: string;
  should_texture?: boolean;
  enable_pbr?: boolean;
  topology?: 'quad' | 'triangle';
  target_polycount?: number;
  texture_prompt?: string;
  ai_model?: 'meshy-5' | 'meshy-6' | 'latest';
  symmetry_mode?: 'off' | 'auto' | 'on';
}

export class MeshyImageTo3DTool implements vscode.LanguageModelTool<ImageTo3DInput> {
  prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<ImageTo3DInput>,
  ): vscode.PreparedToolInvocation {
    const { image_url, should_texture, topology, target_polycount } = options.input;
    const withTexture = should_texture !== false;
    const creditCost = withTexture ? 30 : 20;
    const topo = topology ?? 'triangle';
    const polycount = target_polycount ?? 30_000;

    return {
      invocationMessage: `Generating 3D model from image…`,
      confirmationMessages: {
        title: 'Generate 3D Model from Image',
        message: new vscode.MarkdownString(
          `**Image URL:** ${image_url}\n\n` +
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
    options: vscode.LanguageModelToolInvocationOptions<ImageTo3DInput>,
    token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResult> {
    const client = createClient();
    const input = options.input;

    const opts: ImageTo3DOptions = {
      image_url: input.image_url,
      should_texture: input.should_texture,
      enable_pbr: input.enable_pbr,
      topology: input.topology,
      target_polycount: input.target_polycount,
      texture_prompt: input.texture_prompt,
      ai_model: input.ai_model,
      symmetry_mode: input.symmetry_mode,
    };

    const taskId = await client.createImageTo3D(opts);
    const log: string[] = [`Task created: \`${taskId}\``];

    const task = await client.pollImageTo3D(
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

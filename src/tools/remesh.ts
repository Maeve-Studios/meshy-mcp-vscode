import * as vscode from 'vscode';
import { type RemeshOptions, createClient } from '../meshy-client';

function result(text: string): vscode.LanguageModelToolResult {
  return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(text)]);
}

interface RemeshInput {
  model_url: string;
  output_path?: string;
  topology?: 'quad' | 'triangle';
  target_polycount?: number;
  output_formats?: ('glb' | 'fbx' | 'obj' | 'usdz' | 'stl')[];
  resize_height?: number;
  convert_format_only?: boolean;
}

export class MeshyRemeshTool implements vscode.LanguageModelTool<RemeshInput> {
  prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<RemeshInput>,
  ): vscode.PreparedToolInvocation {
    const { model_url, topology, target_polycount } = options.input;
    const topo = topology ?? 'triangle';
    const polycount = target_polycount ?? 10_000;

    return {
      invocationMessage: `Remeshing 3D model…`,
      confirmationMessages: {
        title: 'Remesh 3D Model',
        message: new vscode.MarkdownString(
          `**Model URL:** ${model_url}\n\n` +
          `| Setting | Value |\n|---|---|\n` +
          `| Topology | ${topo} |\n` +
          `| Target Polycount | ${polycount.toLocaleString()} |\n\n` +
          `**Estimated cost:** 5 credits`,
        ),
      },
    };
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<RemeshInput>,
    token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResult> {
    const client = createClient();
    const input = options.input;

    const opts: RemeshOptions = {
      model_url: input.model_url,
      topology: input.topology,
      target_polycount: input.target_polycount,
      output_formats: input.output_formats,
      resize_height: input.resize_height,
      convert_format_only: input.convert_format_only,
    };

    const taskId = await client.createRemesh(opts);
    const log: string[] = [`Task created: \`${taskId}\``];

    const task = await client.pollRemesh(
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

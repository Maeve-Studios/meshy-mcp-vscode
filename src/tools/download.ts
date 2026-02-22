import * as vscode from 'vscode';
import { createClient } from '../meshy-client';

interface DownloadInput {
  task_id: string;
  output_path: string;
}

export class DownloadTool implements vscode.LanguageModelTool<DownloadInput> {
  async prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<DownloadInput>,
  ): Promise<vscode.PreparedToolInvocation> {
    return {
      invocationMessage: `Downloading GLB from Meshy task \`${options.input.task_id.slice(0, 12)}…\` → ${options.input.output_path}`,
    };
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<DownloadInput>,
    _token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResult> {
    const client = createClient();

    const task = await client.getTask(options.input.task_id);

    if (task.status !== 'SUCCEEDED') {
      return result(
        `❌ Task is not ready (status: ${task.status}, progress: ${task.progress ?? 0}%). ` +
          `Wait until status is SUCCEEDED before downloading.`,
      );
    }

    const savedPath = await client.downloadGlb(task, options.input.output_path);

    return result(
      [
        `✓ GLB downloaded successfully.`,
        ``,
        `**Saved to:** \`${savedPath}\``,
      ].join('\n'),
    );
  }
}

function result(text: string): vscode.LanguageModelToolResult {
  return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(text)]);
}

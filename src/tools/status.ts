import * as vscode from 'vscode';
import { createClient } from '../meshy-client';

interface StatusInput {
  task_id: string;
}

export class StatusTool implements vscode.LanguageModelTool<StatusInput> {
  async prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<StatusInput>,
  ): Promise<vscode.PreparedToolInvocation> {
    return {
      invocationMessage: `Checking Meshy task \`${options.input.task_id.slice(0, 12)}…\``,
    };
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<StatusInput>,
    _token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResult> {
    const client = createClient();
    const task = await client.getTask(options.input.task_id);

    const lines: string[] = [
      `**Task:** \`${task.id}\``,
      `**Status:** ${statusEmoji(task.status)} ${task.status}`,
      `**Progress:** ${task.progress ?? 0}%`,
    ];

    if ((task.preceding_tasks ?? 0) > 0) {
      lines.push(`**Queue position:** ${task.preceding_tasks} task(s) ahead`);
    }

    if (task.status === 'SUCCEEDED') {
      const urls = task.model_urls ?? {};
      lines.push('', '**Model URLs:**');
      for (const [fmt, url] of Object.entries(urls)) {
        if (url) {
          lines.push(`- ${fmt.toUpperCase()}: ${url}`);
        }
      }
      if (task.thumbnail_url) {
        lines.push(`- Thumbnail: ${task.thumbnail_url}`);
      }
      lines.push('', 'Use `meshy_download` to save the GLB locally.');
    }

    if (task.status === 'FAILED' || task.status === 'CANCELED') {
      const msg = task.task_error?.message ?? 'No details available';
      lines.push(`**Error:** ${msg}`);
    }

    return result(lines.join('\n'));
  }
}

function statusEmoji(status: string): string {
  switch (status) {
    case 'SUCCEEDED':
      return '✅';
    case 'FAILED':
    case 'CANCELED':
    case 'EXPIRED':
      return '❌';
    case 'IN_PROGRESS':
      return '⏳';
    default:
      return '🕐';
  }
}

function result(text: string): vscode.LanguageModelToolResult {
  return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(text)]);
}

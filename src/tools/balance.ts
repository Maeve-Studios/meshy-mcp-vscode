import * as vscode from 'vscode';
import { createClient } from '../meshy-client';

function result(text: string): vscode.LanguageModelToolResult {
  return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(text)]);
}

// Balance tool has no input parameters
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface BalanceInput {}

export class MeshyBalanceTool implements vscode.LanguageModelTool<BalanceInput> {
  async prepareInvocation(
    _options: vscode.LanguageModelToolInvocationPrepareOptions<BalanceInput>,
  ): Promise<vscode.PreparedToolInvocation> {
    return {
      invocationMessage: 'Fetching Meshy credit balance…',
    };
  }

  async invoke(
    _options: vscode.LanguageModelToolInvocationOptions<BalanceInput>,
    _token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResult> {
    const client = createClient();
    const balance = await client.getBalance();
    return result(`Your current Meshy credit balance is **${balance.credit_balance.toLocaleString()} credits**.`);
  }
}

import * as vscode from 'vscode';
import { MeshyBalanceTool } from './tools/balance';
import { DownloadTool } from './tools/download';
import { GenerateFromFileTool } from './tools/generate-from-file';
import { GenerateTool } from './tools/generate';
import { MeshyImageTo3DTool } from './tools/image-to-3d';
import { MeshyMultiImageTo3DTool } from './tools/multi-image-to-3d';
import { PreviewTool } from './tools/preview';
import { RefineTool } from './tools/refine';
import { MeshyRemeshTool } from './tools/remesh';
import { MeshyRetextureTool } from './tools/retexture';
import { StatusTool } from './tools/status';

export function activate(context: vscode.ExtensionContext): void {
  // ── Register language model tools ──────────────────────────────────────────
  context.subscriptions.push(
    vscode.lm.registerTool('meshy_preview', new PreviewTool()),
    vscode.lm.registerTool('meshy_refine', new RefineTool()),
    vscode.lm.registerTool('meshy_status', new StatusTool()),
    vscode.lm.registerTool('meshy_download', new DownloadTool()),
    vscode.lm.registerTool('meshy_generate', new GenerateTool()),
    vscode.lm.registerTool('meshy_generate_from_file', new GenerateFromFileTool()),
    vscode.lm.registerTool('meshy_balance', new MeshyBalanceTool()),
    vscode.lm.registerTool('meshy_image_to_3d', new MeshyImageTo3DTool()),
    vscode.lm.registerTool('meshy_multi_image_to_3d', new MeshyMultiImageTo3DTool()),
    vscode.lm.registerTool('meshy_retexture', new MeshyRetextureTool()),
    vscode.lm.registerTool('meshy_remesh', new MeshyRemeshTool()),
  );

  // ── Commands ───────────────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('meshy.setApiKey', async () => {
      const key = await vscode.window.showInputBox({
        title: 'Meshy API Key',
        prompt: 'Enter your Meshy.ai API key (starts with msy_)',
        password: true,
        placeHolder: 'msy_...',
        validateInput: (v) =>
          v && v.trim().length > 0 ? null : 'API key cannot be empty',
      });

      if (key) {
        await vscode.workspace
          .getConfiguration('meshy')
          .update('apiKey', key.trim(), vscode.ConfigurationTarget.Global);
        void vscode.window.showInformationMessage('✓ Meshy API key saved.');
      }
    }),

    vscode.commands.registerCommand('meshy.openDashboard', () => {
      void vscode.env.openExternal(vscode.Uri.parse('https://app.meshy.ai'));
    }),
  );

  // ── Startup check ──────────────────────────────────────────────────────────
  const config = vscode.workspace.getConfiguration('meshy');
  const apiKey = config.get<string>('apiKey');
  const envKey = process.env['MESHY_API_KEY'];

  if (!apiKey?.trim() && !envKey?.trim()) {
    void vscode.window
      .showWarningMessage(
        'Meshy AI: No API key configured. Set one to use the Meshy tools in Copilot.',
        'Set API Key',
        'Dismiss',
      )
      .then((choice) => {
        if (choice === 'Set API Key') {
          void vscode.commands.executeCommand('meshy.setApiKey');
        }
      });
  }
}

export function deactivate(): void {
  // subscriptions are automatically disposed
}

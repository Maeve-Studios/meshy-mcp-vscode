import axios, { AxiosInstance } from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface MeshyTaskStatus {
  id: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'SUCCEEDED' | 'FAILED' | 'CANCELED' | 'EXPIRED';
  progress: number;
  preceding_tasks?: number;
  model_urls?: {
    glb?: string;
    fbx?: string;
    usdz?: string;
    obj?: string;
    mtl?: string;
  };
  thumbnail_url?: string;
  task_error?: {
    message: string;
  };
  created_at?: number;
  started_at?: number;
  finished_at?: number;
}

export interface PreviewOptions {
  prompt: string;
  style_suffix?: string;
  negative_prompt?: string;
  image_url?: string;
  topology?: 'quad' | 'triangle';
  target_polycount?: number;
}

export interface RefineOptions {
  preview_task_id: string;
  enable_pbr?: boolean;
}

export type ProgressCallback = (status: string, progress: number, precedingTasks?: number) => void;

// ── Client ─────────────────────────────────────────────────────────────────────

export class MeshyClient {
  private readonly http: AxiosInstance;
  private readonly baseUrl = 'https://api.meshy.ai/openapi/v2/text-to-3d';

  constructor(private readonly apiKey: string) {
    this.http = axios.create({
      baseURL: this.baseUrl,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 30_000,
    });
  }

  // ── Task creation ────────────────────────────────────────────────────────────

  async createPreview(opts: PreviewOptions): Promise<string> {
    const payload: Record<string, unknown> = {
      mode: 'preview',
      prompt: opts.prompt + (opts.style_suffix ?? ''),
      negative_prompt: opts.negative_prompt ?? '',
      ai_model: 'latest',
      should_remesh: true,
      topology: opts.topology ?? 'quad',
      target_polycount: opts.target_polycount ?? 10_000,
    };
    if (opts.image_url) {
      payload['image_url'] = opts.image_url;
    }
    const resp = await this.http.post<{ result: string }>('', payload);
    return resp.data.result;
  }

  async createRefine(opts: RefineOptions): Promise<string> {
    const payload = {
      mode: 'refine',
      preview_task_id: opts.preview_task_id,
      enable_pbr: opts.enable_pbr ?? true,
    };
    const resp = await this.http.post<{ result: string }>('', payload);
    return resp.data.result;
  }

  // ── Status ───────────────────────────────────────────────────────────────────

  async getTask(taskId: string): Promise<MeshyTaskStatus> {
    const resp = await this.http.get<MeshyTaskStatus>(`/${taskId}`);
    return resp.data;
  }

  // ── Polling ──────────────────────────────────────────────────────────────────

  /**
   * Polls a task until it reaches SUCCEEDED or a terminal failure state.
   * Calls onProgress on each poll cycle. Respects VS Code cancellation tokens.
   */
  async pollUntilDone(
    taskId: string,
    onProgress: ProgressCallback,
    token: vscode.CancellationToken,
    intervalMs?: number
  ): Promise<MeshyTaskStatus> {
    const config = vscode.workspace.getConfiguration('meshy');
    const pollMs = intervalMs ?? (config.get<number>('pollIntervalSeconds') ?? 10) * 1_000;

    while (!token.isCancellationRequested) {
      const task = await this.getTask(taskId);

      if (task.status === 'SUCCEEDED') {
        onProgress('SUCCEEDED', 100);
        return task;
      }

      if (task.status === 'FAILED' || task.status === 'CANCELED' || task.status === 'EXPIRED') {
        const msg = task.task_error?.message ?? 'Unknown error';
        throw new Error(`Task ${task.status}: ${msg}`);
      }

      onProgress(task.status, task.progress ?? 0, task.preceding_tasks);

      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, pollMs);
        token.onCancellationRequested(() => {
          clearTimeout(timer);
          reject(new Error('Cancelled'));
        });
      });
    }

    throw new Error('Cancelled by user');
  }

  // ── Download ─────────────────────────────────────────────────────────────────

  /**
   * Downloads the GLB from a completed task to outputPath.
   * outputPath is resolved relative to the workspace root if not absolute.
   */
  async downloadGlb(task: MeshyTaskStatus, outputPath: string): Promise<string> {
    const glbUrl = task.model_urls?.glb;
    if (!glbUrl) {
      throw new Error('No GLB URL found in task response');
    }

    const resolvedPath = this.resolveOutputPath(outputPath);
    fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });

    const resp = await axios.get<NodeJS.ReadableStream>(glbUrl, {
      responseType: 'stream',
      timeout: 120_000,
    });

    await new Promise<void>((resolve, reject) => {
      const writer = fs.createWriteStream(resolvedPath);
      (resp.data as NodeJS.ReadableStream).pipe(writer);
      writer.on('finish', resolve);
      writer.on('error', reject);
    });

    return resolvedPath;
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  private resolveOutputPath(outputPath: string): string {
    if (path.isAbsolute(outputPath)) {
      return outputPath;
    }
    const workspaceFolders = vscode.workspace.workspaceFolders;
    const base = workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();
    return path.join(base, outputPath);
  }
}

// ── Factory ─────────────────────────────────────────────────────────────────────

/**
 * Resolves the API key from VS Code settings or the MESHY_API_KEY env var.
 * Throws if not set.
 */
export function resolveApiKey(): string {
  const config = vscode.workspace.getConfiguration('meshy');
  const fromSettings = config.get<string>('apiKey');
  const fromEnv = process.env['MESHY_API_KEY'];

  const key = (fromSettings && fromSettings.trim()) || (fromEnv && fromEnv.trim()) || '';
  if (!key) {
    throw new Error(
      'No Meshy API key found. Set it via "Meshy: Set API Key" command or the MESHY_API_KEY environment variable.'
    );
  }
  return key;
}

export function createClient(): MeshyClient {
  return new MeshyClient(resolveApiKey());
}

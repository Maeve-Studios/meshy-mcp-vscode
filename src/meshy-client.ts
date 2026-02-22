import axios, { AxiosInstance } from 'axios';
import * as fs from 'node:fs';
import * as path from 'node:path';
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

export interface ImageTo3DOptions {
  image_url: string;
  ai_model?: 'meshy-5' | 'meshy-6' | 'latest';
  should_texture?: boolean;
  enable_pbr?: boolean;
  topology?: 'quad' | 'triangle';
  target_polycount?: number;
  texture_prompt?: string;
  pose_mode?: 'a-pose' | 't-pose' | '';
  symmetry_mode?: 'off' | 'auto' | 'on';
  should_remesh?: boolean;
}

export interface MultiImageTo3DOptions {
  image_urls: string[];
  ai_model?: 'meshy-5' | 'meshy-6' | 'latest';
  should_texture?: boolean;
  enable_pbr?: boolean;
  topology?: 'quad' | 'triangle';
  target_polycount?: number;
  texture_prompt?: string;
  pose_mode?: 'a-pose' | 't-pose' | '';
  symmetry_mode?: 'off' | 'auto' | 'on';
  should_remesh?: boolean;
}

export interface RetextureOptions {
  model_url: string;
  object_prompt: string;
  style_prompt: string;
  enable_pbr?: boolean;
  enable_original_uv?: boolean;
  resolution?: '1024' | '2048' | '4096';
  ai_model?: string;
}

export interface RemeshOptions {
  model_url: string;
  topology?: 'quad' | 'triangle';
  target_polycount?: number;
  output_formats?: ('glb' | 'fbx' | 'obj' | 'usdz' | 'stl')[];
  resize_height?: number;
  convert_format_only?: boolean;
}

export interface MeshyBalance {
  credit_balance: number;
}

export type ProgressCallback = (status: string, progress: number, precedingTasks?: number) => void;

// ── Client ─────────────────────────────────────────────────────────────────────

export class MeshyClient {
  private readonly http: AxiosInstance;
  private readonly api: AxiosInstance;
  private readonly baseUrl = 'https://api.meshy.ai/openapi/v2/text-to-3d';

  constructor(private readonly apiKey: string) {
    const authHeaders = {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    };
    this.http = axios.create({
      baseURL: this.baseUrl,
      headers: authHeaders,
      timeout: 30_000,
    });
    this.api = axios.create({
      baseURL: 'https://api.meshy.ai',
      headers: authHeaders,
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

  private async pollTask(
    taskGetter: () => Promise<MeshyTaskStatus>,
    onProgress: ProgressCallback,
    token: vscode.CancellationToken,
    intervalMs?: number,
  ): Promise<MeshyTaskStatus> {
    const config = vscode.workspace.getConfiguration('meshy');
    const pollMs = intervalMs ?? (config.get<number>('pollIntervalSeconds') ?? 10) * 1_000;

    while (!token.isCancellationRequested) {
      const task = await taskGetter();

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

  /**
   * Polls a text-to-3d task until it reaches SUCCEEDED or a terminal failure state.
   * Calls onProgress on each poll cycle. Respects VS Code cancellation tokens.
   */
  async pollUntilDone(
    taskId: string,
    onProgress: ProgressCallback,
    token: vscode.CancellationToken,
    intervalMs?: number,
  ): Promise<MeshyTaskStatus> {
    return this.pollTask(() => this.getTask(taskId), onProgress, token, intervalMs);
  }

  // ── Balance ──────────────────────────────────────────────────────────────────

  async getBalance(): Promise<MeshyBalance> {
    const resp = await this.api.get<MeshyBalance>('/openapi/v1/balance');
    return resp.data;
  }

  // ── Image to 3D ───────────────────────────────────────────────────────────────

  async createImageTo3D(opts: ImageTo3DOptions): Promise<string> {
    const payload: Record<string, unknown> = {
      image_url: opts.image_url,
      ai_model: opts.ai_model ?? 'latest',
      should_texture: opts.should_texture ?? true,
      enable_pbr: opts.enable_pbr ?? false,
      topology: opts.topology ?? 'triangle',
      target_polycount: opts.target_polycount ?? 30_000,
    };
    if (opts.texture_prompt) { payload['texture_prompt'] = opts.texture_prompt; }
    if (opts.pose_mode !== undefined) { payload['pose_mode'] = opts.pose_mode; }
    if (opts.symmetry_mode) { payload['symmetry_mode'] = opts.symmetry_mode; }
    if (opts.should_remesh !== undefined) { payload['should_remesh'] = opts.should_remesh; }
    const resp = await this.api.post<{ result: string }>('/openapi/v1/image-to-3d', payload);
    return resp.data.result;
  }

  async getImageTo3DTask(taskId: string): Promise<MeshyTaskStatus> {
    const resp = await this.api.get<MeshyTaskStatus>(`/openapi/v1/image-to-3d/${taskId}`);
    return resp.data;
  }

  async pollImageTo3D(
    taskId: string,
    onProgress: ProgressCallback,
    token: vscode.CancellationToken,
  ): Promise<MeshyTaskStatus> {
    return this.pollTask(() => this.getImageTo3DTask(taskId), onProgress, token);
  }

  // ── Multi-Image to 3D ─────────────────────────────────────────────────────────

  async createMultiImageTo3D(opts: MultiImageTo3DOptions): Promise<string> {
    const payload: Record<string, unknown> = {
      image_urls: opts.image_urls,
      ai_model: opts.ai_model ?? 'latest',
      should_texture: opts.should_texture ?? true,
      enable_pbr: opts.enable_pbr ?? false,
      topology: opts.topology ?? 'triangle',
      target_polycount: opts.target_polycount ?? 30_000,
    };
    if (opts.texture_prompt) { payload['texture_prompt'] = opts.texture_prompt; }
    if (opts.pose_mode !== undefined) { payload['pose_mode'] = opts.pose_mode; }
    if (opts.symmetry_mode) { payload['symmetry_mode'] = opts.symmetry_mode; }
    if (opts.should_remesh !== undefined) { payload['should_remesh'] = opts.should_remesh; }
    const resp = await this.api.post<{ result: string }>('/openapi/v1/multi-image-to-3d', payload);
    return resp.data.result;
  }

  async getMultiImageTo3DTask(taskId: string): Promise<MeshyTaskStatus> {
    const resp = await this.api.get<MeshyTaskStatus>(`/openapi/v1/multi-image-to-3d/${taskId}`);
    return resp.data;
  }

  async pollMultiImageTo3D(
    taskId: string,
    onProgress: ProgressCallback,
    token: vscode.CancellationToken,
  ): Promise<MeshyTaskStatus> {
    return this.pollTask(() => this.getMultiImageTo3DTask(taskId), onProgress, token);
  }

  // ── Retexture ────────────────────────────────────────────────────────────────

  async createRetexture(opts: RetextureOptions): Promise<string> {
    const payload: Record<string, unknown> = {
      model_url: opts.model_url,
      object_prompt: opts.object_prompt,
      style_prompt: opts.style_prompt,
      enable_pbr: opts.enable_pbr ?? true,
    };
    if (opts.enable_original_uv !== undefined) { payload['enable_original_uv'] = opts.enable_original_uv; }
    if (opts.resolution) { payload['resolution'] = opts.resolution; }
    if (opts.ai_model) { payload['ai_model'] = opts.ai_model; }
    const resp = await this.api.post<{ result: string }>('/openapi/v1/retexture', payload);
    return resp.data.result;
  }

  async getRetextureTask(taskId: string): Promise<MeshyTaskStatus> {
    const resp = await this.api.get<MeshyTaskStatus>(`/openapi/v1/retexture/${taskId}`);
    return resp.data;
  }

  async pollRetexture(
    taskId: string,
    onProgress: ProgressCallback,
    token: vscode.CancellationToken,
  ): Promise<MeshyTaskStatus> {
    return this.pollTask(() => this.getRetextureTask(taskId), onProgress, token);
  }

  // ── Remesh ───────────────────────────────────────────────────────────────────

  async createRemesh(opts: RemeshOptions): Promise<string> {
    const payload: Record<string, unknown> = {
      model_url: opts.model_url,
      topology: opts.topology ?? 'triangle',
      target_polycount: opts.target_polycount ?? 10_000,
      output_formats: opts.output_formats ?? ['glb'],
    };
    if (opts.resize_height !== undefined) { payload['resize_height'] = opts.resize_height; }
    if (opts.convert_format_only !== undefined) { payload['convert_format_only'] = opts.convert_format_only; }
    const resp = await this.api.post<{ result: string }>('/openapi/v1/remesh', payload);
    return resp.data.result;
  }

  async getRemeshTask(taskId: string): Promise<MeshyTaskStatus> {
    const resp = await this.api.get<MeshyTaskStatus>(`/openapi/v1/remesh/${taskId}`);
    return resp.data;
  }

  async pollRemesh(
    taskId: string,
    onProgress: ProgressCallback,
    token: vscode.CancellationToken,
  ): Promise<MeshyTaskStatus> {
    return this.pollTask(() => this.getRemeshTask(taskId), onProgress, token);
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
      resp.data.pipe(writer);
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

  const key = fromSettings?.trim() || fromEnv?.trim() || '';
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

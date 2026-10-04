import type { ZodType } from 'zod';

import {
  downloadResponseSchema,
  errorResponseSchema,
  healthSchema,
  jobResponseSchema,
  metadataSchema,
  type DownloadResponse,
  type JobResponse,
  type MetadataResponse,
} from './schemas';

/** A failure talking to the backend, normalized to a stable code. */
export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number | null = null,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export type ApiConfig = { baseUrl: string; apiKey: string };

export type ApiClientOptions = {
  getConfig: () => Promise<ApiConfig>;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

const DEFAULT_TIMEOUT_MS = 30_000;
// Metadata needs a round trip to the provider, which can be slow.
const METADATA_TIMEOUT_MS = 60_000;

/**
 * Typed client for the AudioVault media API. The provider is resolved
 * server-side; nothing here is YouTube-specific.
 */
export class ApiClient {
  constructor(private readonly options: ApiClientOptions) {}

  getMetadata(url: string): Promise<MetadataResponse> {
    return this.request('POST', '/api/media/metadata', metadataSchema, {
      body: { url },
      timeoutMs: METADATA_TIMEOUT_MS,
    });
  }

  startDownload(url: string): Promise<DownloadResponse> {
    return this.request('POST', '/api/media/download', downloadResponseSchema, {
      body: { url, format: 'mp3' },
      timeoutMs: METADATA_TIMEOUT_MS,
    });
  }

  getJob(jobId: string): Promise<JobResponse> {
    return this.request('GET', `/api/media/jobs/${encodeURIComponent(jobId)}`, jobResponseSchema);
  }

  /** Acknowledges a finished download (or cancels a job) so the server deletes its copy. */
  async deleteJob(jobId: string): Promise<void> {
    await this.request('DELETE', `/api/media/jobs/${encodeURIComponent(jobId)}`, null);
  }

  async health() {
    return this.request('GET', '/health', healthSchema, { timeoutMs: 5000, auth: false });
  }

  /** URL and headers for streaming the finished MP3 straight to disk. */
  async fileRequest(jobId: string, token: string) {
    const { baseUrl, apiKey } = await this.config();
    const url = `${baseUrl}/api/media/jobs/${encodeURIComponent(jobId)}/file?token=${encodeURIComponent(token)}`;
    return { url, headers: { 'X-API-Key': apiKey } };
  }

  private async config(): Promise<ApiConfig> {
    const config = await this.options.getConfig();
    if (!config.baseUrl) {
      throw new ApiError('not_configured', 'Set the server address in Settings first.');
    }
    return { ...config, baseUrl: config.baseUrl.replace(/\/+$/, '') };
  }

  private async request<T>(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    schema: ZodType<T> | null,
    opts: { body?: unknown; timeoutMs?: number; auth?: boolean } = {},
  ): Promise<T> {
    const { baseUrl, apiKey } = await this.config();
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      opts.timeoutMs ?? this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    );
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (opts.auth !== false) headers['X-API-Key'] = apiKey;
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';

    let response: Response;
    try {
      response = await (this.options.fetchImpl ?? fetch)(`${baseUrl}${path}`, {
        method,
        headers,
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted) {
        throw new ApiError('timeout', 'The server took too long to respond. Try again.');
      }
      throw new ApiError(
        'network_error',
        'Can’t reach the AudioVault server. Check your connection and server address.',
      );
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) throw await toApiError(response);
    if (schema === null || response.status === 204) return undefined as T;

    let json: unknown;
    try {
      json = await response.json();
    } catch {
      throw new ApiError('invalid_response', 'The server sent an unreadable response.');
    }
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      throw new ApiError('invalid_response', 'The server sent an unexpected response.');
    }
    return parsed.data;
  }
}

async function toApiError(response: Response): Promise<ApiError> {
  try {
    const parsed = errorResponseSchema.safeParse(await response.json());
    if (parsed.success) {
      return new ApiError(parsed.data.error.code, parsed.data.error.message, response.status);
    }
  } catch {
    // fall through to a generic error
  }
  if (response.status === 401) {
    return new ApiError('unauthorized', 'The server rejected the API key.', 401);
  }
  return new ApiError(
    response.status >= 500 ? 'server_error' : 'http_error',
    'The server could not complete the request.',
    response.status,
  );
}

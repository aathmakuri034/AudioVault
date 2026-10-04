import { z } from 'zod';

/**
 * Zod schemas for every backend response. Responses are validated at the
 * boundary so a misbehaving server yields a clean error, not a crash.
 */
export const metadataSchema = z.object({
  provider: z.string().min(1),
  sourceId: z.string().min(1),
  sourceUrl: z.string().url(),
  title: z.string(),
  creator: z.string(),
  thumbnail: z.string().url().nullable(),
  duration: z.number().int().nonnegative().nullable(),
});

export const jobStatusSchema = z.enum(['queued', 'processing', 'complete', 'failed']);
export const jobStageSchema = z.enum([
  'queued',
  'downloading',
  'converting',
  'ready',
  'failed',
  'cancelled',
]);

export const downloadResponseSchema = z.object({
  jobId: z.string().uuid(),
  status: jobStatusSchema,
  stage: jobStageSchema,
  progress: z.number().min(0).max(100),
  downloadToken: z.string().min(16),
  metadata: metadataSchema,
});

export const jobResponseSchema = z.object({
  jobId: z.string().uuid(),
  status: jobStatusSchema,
  stage: jobStageSchema,
  progress: z.number().min(0).max(100),
  error: z.object({ code: z.string(), message: z.string() }).nullable(),
  fileSize: z.number().int().nonnegative().nullable(),
  expiresAt: z.string().nullable(),
});

export const errorResponseSchema = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});

export const healthSchema = z.object({
  status: z.literal('ok'),
  providers: z.array(z.string()),
});

export type MetadataResponse = z.infer<typeof metadataSchema>;
export type DownloadResponse = z.infer<typeof downloadResponseSchema>;
export type JobResponse = z.infer<typeof jobResponseSchema>;
export type JobStage = z.infer<typeof jobStageSchema>;

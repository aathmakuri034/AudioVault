import { z } from 'zod';

export const MAX_URL_LENGTH = 2048;

/**
 * Client-side URL validation. This is intentionally provider-agnostic: it
 * only checks that the input is a plausible http(s) link. Whether a provider
 * supports it (YouTube today) is decided by the backend, so providers can be
 * added or disabled without an app update.
 */
export const mediaUrlSchema = z
  .string()
  .trim()
  .min(1, 'Paste a link to import.')
  .max(MAX_URL_LENGTH, 'That link is too long.')
  .refine((value) => !/\s/.test(value), 'Links cannot contain spaces.')
  .refine((value) => {
    try {
      const url = new URL(value);
      return (url.protocol === 'https:' || url.protocol === 'http:') && url.hostname.includes('.');
    } catch {
      return false;
    }
  }, 'Enter a valid web link, e.g. https://www.youtube.com/watch?v=…');

export type UrlValidation = { ok: true; url: string } | { ok: false; message: string };

export function validateMediaUrl(input: string): UrlValidation {
  const result = mediaUrlSchema.safeParse(input);
  if (result.success) return { ok: true, url: result.data };
  return { ok: false, message: result.error.issues[0]?.message ?? 'Unable to process this URL.' };
}

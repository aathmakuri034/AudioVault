/** A download failure with a stable code and a message safe to show users. */
export class DownloadError extends Error {
  constructor(
    public readonly code: string,
    message?: string,
    /** For duplicates: the existing song or download. */
    public readonly relatedId?: string,
  ) {
    super(message ?? messageForCode(code));
    this.name = 'DownloadError';
  }
}

const MESSAGES: Record<string, string> = {
  invalid_url: 'Unable to process this URL.',
  invalid_request: 'Unable to process this URL.',
  unsupported_url: 'This link isn’t supported. Paste a supported media URL.',
  unsupported_media: 'Live streams and playlists can’t be imported.',
  private_media: 'This media is private, so it can’t be imported.',
  unavailable_media: 'This media was deleted or is no longer available.',
  restricted_media: 'This media is restricted (age, region or membership) and can’t be imported.',
  media_too_long: 'This media is too long to import.',
  conversion_failed: 'The audio couldn’t be converted. Try again later.',
  provider_error: 'Unable to process this URL.',
  duplicate: 'This track has already been downloaded.',
  already_downloading: 'This track is already downloading.',
  insufficient_storage: 'Not enough storage is available on your device.',
  network_error: 'Your download was interrupted. Try again.',
  interrupted: 'Your download was interrupted. Try again.',
  timeout: 'The server took too long to respond. Try again.',
  corrupted_file: 'The downloaded file was damaged. Try again.',
  file_expired: 'The prepared file expired on the server. Try again.',
  job_not_found: 'The server lost track of this download. Try again.',
  cancelled: 'Download cancelled.',
  rate_limited: 'Too many requests. Wait a minute and try again.',
  server_busy: 'The server is busy right now. Try again shortly.',
  server_error: 'The server ran into a problem. Try again.',
  unauthorized: 'The server rejected the API key. Check Settings.',
  not_configured: 'Set the server address in Settings first.',
  invalid_response: 'The server sent an unexpected response. Check the server address.',
};

export function messageForCode(code: string, fallback?: string): string {
  return MESSAGES[code] ?? fallback ?? 'Unable to process this URL.';
}

/** Failures worth retrying against the same server job. */
export const RESUMABLE_CODES = new Set([
  'network_error',
  'interrupted',
  'timeout',
  'corrupted_file',
]);

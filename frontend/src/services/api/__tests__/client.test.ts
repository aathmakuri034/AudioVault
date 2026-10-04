import { ApiClient, ApiError } from '../client';

const JOB_ID = '9f60bf07-0c21-4ca3-8513-2d00e35e62fc';
const meta = {
  provider: 'youtube',
  sourceId: 'aqz-KE-bpKQ',
  sourceUrl: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ',
  title: 'Big Buck Bunny',
  creator: 'Blender',
  thumbnail: 'https://i.ytimg.com/vi/aqz-KE-bpKQ/hq.jpg',
  duration: 635,
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function client(fetchImpl: jest.Mock, baseUrl = 'http://192.168.1.10:8000/') {
  return new ApiClient({
    getConfig: async () => ({ baseUrl, apiKey: 'secret-key' }),
    fetchImpl: fetchImpl as unknown as typeof fetch,
    timeoutMs: 50,
  });
}

describe('ApiClient', () => {
  it('sends the API key and parses metadata', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(json(200, meta));
    const result = await client(fetchImpl).getMetadata('https://youtu.be/aqz-KE-bpKQ');
    expect(result).toEqual(meta);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('http://192.168.1.10:8000/api/media/metadata');
    expect(init.headers['X-API-Key']).toBe('secret-key');
    expect(JSON.parse(init.body)).toEqual({ url: 'https://youtu.be/aqz-KE-bpKQ' });
  });

  it('starts a download and parses the job', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      json(202, {
        jobId: JOB_ID,
        status: 'queued',
        stage: 'queued',
        progress: 0,
        downloadToken: 'x'.repeat(43),
        metadata: meta,
      }),
    );
    const job = await client(fetchImpl).startDownload(meta.sourceUrl);
    expect(job.jobId).toBe(JOB_ID);
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({
      url: meta.sourceUrl,
      format: 'mp3',
    });
  });

  it.each([
    [422, 'unsupported_url', 'This link is not supported.'],
    [403, 'private_media', 'This media is private.'],
    [404, 'unavailable_media', 'This media is no longer available.'],
    [429, 'rate_limited', 'Too many requests.'],
  ])('maps %p %s errors from the backend contract', async (status, code, message) => {
    const fetchImpl = jest.fn().mockResolvedValue(json(status, { error: { code, message } }));
    await expect(client(fetchImpl).getMetadata('https://x.y/z')).rejects.toMatchObject({
      code,
      message,
      status,
    });
  });

  it('maps unexpected server errors generically', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(new Response('boom', { status: 500 }));
    await expect(client(fetchImpl).getJob(JOB_ID)).rejects.toMatchObject({
      code: 'server_error',
      status: 500,
    });
  });

  it('reports network failures', async () => {
    const fetchImpl = jest.fn().mockRejectedValue(new TypeError('Network request failed'));
    await expect(client(fetchImpl).getJob(JOB_ID)).rejects.toMatchObject({
      code: 'network_error',
    });
  });

  it('times out slow requests', async () => {
    const fetchImpl = jest.fn(
      (_url: string, init: RequestInit) =>
        new Promise((_, reject) =>
          init.signal?.addEventListener('abort', () => reject(new Error('aborted'))),
        ),
    );
    await expect(client(fetchImpl as jest.Mock).getJob(JOB_ID)).rejects.toMatchObject({
      code: 'timeout',
    });
  });

  it('rejects responses that do not match the contract', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(json(200, { title: 'missing fields' }));
    await expect(client(fetchImpl).getMetadata('https://x.y/z')).rejects.toMatchObject({
      code: 'invalid_response',
    });
  });

  it('requires a configured server', async () => {
    const fetchImpl = jest.fn();
    await expect(client(fetchImpl, '').getJob(JOB_ID)).rejects.toBeInstanceOf(ApiError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('builds the authenticated file request', async () => {
    const req = await client(jest.fn()).fileRequest(JOB_ID, 'tok/en');
    expect(req.url).toBe(`http://192.168.1.10:8000/api/media/jobs/${JOB_ID}/file?token=tok%2Fen`);
    expect(req.headers['X-API-Key']).toBe('secret-key');
  });

  it('treats 204 acknowledgements as success', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(new Response(null, { status: 204 }));
    await expect(client(fetchImpl).deleteJob(JOB_ID)).resolves.toBeUndefined();
  });
});

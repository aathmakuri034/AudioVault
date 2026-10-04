import { validateMediaUrl } from '../url';

describe('validateMediaUrl', () => {
  it.each([
    'https://www.youtube.com/watch?v=aqz-KE-bpKQ',
    'https://youtu.be/aqz-KE-bpKQ',
    '  https://m.youtube.com/watch?v=aqz-KE-bpKQ&t=10  ',
    'http://example.com/audio',
  ])('accepts %p', (input) => {
    const result = validateMediaUrl(input);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.url).toBe(input.trim());
  });

  it.each([
    ['', /paste a link/i],
    ['   ', /paste a link/i],
    ['not a url', /spaces|valid/i],
    ['javascript:alert(1)', /valid web link/i],
    ['ftp://example.com/file.mp3', /valid web link/i],
    ['file:///etc/passwd', /valid web link/i],
    ['https://localhost/x', /valid web link/i],
    [`https://example.com/${'a'.repeat(2100)}`, /too long/i],
  ])('rejects %p', (input, message) => {
    const result = validateMediaUrl(input);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(message);
  });
});

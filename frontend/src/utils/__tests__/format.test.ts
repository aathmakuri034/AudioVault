import { formatBytes, formatDuration, pluralize } from '../format';

describe('formatDuration', () => {
  it.each([
    [0, '0:00'],
    [5, '0:05'],
    [185, '3:05'],
    [600, '10:00'],
    [3723, '1:02:03'],
    [185.9, '3:05'],
  ])('%p -> %p', (input, expected) => {
    expect(formatDuration(input)).toBe(expected);
  });

  it.each([null, undefined, -1, NaN, Infinity])('unknown %p -> --:--', (input) => {
    expect(formatDuration(input)).toBe('--:--');
  });
});

describe('formatBytes', () => {
  it.each([
    [0, '0 B'],
    [1023, '1023 B'],
    [1536, '1.5 KB'],
    [15_231_212, '15 MB'],
    [3 * 1024 ** 3, '3.0 GB'],
  ])('%p -> %p', (input, expected) => {
    expect(formatBytes(input)).toBe(expected);
  });

  it('handles unknown sizes', () => {
    expect(formatBytes(null)).toBe('—');
  });
});

describe('pluralize', () => {
  it('pluralizes counts', () => {
    expect(pluralize(1, 'song')).toBe('1 song');
    expect(pluralize(3, 'song')).toBe('3 songs');
  });
});

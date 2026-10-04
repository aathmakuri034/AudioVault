/**
 * In-memory stand-in for the subset of the `expo-file-system` object API the
 * app uses. Use with:
 *
 *   jest.mock('expo-file-system', () => require('@/test-utils/fakeFileSystem').fakeExpoFileSystem);
 */
type Entry = { kind: 'file'; size: number } | { kind: 'dir' };

const DOCUMENT = 'file:///sandbox/Documents/';
const CACHE = 'file:///sandbox/Caches/';

export const fakeFs = {
  entries: new Map<string, Entry>(),
  availableDiskSpace: 10 * 1024 * 1024 * 1024,
  reset() {
    this.entries.clear();
    this.entries.set(DOCUMENT, { kind: 'dir' });
    this.entries.set(CACHE, { kind: 'dir' });
    this.availableDiskSpace = 10 * 1024 * 1024 * 1024;
  },
  writeFile(uri: string, size = 1) {
    this.entries.set(uri, { kind: 'file', size });
  },
};
fakeFs.reset();

function join(parts: (string | { uri: string })[], isDir: boolean): string {
  const strs = parts.map((p) => (typeof p === 'string' ? p : p.uri));
  let uri = strs[0];
  for (const part of strs.slice(1)) {
    uri = uri.replace(/\/?$/, '/') + part.replace(/^\//, '');
  }
  if (isDir) uri = uri.replace(/\/?$/, '/');
  return uri;
}

class FakeFile {
  uri: string;
  constructor(...parts: (string | { uri: string })[]) {
    this.uri = join(parts, false);
  }
  get name() {
    return this.uri.split('/').pop() ?? '';
  }
  get exists() {
    return fakeFs.entries.get(this.uri)?.kind === 'file';
  }
  get size() {
    const e = fakeFs.entries.get(this.uri);
    return e?.kind === 'file' ? e.size : 0;
  }
  create() {
    fakeFs.writeFile(this.uri, 0);
  }
  delete() {
    if (!this.exists) throw new Error(`File not found: ${this.uri}`);
    fakeFs.entries.delete(this.uri);
  }
  async copy(dest: FakeFile) {
    fakeFs.writeFile(dest.uri, this.size);
  }
  async move(dest: FakeFile) {
    const size = this.size;
    fakeFs.entries.delete(this.uri);
    fakeFs.writeFile(dest.uri, size);
    this.uri = dest.uri;
  }
  moveSync(dest: FakeFile) {
    void this.move(dest);
  }
  static async downloadFileAsync(url: string, dest: FakeFile) {
    fakeFs.writeFile(dest.uri, 1234);
    return dest;
  }
}

class FakeDirectory {
  uri: string;
  constructor(...parts: (string | { uri: string })[]) {
    this.uri = join(parts, true);
  }
  get exists() {
    return fakeFs.entries.get(this.uri)?.kind === 'dir';
  }
  create() {
    fakeFs.entries.set(this.uri, { kind: 'dir' });
  }
  delete() {
    for (const key of [...fakeFs.entries.keys()]) {
      if (key.startsWith(this.uri)) fakeFs.entries.delete(key);
    }
  }
  list() {
    const children: (FakeFile | FakeDirectory)[] = [];
    for (const [key, entry] of fakeFs.entries) {
      if (key === this.uri || !key.startsWith(this.uri)) continue;
      const rest = key.slice(this.uri.length).replace(/\/$/, '');
      if (rest.includes('/')) continue;
      children.push(entry.kind === 'file' ? new FakeFile(key) : new FakeDirectory(key));
    }
    return children;
  }
}

export const fakeExpoFileSystem = {
  File: FakeFile,
  Directory: FakeDirectory,
  Paths: {
    get document() {
      return new FakeDirectory(DOCUMENT);
    },
    get cache() {
      return new FakeDirectory(CACHE);
    },
    get availableDiskSpace() {
      return fakeFs.availableDiskSpace;
    },
  },
};

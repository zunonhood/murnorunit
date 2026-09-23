import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export class JsonStateStore {
  constructor(path) {
    if (!path) throw new TypeError('State path is required');
    this.path = path;
  }

  async load() {
    try {
      return JSON.parse(await readFile(this.path, 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
  }

  async save(state) {
    await mkdir(dirname(this.path), { recursive: true });
    const temporary = this.path + '.tmp';
    await writeFile(temporary, JSON.stringify(state, null, 2) + '\n', 'utf8');
    await rename(temporary, this.path);
  }
}

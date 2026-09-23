import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export class FileEpochStore {
  constructor(directory) {
    if (!directory) throw new TypeError('Store directory is required');
    this.directory = directory;
  }

  async save(record) {
    await mkdir(this.directory, { recursive: true });
    const name = String(record.epoch).padStart(12, '0') + '.json';
    const target = join(this.directory, name);
    const temporary = target + '.tmp';
    await writeFile(temporary, JSON.stringify(record, null, 2) + '\n', {
      encoding: 'utf8',
      flag: 'wx'
    });
    await rename(temporary, target);
    const latest = join(this.directory, 'latest');
    const latestTemporary = latest + '.tmp';
    await writeFile(latestTemporary, name + '\n', 'utf8');
    await rename(latestTemporary, latest);
    return target;
  }

  async latest() {
    try {
      const name = (await readFile(join(this.directory, 'latest'), 'utf8')).trim();
      if (!/^\d{12}\.json$/.test(name)) throw new Error('Invalid latest epoch pointer');
      return JSON.parse(await readFile(join(this.directory, name), 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
  }
}

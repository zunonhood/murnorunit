import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { signEpoch, verifyEpochSignature } from '../../core/src/index.mjs';

export class SignedEpochPublisher {
  constructor({ directory, privateKeyPath }) {
    if (!directory || !privateKeyPath) {
      throw new TypeError('Publisher directory and privateKeyPath are required');
    }
    this.directory = directory;
    this.privateKeyPath = privateKeyPath;
  }

  async publish(record) {
    const privateKey = await readFile(this.privateKeyPath, 'utf8');
    const envelope = signEpoch(record, privateKey);
    await mkdir(this.directory, { recursive: true });
    const name = String(record.epoch).padStart(12, '0') + '.json';
    const target = join(this.directory, name);
    try {
      const existing = JSON.parse(await readFile(target, 'utf8'));
      if (!verifyEpochSignature(existing.record, existing.signature) ||
          existing.record.commitment !== record.commitment ||
          existing.signature.publicKey !== envelope.publicKey) {
        throw new Error('Published epoch conflicts with immutable record: ' + record.epoch);
      }
      return target;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    const temporary = target + '.tmp';
    await writeFile(temporary, JSON.stringify({
      schema: 'murno.public-epoch.v1',
      record,
      signature: envelope
    }, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' });
    await rename(temporary, target);
    return target;
  }
}

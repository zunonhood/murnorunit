import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCommitment, verifyEpochSignature } from '../../core/src/index.mjs';
import { SignedEpochPublisher } from '../src/epoch-publisher.mjs';

function epochRecord() {
  const body = {
    schema: 'murno.epoch.v1',
    epoch: 0,
    observedAt: '2026-09-23T00:00:00.000Z',
    previousCommitment: null,
    policyVersion: 'publisher-test-v1',
    windowCount: 0,
    acceptedCount: 0,
    rejectedCount: 0,
    trainingBatchCommitment: createCommitment([]),
    signals: [],
    modelState: { revision: 0 }
  };
  return { ...body, commitment: createCommitment(body) };
}

test('publishes an idempotent signed public epoch', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'murno-publisher-'));
  try {
    const keys = generateKeyPairSync('ed25519');
    const keyPath = join(directory, 'private.pem');
    await writeFile(keyPath, keys.privateKey.export({
      type: 'pkcs8',
      format: 'pem'
    }));
    const publisher = new SignedEpochPublisher({
      directory: join(directory, 'public'),
      privateKeyPath: keyPath
    });
    const record = epochRecord();
    const first = await publisher.publish(record);
    const second = await publisher.publish(record);
    assert.equal(first, second);
    const published = JSON.parse(await readFile(first, 'utf8'));
    assert.equal(published.schema, 'murno.public-epoch.v1');
    assert.equal(verifyEpochSignature(published.record, published.signature), true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

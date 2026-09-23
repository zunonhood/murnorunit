import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PythonTrainerAdapter } from '../src/index.mjs';

const policy = {
  version: 'python-bridge-test-v1',
  minimumEvents: 2,
  minimumIndependentActors: 2,
  minimumMedianHoldSlots: 10,
  minimumMedianLiquidity: 100
};

test('trains the private Python model through the protocol adapter', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'murno-python-'));
  try {
    const trainer = new PythonTrainerAdapter({
      policy,
      checkpointPath: join(directory, 'checkpoint.json'),
      scriptPath: fileURLToPath(new URL('../../model/train.py', import.meta.url)),
      epochs: 4,
      learningRate: 0.1
    });
    const batch = [{
      id: 'window-1',
      influence: 0.08,
      features: {
        eventCount: 8,
        independentActorCount: 6,
        actorConcentration: 0.2,
        reversalRate: 0.1,
        medianHoldSlots: 30,
        medianLiquidity: 400
      }
    }];
    const receipt = await trainer.update(batch, { epoch: 0 });
    assert.equal(receipt.schema, 'murno.training-receipt.v1');
    assert.equal(receipt.observationCount, 1);
    assert.equal(receipt.revision, 1);
    assert.match(receipt.checkpointDigest, /^[a-f0-9]{64}$/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

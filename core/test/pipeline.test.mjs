import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildMarketWindows,
  createActorPseudonymizer,
  createPolicy,
  createTrainerAdapter,
  deduplicateObservations,
  FileEpochStore,
  MurnoRuntime
} from '../src/index.mjs';

function observation(signature, slot, overrides = {}) {
  return {
    signature,
    slot,
    wallet: 'wallet-' + signature,
    notional: 10,
    holdSlots: 20,
    liquidity: 500,
    reversed: false,
    ...overrides
  };
}

const policy = createPolicy({
  version: 'pipeline-test-v1',
  minimumEvents: 2,
  minimumIndependentActors: 2,
  maximumActorConcentration: 0.6,
  maximumReversalRate: 0.5,
  minimumMedianHoldSlots: 10,
  minimumMedianLiquidity: 100,
  acceptConfidence: 0.6,
  reviewConfidence: 0.4,
  maximumSignalInfluence: 0.1,
  weights: {
    persistence: 1,
    distribution: 1,
    liquidity: 1,
    lowReversal: 1
  }
});

test('deduplicates events before building fixed slot windows', () => {
  const observations = [
    observation('a', 105),
    observation('a', 105),
    observation('b', 111),
    observation('c', 125)
  ];
  assert.equal(deduplicateObservations(observations).length, 3);
  const windows = buildMarketWindows(observations, { genesisSlot: 100, windowSlots: 20 });
  assert.equal(windows.length, 2);
  assert.deepEqual(windows.map(item => item.events.length), [2, 1]);
  assert.equal(windows[0].id, '100-119');
});

test('creates stable domain-separated actor pseudonyms', () => {
  const secret = 'a-private-secret-with-at-least-32-characters';
  const first = createActorPseudonymizer(secret, 'murno.test');
  const second = createActorPseudonymizer(secret, 'murno.other');
  assert.equal(first('wallet-a'), first('wallet-a'));
  assert.notEqual(first('wallet-a'), first('wallet-b'));
  assert.notEqual(first('wallet-a'), second('wallet-a'));
  assert.match(first('wallet-a'), /^[a-f0-9]{64}$/);
});

test('publishes receipts while retaining private trainer state', async () => {
  const trainer = createTrainerAdapter({
    initialState: { weight: 0 },
    async train({ batch, previousState }) {
      return {
        state: { weight: previousState.weight + batch.length },
        metrics: { accepted: batch.length }
      };
    }
  });
  const receipt = await trainer.update([{ id: 'signal' }], { epoch: 1 });
  assert.equal(receipt.observationCount, 1);
  assert.equal(receipt.weight, undefined);
  assert.match(receipt.checkpointDigest, /^[a-f0-9]{64}$/);
  const unchanged = await trainer.update([], { epoch: 2 });
  assert.equal(unchanged.revision, receipt.revision);
  assert.equal(unchanged.observationCount, 0);
});

test('persists epochs and resumes their commitment chain', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'murno-store-'));
  try {
    const store = new FileEpochStore(directory);
    const trainer = createTrainerAdapter({
      async train({ batch }) {
        return { state: { count: batch.length }, metrics: {} };
      }
    });
    const runtime = new MurnoRuntime({ policy, model: trainer, store });
    const events = [
      observation('one', 100, { actorId: 'one' }),
      observation('two', 101, { actorId: 'two' })
    ];
    const windows = buildMarketWindows(events, { genesisSlot: 100, windowSlots: 20 });
    const first = await runtime.process({
      epoch: 0,
      windows,
      observedAt: '2026-09-23T00:00:00.000Z'
    });
    const second = await runtime.process({
      epoch: 1,
      windows: [],
      observedAt: '2026-09-23T00:01:00.000Z'
    });
    assert.equal(second.previousCommitment, first.commitment);
    assert.equal((await store.latest()).epoch, 1);
    await assert.rejects(() => runtime.process({ epoch: 3, windows: [] }), /continue/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

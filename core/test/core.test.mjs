import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createPolicy,
  evaluateSignal,
  extractFeatures,
  runEpoch
} from '../src/index.mjs';

const policy = createPolicy({
  version: 'test-policy-v1',
  minimumEvents: 4,
  minimumIndependentActors: 4,
  maximumActorConcentration: 0.35,
  maximumReversalRate: 0.4,
  minimumMedianHoldBlocks: 10,
  minimumMedianLiquidity: 100,
  acceptConfidence: 0.7,
  reviewConfidence: 0.5,
  maximumSignalInfluence: 0.08,
  weights: {
    persistence: 1,
    distribution: 1,
    liquidity: 1,
    lowReversal: 1
  }
});

function event(index, overrides = {}) {
  return {
    transactionHash: 'transaction-' + index,
    wallet: 'wallet-' + index,
    actorId: 'actor-' + index,
    notional: 100,
    holdBlocks: 20,
    liquidity: 200,
    reversed: false,
    ...overrides
  };
}

function window(id, events) {
  return { id, startBlock: 100, endBlock: 120, events };
}

test('clusters wallets that belong to one independent actor', () => {
  const events = [0, 1, 2, 3].map(index => event(index, { actorId: 'same-actor' }));
  const features = extractFeatures(window('clustered', events));
  assert.equal(features.walletCount, 4);
  assert.equal(features.independentActorCount, 1);
  assert.equal(evaluateSignal(window('clustered', events), policy).status, 'rejected');
});

test('accepts a persistent and distributed market signal', () => {
  const result = evaluateSignal(window('distributed', [0, 1, 2, 3].map(event)), policy);
  assert.equal(result.status, 'accepted');
  assert.ok(result.influence > 0);
  assert.ok(result.influence <= policy.maximumSignalInfluence);
});

test('links every epoch to the previous public commitment', async () => {
  const model = {
    async update(batch, context) {
      return { revision: context.epoch, observations: batch.length };
    }
  };
  const first = await runEpoch({
    epoch: 1,
    windows: [window('first', [0, 1, 2, 3].map(event))],
    policy,
    model,
    observedAt: '2026-09-23T00:00:00.000Z'
  });
  const second = await runEpoch({
    epoch: 2,
    windows: [],
    policy,
    model,
    previousCommitment: first.commitment,
    observedAt: '2026-09-23T00:01:00.000Z'
  });
  assert.match(first.commitment, /^[a-f0-9]{64}$/);
  assert.equal(second.previousCommitment, first.commitment);
  assert.notEqual(second.commitment, first.commitment);
});

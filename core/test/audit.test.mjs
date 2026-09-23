import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import {
  auditEpochChain,
  createCommitment,
  signEpoch,
  verifyEpochCommitment,
  verifyEpochSignature
} from '../src/index.mjs';

function record(epoch, previousCommitment = null) {
  const body = {
    schema: 'murno.epoch.v1',
    epoch,
    observedAt: '2026-09-23T00:00:00.000Z',
    previousCommitment,
    policyVersion: 'audit-test-v1',
    windowCount: 0,
    acceptedCount: 0,
    rejectedCount: 0,
    trainingBatchCommitment: createCommitment([]),
    signals: [],
    modelState: { revision: epoch }
  };
  return { ...body, commitment: createCommitment(body) };
}

test('signs and verifies a valid epoch without exposing the private key', () => {
  const keys = generateKeyPairSync('ed25519');
  const epoch = record(0);
  const envelope = signEpoch(epoch, keys.privateKey);
  assert.equal(verifyEpochCommitment(epoch), true);
  assert.equal(verifyEpochSignature(epoch, envelope), true);
  assert.equal(Object.hasOwn(envelope, 'privateKey'), false);
  assert.equal(verifyEpochSignature({ ...epoch, acceptedCount: 1 }, envelope), false);
});

test('detects commitment tampering and broken epoch links', () => {
  const first = record(0);
  const second = record(1, first.commitment);
  assert.equal(auditEpochChain([first, second]).valid, true);
  const broken = { ...second, previousCommitment: '0'.repeat(64) };
  const audit = auditEpochChain([first, broken]);
  assert.equal(audit.valid, false);
  assert.ok(audit.errors.some(error => error.reason === 'broken_commitment_link'));
});

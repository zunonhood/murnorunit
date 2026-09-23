import {
  createPrivateKey,
  createPublicKey,
  sign,
  verify
} from 'node:crypto';
import { canonicalJson, createCommitment } from './commitment.mjs';

function unsignedRecord(record) {
  const { commitment, ...body } = record;
  return body;
}

function signingPayload(record) {
  return Buffer.from(canonicalJson({
    schema: 'murno.epoch-signature.v1',
    epoch: record.epoch,
    commitment: record.commitment,
    previousCommitment: record.previousCommitment
  }));
}

export function verifyEpochCommitment(record) {
  return Boolean(
    record &&
    /^[a-f0-9]{64}$/.test(record.commitment || '') &&
    createCommitment(unsignedRecord(record)) === record.commitment
  );
}

export function signEpoch(record, privateKey) {
  if (!verifyEpochCommitment(record)) throw new Error('Cannot sign an invalid epoch commitment');
  const key = privateKey?.type === 'private' ? privateKey : createPrivateKey(privateKey);
  const publicKey = createPublicKey(key);
  return Object.freeze({
    schema: 'murno.epoch-signature.v1',
    epoch: record.epoch,
    commitment: record.commitment,
    algorithm: 'Ed25519',
    publicKey: publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
    signature: sign(null, signingPayload(record), key).toString('base64')
  });
}

export function verifyEpochSignature(record, envelope) {
  if (!verifyEpochCommitment(record)) return false;
  if (!envelope || envelope.schema !== 'murno.epoch-signature.v1' ||
      envelope.algorithm !== 'Ed25519' ||
      envelope.epoch !== record.epoch ||
      envelope.commitment !== record.commitment) return false;
  try {
    const publicKey = createPublicKey({
      key: Buffer.from(envelope.publicKey, 'base64'),
      type: 'spki',
      format: 'der'
    });
    return verify(
      null,
      signingPayload(record),
      publicKey,
      Buffer.from(envelope.signature, 'base64')
    );
  } catch {
    return false;
  }
}

export function auditEpochChain(records) {
  const errors = [];
  records.forEach((record, index) => {
    if (!verifyEpochCommitment(record)) {
      errors.push({ epoch: record?.epoch, reason: 'invalid_commitment' });
    }
    if (index > 0) {
      const previous = records[index - 1];
      if (record.epoch !== previous.epoch + 1) {
        errors.push({ epoch: record.epoch, reason: 'non_contiguous_epoch' });
      }
      if (record.previousCommitment !== previous.commitment) {
        errors.push({ epoch: record.epoch, reason: 'broken_commitment_link' });
      }
    }
  });
  return Object.freeze({
    valid: errors.length === 0,
    records: records.length,
    head: records.at(-1)?.commitment || null,
    errors: Object.freeze(errors)
  });
}

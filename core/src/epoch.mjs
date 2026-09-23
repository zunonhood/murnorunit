import { evaluateSignal } from './evaluate.mjs';
import { createCommitment } from './commitment.mjs';

export async function runEpoch({
  epoch,
  windows,
  policy,
  model,
  previousCommitment = null,
  observedAt = new Date().toISOString()
}) {
  if (!Number.isInteger(epoch) || epoch < 0) throw new TypeError('Epoch must be a non-negative integer');
  if (!Array.isArray(windows)) throw new TypeError('Market windows are required');
  if (!model || typeof model.update !== 'function') throw new TypeError('A model adapter with update() is required');

  const evaluated = windows.map(window => ({
    id: window.id,
    startSlot: window.startSlot,
    endSlot: window.endSlot,
    result: evaluateSignal(window, policy)
  }));
  const accepted = evaluated.filter(signal => signal.result.influence > 0);
  const trainingBatch = accepted.map(signal => ({
    id: signal.id,
    influence: signal.result.influence,
    features: signal.result.features
  }));
  const modelState = await model.update(trainingBatch, {
    epoch,
    previousCommitment,
    policyVersion: policy.version
  });
  const record = {
    schema: 'murno.epoch.v1',
    epoch,
    observedAt,
    previousCommitment,
    policyVersion: policy.version,
    windowCount: windows.length,
    acceptedCount: accepted.length,
    rejectedCount: windows.length - accepted.length,
    trainingBatchCommitment: createCommitment(trainingBatch),
    signals: evaluated,
    modelState
  };
  return Object.freeze({
    ...record,
    commitment: createCommitment(record)
  });
}

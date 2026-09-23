import { createCommitment } from './commitment.mjs';

export function createTrainerAdapter({ train, initialState = null }) {
  if (typeof train !== 'function') throw new TypeError('Trainer function is required');
  let privateState = initialState;
  let revision = 0;

  return Object.freeze({
    async update(batch, context) {
      if (!Array.isArray(batch)) throw new TypeError('Training batch must be an array');
      if (batch.length === 0) {
        return Object.freeze({
          revision,
          observationCount: 0,
          checkpointDigest: createCommitment(privateState),
          metricsDigest: createCommitment({})
        });
      }
      const result = await train({
        batch,
        context,
        previousState: privateState
      });
      if (!result || !Object.hasOwn(result, 'state')) {
        throw new TypeError('Trainer must return a private state');
      }
      privateState = result.state;
      revision += 1;
      return Object.freeze({
        revision,
        observationCount: batch.length,
        checkpointDigest: createCommitment(privateState),
        metricsDigest: createCommitment(result.metrics || {})
      });
    }
  });
}

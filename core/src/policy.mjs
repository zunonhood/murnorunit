const REQUIRED_THRESHOLDS = [
  'minimumEvents', 'minimumIndependentActors', 'maximumActorConcentration',
  'maximumReversalRate', 'minimumMedianHoldSlots', 'minimumMedianLiquidity',
  'acceptConfidence', 'reviewConfidence', 'maximumSignalInfluence'
];
const REQUIRED_WEIGHTS = ['persistence', 'distribution', 'liquidity', 'lowReversal'];

export function createPolicy(input) {
  if (!input || typeof input !== 'object') throw new TypeError('Policy is required');
  if (!input.version) throw new TypeError('Policy version is required');
  for (const key of REQUIRED_THRESHOLDS) {
    if (!Number.isFinite(input[key])) throw new TypeError('Missing numeric policy field: ' + key);
  }
  for (const key of ['minimumEvents', 'minimumIndependentActors', 'minimumMedianHoldSlots', 'minimumMedianLiquidity']) {
    if (input[key] <= 0) throw new RangeError(key + ' must be greater than zero');
  }
  for (const key of ['maximumActorConcentration', 'maximumReversalRate', 'acceptConfidence', 'reviewConfidence']) {
    if (input[key] < 0 || input[key] > 1) throw new RangeError(key + ' must be between zero and one');
  }
  if (!input.weights || typeof input.weights !== 'object') throw new TypeError('Policy weights are required');
  for (const key of REQUIRED_WEIGHTS) {
    if (!Number.isFinite(input.weights[key]) || input.weights[key] < 0) {
      throw new TypeError('Invalid policy weight: ' + key);
    }
  }
  const total = REQUIRED_WEIGHTS.reduce((sum, key) => sum + input.weights[key], 0);
  if (total <= 0) throw new RangeError('Policy weights require a positive total');
  if (input.reviewConfidence > input.acceptConfidence) throw new RangeError('Review threshold exceeds accept threshold');
  if (input.maximumSignalInfluence < 0 || input.maximumSignalInfluence > 1) {
    throw new RangeError('Maximum influence must be between zero and one');
  }
  return Object.freeze({ ...input, weights: Object.freeze({ ...input.weights }) });
}

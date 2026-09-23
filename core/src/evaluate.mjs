import { extractFeatures } from './features.mjs';
const clamp = value => Math.max(0, Math.min(1, value));

export function evaluateSignal(window, policy) {
  const features = extractFeatures(window);
  const checks = {
    enoughEvents: features.eventCount >= policy.minimumEvents,
    enoughIndependentActors: features.independentActorCount >= policy.minimumIndependentActors,
    distributedActors: features.actorConcentration <= policy.maximumActorConcentration,
    acceptableReversal: features.reversalRate <= policy.maximumReversalRate,
    persistentPositions: features.medianHoldBlocks >= policy.minimumMedianHoldBlocks,
    usableLiquidity: features.medianLiquidity >= policy.minimumMedianLiquidity
  };
  const components = {
    persistence: clamp(features.medianHoldBlocks / policy.minimumMedianHoldBlocks),
    distribution: clamp(1 - features.actorConcentration / policy.maximumActorConcentration),
    liquidity: clamp(features.medianLiquidity / policy.minimumMedianLiquidity),
    lowReversal: clamp(1 - features.reversalRate / policy.maximumReversalRate)
  };
  const weightTotal = Object.values(policy.weights).reduce((sum, value) => sum + value, 0);
  const confidence = Object.entries(components).reduce((sum, [key, value]) => {
    return sum + value * policy.weights[key];
  }, 0) / weightTotal;
  const hardFailure = !checks.enoughEvents || !checks.enoughIndependentActors ||
    !checks.distributedActors || !checks.usableLiquidity;
  let status = 'rejected';
  if (!hardFailure && confidence >= policy.acceptConfidence) status = 'accepted';
  else if (!hardFailure && confidence >= policy.reviewConfidence) status = 'reduced';
  const influence = status === 'rejected' ? 0 :
    Math.min(policy.maximumSignalInfluence, policy.maximumSignalInfluence * confidence);
  return Object.freeze({ status, confidence, influence, checks: Object.freeze(checks), features });
}

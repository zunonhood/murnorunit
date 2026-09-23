import { createHmac } from 'node:crypto';

export function createActorPseudonymizer(secret, domain = 'murno.actor.v1') {
  if (typeof secret !== 'string' || secret.length < 32) {
    throw new TypeError('Pseudonymization secret must contain at least 32 characters');
  }
  return wallet => {
    if (!wallet) throw new TypeError('Wallet is required');
    return createHmac('sha256', secret)
      .update(domain)
      .update('\0')
      .update(String(wallet))
      .digest('hex');
  };
}

export function attachActorIds(observations, resolveActor) {
  if (typeof resolveActor !== 'function') throw new TypeError('Actor resolver is required');
  return observations.map(observation => Object.freeze({
    ...observation,
    actorId: String(resolveActor(observation.wallet, observation))
  }));
}

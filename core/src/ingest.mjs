const requiredNumbers = ['slot', 'notional', 'holdSlots', 'liquidity'];

export function normalizeObservation(raw) {
  if (!raw || typeof raw !== 'object') throw new TypeError('Observation is required');
  if (!raw.signature || !raw.wallet) throw new TypeError('Observation requires signature and wallet');
  for (const field of requiredNumbers) {
    if (!Number.isFinite(raw[field]) || raw[field] < 0) {
      throw new TypeError('Invalid observation field: ' + field);
    }
  }
  if (!Number.isInteger(raw.slot)) throw new TypeError('Observation slot must be an integer');
  return Object.freeze({
    signature: String(raw.signature),
    eventIndex: Number.isInteger(raw.eventIndex) ? raw.eventIndex : 0,
    slot: raw.slot,
    wallet: String(raw.wallet),
    actorId: raw.actorId ? String(raw.actorId) : undefined,
    notional: raw.notional,
    holdSlots: raw.holdSlots,
    liquidity: raw.liquidity,
    reversed: raw.reversed === true,
    source: raw.source ? String(raw.source) : 'unknown'
  });
}

export function deduplicateObservations(observations) {
  const unique = new Map();
  for (const raw of observations) {
    const observation = normalizeObservation(raw);
    const key = observation.signature + ':' + observation.eventIndex;
    if (!unique.has(key)) unique.set(key, observation);
  }
  return [...unique.values()].sort((a, b) => a.slot - b.slot ||
    a.signature.localeCompare(b.signature) || a.eventIndex - b.eventIndex);
}

export function buildMarketWindows(observations, { windowSlots, genesisSlot = 0 } = {}) {
  if (!Number.isInteger(windowSlots) || windowSlots <= 0) {
    throw new TypeError('windowSlots must be a positive integer');
  }
  if (!Number.isInteger(genesisSlot) || genesisSlot < 0) {
    throw new TypeError('genesisSlot must be a non-negative integer');
  }
  const groups = new Map();
  for (const observation of deduplicateObservations(observations)) {
    if (observation.slot < genesisSlot) continue;
    const index = Math.floor((observation.slot - genesisSlot) / windowSlots);
    const startSlot = genesisSlot + index * windowSlots;
    const endSlot = startSlot + windowSlots - 1;
    if (!groups.has(index)) {
      groups.set(index, {
        id: startSlot + '-' + endSlot,
        startSlot,
        endSlot,
        events: []
      });
    }
    const { slot, source, ...event } = observation;
    groups.get(index).events.push(event);
  }
  return [...groups.values()].sort((a, b) => a.startSlot - b.startSlot);
}

export async function collectAddressActivity({
  reader,
  address,
  decoder,
  before,
  limit = 1000
}) {
  if (!reader || typeof reader.getSignaturesForAddress !== 'function') {
    throw new TypeError('A Solana reader is required');
  }
  if (typeof decoder !== 'function') throw new TypeError('A transaction decoder is required');
  const signatures = await reader.getSignaturesForAddress(address, { before, limit });
  const observations = [];
  for (const entry of signatures) {
    if (entry.err) continue;
    const transaction = await reader.getTransaction(entry.signature);
    if (!transaction) continue;
    const decoded = await decoder(transaction, entry);
    if (!Array.isArray(decoded)) throw new TypeError('Decoder must return an observation array');
    observations.push(...decoded);
  }
  return deduplicateObservations(observations);
}

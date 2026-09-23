function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function validateMarketWindow(window) {
  if (!window || !Array.isArray(window.events)) throw new TypeError('Market window events are required');
  if (!Number.isInteger(window.startSlot) || !Number.isInteger(window.endSlot)) throw new TypeError('Window slots must be integers');
  if (window.endSlot < window.startSlot) throw new RangeError('Window slot order is invalid');
  const eventKeys = new Set();
  for (const event of window.events) {
    if (!event.signature || !event.wallet) throw new TypeError('Every event requires a signature and wallet');
    const eventKey = event.signature + ':' + (Number.isInteger(event.eventIndex) ? event.eventIndex : 0);
    if (eventKeys.has(eventKey)) throw new RangeError('Duplicate market event: ' + eventKey);
    eventKeys.add(eventKey);
    for (const field of ['notional', 'holdSlots', 'liquidity']) {
      if (!Number.isFinite(event[field]) || event[field] < 0) throw new TypeError('Invalid event field: ' + field);
    }
  }
  return window;
}

export function extractFeatures(window) {
  validateMarketWindow(window);
  const actorVolume = new Map();
  let totalNotional = 0;
  let reversed = 0;
  for (const event of window.events) {
    const actor = event.actorId || event.wallet;
    actorVolume.set(actor, (actorVolume.get(actor) || 0) + event.notional);
    totalNotional += event.notional;
    if (event.reversed === true) reversed += 1;
  }
  let actorConcentration = 0;
  if (totalNotional > 0) {
    for (const value of actorVolume.values()) {
      const share = value / totalNotional;
      actorConcentration += share * share;
    }
  }
  return Object.freeze({
    eventCount: window.events.length,
    walletCount: new Set(window.events.map(event => event.wallet)).size,
    independentActorCount: actorVolume.size,
    totalNotional,
    actorConcentration,
    reversalRate: window.events.length ? reversed / window.events.length : 0,
    medianHoldSlots: median(window.events.map(event => event.holdSlots)),
    medianLiquidity: median(window.events.map(event => event.liquidity))
  });
}

const requiredNumbers = ['blockNumber', 'notional', 'holdBlocks', 'liquidity'];

export function normalizeObservation(raw) {
  if (!raw || typeof raw !== 'object') throw new TypeError('Observation is required');
  if (!raw.transactionHash || !raw.wallet) throw new TypeError('Observation requires transactionHash and wallet');
  for (const field of requiredNumbers) {
    if (!Number.isFinite(raw[field]) || raw[field] < 0) {
      throw new TypeError('Invalid observation field: ' + field);
    }
  }
  if (!Number.isInteger(raw.blockNumber)) throw new TypeError('Observation blockNumber must be an integer');
  return Object.freeze({
    transactionHash: String(raw.transactionHash).toLowerCase(),
    logIndex: Number.isInteger(raw.logIndex) ? raw.logIndex : 0,
    blockNumber: raw.blockNumber,
    wallet: String(raw.wallet).toLowerCase(),
    actorId: raw.actorId ? String(raw.actorId) : undefined,
    notional: raw.notional,
    holdBlocks: raw.holdBlocks,
    liquidity: raw.liquidity,
    reversed: raw.reversed === true,
    source: raw.source ? String(raw.source) : 'unknown'
  });
}

export function deduplicateObservations(observations) {
  const unique = new Map();
  for (const raw of observations) {
    const observation = normalizeObservation(raw);
    const key = observation.transactionHash + ':' + observation.logIndex;
    if (!unique.has(key)) unique.set(key, observation);
  }
  return [...unique.values()].sort((a, b) => a.blockNumber - b.blockNumber ||
    a.transactionHash.localeCompare(b.transactionHash) || a.logIndex - b.logIndex);
}

export function buildMarketWindows(observations, { windowBlocks, genesisBlock = 0 } = {}) {
  if (!Number.isInteger(windowBlocks) || windowBlocks <= 0) {
    throw new TypeError('windowBlocks must be a positive integer');
  }
  if (!Number.isInteger(genesisBlock) || genesisBlock < 0) {
    throw new TypeError('genesisBlock must be a non-negative integer');
  }
  const groups = new Map();
  for (const observation of deduplicateObservations(observations)) {
    if (observation.blockNumber < genesisBlock) continue;
    const index = Math.floor((observation.blockNumber - genesisBlock) / windowBlocks);
    const startBlock = genesisBlock + index * windowBlocks;
    const endBlock = startBlock + windowBlocks - 1;
    if (!groups.has(index)) {
      groups.set(index, {
        id: startBlock + '-' + endBlock,
        startBlock,
        endBlock,
        events: []
      });
    }
    const { blockNumber, source, ...event } = observation;
    groups.get(index).events.push(event);
  }
  return [...groups.values()].sort((a, b) => a.startBlock - b.startBlock);
}

export async function collectContractActivity({
  reader,
  address,
  decoder,
  fromBlock,
  toBlock,
  topics = []
}) {
  if (!reader || typeof reader.getLogs !== 'function' ||
      typeof reader.getTransactionReceipt !== 'function') {
    throw new TypeError('A Robinhood Chain reader is required');
  }
  if (!decoder || typeof decoder.decode !== 'function') throw new TypeError('An EVM receipt decoder is required');
  const logs = await reader.getLogs({ address, fromBlock, toBlock, topics });
  const transactionHashes = [...new Set(logs.map(log => log.transactionHash).filter(Boolean))];
  const observations = [];
  for (const transactionHash of transactionHashes) {
    const receipt = await reader.getTransactionReceipt(transactionHash);
    if (!receipt || receipt.status === '0x0') continue;
    const decoded = decoder.decode(receipt);
    if (!Array.isArray(decoded)) throw new TypeError('Decoder must return an observation array');
    observations.push(...decoded);
  }
  return deduplicateObservations(observations);
}

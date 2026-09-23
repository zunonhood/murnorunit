export const TRANSFER_TOPIC =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

function address(value, label) {
  const normalized = String(value || '').toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(normalized)) throw new TypeError(label + ' must be an EVM address');
  return normalized;
}

function topicAddress(topic) {
  if (typeof topic !== 'string' || !/^0x[0-9a-f]{64}$/i.test(topic)) return null;
  return '0x' + topic.slice(-40).toLowerCase();
}

function decimalAmount(raw, decimals) {
  const value = Number(raw) / (10 ** decimals);
  if (!Number.isFinite(value)) throw new RangeError('Token amount exceeds numeric range');
  return value;
}

function addDelta(map, account, delta) {
  if (account === ZERO_ADDRESS) return;
  map.set(account, (map.get(account) || 0n) + delta);
}

function transferDeltas(receipt, tokenAddress) {
  const deltas = new Map();
  for (const log of receipt.logs || []) {
    if (String(log.address).toLowerCase() !== tokenAddress ||
        String(log.topics?.[0]).toLowerCase() !== TRANSFER_TOPIC ||
        log.topics.length < 3) continue;
    const from = topicAddress(log.topics[1]);
    const to = topicAddress(log.topics[2]);
    if (!from || !to || typeof log.data !== 'string') continue;
    const amount = BigInt(log.data);
    addDelta(deltas, from, -amount);
    addDelta(deltas, to, amount);
  }
  return deltas;
}

export class Erc20TransferDecoder {
  constructor({
    targetToken,
    quoteToken,
    poolAddress,
    targetDecimals,
    quoteDecimals,
    tracker,
    minimumNotional = 0
  }) {
    this.targetToken = address(targetToken, 'targetToken');
    this.quoteToken = address(quoteToken, 'quoteToken');
    this.poolAddress = address(poolAddress, 'poolAddress');
    if (!Number.isInteger(targetDecimals) || targetDecimals < 0 ||
        !Number.isInteger(quoteDecimals) || quoteDecimals < 0) {
      throw new TypeError('Token decimals must be non-negative integers');
    }
    if (!tracker) throw new TypeError('Position tracker is required');
    this.targetDecimals = targetDecimals;
    this.quoteDecimals = quoteDecimals;
    this.tracker = tracker;
    this.minimumNotional = minimumNotional;
  }

  decode(receipt, { liquidityRaw } = {}) {
    if (!receipt || receipt.status === '0x0' || !receipt.transactionHash) return [];
    const blockNumber = Number.parseInt(receipt.blockNumber, 16);
    if (!Number.isSafeInteger(blockNumber)) return [];
    if (typeof liquidityRaw !== 'bigint' || liquidityRaw <= 0n) return [];
    const target = transferDeltas(receipt, this.targetToken);
    const quote = transferDeltas(receipt, this.quoteToken);
    const wallets = new Set([...target.keys(), ...quote.keys()]);
    wallets.delete(this.poolAddress);
    wallets.delete(ZERO_ADDRESS);
    const liquidity = decimalAmount(liquidityRaw, this.quoteDecimals);
    const observations = [];
    let logIndex = 0;
    for (const wallet of wallets) {
      const tokenDelta = target.get(wallet) || 0n;
      const quoteDelta = quote.get(wallet) || 0n;
      if (tokenDelta === 0n || quoteDelta === 0n ||
          (tokenDelta > 0n) === (quoteDelta > 0n)) continue;
      const notional = Math.abs(decimalAmount(quoteDelta, this.quoteDecimals));
      if (notional < this.minimumNotional) continue;
      const side = tokenDelta > 0n ? 'buy' : 'sell';
      const position = this.tracker.observe({
        wallet,
        side,
        blockNumber,
        tokenDelta
      });
      observations.push({
        transactionHash: receipt.transactionHash.toLowerCase(),
        logIndex: logIndex++,
        blockNumber,
        wallet,
        notional,
        holdBlocks: position.holdBlocks,
        liquidity,
        reversed: position.reversed,
        source: 'erc20-transfer-delta:' + side
      });
    }
    return observations;
  }
}

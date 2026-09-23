export class PositionTracker {
  constructor({ reversalBlocks = 150, state = {} } = {}) {
    if (!Number.isInteger(reversalBlocks) || reversalBlocks <= 0) {
      throw new TypeError('reversalBlocks must be a positive integer');
    }
    this.reversalBlocks = reversalBlocks;
    this.positions = new Map(Object.entries(state));
  }

  observe({ wallet, side, blockNumber, tokenDelta }) {
    const prior = this.positions.get(wallet);
    const reversed = Boolean(
      prior && prior.lastSide !== side &&
      blockNumber - prior.lastBlock <= this.reversalBlocks
    );
    let openedBlock = prior?.openedBlock ?? null;
    let balanceRaw = BigInt(prior?.balanceRaw || '0') + tokenDelta;
    if (balanceRaw < 0n) balanceRaw = 0n;
    if (side === 'buy' && openedBlock === null) openedBlock = blockNumber;
    const holdBlocks = openedBlock === null ? 0 : Math.max(0, blockNumber - openedBlock);
    if (balanceRaw === 0n) openedBlock = null;
    this.positions.set(wallet, {
      lastSide: side,
      lastBlock: blockNumber,
      openedBlock,
      balanceRaw: balanceRaw.toString()
    });
    return { reversed, holdBlocks };
  }

  snapshot() {
    return Object.fromEntries(this.positions);
  }

  restore(state = {}) {
    this.positions = new Map(Object.entries(state));
  }
}

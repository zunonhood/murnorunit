export class PositionTracker {
  constructor({ reversalSlots = 150, state = {} } = {}) {
    if (!Number.isInteger(reversalSlots) || reversalSlots <= 0) {
      throw new TypeError('reversalSlots must be a positive integer');
    }
    this.reversalSlots = reversalSlots;
    this.positions = new Map(Object.entries(state));
  }

  observe({ wallet, side, slot, remainingBalance }) {
    const prior = this.positions.get(wallet);
    const reversed = Boolean(
      prior && prior.lastSide !== side && slot - prior.lastSlot <= this.reversalSlots
    );
    let openedSlot = prior ? prior.openedSlot : null;
    if (side === 'buy' && openedSlot === null) openedSlot = slot;
    const holdSlots = side === 'sell' && openedSlot !== null ? Math.max(0, slot - openedSlot) :
      openedSlot === null ? 0 : Math.max(0, slot - openedSlot);
    if (remainingBalance <= 0) openedSlot = null;
    this.positions.set(wallet, { lastSide: side, lastSlot: slot, openedSlot });
    return { reversed, holdSlots };
  }

  snapshot() {
    return Object.fromEntries(this.positions);
  }

  restore(state = {}) {
    this.positions = new Map(Object.entries(state));
  }
}

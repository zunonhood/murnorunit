import { attachActorIds, buildMarketWindows, deduplicateObservations } from '../../core/src/index.mjs';

export class ContinuousMurnoNode {
  constructor({
    reader,
    runtime,
    decoder,
    tracker,
    stateStore,
    publisher = null,
    monitorAddress,
    actorResolver,
    windowSlots,
    genesisSlot,
    finalityLagSlots = 32,
    pageSize = 1000,
    maxPages = 20
  }) {
    if (!reader || !runtime || !decoder || !tracker || !stateStore) {
      throw new TypeError('Reader, runtime, decoder, tracker and state store are required');
    }
    if (!monitorAddress || typeof actorResolver !== 'function') {
      throw new TypeError('Monitor address and actor resolver are required');
    }
    this.reader = reader;
    this.runtime = runtime;
    this.decoder = decoder;
    this.tracker = tracker;
    this.stateStore = stateStore;
    this.publisher = publisher;
    this.monitorAddress = monitorAddress;
    this.actorResolver = actorResolver;
    this.windowSlots = windowSlots;
    this.genesisSlot = genesisSlot;
    this.finalityLagSlots = finalityLagSlots;
    this.pageSize = pageSize;
    this.maxPages = maxPages;
    this.running = false;
  }

  async signaturesSince(cursor) {
    const entries = [];
    let before;
    for (let pageNumber = 0; pageNumber < this.maxPages; pageNumber += 1) {
      const options = { limit: this.pageSize };
      if (cursor) options.until = cursor;
      if (before) options.before = before;
      const page = await this.reader.getSignaturesForAddress(this.monitorAddress, options);
      if (!Array.isArray(page)) throw new TypeError('Solana signature response must be an array');
      entries.push(...page.filter(entry => !entry.err));
      if (page.length < this.pageSize) return entries;
      before = page.at(-1)?.signature;
      if (!before) return entries;
    }
    throw new Error('Signature backfill exceeded maxPages; state was not advanced');
  }

  async loadState() {
    const stored = await this.stateStore.load();
    const state = stored || {
      schema: 'murno.node-state.v1',
      cursor: null,
      nextEpoch: 0,
      pending: [],
      positions: {}
    };
    if (state.schema !== 'murno.node-state.v1') throw new Error('Unsupported node state schema');
    this.tracker.restore(state.positions);
    const latest = await this.runtime.store.latest();
    if (latest && this.publisher) await this.publisher.publish(latest);
    if (latest && state.nextEpoch <= latest.epoch) {
      const completed = new Set(latest.signals.map(signal => signal.id));
      state.pending = state.pending.filter(observation => {
        const start = this.genesisSlot +
          Math.floor((observation.slot - this.genesisSlot) / this.windowSlots) * this.windowSlots;
        return !completed.has(start + '-' + (start + this.windowSlots - 1));
      });
      state.nextEpoch = latest.epoch + 1;
      await this.stateStore.save(state);
    }
    return state;
  }

  async pollOnce() {
    if (this.running) throw new Error('A node poll is already running');
    this.running = true;
    try {
      const state = await this.loadState();
      const entries = await this.signaturesSince(state.cursor);
      const chronological = [...entries].sort((a, b) => a.slot - b.slot);
      const decoded = [];
      for (const entry of chronological) {
        const transaction = await this.reader.getTransaction(entry.signature);
        if (!transaction) continue;
        decoded.push(...this.decoder.decode(transaction, entry));
      }
      const privateObservations = attachActorIds(decoded, this.actorResolver);
      state.pending = deduplicateObservations([...state.pending, ...privateObservations]);
      if (entries.length) state.cursor = entries[0].signature;
      state.positions = this.tracker.snapshot();
      await this.stateStore.save(state);

      const confirmedSlot = await this.reader.getSlot('confirmed');
      const safeSlot = confirmedSlot - this.finalityLagSlots;
      const windows = buildMarketWindows(state.pending, {
        windowSlots: this.windowSlots,
        genesisSlot: this.genesisSlot
      });
      const completed = [];
      for (const window of windows) {
        if (window.endSlot > safeSlot) continue;
        const record = await this.runtime.process({
          epoch: state.nextEpoch,
          windows: [window],
          observedAt: new Date().toISOString()
        });
        if (this.publisher) await this.publisher.publish(record);
        state.nextEpoch += 1;
        completed.push(window.id);
        state.pending = state.pending.filter(observation =>
          observation.slot < window.startSlot || observation.slot > window.endSlot
        );
        await this.stateStore.save(state);
      }
      return Object.freeze({
        fetchedSignatures: entries.length,
        decodedObservations: decoded.length,
        completedEpochs: completed,
        pendingObservations: state.pending.length,
        cursor: state.cursor,
        safeSlot
      });
    } finally {
      this.running = false;
    }
  }
}

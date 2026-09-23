import { attachActorIds, buildMarketWindows, deduplicateObservations } from '../../core/src/index.mjs';
import { TRANSFER_TOPIC } from './balance-decoder.mjs';

export class ContinuousMurnoNode {
  constructor({
    reader,
    runtime,
    decoder,
    tracker,
    stateStore,
    publisher = null,
    actorResolver,
    windowBlocks,
    genesisBlock,
    finalityLagBlocks = 20,
    blockRange = 2000,
    maxRanges = 20
  }) {
    if (!reader || !runtime || !decoder || !tracker || !stateStore) {
      throw new TypeError('Reader, runtime, decoder, tracker and state store are required');
    }
    if (typeof actorResolver !== 'function') throw new TypeError('Actor resolver is required');
    this.reader = reader;
    this.runtime = runtime;
    this.decoder = decoder;
    this.tracker = tracker;
    this.stateStore = stateStore;
    this.publisher = publisher;
    this.actorResolver = actorResolver;
    this.windowBlocks = windowBlocks;
    this.genesisBlock = genesisBlock;
    this.finalityLagBlocks = finalityLagBlocks;
    this.blockRange = blockRange;
    this.maxRanges = maxRanges;
    this.running = false;
  }

  async logsBetween(fromBlock, toBlock) {
    if (fromBlock > toBlock) return [];
    const rangeCount = Math.ceil((toBlock - fromBlock + 1) / this.blockRange);
    if (rangeCount > this.maxRanges) {
      throw new Error('Log backfill exceeded maxRanges; state was not advanced');
    }
    const logs = [];
    for (let start = fromBlock; start <= toBlock; start += this.blockRange) {
      const end = Math.min(toBlock, start + this.blockRange - 1);
      const page = await this.reader.getLogs({
        address: this.decoder.targetToken,
        fromBlock: start,
        toBlock: end,
        topics: [TRANSFER_TOPIC]
      });
      if (!Array.isArray(page)) throw new TypeError('Robinhood Chain log response must be an array');
      logs.push(...page);
    }
    return logs;
  }

  async loadState() {
    const stored = await this.stateStore.load();
    const state = stored || {
      schema: 'murno.robinhood-node-state.v1',
      cursorBlock: null,
      nextEpoch: 0,
      pending: [],
      positions: {}
    };
    if (state.schema !== 'murno.robinhood-node-state.v1') {
      throw new Error('Unsupported node state schema; migrate or start a new Robinhood Chain data directory');
    }
    this.tracker.restore(state.positions);
    const latest = await this.runtime.store.latest();
    if (latest && this.publisher) await this.publisher.publish(latest);
    if (latest && state.nextEpoch <= latest.epoch) {
      const completed = new Set(latest.signals.map(signal => signal.id));
      state.pending = state.pending.filter(observation => {
        const start = this.genesisBlock +
          Math.floor((observation.blockNumber - this.genesisBlock) / this.windowBlocks) * this.windowBlocks;
        return !completed.has(start + '-' + (start + this.windowBlocks - 1));
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
      const chainHead = await this.reader.getBlockNumber();
      const safeBlock = Math.max(0, chainHead - this.finalityLagBlocks);
      const fromBlock = state.cursorBlock === null ? this.genesisBlock : state.cursorBlock + 1;
      const logs = await this.logsBetween(fromBlock, safeBlock);
      const transactionHashes = [...new Set(logs.map(log => log.transactionHash).filter(Boolean))];
      const receipts = [];
      for (const transactionHash of transactionHashes) {
        const receipt = await this.reader.getTransactionReceipt(transactionHash);
        if (receipt && receipt.status !== '0x0') receipts.push(receipt);
      }
      receipts.sort((a, b) => Number.parseInt(a.blockNumber, 16) - Number.parseInt(b.blockNumber, 16));
      const decoded = [];
      for (const receipt of receipts) {
        const blockNumber = Number.parseInt(receipt.blockNumber, 16);
        const liquidityRaw = await this.reader.getTokenBalance(
          this.decoder.quoteToken,
          this.decoder.poolAddress,
          blockNumber
        );
        decoded.push(...this.decoder.decode(receipt, { liquidityRaw }));
      }
      const privateObservations = attachActorIds(decoded, this.actorResolver);
      state.pending = deduplicateObservations([...state.pending, ...privateObservations]);
      if (fromBlock <= safeBlock) state.cursorBlock = safeBlock;
      state.positions = this.tracker.snapshot();
      await this.stateStore.save(state);

      const windows = buildMarketWindows(state.pending, {
        windowBlocks: this.windowBlocks,
        genesisBlock: this.genesisBlock
      });
      const completed = [];
      for (const window of windows) {
        if (window.endBlock > safeBlock) continue;
        const record = await this.runtime.process({
          epoch: state.nextEpoch,
          windows: [window],
          observedAt: new Date().toISOString()
        });
        if (this.publisher) await this.publisher.publish(record);
        state.nextEpoch += 1;
        completed.push(window.id);
        state.pending = state.pending.filter(observation =>
          observation.blockNumber < window.startBlock || observation.blockNumber > window.endBlock
        );
        await this.stateStore.save(state);
      }
      return Object.freeze({
        fetchedLogs: logs.length,
        fetchedTransactions: receipts.length,
        decodedObservations: decoded.length,
        completedEpochs: completed,
        pendingObservations: state.pending.length,
        cursorBlock: state.cursorBlock,
        safeBlock
      });
    } finally {
      this.running = false;
    }
  }
}

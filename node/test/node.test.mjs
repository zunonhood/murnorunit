import test from 'node:test';
import assert from 'node:assert/strict';
import { Erc20TransferDecoder, TRANSFER_TOPIC } from '../src/balance-decoder.mjs';
import { ContinuousMurnoNode } from '../src/continuous-node.mjs';
import { PositionTracker } from '../src/position-tracker.mjs';

const TOKEN = '0x1111111111111111111111111111111111111111';
const QUOTE = '0x2222222222222222222222222222222222222222';
const POOL = '0x3333333333333333333333333333333333333333';
const ALICE = '0x4444444444444444444444444444444444444444';

function topic(address) {
  return '0x' + address.slice(2).padStart(64, '0');
}

function transfer(token, from, to, amount) {
  return {
    address: token,
    topics: [TRANSFER_TOPIC, topic(from), topic(to)],
    data: '0x' + BigInt(amount).toString(16)
  };
}

function receipt(transactionHash, blockNumber, logs) {
  return {
    transactionHash,
    blockNumber: '0x' + blockNumber.toString(16),
    status: '0x1',
    logs
  };
}

test('decodes opposed ERC-20 transfers into real observations', () => {
  const tracker = new PositionTracker({ reversalBlocks: 50 });
  const decoder = new Erc20TransferDecoder({
    targetToken: TOKEN,
    quoteToken: QUOTE,
    poolAddress: POOL,
    targetDecimals: 2,
    quoteDecimals: 2,
    tracker
  });
  const buy = decoder.decode(receipt('0xbuy', 100, [
    transfer(TOKEN, POOL, ALICE, 100),
    transfer(QUOTE, ALICE, POOL, 1000)
  ]), { liquidityRaw: 101000n });
  assert.equal(buy.length, 1);
  assert.equal(buy[0].notional, 10);
  assert.equal(buy[0].liquidity, 1010);
  assert.equal(buy[0].source, 'erc20-transfer-delta:buy');

  const sell = decoder.decode(receipt('0xsell', 120, [
    transfer(TOKEN, ALICE, POOL, 100),
    transfer(QUOTE, POOL, ALICE, 1500)
  ]), { liquidityRaw: 99500n });
  assert.equal(sell.length, 1);
  assert.equal(sell[0].holdBlocks, 20);
  assert.equal(sell[0].reversed, true);
});

test('polls Robinhood Chain logs, closes a safe block window and advances state', async () => {
  let stored = null;
  const processed = [];
  const stateStore = {
    async load() { return stored; },
    async save(value) { stored = JSON.parse(JSON.stringify(value)); }
  };
  const runtime = {
    store: { async latest() { return null; } },
    async process(input) {
      processed.push(input);
      return { epoch: input.epoch };
    }
  };
  const reader = {
    async getBlockNumber() { return 200; },
    async getLogs() { return [{ transactionHash: '0xtransaction' }]; },
    async getTransactionReceipt() {
      return { transactionHash: '0xtransaction', blockNumber: '0x69', status: '0x1', logs: [] };
    },
    async getTokenBalance() { return 100000n; }
  };
  const tracker = new PositionTracker();
  const decoder = {
    targetToken: TOKEN,
    quoteToken: QUOTE,
    poolAddress: POOL,
    decode() {
      return [{
        transactionHash: '0xtransaction',
        logIndex: 0,
        blockNumber: 105,
        wallet: ALICE,
        notional: 10,
        holdBlocks: 20,
        liquidity: 1000,
        reversed: false
      }];
    }
  };
  const node = new ContinuousMurnoNode({
    reader,
    runtime,
    decoder,
    tracker,
    stateStore,
    actorResolver: wallet => 'private-' + wallet,
    windowBlocks: 10,
    genesisBlock: 100,
    finalityLagBlocks: 5,
    blockRange: 100,
    maxRanges: 2
  });
  const result = await node.pollOnce();
  assert.deepEqual(result.completedEpochs, ['100-109']);
  assert.equal(processed.length, 1);
  assert.equal(processed[0].epoch, 0);
  assert.equal(stored.cursorBlock, 195);
  assert.equal(stored.nextEpoch, 1);
  assert.equal(stored.pending.length, 0);
});

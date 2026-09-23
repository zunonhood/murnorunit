import test from 'node:test';
import assert from 'node:assert/strict';
import { BalanceChangeDecoder } from '../src/balance-decoder.mjs';
import { ContinuousMurnoNode } from '../src/continuous-node.mjs';
import { PositionTracker } from '../src/position-tracker.mjs';

function token(owner, mint, amount, decimals = 2) {
  return {
    owner,
    mint,
    uiTokenAmount: { amount: String(amount), decimals }
  };
}

test('decodes opposed token and quote balance changes into real observations', () => {
  const tracker = new PositionTracker({ reversalSlots: 50 });
  const decoder = new BalanceChangeDecoder({
    targetMint: 'MURNO',
    quoteMint: 'QUOTE',
    poolOwner: 'POOL',
    tracker
  });
  const buy = decoder.decode({
    slot: 100,
    meta: {
      err: null,
      preTokenBalances: [
        token('ALICE', 'MURNO', 0),
        token('ALICE', 'QUOTE', 5000),
        token('POOL', 'QUOTE', 100000)
      ],
      postTokenBalances: [
        token('ALICE', 'MURNO', 100),
        token('ALICE', 'QUOTE', 4000),
        token('POOL', 'QUOTE', 101000)
      ]
    }
  }, { signature: 'buy-signature' });
  assert.equal(buy.length, 1);
  assert.equal(buy[0].notional, 10);
  assert.equal(buy[0].liquidity, 1010);
  assert.equal(buy[0].source, 'token-balance-delta:buy');

  const sell = decoder.decode({
    slot: 120,
    meta: {
      err: null,
      preTokenBalances: [
        token('ALICE', 'MURNO', 100),
        token('ALICE', 'QUOTE', 4000),
        token('POOL', 'QUOTE', 101000)
      ],
      postTokenBalances: [
        token('ALICE', 'MURNO', 0),
        token('ALICE', 'QUOTE', 5500),
        token('POOL', 'QUOTE', 99500)
      ]
    }
  }, { signature: 'sell-signature' });
  assert.equal(sell.length, 1);
  assert.equal(sell[0].holdSlots, 20);
  assert.equal(sell[0].reversed, true);
});

test('polls, closes a safe slot window and advances durable state', async () => {
  let stored = null;
  const processed = [];
  const stateStore = {
    async load() {
      return stored;
    },
    async save(value) {
      stored = JSON.parse(JSON.stringify(value));
    }
  };
  const runtime = {
    store: { async latest() { return null; } },
    async process(input) {
      processed.push(input);
      return { epoch: input.epoch };
    }
  };
  const reader = {
    async getSignaturesForAddress(address, options) {
      return options.until ? [] : [{ signature: 'signature-1', slot: 105, err: null }];
    },
    async getTransaction() {
      return { slot: 105, meta: { err: null } };
    },
    async getSlot() {
      return 200;
    }
  };
  const tracker = new PositionTracker();
  const decoder = {
    decode() {
      return [{
        signature: 'signature-1',
        eventIndex: 0,
        slot: 105,
        wallet: 'wallet-1',
        notional: 10,
        holdSlots: 20,
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
    monitorAddress: 'monitor',
    actorResolver: wallet => 'private-' + wallet,
    windowSlots: 10,
    genesisSlot: 100,
    finalityLagSlots: 5,
    pageSize: 100,
    maxPages: 2
  });
  const result = await node.pollOnce();
  assert.deepEqual(result.completedEpochs, ['100-109']);
  assert.equal(processed.length, 1);
  assert.equal(processed[0].epoch, 0);
  assert.equal(stored.cursor, 'signature-1');
  assert.equal(stored.nextEpoch, 1);
  assert.equal(stored.pending.length, 0);
});

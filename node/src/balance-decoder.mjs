function rawAmount(balance) {
  return BigInt(balance?.uiTokenAmount?.amount || '0');
}

function decimalAmount(raw, decimals) {
  const value = Number(raw) / (10 ** decimals);
  if (!Number.isFinite(value)) throw new RangeError('Token amount exceeds numeric range');
  return value;
}

function balancesByOwner(transaction, mint) {
  const before = new Map();
  const after = new Map();
  for (const balance of transaction.meta?.preTokenBalances || []) {
    if (balance.mint === mint && balance.owner) before.set(balance.owner, balance);
  }
  for (const balance of transaction.meta?.postTokenBalances || []) {
    if (balance.mint === mint && balance.owner) after.set(balance.owner, balance);
  }
  return { before, after };
}

function ownerDelta(owner, balances) {
  const before = balances.before.get(owner);
  const after = balances.after.get(owner);
  const decimals = after?.uiTokenAmount?.decimals ?? before?.uiTokenAmount?.decimals;
  if (!Number.isInteger(decimals)) return null;
  const pre = rawAmount(before);
  const post = rawAmount(after);
  return { raw: post - pre, post, decimals };
}

export class BalanceChangeDecoder {
  constructor({ targetMint, quoteMint, poolOwner, tracker, minimumNotional = 0 }) {
    if (!targetMint || !quoteMint || !poolOwner || !tracker) {
      throw new TypeError('targetMint, quoteMint, poolOwner and tracker are required');
    }
    this.targetMint = targetMint;
    this.quoteMint = quoteMint;
    this.poolOwner = poolOwner;
    this.tracker = tracker;
    this.minimumNotional = minimumNotional;
  }

  decode(transaction, entry) {
    if (!transaction?.meta || transaction.meta.err) return [];
    const signature = entry.signature;
    const slot = transaction.slot;
    if (!signature || !Number.isInteger(slot)) return [];
    const target = balancesByOwner(transaction, this.targetMint);
    const quote = balancesByOwner(transaction, this.quoteMint);
    const poolQuote = ownerDelta(this.poolOwner, quote);
    if (!poolQuote) return [];
    const liquidity = decimalAmount(poolQuote.post, poolQuote.decimals);
    if (liquidity <= 0) return [];
    const owners = new Set([...target.before.keys(), ...target.after.keys()]);
    owners.delete(this.poolOwner);
    const observations = [];
    let eventIndex = 0;
    for (const wallet of owners) {
      const tokenChange = ownerDelta(wallet, target);
      const quoteChange = ownerDelta(wallet, quote);
      if (!tokenChange || !quoteChange || tokenChange.raw === 0n || quoteChange.raw === 0n) continue;
      if ((tokenChange.raw > 0n) === (quoteChange.raw > 0n)) continue;
      const notional = Math.abs(decimalAmount(quoteChange.raw, quoteChange.decimals));
      if (notional < this.minimumNotional) continue;
      const remainingBalance = decimalAmount(tokenChange.post, tokenChange.decimals);
      const side = tokenChange.raw > 0n ? 'buy' : 'sell';
      const position = this.tracker.observe({ wallet, side, slot, remainingBalance });
      observations.push({
        signature,
        eventIndex: eventIndex++,
        slot,
        wallet,
        notional,
        holdSlots: position.holdSlots,
        liquidity,
        reversed: position.reversed,
        source: 'token-balance-delta:' + side
      });
    }
    return observations;
  }
}

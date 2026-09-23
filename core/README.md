# Murno protocol core

Murno turns public Robinhood Chain market activity into bounded training input
for an AI agent. This directory contains the executable reference pipeline.

## Pipeline

1. robinhood.mjs connects to Robinhood Chain mainnet through standard EVM
   JSON-RPC and reads the chain ID, block height, contract logs, receipts and
   ERC-20 pool balance.
2. ingest.mjs normalizes decoded receipts, deduplicates events by transaction
   hash and log index, and builds deterministic fixed-block windows.
3. features.mjs derives distribution, persistence, liquidity and reversal
   measurements from each completed window.
4. evaluate.mjs applies a versioned public policy and assigns an accepted,
   reduced or rejected result. Influence is capped by policy.
5. epoch.mjs sends only non-zero signals to the private model adapter and
   produces an immutable epoch record.
6. commitment.mjs canonicalizes the record and creates its SHA-256 commitment,
   linking consecutive epochs into a verifiable history.

Production-facing modules provide the remaining boundaries:

- privacy.mjs converts wallet addresses into stable, domain-separated
  pseudonyms before training data leaves the identity boundary.
- trainer.mjs keeps model state private and exposes checkpoint and metric
  commitments only.
- store.mjs writes immutable epoch records and advances the latest pointer
  atomically.
- runtime.mjs resumes the previous commitment and refuses skipped epochs.
- python-trainer.mjs sends accepted aggregate features to the private Python
  trainer over stdin and validates the returned receipt.
- audit.mjs verifies epoch commitments and chains, then signs valid epoch
  heads with an Ed25519 publishing key.

Robinhood Chain transaction decoding is implemented at the node boundary
because EVM venues can route swaps through different contracts. The reference
decoder uses actual ERC-20 Transfer logs and pool balances rather than
displayed prices or fabricated activity.

The core does not include hidden production thresholds. The token contract is
published in the interface; the pool, production policy and genesis block must
be published when finalized.

## Run tests

Use Node.js 20 or newer:

    node --test core/test/*.test.mjs

Tests use an explicitly named policy and synthetic fixtures. Fixture values are
not live protocol data or production configuration.

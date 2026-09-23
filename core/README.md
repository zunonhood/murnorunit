# Murno protocol core

Murno turns public Solana market activity into bounded training input for an AI
agent. This directory contains the executable reference pipeline behind that
claim. It is intentionally small enough to audit.

## Pipeline

1. solana.mjs reads confirmed slots, signatures and transactions from a
   caller-selected Solana RPC endpoint.
2. An ingestion service converts those transactions into fixed market windows.
   Each event includes its transaction signature, wallet, notional amount,
   holding duration and observed liquidity. An optional actorId lets an
   identity-analysis service cluster related wallets.
3. features.mjs derives distribution, persistence, liquidity and reversal
   measurements from each window.
4. evaluate.mjs applies a versioned policy and assigns an accepted, reduced or
   rejected result. Influence is always capped by the supplied policy.
5. epoch.mjs sends only non-zero signals to a model adapter and produces an
   immutable epoch record.
6. commitment.mjs canonicalizes that record and produces its SHA-256
   commitment so consecutive epochs can form a verifiable chain.

Additional production-facing modules complete the reference runtime:

- ingest.mjs normalizes decoded DEX observations, removes repeated transaction
  events and builds deterministic fixed-slot windows.
- privacy.mjs converts wallets into stable, domain-separated pseudonyms before
  training data leaves the identity boundary.
- trainer.mjs keeps private model state behind an adapter and exposes only
  checkpoint and metric commitments.
- store.mjs writes immutable epoch records and advances the latest pointer
  atomically.
- runtime.mjs resumes the previous commitment and refuses skipped epochs.
- python-trainer.mjs starts the private Python trainer, sends only accepted
  aggregate features over stdin and validates the returned checkpoint receipt.
- audit.mjs verifies epoch commitments and chains, then signs valid epoch heads
  with an Ed25519 publishing key for independent verification.

Transaction decoding is injected because every Solana venue has different
instruction layouts. A decoder must produce the normalized observation shape;
the deterministic pipeline after that boundary is implemented here.

The core does not ship hidden production thresholds or pretend that deployment
has happened. Production policy, token mint, program addresses, model weights
and genesis slot must be published when they are finalized. Until then, the
website describes Murno as pre-genesis.

## Model adapter

The training implementation is supplied through one narrow interface. Its
update function receives the accepted training batch, prior private state and
epoch context, then returns the next private state and optional metrics. The
public epoch receives only digests and counts. This separation keeps market
validation deterministic while allowing the model architecture, local GPU
training stack or private Hugging Face checkpoint store to evolve
independently.

## Run tests

Use Node.js 20 or newer:

    node --test core/test/*.test.mjs

The tests use an explicitly named test policy and synthetic fixtures. Those
values are not displayed as live protocol data and are not production
configuration.

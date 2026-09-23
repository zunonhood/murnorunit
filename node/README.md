# Continuous Murno node

This service closes the Robinhood Chain runtime loop:

confirmed ERC-20 logs -> receipt transfer deltas -> private actor IDs ->
fixed block windows -> signal validation -> private model training ->
immutable signed epoch records.

The node connects to Robinhood Chain mainnet (chain ID 4663) and refuses to run
when the configured RPC reports another chain. It scans the target token's
Transfer logs with eth_getLogs, retrieves transaction receipts, compares
target-token and quote-token flows, and reads the pool's real ERC-20 quote
balance with eth_call.

## Required configuration

- MURNO_DATA_DIR: private runtime data directory.
- MURNO_POLICY_PATH: finalized versioned policy JSON.
- MURNO_TOKEN_ADDRESS: deployed Murno ERC-20 contract.
- MURNO_QUOTE_TOKEN_ADDRESS: pool quote-token contract.
- MURNO_POOL_ADDRESS: pool contract observed by the decoder.
- MURNO_ACTOR_SECRET: at least 32 private characters for HMAC pseudonyms.
- MURNO_GENESIS_BLOCK: published learning start block.
- MURNO_SIGNING_KEY_PATH: private Ed25519 PEM key for public epochs.

## Optional configuration

- MURNO_RPC_URL defaults to https://rpc.mainnet.chain.robinhood.com.
- MURNO_TOKEN_DECIMALS and MURNO_QUOTE_DECIMALS default to 18.
- MURNO_WINDOW_BLOCKS defaults to 1200.
- MURNO_FINALITY_LAG_BLOCKS defaults to 20.
- MURNO_REVERSAL_BLOCKS defaults to 150.
- MURNO_RPC_BLOCK_RANGE defaults to 2000.
- MURNO_RPC_MAX_RANGES defaults to 20.
- MURNO_MINIMUM_NOTIONAL defaults to 0.000001.
- MURNO_POLL_INTERVAL_MS defaults to 15000.

Python executable, training epochs and learning rate can also be configured
through MURNO_PYTHON, MURNO_TRAINING_EPOCHS and MURNO_LEARNING_RATE.

Start one verification poll:

    $env:MURNO_RUN_ONCE='true'
    node node/run.mjs

Remove MURNO_RUN_ONCE to run continuously. Logs are newline-delimited JSON.
RPC and trainer failures use exponential backoff. The block cursor advances
only after the complete safe range is decoded and state is persisted.

No contract, pool, policy or genesis block is bundled before deployment.

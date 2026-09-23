# Continuous Murno node

This service closes the real runtime loop:

Solana confirmed transactions -> token balance deltas -> private actor IDs ->
fixed slot windows -> signal validation -> private model training -> immutable
epoch records.

It reads the official Solana transaction metadata fields rather than relying on
displayed prices or fabricated market data. A trade is accepted by the decoder
only when the target-token and quote-token balances move in opposite directions
for the same owner. The configured pool owner's post-trade quote balance is the
liquidity observation.

## Required configuration

- MURNO_DATA_DIR: private runtime data directory.
- MURNO_POLICY_PATH: finalized versioned policy JSON.
- MURNO_TOKEN_MINT: real Murno token mint.
- MURNO_QUOTE_MINT: pool quote mint, such as wrapped SOL or USDC.
- MURNO_POOL_OWNER: owner represented by the pool token-balance entries.
- MURNO_MONITOR_ADDRESS: address used by getSignaturesForAddress.
- MURNO_ACTOR_SECRET: at least 32 private characters used for HMAC pseudonyms.
- MURNO_GENESIS_SLOT: the published learning start slot.
- MURNO_SIGNING_KEY_PATH: private Ed25519 PEM key used to sign public epochs.

Optional settings cover the RPC URL, window size, finality lag, polling
interval, reversal interval, minimum quote notional, pagination ceiling,
Python executable, training epochs and learning rate. See run.mjs for names and
defaults.

Start one poll for verification:

    $env:MURNO_RUN_ONCE='true'
    node node/run.mjs

Remove MURNO_RUN_ONCE to run continuously. Logs are newline-delimited JSON.
The service applies exponential backoff after RPC or trainer failures and never
advances its cursor when signature backfill exceeds the configured page limit.
Signed public records are written under the public directory. Existing records
are immutable: a conflicting commitment causes the node to stop that poll.

No mint, pool address, policy or genesis slot is bundled because those values
do not exist before deployment and must never be invented.

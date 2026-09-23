import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createActorPseudonymizer,
  createPolicy,
  FileEpochStore,
  MurnoRuntime,
  PythonTrainerAdapter,
  RobinhoodReader
} from '../core/src/index.mjs';
import { Erc20TransferDecoder } from './src/balance-decoder.mjs';
import { ContinuousMurnoNode } from './src/continuous-node.mjs';
import { PositionTracker } from './src/position-tracker.mjs';
import { JsonStateStore } from './src/state-store.mjs';
import { SignedEpochPublisher } from './src/epoch-publisher.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const ROBINHOOD_MAINNET_CHAIN_ID = 4663;

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error('Missing environment variable: ' + name);
  return value;
}

function integer(name, fallback) {
  const value = process.env[name] === undefined ? fallback : Number(process.env[name]);
  if (!Number.isInteger(value) || value < 0) throw new Error('Invalid integer environment variable: ' + name);
  return value;
}

function positiveInteger(name, fallback) {
  const value = integer(name, fallback);
  if (value <= 0) throw new Error('Environment variable must be greater than zero: ' + name);
  return value;
}

function requiredInteger(name) {
  const value = Number(required(name));
  if (!Number.isInteger(value) || value < 0) {
    throw new Error('Invalid integer environment variable: ' + name);
  }
  return value;
}

function positiveNumber(name, fallback) {
  const value = process.env[name] === undefined ? fallback : Number(process.env[name]);
  if (!Number.isFinite(value) || value <= 0) throw new Error('Invalid numeric environment variable: ' + name);
  return value;
}

async function createNode() {
  const dataDirectory = required('MURNO_DATA_DIR');
  const policy = createPolicy(JSON.parse(await readFile(required('MURNO_POLICY_PATH'), 'utf8')));
  const tracker = new PositionTracker({
    reversalBlocks: positiveInteger('MURNO_REVERSAL_BLOCKS', 150)
  });
  const reader = new RobinhoodReader(
    process.env.MURNO_RPC_URL || 'https://rpc.mainnet.chain.robinhood.com'
  );
  const chainId = await reader.getChainId();
  if (chainId !== ROBINHOOD_MAINNET_CHAIN_ID) {
    throw new Error('RPC chain ID ' + chainId + ' does not match Robinhood Chain mainnet 4663');
  }
  const model = new PythonTrainerAdapter({
    policy,
    checkpointPath: join(dataDirectory, 'private', 'model-checkpoint.json'),
    scriptPath: join(here, '..', 'model', 'train.py'),
    python: process.env.MURNO_PYTHON || 'python',
    epochs: positiveInteger('MURNO_TRAINING_EPOCHS', 30),
    learningRate: positiveNumber('MURNO_LEARNING_RATE', 0.08)
  });
  const runtime = new MurnoRuntime({
    policy,
    model,
    store: new FileEpochStore(join(dataDirectory, 'epochs'))
  });
  const decoder = new Erc20TransferDecoder({
    targetToken: required('MURNO_TOKEN_ADDRESS'),
    quoteToken: required('MURNO_QUOTE_TOKEN_ADDRESS'),
    poolAddress: required('MURNO_POOL_ADDRESS'),
    targetDecimals: integer('MURNO_TOKEN_DECIMALS', 18),
    quoteDecimals: integer('MURNO_QUOTE_DECIMALS', 18),
    tracker,
    minimumNotional: positiveNumber('MURNO_MINIMUM_NOTIONAL', 0.000001)
  });
  return new ContinuousMurnoNode({
    reader,
    runtime,
    decoder,
    tracker,
    stateStore: new JsonStateStore(join(dataDirectory, 'robinhood-node-state.json')),
    publisher: new SignedEpochPublisher({
      directory: join(dataDirectory, 'public'),
      privateKeyPath: required('MURNO_SIGNING_KEY_PATH')
    }),
    actorResolver: createActorPseudonymizer(required('MURNO_ACTOR_SECRET')),
    windowBlocks: positiveInteger('MURNO_WINDOW_BLOCKS', 1200),
    genesisBlock: requiredInteger('MURNO_GENESIS_BLOCK'),
    finalityLagBlocks: integer('MURNO_FINALITY_LAG_BLOCKS', 20),
    blockRange: positiveInteger('MURNO_RPC_BLOCK_RANGE', 2000),
    maxRanges: positiveInteger('MURNO_RPC_MAX_RANGES', 20)
  });
}

function writeLog(level, event, details = {}) {
  process.stdout.write(JSON.stringify({
    time: new Date().toISOString(),
    level,
    event,
    ...details
  }) + '\n');
}

async function main() {
  const node = await createNode();
  const pollInterval = positiveInteger('MURNO_POLL_INTERVAL_MS', 15000);
  const runOnce = process.env.MURNO_RUN_ONCE === 'true';
  let stopped = false;
  let failures = 0;
  const stop = () => { stopped = true; };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);

  while (!stopped) {
    try {
      const result = await node.pollOnce();
      failures = 0;
      writeLog('info', 'poll_complete', result);
      if (runOnce) return;
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    } catch (error) {
      failures += 1;
      const delay = Math.min(pollInterval * (2 ** failures), 300000);
      writeLog('error', 'poll_failed', { message: error.message, retryInMs: delay });
      if (runOnce) throw error;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  writeLog('info', 'node_stopped');
}

main().catch(error => {
  writeLog('fatal', 'node_exit', { message: error.message });
  process.exitCode = 1;
});

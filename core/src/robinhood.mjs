const DEFAULT_RPC = 'https://rpc.mainnet.chain.robinhood.com';

function hexQuantity(value) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError('Block quantity must be a non-negative safe integer');
  }
  return '0x' + value.toString(16);
}

function parseQuantity(value, label) {
  if (typeof value !== 'string' || !/^0x[0-9a-f]+$/i.test(value)) {
    throw new TypeError('Invalid Robinhood Chain ' + label);
  }
  const parsed = Number.parseInt(value.slice(2), 16);
  if (!Number.isSafeInteger(parsed)) throw new RangeError(label + ' exceeds safe integer range');
  return parsed;
}

export class RobinhoodReader {
  constructor(endpoint = DEFAULT_RPC, fetchImpl = globalThis.fetch) {
    if (typeof fetchImpl !== 'function') throw new TypeError('A fetch implementation is required');
    this.endpoint = endpoint;
    this.fetch = fetchImpl;
    this.requestId = 0;
  }

  async request(method, params = []) {
    const response = await this.fetch(this.endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++this.requestId, method, params })
    });
    if (!response.ok) throw new Error('Robinhood Chain RPC HTTP error: ' + response.status);
    const body = await response.json();
    if (body.error) throw new Error('Robinhood Chain RPC error: ' + body.error.message);
    return body.result;
  }

  async getChainId() {
    return parseQuantity(await this.request('eth_chainId'), 'chain ID');
  }

  async getBlockNumber() {
    return parseQuantity(await this.request('eth_blockNumber'), 'block number');
  }

  getLogs({ address, fromBlock, toBlock, topics = [] }) {
    if (!address) throw new TypeError('Log address is required');
    return this.request('eth_getLogs', [{
      address,
      fromBlock: hexQuantity(fromBlock),
      toBlock: hexQuantity(toBlock),
      topics
    }]);
  }

  getTransactionReceipt(transactionHash) {
    if (!transactionHash) throw new TypeError('Transaction hash is required');
    return this.request('eth_getTransactionReceipt', [transactionHash]);
  }

  async getTokenBalance(tokenAddress, ownerAddress, blockNumber = 'latest') {
    const token = String(tokenAddress).toLowerCase();
    const owner = String(ownerAddress).toLowerCase();
    if (!/^0x[0-9a-f]{40}$/.test(token) || !/^0x[0-9a-f]{40}$/.test(owner)) {
      throw new TypeError('ERC-20 token and owner must be EVM addresses');
    }
    const data = '0x70a08231' + owner.slice(2).padStart(64, '0');
    const blockTag = blockNumber === 'latest' ? blockNumber : hexQuantity(blockNumber);
    const result = await this.request('eth_call', [{ to: token, data }, blockTag]);
    if (typeof result !== 'string' || !/^0x[0-9a-f]*$/i.test(result)) {
      throw new TypeError('Invalid ERC-20 balance response');
    }
    return BigInt(result || '0x0');
  }
}

export { DEFAULT_RPC as ROBINHOOD_MAINNET_RPC };

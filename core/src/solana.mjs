export class SolanaReader {
  constructor(endpoint = 'https://api.mainnet-beta.solana.com', fetchImpl = globalThis.fetch) {
    if (typeof fetchImpl !== 'function') throw new TypeError('A fetch implementation is required');
    this.endpoint = endpoint;
    this.fetch = fetchImpl;
    this.requestId = 0;
  }

  async request(method, params = []) {
    const response = await this.fetch(this.endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: ++this.requestId,
        method,
        params
      })
    });
    if (!response.ok) throw new Error('Solana RPC HTTP error: ' + response.status);
    const body = await response.json();
    if (body.error) throw new Error('Solana RPC error: ' + body.error.message);
    return body.result;
  }

  getSlot(commitment = 'confirmed') {
    return this.request('getSlot', [{ commitment }]);
  }

  getSignaturesForAddress(address, options = {}) {
    return this.request('getSignaturesForAddress', [
      address,
      { commitment: 'confirmed', limit: 1000, ...options }
    ]);
  }

  getTransaction(signature, options = {}) {
    return this.request('getTransaction', [
      signature,
      {
        commitment: 'confirmed',
        encoding: 'jsonParsed',
        maxSupportedTransactionVersion: 0,
        ...options
      }
    ]);
  }
}

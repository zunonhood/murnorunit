# Murno

Murno is a private AI model trained by validated Robinhood Chain market
behavior, with a public and verifiable learning history.

The repository contains four connected parts:

- the public technical interface and local source explorer;
- the deterministic signal-validation and epoch protocol;
- the dependency-free private market-preference model;
- the continuous Robinhood Chain ingestion, recovery and signed publishing node.

## Network

Murno targets Robinhood Chain mainnet:

- Chain ID: 4663
- Public RPC: https://rpc.mainnet.chain.robinhood.com
- Gas token: ETH
- Explorer: https://robinhoodchain.blockscout.com

The node checks the RPC chain ID before processing data.

## Public interface

The site is deployed through GitHub Pages:

https://murno.fun/

Run the interface locally:

    python -m http.server 4173 --bind 127.0.0.1

Then open http://127.0.0.1:4173/.

## Verification

Run the JavaScript protocol and node tests:

    node --test core/test/*.test.mjs node/test/*.test.mjs

Run the private-model tests:

    python model/test_model.py

## Current boundary

Murno is pre-genesis. The Robinhood Chain reference protocol, continuous EVM
node, private model, recovery system and signed epoch verifier are implemented
and tested. The verified token contract is published in the public interface.
No pool address, production policy, genesis block or live Murno training
history is published yet.

Runtime secrets, private signing keys, model checkpoints and node data must
never be committed.

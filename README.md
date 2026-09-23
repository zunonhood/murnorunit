# Murno

Murno is a private AI model trained by validated Solana market behavior, with a
public and verifiable learning history.

The repository contains four connected parts:

- the public technical interface and local source explorer;
- the deterministic signal-validation and epoch protocol;
- the dependency-free private market-preference model;
- the continuous Solana ingestion, recovery and signed publishing node.

## Public interface

The site is deployed through GitHub Pages:

https://zunonhood.github.io/murnorunit/

Run the interface locally:

    python -m http.server 4173 --bind 127.0.0.1

Then open http://127.0.0.1:4173/.

## Verification

Run the JavaScript protocol and node tests:

    node --test core/test/*.test.mjs node/test/*.test.mjs

Run the private-model tests:

    python model/test_model.py

## Current boundary

Murno is pre-genesis. The reference protocol, continuous node, private model,
recovery system and signed epoch verifier are implemented and tested. No token
mint, pool address, production policy, genesis slot or live Murno training
history is published in this repository.

Runtime secrets, private signing keys, model checkpoints and node data must
never be committed.

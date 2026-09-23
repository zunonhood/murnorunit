# Murno private market model

This directory contains a dependency-free model that can be trained immediately
with Python 3. It is not a pretrained model and ships with no invented weights
or market dataset.

The model is a compact autoencoder. It learns a latent preference representation
from six aggregate market dimensions: activity, independent participation,
distribution, conviction, persistence and liquidity. Every example is weighted
by the bounded influence produced by the public protocol core.

Raw wallets and transaction hashes are not model inputs. The private
checkpoint remains on the training machine. A run emits a public receipt with a
checkpoint digest, revision, observation count and loss metrics.

Run the model tests:

    python -m unittest model/test_model.py

Run training:

    python model/train.py --batch accepted-batch.json --policy policy.json --checkpoint private-checkpoint.json

The dependency-free implementation is the executable baseline. A larger model
can replace it through the same trainer adapter without changing signal
validation or the public epoch format.

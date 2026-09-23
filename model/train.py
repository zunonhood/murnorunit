import argparse
import json
import sys
from pathlib import Path

from murno_model import MarketPreferenceModel, checkpoint_digest, feature_vector


def main():
    parser = argparse.ArgumentParser(description='Train the private Murno market encoder')
    parser.add_argument('--batch', help='JSON training batch produced by the protocol core')
    parser.add_argument('--policy', help='Versioned policy JSON')
    parser.add_argument('--stdin', action='store_true', help='Read batch and policy from one JSON stdin payload')
    parser.add_argument('--checkpoint', required=True, help='Private checkpoint path')
    parser.add_argument('--epochs', type=int, default=30)
    parser.add_argument('--learning-rate', type=float, default=0.08)
    args = parser.parse_args()

    if args.stdin:
        payload = json.load(sys.stdin)
        batch = payload['batch']
        policy = payload['policy']
    else:
        if not args.batch or not args.policy:
            parser.error('--batch and --policy are required unless --stdin is used')
        batch = json.loads(Path(args.batch).read_text(encoding='utf-8'))
        policy = json.loads(Path(args.policy).read_text(encoding='utf-8'))
    checkpoint = Path(args.checkpoint)
    model = MarketPreferenceModel.load(checkpoint) if checkpoint.exists() else MarketPreferenceModel()
    examples = [
        (feature_vector(item['features'], policy), item['influence'])
        for item in batch
    ]
    metrics = model.train(examples, epochs=args.epochs, learning_rate=args.learning_rate)
    digest = model.save(checkpoint)
    receipt = {
        'schema': 'murno.training-receipt.v1',
        'revision': model.revision,
        'observationCount': len(examples),
        'checkpointDigest': digest,
        'metrics': metrics.as_dict(),
        'stateDigest': checkpoint_digest(model.state_dict()),
    }
    print(json.dumps(receipt, sort_keys=True))


if __name__ == '__main__':
    main()

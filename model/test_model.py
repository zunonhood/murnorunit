import tempfile
import unittest
from pathlib import Path

from murno_model import MarketPreferenceModel, checkpoint_digest, feature_vector


class MurnoModelTests(unittest.TestCase):
    def test_training_reduces_reconstruction_loss(self):
        model = MarketPreferenceModel(seed=7)
        examples = [
            ([0.9, 0.8, 0.75, 0.9, 0.7, 0.8], 0.9),
            ([0.8, 0.9, 0.8, 0.85, 0.75, 0.9], 0.8),
        ]
        metrics = model.train(examples, epochs=120, learning_rate=0.2)
        self.assertLess(metrics.final_loss, metrics.initial_loss)

    def test_checkpoint_round_trip_is_stable(self):
        model = MarketPreferenceModel(seed=9)
        with tempfile.TemporaryDirectory(prefix='murno-model-') as directory:
            path = Path(directory) / 'checkpoint.json'
            digest = model.save(path)
            restored = MarketPreferenceModel.load(path)
            self.assertEqual(digest, checkpoint_digest(restored.state_dict()))
            self.assertEqual(model.forward([0.5] * 6), restored.forward([0.5] * 6))

    def test_feature_vector_contains_only_aggregate_market_data(self):
        features = {
            'eventCount': 10,
            'independentActorCount': 8,
            'actorConcentration': 0.2,
            'reversalRate': 0.1,
            'medianHoldSlots': 50,
            'medianLiquidity': 1000,
        }
        policy = {
            'minimumEvents': 5,
            'minimumIndependentActors': 4,
            'minimumMedianHoldSlots': 25,
            'minimumMedianLiquidity': 500,
        }
        values = feature_vector(features, policy)
        self.assertEqual(len(values), 6)
        self.assertTrue(all(0.0 <= value <= 1.0 for value in values))

    def test_empty_batch_does_not_advance_model_revision(self):
        model = MarketPreferenceModel(seed=11)
        metrics = model.train([], epochs=10)
        self.assertEqual(model.revision, 0)
        self.assertEqual(metrics.examples, 0)
        self.assertEqual(metrics.epochs, 0)


if __name__ == '__main__':
    unittest.main()

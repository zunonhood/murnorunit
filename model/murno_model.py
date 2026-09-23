import hashlib
import json
import math
import random
from dataclasses import dataclass
from pathlib import Path

FEATURE_NAMES = (
    'activity',
    'independence',
    'distribution',
    'conviction',
    'persistence',
    'liquidity',
)


def _clamp(value, low=0.0, high=1.0):
    return max(low, min(high, float(value)))


def _sigmoid(value):
    if value >= 0:
        z = math.exp(-value)
        return 1.0 / (1.0 + z)
    z = math.exp(value)
    return z / (1.0 + z)


def _canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=True)


def checkpoint_digest(state):
    return hashlib.sha256(_canonical(state).encode('utf-8')).hexdigest()


def feature_vector(features, policy):
    required = (
        'eventCount',
        'independentActorCount',
        'actorConcentration',
        'reversalRate',
        'medianHoldBlocks',
        'medianLiquidity',
    )
    if any(name not in features for name in required):
        raise ValueError('Incomplete market feature record')
    return [
        _clamp(features['eventCount'] / (2.0 * policy['minimumEvents'])),
        _clamp(features['independentActorCount'] / (2.0 * policy['minimumIndependentActors'])),
        _clamp(1.0 - features['actorConcentration']),
        _clamp(1.0 - features['reversalRate']),
        _clamp(features['medianHoldBlocks'] / (2.0 * policy['minimumMedianHoldBlocks'])),
        _clamp(features['medianLiquidity'] / (2.0 * policy['minimumMedianLiquidity'])),
    ]


@dataclass
class TrainingMetrics:
    examples: int
    epochs: int
    initial_loss: float
    final_loss: float

    def as_dict(self):
        return {
            'examples': self.examples,
            'epochs': self.epochs,
            'initialLoss': self.initial_loss,
            'finalLoss': self.final_loss,
        }


class MarketPreferenceModel:
    def __init__(self, input_size=6, latent_size=4, seed=8172):
        if input_size <= 0 or latent_size <= 0:
            raise ValueError('Model dimensions must be positive')
        rng = random.Random(seed)
        scale = 1.0 / math.sqrt(input_size)
        self.input_size = input_size
        self.latent_size = latent_size
        self.encoder = [
            [rng.uniform(-scale, scale) for _ in range(input_size)]
            for _ in range(latent_size)
        ]
        self.encoder_bias = [0.0] * latent_size
        self.decoder = [
            [rng.uniform(-scale, scale) for _ in range(latent_size)]
            for _ in range(input_size)
        ]
        self.decoder_bias = [0.0] * input_size
        self.revision = 0

    def forward(self, values):
        if len(values) != self.input_size:
            raise ValueError('Unexpected feature vector size')
        latent = [
            math.tanh(sum(weight * value for weight, value in zip(row, values)) + bias)
            for row, bias in zip(self.encoder, self.encoder_bias)
        ]
        reconstructed = [
            _sigmoid(sum(weight * value for weight, value in zip(row, latent)) + bias)
            for row, bias in zip(self.decoder, self.decoder_bias)
        ]
        return latent, reconstructed

    def loss(self, examples):
        if not examples:
            return 0.0
        total = 0.0
        weight_total = 0.0
        for values, influence in examples:
            _, predicted = self.forward(values)
            weight = max(float(influence), 1e-9)
            total += weight * sum((actual - estimate) ** 2 for actual, estimate in zip(values, predicted))
            weight_total += weight * self.input_size
        return total / weight_total

    def train(self, examples, epochs=30, learning_rate=0.08):
        if epochs <= 0 or learning_rate <= 0:
            raise ValueError('Training parameters must be positive')
        prepared = [(list(values), _clamp(influence)) for values, influence in examples]
        initial_loss = self.loss(prepared)
        if not prepared:
            return TrainingMetrics(
                examples=0,
                epochs=0,
                initial_loss=0.0,
                final_loss=0.0,
            )
        for _ in range(epochs):
            for values, influence in prepared:
                latent, predicted = self.forward(values)
                strength = learning_rate * max(influence, 1e-6)
                output_gradient = [
                    2.0 * (estimate - actual) / self.input_size * estimate * (1.0 - estimate)
                    for actual, estimate in zip(values, predicted)
                ]
                latent_gradient = []
                for hidden in range(self.latent_size):
                    downstream = sum(
                        self.decoder[output][hidden] * output_gradient[output]
                        for output in range(self.input_size)
                    )
                    latent_gradient.append(downstream * (1.0 - latent[hidden] ** 2))
                for output in range(self.input_size):
                    for hidden in range(self.latent_size):
                        self.decoder[output][hidden] -= strength * output_gradient[output] * latent[hidden]
                    self.decoder_bias[output] -= strength * output_gradient[output]
                for hidden in range(self.latent_size):
                    for feature in range(self.input_size):
                        self.encoder[hidden][feature] -= strength * latent_gradient[hidden] * values[feature]
                    self.encoder_bias[hidden] -= strength * latent_gradient[hidden]
        self.revision += 1
        return TrainingMetrics(
            examples=len(prepared),
            epochs=epochs,
            initial_loss=initial_loss,
            final_loss=self.loss(prepared),
        )

    def state_dict(self):
        return {
            'schema': 'murno.market-autoencoder.v1',
            'revision': self.revision,
            'inputSize': self.input_size,
            'latentSize': self.latent_size,
            'encoder': self.encoder,
            'encoderBias': self.encoder_bias,
            'decoder': self.decoder,
            'decoderBias': self.decoder_bias,
        }

    @classmethod
    def from_state_dict(cls, state):
        if state.get('schema') != 'murno.market-autoencoder.v1':
            raise ValueError('Unsupported checkpoint schema')
        model = cls(state['inputSize'], state['latentSize'])
        model.encoder = state['encoder']
        model.encoder_bias = state['encoderBias']
        model.decoder = state['decoder']
        model.decoder_bias = state['decoderBias']
        model.revision = state['revision']
        return model

    def save(self, path):
        target = Path(path)
        target.parent.mkdir(parents=True, exist_ok=True)
        temporary = target.with_suffix(target.suffix + '.tmp')
        temporary.write_text(_canonical(self.state_dict()) + '\n', encoding='utf-8')
        temporary.replace(target)
        return checkpoint_digest(self.state_dict())

    @classmethod
    def load(cls, path):
        return cls.from_state_dict(json.loads(Path(path).read_text(encoding='utf-8')))

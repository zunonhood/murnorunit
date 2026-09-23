import { runEpoch } from './epoch.mjs';

export class MurnoRuntime {
  constructor({ policy, model, store }) {
    if (!policy) throw new TypeError('Runtime policy is required');
    if (!model) throw new TypeError('Runtime model is required');
    if (!store || typeof store.save !== 'function' || typeof store.latest !== 'function') {
      throw new TypeError('Runtime store is required');
    }
    this.policy = policy;
    this.model = model;
    this.store = store;
  }

  async process({ epoch, windows, observedAt }) {
    const previous = await this.store.latest();
    if (previous && epoch !== previous.epoch + 1) {
      throw new Error('Epoch must continue from ' + previous.epoch);
    }
    const record = await runEpoch({
      epoch,
      windows,
      observedAt,
      policy: this.policy,
      model: this.model,
      previousCommitment: previous ? previous.commitment : null
    });
    await this.store.save(record);
    return record;
  }
}

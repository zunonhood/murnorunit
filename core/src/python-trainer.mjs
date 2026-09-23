import { spawn } from 'node:child_process';

export class PythonTrainerAdapter {
  constructor({
    policy,
    checkpointPath,
    scriptPath,
    python = 'python',
    epochs = 30,
    learningRate = 0.08,
    spawnImpl = spawn
  }) {
    if (!policy || !checkpointPath || !scriptPath) {
      throw new TypeError('Policy, checkpointPath and scriptPath are required');
    }
    this.policy = policy;
    this.checkpointPath = checkpointPath;
    this.scriptPath = scriptPath;
    this.python = python;
    this.epochs = epochs;
    this.learningRate = learningRate;
    this.spawn = spawnImpl;
  }

  async update(batch, context) {
    const args = [
      this.scriptPath,
      '--stdin',
      '--checkpoint', this.checkpointPath,
      '--epochs', String(this.epochs),
      '--learning-rate', String(this.learningRate)
    ];
    const receipt = await new Promise((resolve, reject) => {
      const process = this.spawn(this.python, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true
      });
      let output = '';
      let errorOutput = '';
      process.stdout.setEncoding('utf8');
      process.stderr.setEncoding('utf8');
      process.stdout.on('data', chunk => {
        output += chunk;
        if (output.length > 1048576) process.kill();
      });
      process.stderr.on('data', chunk => {
        errorOutput += chunk;
      });
      process.on('error', reject);
      process.on('close', code => {
        if (code !== 0) {
          reject(new Error('Python trainer failed: ' + errorOutput.trim()));
          return;
        }
        try {
          resolve(JSON.parse(output));
        } catch {
          reject(new Error('Python trainer returned an invalid receipt'));
        }
      });
      process.stdin.end(JSON.stringify({
        batch,
        policy: this.policy,
        context
      }));
    });
    if (receipt.schema !== 'murno.training-receipt.v1' ||
        !/^[a-f0-9]{64}$/.test(receipt.checkpointDigest || '')) {
      throw new Error('Python trainer receipt failed validation');
    }
    return Object.freeze(receipt);
  }
}

const RPC_URL = 'https://api.mainnet-beta.solana.com';
document.title = 'Murno - The market trains the model';

const rpcState = document.querySelector('#rpc-state');
const rpcDot = document.querySelector('#rpc-dot');
const blockNumber = document.querySelector('#block-number');
const slotTrace = document.querySelector('#slot-trace');
const slotTraceNote = document.querySelector('#slot-trace-note');
const slotPoints = [];

function drawSlotTrace() {
  if (!slotTrace) return;
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, slotTrace.clientWidth);
  const height = Math.max(1, slotTrace.clientHeight);
  slotTrace.width = Math.round(width * ratio);
  slotTrace.height = Math.round(height * ratio);
  const context = slotTrace.getContext('2d');
  context.scale(ratio, ratio);
  context.clearRect(0, 0, width, height);

  const padding = { left: 42, right: 18, top: 22, bottom: 30 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  context.strokeStyle = 'rgba(255,255,255,.065)';
  context.lineWidth = 1;
  for (let row = 0; row <= 4; row += 1) {
    const y = padding.top + plotHeight * row / 4;
    context.beginPath();
    context.moveTo(padding.left, y);
    context.lineTo(width - padding.right, y);
    context.stroke();
  }
  for (let column = 0; column <= 6; column += 1) {
    const x = padding.left + plotWidth * column / 6;
    context.beginPath();
    context.moveTo(x, padding.top);
    context.lineTo(x, height - padding.bottom);
    context.stroke();
  }
  context.fillStyle = 'rgba(255,255,255,.34)';
  context.font = '8px ui-monospace, monospace';
  context.fillText('SLOT', 10, padding.top + 3);
  context.fillText('SESSION TIME', width - 86, height - 10);

  if (!slotPoints.length) {
    context.fillStyle = 'rgba(255,255,255,.28)';
    context.textAlign = 'center';
    context.fillText('AWAITING PUBLIC RPC', width / 2, height / 2);
    context.textAlign = 'left';
    return;
  }

  const values = slotPoints.map(point => point.slot);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const range = Math.max(1, maximum - minimum);
  const coordinates = slotPoints.map((point, index) => ({
    x: padding.left + (slotPoints.length === 1 ? plotWidth / 2 : plotWidth * index / (slotPoints.length - 1)),
    y: padding.top + plotHeight - ((point.slot - minimum) / range) * plotHeight
  }));

  const gradient = context.createLinearGradient(0, padding.top, 0, height - padding.bottom);
  gradient.addColorStop(0, 'rgba(143,194,232,.28)');
  gradient.addColorStop(1, 'rgba(143,194,232,0)');
  context.beginPath();
  context.moveTo(coordinates[0].x, height - padding.bottom);
  coordinates.forEach(point => context.lineTo(point.x, point.y));
  context.lineTo(coordinates.at(-1).x, height - padding.bottom);
  context.closePath();
  context.fillStyle = gradient;
  context.fill();

  context.beginPath();
  coordinates.forEach((point, index) => {
    if (index === 0) context.moveTo(point.x, point.y);
    else context.lineTo(point.x, point.y);
  });
  context.strokeStyle = '#8fc2e8';
  context.lineWidth = 1.5;
  context.stroke();
  const last = coordinates.at(-1);
  context.beginPath();
  context.arc(last.x, last.y, 3, 0, Math.PI * 2);
  context.fillStyle = '#8fd0ad';
  context.fill();
}

function recordSlot(slot) {
  slotPoints.push({ slot, time: Date.now() });
  if (slotPoints.length > 60) slotPoints.shift();
  if (slotTraceNote) {
    const delta = slotPoints.length > 1 ? slot - slotPoints[0].slot : 0;
    slotTraceNote.textContent = slotPoints.length + ' real RPC observation' +
      (slotPoints.length === 1 ? '' : 's') + ' / slot delta +' + delta.toLocaleString('en-US') +
      ' / 30 second interval';
  }
  drawSlotTrace();
}

async function readChain() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    const response = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getSlot',
        params: [{ commitment: 'confirmed' }]
      }),
      signal: controller.signal
    });
    const data = await response.json();
    if (!data.result) throw new Error('No slot returned');
    const slot = Number(data.result);
    if (rpcState) rpcState.textContent = 'solana / online';
    if (blockNumber) blockNumber.textContent = slot.toLocaleString('en-US');
    if (rpcDot) rpcDot.classList.add('online');
    recordSlot(slot);
  } catch {
    if (rpcState) rpcState.textContent = 'solana / unavailable';
    if (blockNumber) blockNumber.textContent = 'unavailable';
    if (rpcDot) rpcDot.classList.remove('online');
  } finally {
    clearTimeout(timeout);
  }
}

readChain();
setInterval(readChain, 30000);
drawSlotTrace();
window.addEventListener('resize', drawSlotTrace);

const localProjects = [
  {
    name: 'murno-protocol',
    description: 'Market-signal evaluation, policy validation, epoch execution and Solana ingestion.',
    language: 'JavaScript',
    files: [
      'core/README.md',
      'core/src/index.mjs',
      'core/src/policy.mjs',
      'core/src/features.mjs',
      'core/src/evaluate.mjs',
      'core/src/commitment.mjs',
      'core/src/epoch.mjs',
      'core/src/solana.mjs',
      'core/src/ingest.mjs',
      'core/src/privacy.mjs',
      'core/src/trainer.mjs',
      'core/src/store.mjs',
      'core/src/runtime.mjs',
      'core/src/python-trainer.mjs',
      'core/src/audit.mjs',
      'core/test/core.test.mjs',
      'core/test/pipeline.test.mjs',
      'core/test/python-trainer.test.mjs',
      'core/test/audit.test.mjs'
    ]
  },
  {
    name: 'murno-interface',
    description: 'The public Murno protocol interface and local source explorer.',
    language: 'HTML / CSS / JavaScript',
    files: ['index.html', 'styles.css', 'app.js']
  },
  {
    name: 'murno-model',
    description: 'Dependency-free private market encoder, checkpointing and training command.',
    language: 'Python',
    files: [
      'model/README.md',
      'model/murno_model.py',
      'model/train.py',
      'model/test_model.py'
    ]
  },
  {
    name: 'murno-node',
    description: 'Continuous Solana ingestion, balance decoding, recovery and epoch execution service.',
    language: 'JavaScript / Node.js',
    files: [
      'node/README.md',
      'node/run.mjs',
      'node/src/state-store.mjs',
      'node/src/position-tracker.mjs',
      'node/src/balance-decoder.mjs',
      'node/src/continuous-node.mjs',
      'node/src/epoch-publisher.mjs',
      'node/test/node.test.mjs',
      'node/test/publisher.test.mjs'
    ]
  }
];

const githubTrigger = document.querySelector('.github-trigger');
const repoOverlay = document.querySelector('#repo-overlay');
const repoClose = document.querySelector('[data-close-repo]');
const repoSearch = document.querySelector('#repo-search');
const repoList = document.querySelector('#repo-list');
const fileList = document.querySelector('#file-list');
const breadcrumb = document.querySelector('#repo-breadcrumb');
const codeOutput = document.querySelector('#code-output');
const lineNumbers = document.querySelector('#line-numbers');
const codeFileName = document.querySelector('#code-file-name');
const codeFileMeta = document.querySelector('#code-file-meta');
const repoOpenFile = document.querySelector('#repo-open-file');
const repoApiState = document.querySelector('#repo-api-state');

const sourceState = {
  repos: localProjects,
  repo: null,
  path: ''
};

function setRepoMessage(target, message, error = false) {
  target.replaceChildren();
  const node = document.createElement('p');
  node.className = 'repo-message' + (error ? ' repo-error' : '');
  node.textContent = message;
  target.append(node);
}

function openRepoExplorer(event) {
  event.preventDefault();
  repoOverlay.hidden = false;
  document.body.classList.add('repo-open');
  requestAnimationFrame(() => repoOverlay.classList.add('open'));
  renderRepositories(repoSearch.value);
  if (!sourceState.repo) selectRepository(localProjects[0]);
}

function closeRepoExplorer() {
  repoOverlay.classList.remove('open');
  document.body.classList.remove('repo-open');
  setTimeout(() => {
    repoOverlay.hidden = true;
  }, 180);
}

function renderRepositories(query = '') {
  const term = query.trim().toLowerCase();
  const repos = sourceState.repos.filter(repo => {
    return repo.name.toLowerCase().includes(term) ||
      repo.description.toLowerCase().includes(term);
  });
  repoList.replaceChildren();
  if (!repos.length) {
    setRepoMessage(repoList, 'No local project matches this search.');
    return;
  }
  repos.forEach(repo => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'repo-item' +
      (sourceState.repo && sourceState.repo.name === repo.name ? ' active' : '');

    const name = document.createElement('b');
    name.textContent = repo.name;
    const meta = document.createElement('span');
    meta.textContent = repo.language;
    const description = document.createElement('small');
    description.textContent = repo.description;

    button.append(name, meta, description);
    button.addEventListener('click', () => selectRepository(repo));
    repoList.append(button);
  });
}

function selectRepository(repo) {
  sourceState.repo = repo;
  sourceState.path = '';
  repoOpenFile.textContent = 'LOCAL SOURCE';
  repoApiState.textContent = 'LOCAL / ' + repo.files.length + ' FILES';
  renderRepositories(repoSearch.value);
  clearCode('Select a file from ' + repo.name + '.');
  loadDirectory('');
}

function getLocalDirectory(repo, path) {
  const prefix = path ? path + '/' : '';
  const entries = new Map();

  repo.files
    .filter(file => file.startsWith(prefix))
    .forEach(file => {
      const remainder = file.slice(prefix.length);
      const parts = remainder.split('/');
      const name = parts[0];
      entries.set(name, {
        name,
        path: prefix + name,
        type: parts.length > 1 ? 'dir' : 'file'
      });
    });

  return [...entries.values()];
}

function loadDirectory(path) {
  if (!sourceState.repo) return;
  sourceState.path = path;
  renderBreadcrumb();
  renderDirectory(getLocalDirectory(sourceState.repo, path));
  repoApiState.textContent = 'LOCAL / SOURCE READY';
}

function renderDirectory(items) {
  fileList.replaceChildren();

  if (sourceState.path) {
    const up = document.createElement('button');
    up.type = 'button';
    up.className = 'file-item folder';
    const icon = document.createElement('i');
    icon.textContent = '←';
    const label = document.createElement('span');
    label.textContent = '..';
    up.append(icon, label);
    up.addEventListener('click', () => {
      const parts = sourceState.path.split('/');
      parts.pop();
      loadDirectory(parts.join('/'));
    });
    fileList.append(up);
  }

  const sorted = [...items].sort((a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  sorted.forEach(item => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'file-item ' + item.type;

    const icon = document.createElement('i');
    icon.textContent = item.type === 'dir' ? '▸' : '·/';
    const label = document.createElement('span');
    label.textContent = item.name;

    button.append(icon, label);
    button.addEventListener('click', () => {
      if (item.type === 'dir') loadDirectory(item.path);
      else loadSourceFile(item);
    });
    fileList.append(button);
  });

  if (!sorted.length) setRepoMessage(fileList, 'This directory is empty.');
}

function renderBreadcrumb() {
  breadcrumb.replaceChildren();
  const root = document.createElement('button');
  root.type = 'button';
  root.textContent = sourceState.repo.name;
  root.addEventListener('click', () => loadDirectory(''));
  breadcrumb.append(root);

  const parts = sourceState.path.split('/').filter(Boolean);
  parts.forEach((part, index) => {
    breadcrumb.append(document.createTextNode('/'));
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = part;
    button.addEventListener('click', () => {
      loadDirectory(parts.slice(0, index + 1).join('/'));
    });
    breadcrumb.append(button);
  });
}

function clearCode(message) {
  codeFileName.textContent = 'NO FILE SELECTED';
  codeFileMeta.textContent = 'LOCAL SOURCE';
  lineNumbers.textContent = '';
  codeOutput.textContent = message;
}

async function loadSourceFile(item) {
  codeFileName.textContent = item.name.toUpperCase();
  codeFileMeta.textContent = 'LOADING';
  repoOpenFile.textContent = item.path;
  lineNumbers.textContent = '';
  codeOutput.textContent = 'Loading local source...';

  try {
    const binaryExtensions = /\.(png|jpe?g|gif|webp|ico|woff2?|ttf|eot|pdf|zip|gz|mp4|mp3)$/i;
    if (binaryExtensions.test(item.name)) {
      throw new Error('Binary files are not rendered in the source viewer');
    }

    const response = await fetch(item.path, { cache: 'no-store' });
    if (!response.ok) throw new Error('Local source could not be loaded');
    const source = await response.text();
    const lines = source.split('\n');

    lineNumbers.textContent = lines.map((_, index) => index + 1).join('\n');
    codeOutput.textContent = source;
    codeFileMeta.textContent = lines.length + ' LINES · ' + formatBytes(new Blob([source]).size);
    repoApiState.textContent = 'LOCAL / SOURCE LOADED';
  } catch (error) {
    codeOutput.textContent = error.message;
    codeFileMeta.textContent = 'PREVIEW UNAVAILABLE';
    repoApiState.textContent = 'LOCAL FILE ERROR';
  }
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

githubTrigger.addEventListener('click', openRepoExplorer);
repoClose.addEventListener('click', closeRepoExplorer);
repoOverlay.addEventListener('click', event => {
  if (event.target === repoOverlay) closeRepoExplorer();
});
repoSearch.addEventListener('input', event => renderRepositories(event.target.value));
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !repoOverlay.hidden) closeRepoExplorer();
});

if (window.location.hash) {
  window.setTimeout(() => {
    const target = document.getElementById(decodeURIComponent(window.location.hash.slice(1)));
    if (target) {
      const previousBehavior = document.documentElement.style.scrollBehavior;
      document.documentElement.style.scrollBehavior = 'auto';
      target.scrollIntoView({ block: 'start' });
      window.requestAnimationFrame(() => {
        document.documentElement.style.scrollBehavior = previousBehavior;
      });
    }
  }, 120);
}

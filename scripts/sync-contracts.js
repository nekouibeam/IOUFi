const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const solidityOut = path.join(root, 'solidity', 'out');
const webContracts = path.join(root, 'web', 'src', 'contracts');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function collectRunLatestFiles(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectRunLatestFiles(fullPath, acc);
      continue;
    }

    if (entry.isFile() && entry.name === 'run-latest.json') {
      acc.push(fullPath);
    }
  }

  return acc;
}

function main() {
  ensureDir(webContracts);

  const addresses = {};
  const artifacts = ['IOUNFT', 'ReputationLedger', 'Treasury', 'SDGsDAO'];

  for (const name of artifacts) {
    const artifactPath = path.join(solidityOut, `${name}.sol`, `${name}.json`);
    if (fs.existsSync(artifactPath)) {
      const artifact = readJson(artifactPath);
      fs.writeFileSync(path.join(webContracts, `${name}.json`), JSON.stringify(artifact, null, 2));
    }
  }

  const broadcastRoot = path.join(root, 'solidity', 'broadcast');
  for (const runLatest of collectRunLatestFiles(broadcastRoot)) {
    const data = readJson(runLatest);
    const chainId = String(data.chain || data.chainId || 'unknown');
    const transactions = data.transactions || [];

    if (!addresses[chainId]) {
      addresses[chainId] = {};
    }

    for (const tx of transactions) {
      if (tx.transactionType === 'CREATE' && tx.contractName && tx.contractAddress) {
        addresses[chainId][tx.contractName] = tx.contractAddress;
      }
    }
  }

  fs.writeFileSync(path.join(webContracts, 'addresses.json'), JSON.stringify(addresses, null, 2));
  console.log(`Synced ${Object.keys(addresses).length} contract addresses.`);
}

main();

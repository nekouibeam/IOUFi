const { spawnSync } = require('child_process');
const path = require('path');

const root = path.resolve(__dirname, '..');
const solidityScript = path.join(root, 'solidity', 'script', 'DeployBroadcast.s.sol:DeployBroadcast');

function run(cmd, args, opts = {}) {
  console.log('> ' + [cmd, ...args].join(' '));
  const res = spawnSync(cmd, args, { stdio: 'inherit', shell: true, ...opts });
  if (res.error) throw res.error;
  if (res.status !== 0) process.exit(res.status);
}

function main() {
  const RPC_URL = process.env.RPC_URL || 'http://127.0.0.1:8545';
  const PRIVATE_KEY = process.env.PRIVATE_KEY;

  if (!PRIVATE_KEY) {
    console.error('ERROR: PRIVATE_KEY not set. For local anvil use one of anvil accounts as PRIVATE_KEY.');
    process.exit(1);
  }

  const solidityRoot = path.join(root, 'solidity');
  const forgeScript = 'script/DeployBroadcast.s.sol:DeployBroadcast';

  // Run forge script from the Solidity project root so Foundry resolves libs/remappings correctly.
  run('forge', ['script', forgeScript, '--rpc-url', RPC_URL, '--private-key', PRIVATE_KEY, '--broadcast'], {
    cwd: solidityRoot,
  });

  // Run sync script to copy ABIs and addresses to web/src/contracts
  run('node', [path.join(root, 'scripts', 'sync-contracts.js')]);

  console.log('Deployment + sync completed. Check web/src/contracts/addresses.json for addresses.');
}

main();

# Local Deployment (Foundry + Anvil)

Prerequisites:
- Foundry (`forge`) installed and available in PATH
- Node.js installed
- Anvil or an RPC endpoint running (default `http://127.0.0.1:8545`)

Quick local deploy steps:

1. Start anvil (if not already running):

```bash
anvil -p 8545
```

2. Export a private key from the anvil accounts (use one of anvil's keys) and set it in env:

```bash
# On Windows PowerShell
$env:PRIVATE_KEY = '0x<private_key_here>'
$env:RPC_URL = 'http://127.0.0.1:8545'

# On Unix
export PRIVATE_KEY=0x<private_key_here>
export RPC_URL=http://127.0.0.1:8545
```

3. Run the deploy + sync helper:

```bash
node scripts/deploy-and-sync.js
```

What this does:
- Runs `forge script` to deploy `ReputationLedger`, `Treasury`, `IOUNFT`, and `SDGsDAO` and writes broadcast artifacts to `solidity/broadcast`.
- Runs `scripts/sync-contracts.js` to copy ABIs and generate `web/src/contracts/addresses.json`.

After completion, start the frontend:

```bash
cd web
npm install
npm run dev
```

Notes:
- For production/testnet deployments provide a production `RPC_URL` and an appropriate `PRIVATE_KEY` with funds.
- The script requires `PRIVATE_KEY` to broadcast transactions.

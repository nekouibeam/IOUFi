# IOUFi
Favor Economy + SDGs DAO

Overview
--------
IOUFi is a minimal DApp prototype that mints ERC‑721 "IOU" NFTs, allows accepting and settling IOUs, and integrates a simple Reputation/Treasury/DAO set of contracts. This README describes how to deploy and run the full local development stack (Foundry + Anvil + Vite frontend) and how to sync contracts with the frontend.

Prerequisites
-------------
- Foundry (forge, anvil) installed and available on PATH
- Node.js (18+) and npm
- git (optional)
- MetaMask (for browser interaction)

Local quick deploy (recommended)
------------------------------
1. Start a local Anvil node (default RPC: `http://127.0.0.1:8545`, chain id `31337`):

```bash
anvil --port 8545 --chain-id 31337
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

Start frontend
--------------
Install dependencies and start the Vite dev server:

```bash
cd web
npm install
npm run dev
```

Open `http://localhost:5173` in your browser. Use MetaMask pointed at `http://127.0.0.1:8545` (chain id `31337`) or import a local Anvil private key into MetaMask to interact with the UI and sign transactions.

Verify deployment
-----------------
- Confirm `web/src/contracts/addresses.json` contains an entry for `31337` with `IOUNFT` and other contract addresses.
- Confirm `web/src/contracts/IOUNFT.json` (ABI) exists and matches the compiled contract in `solidity/out/`.
- You can also run the demo script (non-browser) which uses unlocked Anvil accounts to perform mint→accept→settle automatically:

```bash
node web/scripts/demo-interaction.js
```

Troubleshooting
---------------
- If the frontend shows "No addresses found for this chain yet": re-run `node scripts/deploy-and-sync.js` and refresh the page.
- If MetaMask does not show a popup when pressing "Mint IOU":
	- Ensure MetaMask is connected to `http://127.0.0.1:8545` and the selected account matches the expected `from` address.
	- Open DevTools Console to see JS errors; common causes are `window.ethereum` not present or mismatched chain id.
	- Ensure the `Fulfiller address` field in the Mint form is filled (the UI disables the button when required fields are empty).
- If `forge` fails to compile, verify you are running the command from the `solidity/` folder so Foundry's remappings and toml settings are applied.

Useful commands
---------------
- Start Anvil: `anvil --port 8545 --chain-id 31337`
- Deploy + sync (recommended): `node scripts/deploy-and-sync.js`
- Sync only: `node scripts/sync-contracts.js`
- Run demo interactions: `node web/scripts/demo-interaction.js`
- Start frontend: `cd web && npm run dev`

Contributing
------------
See `docs/exer3_ioufi_folder_structure.txt` for the current project layout and where to find scripts, contracts, and frontend source files.


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
export PRIVATE_KEY=0x<private_key_here> #export PRIVATE_KEY=0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6
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

Start services (indexer + query API)
------------------------------------
The frontend's address/query views depend on the off-chain indexer and the read-only query API.

1. Prepare the indexer environment:

```bash
cd services/indexer
cp .env.example .env
```

Edit `services/indexer/.env` and make sure at least these values are set:

- `JSON_RPC_URL=http://127.0.0.1:8545`
- `IOUNFT_ADDRESS=<deployed IOUNFT address>`
- `INDEXER_DB=./data/indexer.db` (or leave the default if you want the local sqlite file)

2. Install and start the indexer:

```bash
cd services/indexer
npm install
npm start
```

If you restart Anvil and want to re-initialize the local indexer from the new chain state, do this:

1. Remove the old sqlite DB so the indexer starts from a clean state.
2. Start the indexer again so it recreates the DB and begins syncing the new chain.
3. Run backfill if you want to repopulate any missing snapshot fields.

```bash
# Unix / macOS / Git Bash
rm -f services/indexer/data/indexer.db

# Windows PowerShell
Remove-Item .\services\indexer\data\indexer.db -ErrorAction SilentlyContinue
```

Then start the indexer:

```bash
cd services/indexer
npm start
```

If you need to rebuild the index from scratch after the indexer has started, run the backfill script:

```bash
cd services/indexer
npm run backfill
```

3. Start the query API in a second terminal:

```bash
cd services/api
npm install
```

Set the DB path if you want it to point at the indexer sqlite file explicitly:

```bash
# Windows PowerShell
$env:INDEXER_DB = '../indexer/data/indexer.db'

# Unix / macOS / Git Bash
export INDEXER_DB=../indexer/data/indexer.db
```

Then start the API:

```bash
cd services/api
npm start
```

Default service ports:

- Indexer: writes to `services/indexer/data/indexer.db` and keeps syncing events from the chain.
- Query API: `http://localhost:4000`

Once both services are running, the frontend can query `/api/users/:address/ious` for the address-based IOU views and inbox/accept flows.

Important note when restarting Anvil:

- `indexer.db` is persistent sqlite storage and is **not** reset automatically when Anvil starts over from a fresh chain.
- If you restart Anvil and want a clean local state, remove the old indexer DB before starting the indexer again, then rerun backfill if needed.

```bash
# Unix / macOS / Git Bash
rm -f services/indexer/data/indexer.db

# Windows PowerShell
Remove-Item .\services\indexer\data\indexer.db -ErrorAction SilentlyContinue
```

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


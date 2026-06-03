# Web Folder — Structure & File Roles

This document explains the purpose of files and directories under the `web/` folder of the IOUFi project. Use this as a quick reference for development, debugging, and frontend-backend sync tasks.

## Top-level files

- `index.html` — Vite app entry HTML.
- `package.json` — npm manifest for the frontend (dev script, deps).
- `vite.config.js` — Vite configuration used by the dev server/build.

## `scripts/`

- `demo-interaction.js`
  - Purpose: Node script that simulates a complete mint → accept → settle flow using a local provider (Anvil) and unlocked accounts.
  - Usage: run it when you want to exercise contract flows without a browser wallet.

## `src/`

- `main.jsx` — App bootstrapping, React root mounting.
- `App.jsx` — Main application layout and routing; wires UI pages, wallet connect controls, and top-level state.
- `styles.css` — Global styles used by the app.

### `src/api/contract.js`

- Purpose: Centralized contract helpers and provider/signer wiring.
- Responsibilities:
  - Load ABIs from `src/contracts/*.json` and read `src/contracts/addresses.json` to pick contract addresses for the connected chain.
  - Provide helper functions to obtain an ethers `Provider` and `Signer` (injected `window.ethereum` or local RPC), and to instantiate contracts bound to signer/provider for reads and writes.
  - Expose high-level wrappers used by UI pages (e.g., `getIOUNFTContract(signerOrProvider)`).

Important: If you modify contract ABIs or add new contracts, run the repository sync step so `src/contracts/` stays current (see below).

### `src/contracts/`

- `addresses.json` — Chain-scoped mapping of deployed addresses. Example shape:

```json
{
  "31337": {
    "IOUNFT": "0x...",
    "ReputationLedger": "0x...",
    "Treasury": "0x...",
    "SDGsDAO": "0x..."
  }
}
```

- `IOUNFT.json`, `ReputationLedger.json`, `SDGsDAO.json`, `Treasury.json` — contract ABIs used by the frontend. These are copied from the `solidity/out/` or produced by the sync script.

If `addresses.json` does not contain an entry for the connected chain, the UI will show "No addresses found for this chain yet" and disable transaction buttons.

### `src/pages/`

- `CreateIOU.jsx` — UI for minting IOUs. Reads form inputs (fulfiller address, value, transferable flag) and calls `IOUNFT.mintIOU(...)` via a signer.
- `Marketplace.jsx` — Listing / browsing of existing IOUs (read-only views using a provider-bound contract instance).
- `IOUDetail.jsx` — Detailed view for a single IOU token; shows state, creator/fulfiller, and action buttons (accept, settle, refund) depending on token state.
- `DAO.jsx` — Minimal DAO UI to inspect proposals or trigger DAO actions (may read from `SDGsDAO`).
- `Treasury.jsx` — Shows `Treasury` balances and allows owner/DAO-triggered transfers if implemented.

## Running the frontend

Install deps and run Vite dev server:

```bash
cd web
npm install
npm run dev
```

Open `http://localhost:5173` and connect MetaMask (or other injected wallet). Ensure MetaMask is pointed to the correct RPC (e.g., `http://127.0.0.1:8545`) and chain id (`31337`).

## Syncing contracts & addresses

The frontend expects ABIs and a chain-scoped `addresses.json` to be present in `src/contracts/`. Use the repository-level scripts to compile, deploy, and sync:

```bash
# start local Anvil
anvil --port 8545 --chain-id 31337

# from project root: deploy and sync (recommended)
node scripts/deploy-and-sync.js

# or run sync only after manual forge deploy
node scripts/sync-contracts.js
```

`deploy-and-sync.js` will run `forge script ... --broadcast` (from `solidity/`) then copy ABIs and write `web/src/contracts/addresses.json` keyed by chain id.

## Troubleshooting common frontend issues

- Buttons disabled / "No addresses found for this chain yet":
  - Confirm `web/src/contracts/addresses.json` contains an entry for the chain reported by MetaMask (`eth_chainId` should be `0x7a69` for `31337`).
  - Re-run `node scripts/deploy-and-sync.js` and refresh the page.
- MetaMask doesn't show a popup when sending transactions:
  - Open DevTools Console and check for errors (e.g., `window.ethereum` undefined, or exceptions thrown by UI handlers).
  - Ensure the connected account matches the `from` address used in the transaction call.
  - If the UI uses a provider without a signer, writes will fail — verify `contract.connect(signer)` or new `ethers.Contract(addr, abi, signer)` is used for txs.
- ABI mismatch / contract call reverts:
  - Re-sync ABIs from `solidity/out/` and ensure contract address in `addresses.json` is correct.

## Notes for developers

- Prefer using `web/scripts/demo-interaction.js` to exercise flows when you don't want to use MetaMask.
- When updating Solidity contract APIs, update the ABIs and run `node scripts/sync-contracts.js` before testing the frontend.
- Keep `src/api/contract.js` as the single place for provider/signer/contract wiring to avoid duplication.

If you want, I can add inline references to the specific functions called by each page (e.g., `mintIOU`, `acceptIOU`, `settleSocialIOU`) or generate a small troubleshooting checklist for wallet connection problems.

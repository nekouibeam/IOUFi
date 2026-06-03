# Solidity Folder — Structure & File Roles

This document explains the purpose of files and directories under the `solidity/` folder of the IOUFi project. Use this as a quick reference when developing, testing, or deploying the contracts.

## Top-level layout

- `foundry.toml` — Foundry configuration for compilation, remappings, and test settings.
- `lib/` — third-party libraries and dependencies (OpenZeppelin is vendored here).
- `script/` — deployment scripts for Foundry (`forge script ...`) and broadcast scripts used in automation.
- `src/` — the smart contract source code (the contracts you will edit).
- `test/` — Foundry test suites written in Solidity (unit/integration tests).
- `out/` and `broadcast/` — generated build artifacts and broadcast outputs (created by `forge` / `forge script --broadcast`).

## `src/` (contracts)

Contents of `solidity/src/` (primary contracts):

- `IOUNFT.sol`
  - Role: The core application contract. Implements the ERC‑721 IOU NFT lifecycle (mint, accept, settle, refund, timeout-claim).
  - Responsibilities: define the IOU data structure, manage state transitions (pending → active → settled/refunded), accept payable mint deposits, interact with `ReputationLedger` and `Treasury` for rep updates and fee handling.
  - Key interactions: calls functions on `IReputationLedger` to update reputation and transfers fees to `Treasury` when appropriate.

- `ReputationLedger.sol`
  - Role: Stores and updates user reputation data (current, lifetime, locked amounts).
  - Responsibilities: expose functions to increase/decrease/lock/unlock reputation; provide read helpers used by `IOUNFT` and `SDGsDAO`.
  - Reason for interface: other contracts interact through `interfaces/IReputationLedger.sol` to remain decoupled.

- `SDGsDAO.sol`
  - Role: A lightweight DAO/governance contract that consumes reputation as voting weight.
  - Responsibilities: proposal creation / voting / execution primitives (depending on implementation), reads voting power from `ReputationLedger` and may instruct `Treasury` to disburse funds on approved proposals.

- `Treasury.sol`
  - Role: System treasury that holds fees and deposits collected by application contracts.
  - Responsibilities: receive ETH (or tokens), hold balances, allow authorized withdrawals or transfers to the DAO/beneficiaries. `IOUNFT` typically deposits fees here.

- `interfaces/IReputationLedger.sol`
  - Role: Solidity interface describing the external functions/events of `ReputationLedger` used by other contracts.
  - Responsibilities: provide typed function signatures for reputation ops so `IOUNFT` and `SDGsDAO` can call them without direct coupling to the concrete implementation.

## `script/` (deployment automation)

- `deploy.s.sol` / `DeployBroadcast.s.sol`
  - Role: Foundry scripts used to deploy contracts to a chain. The broadcast variant is intended for `forge script ... --broadcast` to produce transactions recorded in the `broadcast/` folder.
  - Usage: run `cd solidity && forge script script/DeployBroadcast.s.sol --rpc-url <URL> --broadcast` (or use the repo `scripts/deploy-and-sync.js` orchestrator from project root).

## `test/`

- Contains Solidity test files (e.g. `IOUNFT.t.sol`, `ReputationRules.t.sol`, `TimeoutRefund.t.sol`) executed by `forge test`.
  - Purpose: unit and integration tests verifying IOU lifecycle, reputation mechanics, refund/timeout logic, and Treasury interactions.

## `lib/openzeppelin-contracts/`

- Vendor folder with OpenZeppelin Contracts used by the project. The project imports OpenZeppelin primitives (ERC‑721, Ownable, ReentrancyGuard, etc.) from here.

## Build / runtime artifacts

- `out/` — compiled artifacts (solc output JSON) produced by `forge build`.
- `broadcast/` — JSON files containing the broadcasted transactions and deployment receipts produced by `forge script --broadcast`.

## Common workflows (references)

- Deploy & sync addresses to frontend (from repo root):

```bash
anvil --port 8545 --chain-id 31337
node scripts/deploy-and-sync.js
```

- Run tests:

```bash
cd solidity
forge test
```

- Run a single Foundry deploy script manually:

```bash
cd solidity
forge script script/DeployBroadcast.s.sol --rpc-url http://127.0.0.1:8545 --broadcast
```

## Notes & recommendations

- Keep `IReputationLedger` as the stable interface used by external contracts so the `ReputationLedger` implementation can evolve without breaking callers.
- When changing a contract API, re-run `node scripts/sync-contracts.js` to update `web/src/contracts/` (ABI + addresses) so the frontend stays in sync.
- Use the Foundry broadcast outputs in `broadcast/` for reproducible deployment records and for debugging transaction traces.

If you want, I can also generate a Mermaid sequence diagram showing the mint→accept→settle flow referencing these contracts, or expand this markdown with specific function signatures and emitted events per contract.

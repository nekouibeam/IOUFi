# OpenZeppelin in IOUFi

This project uses OpenZeppelin Contracts v5 as the base layer for token behavior, ownership control, and reentrancy protection. The Solidity sources import OpenZeppelin from the vendored `openzeppelin-contracts` package under `solidity/lib/`.

## What OpenZeppelin provides here

### `ERC721`

Used in `solidity/src/IOUNFT.sol`.

- Provides the NFT foundation for IOU tokens.
- Handles standard ERC-721 behavior such as ownership tracking, minting, transfers, and token existence checks.
- IOUFi builds its business logic on top of the standard instead of re-implementing NFT mechanics.

In this project, `IOUNFT` inherits from `ERC721` and calls `_mint(msg.sender, tokenId)` when minting an IOU.

### `Ownable`

Used in:

- `solidity/src/IOUNFT.sol`
- `solidity/src/ReputationLedger.sol`
- `solidity/src/Treasury.sol`
- `solidity/src/SDGsDAO.sol`

`Ownable` is used to restrict administrative actions to the contract owner.

Typical owner-only operations in this project include:

- updating the `Treasury` address in `IOUNFT`
- updating the `ReputationLedger` address in `IOUNFT`
- setting the linked `IOUNFT` and `DAO` addresses in `ReputationLedger`
- setting the `DAO` address in `Treasury`
- adjusting DAO/treasury wiring in `SDGsDAO`

The constructors use the OpenZeppelin v5 style `Ownable(msg.sender)` initialization so the deployer becomes the initial owner.

### `ReentrancyGuard`

Used in `solidity/src/IOUNFT.sol`.

`ReentrancyGuard` protects settlement and refund flows that send ETH back out of the contract.

It is applied to functions that perform external transfers after state changes, such as:

- `settleBountyIOU(...)`
- `timeoutClaim(...)`
- `refundPending(...)`

This helps prevent reentrancy attacks during value transfers.

## How the contracts use OpenZeppelin together

### `IOUNFT.sol`

- Inherits `ERC721` for token issuance and ownership logic.
- Inherits `Ownable` for admin setters like `setTreasury(...)` and `setReputationLedger(...)`.
- Inherits `ReentrancyGuard` for ETH payout safety.
- Overrides `_update(...)` to enforce IOU-specific transfer restrictions on active tokens.

### `ReputationLedger.sol`

- Uses `Ownable` for trusted configuration of the linked IOU NFT and DAO addresses.
- Does not need ERC-721 or reentrancy protection because it stores and updates reputation data only.

### `Treasury.sol`

- Uses `Ownable` to control DAO assignment.
- Receives ETH through `receive()` and allows DAO-authorized withdrawals.
- Keeps value-transfer authority limited to the configured DAO.

### `SDGsDAO.sol`

- Uses `Ownable` to manage treasury wiring.
- Reads voting power from `ReputationLedger` and triggers `Treasury.withdraw(...)` when proposals pass.

## Why OpenZeppelin fits this project

- It avoids re-implementing ERC-721 from scratch.
- It gives a clear ownership pattern for admin functions.
- It adds a standard reentrancy defense for functions that move ETH.
- It keeps the codebase easier to audit because the core primitives are widely reviewed and familiar.

## Notes

- This project does not currently use OpenZeppelin extensions like `Pausable`, `Enumerable`, or upgradeable proxies.
- The imported OpenZeppelin contracts are vendored locally under `solidity/lib/openzeppelin-contracts/` and compiled through Foundry remappings.
- If contract behavior changes, re-run the deployment sync so the frontend ABIs stay aligned.

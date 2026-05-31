# IOUFi API List

This document lists the backend APIs that the frontend can use in the current IOUFi codebase.

Important notes:
- There is an indexer-backed HTTP query API in `services/api` (default `http://localhost:4000`), used by frontend list and reputation pages.
- Frontend still talks to Solidity contracts directly for write transactions through `ethers`.
- Write calls require a signer / connected wallet.
- Read calls can come from either on-chain provider reads (`web/src/api/contract.js`) or indexer-backed HTTP routes (`/api/...`).
- Contract ABIs and deployed addresses are synced into `web/src/contracts/` by `node scripts/deploy-and-sync.js`.

## Indexer Query API (services/api)

- `GET /api/reputation/summary`
- `GET /api/reputation/leaderboard?limit=20&offset=0`
- `GET /api/reputation/:address`
- `GET /api/reputation/interactions?address=0x...&limit=20&offset=0`
- `GET /api/reputation/interactions/summary?address=0x...&limit=50&offset=0`
- `GET /api/users/:address/ious?roles=creator,owner,fulfiller&states=0,1&limit=20`
- `GET /api/marketplace/ious?limit=100`

## Shared data formats

### `IOUNFT.IOUData`

Returned by `getIOU(tokenId)` and the public mapping getter `ious(tokenId)`.

```solidity
struct IOUData {
    address creator;
    address fulfiller;
    uint256 collateral;
    State state;
    uint256 createdAt;
    uint256 deadline;
    string description;
    string serviceType;
  uint256 decayedCreatorRepBase;
  uint256 decayedFulfillerRepBase;
  bool closeRequested;
  uint256 closeRequestedAt;
  bool repPreAwarded;
  uint256 repPreAwardedAmount;
    bool transferable;
    bool unhappyClose;
  bool transferRequested;
  address transferTo;
  bool transferNewOwnerConfirmed;
  bool transferFulfillerConfirmed;
  uint256 transferRequestedAt;
  uint256 transferFeePaid;
}
```
#### 觀念解析
鑄造後誰持有 NFT 目前在 solidity/src/IOUNFT.sol 的 mintIOU，實際是 _mint(msg.sender, tokenId)，所以鑄造後的 owner 是發放人，也就是債權人，不是 fulfiller。

這代表：

 - creator = 發放人，會保留在 `IOUData.creator`
 - owner = ERC721 持有人，現在是發放人
 - fulfiller = 債務人，只是 IOU 裡記錄的對象，不等於 NFT 當前持有人

Current transfer policy:

 - `Pending` IOUs are not transferable.
 - `Active` social IOUs (`collateral == 0`) are transferable only through the three-party confirmation flow.
 - `Active` bounty IOUs (`collateral > 0`) are locked and cannot be transferred.
 - `Settled` and `Cancelled` IOUs are not transferable.

### `IOUNFT.State`

Enum values:

- `0` = `Pending`
- `1` = `Active`
- `2` = `Settled`
- `3` = `Cancelled`

### `ReputationLedger.ReputationData`

Returned by the public mapping getter `reputations(account)`.

Expected fields from the interface / storage layout:

- `currentRep`
- `lifetimeRep`
- `lockedRep`

### `ReputationLedger.InteractionRecord`

Returned by the public mapping getter `interactions(bytes32)`.

Fields:

- `decayLevel`
- `lastInteractionTs`

### `SDGsDAO.Proposal`

Returned by the public mapping getter `proposals(proposalId)`.

```solidity
struct Proposal {
    address proposer;
    address payable recipient;
    uint256 amount;
    bytes data;
    uint256 votesFor;
    uint256 votesAgainst;
    bool executed;
}
```

## IOUNFT contract

Contract name in frontend artifacts: `IOUNFT`

Address source: `web/src/contracts/addresses.json` under the current chain id

### Write APIs

#### `mintIOU(address fulfiller, uint256 deadline, bool transferable, string description, string serviceType) payable returns (uint256 tokenId)`

- Purpose: create a new IOU NFT.
- Caller: creator / issuer.
- Inputs:
  - `fulfiller`: wallet address of the person who owes the IOU.
  - `deadline`: unix timestamp in seconds.
  - `transferable`: retained in storage for compatibility, but `Pending` transfers are blocked in the current policy.
  - `description`: required human-readable IOU description.
  - `serviceType`: service category tag for the eventual repayment.
- ETH value:
  - `msg.value` becomes the IOU collateral.
  - Optional; can be `0` for social IOUs.
- Output:
  - Transaction response from ethers.
  - Solidity return value is `tokenId`, but on the frontend this is usually read from the receipt / event logs rather than from the tx promise directly.
- Emits:
  - `IOUCreated(tokenId, creator, fulfiller, collateral)`
- Reverts when:
  - `deadline <= block.timestamp`

#### `modifyPending(uint256 tokenId, uint256 newDeadline, string newDescription, string newServiceType)`

- Purpose: edit a pending IOU draft before it becomes active.
- Caller: creator only.
- Inputs:
  - `tokenId`: target IOU NFT.
  - `newDeadline`: updated deadline.
  - `newDescription`: updated service description.
  - `newServiceType`: updated service type tag.
- Output:
  - Transaction response.
- Emits:
  - `IOUCreated(tokenId, creator, fulfiller, collateral)` as the current draft-refresh signal.
- Reverts when:
  - token does not exist
  - token is not `Pending`
  - caller is not creator
  - `newDeadline <= block.timestamp`
  - `newDescription` is empty
  - `newServiceType` is empty

#### `acceptIOU(uint256 tokenId)`

- Purpose: mark a pending IOU as active and assign the fulfiller.
- Caller: the fulfiller, or any account if the IOU has no assigned fulfiller yet.
- Inputs:
  - `tokenId`: the IOU NFT id.
- Output:
  - Transaction response.
- Emits:
  - `IOUAccepted(tokenId, fulfiller)`
- Reverts when:
  - token does not exist
  - token is not `Pending`
  - caller is not the assigned fulfiller when one is already set

#### `settleSocialIOU(uint256 tokenId, uint8 rating)`

- Purpose: settle a social IOU with no ETH collateral.
- Caller: creator only.
- Inputs:
  - `tokenId`: target IOU NFT.
  - `rating`: settlement rating, passed to reputation logic.
- Output:
  - Transaction response.
- Emits:
  - `IOUSettled(tokenId, fee, payout)` with `fee = 0` and `payout = 0`
  - one or two `ReputationAwarded(...)` events depending on reward split
- Reverts when:
  - token does not exist
  - token is not `Active`
  - caller is not creator
  - collateral is not zero

#### `settleBountyIOU(uint256 tokenId, uint8 rating)`

- Purpose: settle an ETH-backed IOU, distribute payout and marketplace fee.
- Caller: creator only.
- Inputs:
  - `tokenId`: target IOU NFT.
  - `rating`: settlement rating, passed to reputation logic.
- Output:
  - Transaction response.
- Side effects:
  - Fee is sent to `treasury`.
  - Payout is sent to `fulfiller`.
- Emits:
  - `IOUSettled(tokenId, fee, payout)`
  - `ReputationAwarded(...)`
- Reverts when:
  - token does not exist
  - token is not `Active`
  - caller is not creator
  - collateral is zero
  - ETH transfer fails

#### `timeoutClaim(uint256 tokenId)`

- Purpose: reclaim collateral after the IOU deadline.
- Caller: creator only.
- Inputs:
  - `tokenId`: target IOU NFT.
- Output:
  - Transaction response.
- Side effects:
  - marks IOU as `Cancelled`
  - returns collateral to creator if any exists
- Emits:
  - `IOURefunded(tokenId, amount)`
- Reverts when:
  - token does not exist
  - token is not `Active`
  - deadline not reached
  - caller is not creator
  - ETH transfer fails

#### `refundPending(uint256 tokenId)`

- Purpose: cancel a pending IOU and refund its collateral.
- Caller: creator only.
- Inputs:
  - `tokenId`: target IOU NFT.
- Output:
  - Transaction response.
- Side effects:
  - marks IOU as `Cancelled`
  - returns collateral to creator if any exists
- Emits:
  - `IOURefunded(tokenId, amount)`
- Reverts when:
  - token does not exist
  - token is not `Pending`
  - caller is not creator
  - ETH transfer fails

#### `startTransfer(uint256 tokenId, address to)`

- Purpose: start the three-party transfer flow for an `Active` social IOU.
- Caller: current owner only.
- Inputs:
  - `tokenId`: target IOU NFT.
  - `to`: proposed new owner address.
- Output:
  - Transaction response.
- Emits:
  - `TransferInitiated(tokenId, from, to)`
- Reverts when:
  - token does not exist
  - caller is not current owner
  - token is not `Active`
  - token collateral is not zero
  - a transfer is already pending
  - `to` is zero address

#### `confirmTransferByNewOwner(uint256 tokenId)` payable

- Purpose: let the proposed new owner accept the transfer and pay the fixed fee.
- Caller: `transferTo` only.
- ETH value:
  - Must be exactly `0.0015 ETH` (`1_500_000_000_000_000 wei`).
- Output:
  - Transaction response.
- Emits:
  - `TransferConfirmed(tokenId, by)`
  - `TransferCompleted(tokenId, from, to, fee)` once the fulfiller has also confirmed
- Reverts when:
  - no transfer is pending
  - caller is not the proposed new owner
  - attached ETH is not exactly the fixed fee

#### `confirmTransferByFulfiller(uint256 tokenId)`

- Purpose: let the fulfiller approve the transfer.
- Caller: fulfiller only.
- Output:
  - Transaction response.
- Emits:
  - `TransferConfirmed(tokenId, by)`
  - `TransferCompleted(tokenId, from, to, fee)` once the new owner has also confirmed
- Reverts when:
  - no transfer is pending
  - caller is not fulfiller

#### `rejectTransfer(uint256 tokenId)`

- Purpose: cancel a pending transfer request.
- Caller: current owner, proposed new owner, or fulfiller.
- Side effects:
  - clears the transfer request
  - refunds the fixed fee to the new owner if it had already been paid
- Emits:
  - `TransferRejected(tokenId, by)`
- Reverts when:
  - no transfer is pending
  - caller is not authorized
  - ETH transfer fails

### Read APIs

#### `getIOU(uint256 tokenId) external view returns (IOUData memory)`

- Purpose: fetch the full IOU struct for a token id.
- Inputs:
  - `tokenId`
- Output:
  - `IOUData` struct fields listed above.
- Reverts when:
  - token does not exist

### Public auto-generated getters

Because the contract uses `public` state variables / mappings, Solidity generates read functions automatically.

#### `nextTokenId() external view returns (uint256)`

- Current next token id to mint.

#### `marketplaceFeeBps() external view returns (uint256)`

- Fee basis points used by bounty settlement.

#### `transferFeeWei() external view returns (uint256)`

- Fixed transfer fee charged to the new owner during the Active social IOU transfer flow.
- Value: `1_500_000_000_000_000 wei` (`0.0015 ETH`).

#### `treasury() external view returns (address)`

- Current treasury address.

#### `reputationLedger() external view returns (address)`

- Current reputation ledger address.

#### `ious(uint256 tokenId) external view returns (IOUData)`

- Same data as `getIOU(tokenId)` but generated by the public mapping.

### Owner / admin setters

#### `setTreasury(address treasury_)`

- Caller: contract owner.
- Updates the treasury address.
- Emits: `TreasuryUpdated(treasury_)`

#### `setReputationLedger(address reputationLedger_)`

- Caller: contract owner.
- Updates the reputation ledger address.
- Emits: `ReputationLedgerUpdated(reputationLedger_)`

#### `setMarketplaceFeeBps(uint256 feeBps)`

- Caller: contract owner.
- Updates fee basis points.
- Constraint: `feeBps <= 2000`

### Events

- `IOUCreated(uint256 tokenId, address creator, address fulfiller, uint256 collateral)`
- `IOUAccepted(uint256 tokenId, address fulfiller)`
- `IOUSettled(uint256 tokenId, uint256 fee, uint256 payout)`
- `IOURefunded(uint256 tokenId, uint256 amount)`
- `TransferInitiated(uint256 tokenId, address from, address to)`
- `TransferConfirmed(uint256 tokenId, address by)`
- `TransferCompleted(uint256 tokenId, address from, address to, uint256 fee)`
- `TransferRejected(uint256 tokenId, address by)`
- `ReputationAwarded(uint256 tokenId, address account, uint256 amount)`
- `TreasuryUpdated(address treasury)`
- `ReputationLedgerUpdated(address reputationLedger)`

## ReputationLedger contract

Contract name in frontend artifacts: `ReputationLedger`

### Write APIs

#### `awardRep(address to, uint256 amount, address from)`

- Purpose: increase reputation when IOU settlement rewards are awarded.
- Caller: `IOUNFT` only.
- Inputs:
  - `to`: account receiving reputation.
  - `amount`: amount of reputation to award.
  - `from`: counterparty used for interaction decay tracking.
- Output:
  - Transaction response.
- Emits:
  - `ReputationChanged(to, currentDelta, lifetimeDelta, lockedDelta)`
- Reverts when:
  - caller is not `IOUNFT`
  - `to == address(0)`

#### `lockRep(address account, uint256 amount)`

- Purpose: lock reputation for governance / collateral logic.
- Caller: DAO only.
- Inputs:
  - `account`
  - `amount`
- Output:
  - Transaction response.
- Emits:
  - `ReputationChanged(account, 0, 0, amount)`
- Reverts when:
  - caller is not DAO
  - insufficient unlocked reputation

#### `unlockRep(address account, uint256 amount)`

- Purpose: unlock previously locked reputation.
- Caller: DAO only.
- Inputs:
  - `account`
  - `amount`
- Output:
  - Transaction response.
- Emits:
  - `ReputationChanged(account, 0, 0, -amount)`
- Reverts when:
  - caller is not DAO
  - insufficient locked reputation

### Read APIs

#### `getReputation(address account) external view returns (uint256 currentRep, uint256 lifetimeRep, uint256 lockedRep)`

- Purpose: fetch the three reputation counters.
- Inputs:
  - `account`
- Output:
  - `currentRep`: current usable reputation.
  - `lifetimeRep`: all-time earned reputation.
  - `lockedRep`: reputation currently locked.

#### `getVotingPower(address account) external view returns (uint256)`

- Purpose: fetch usable voting power.
- Formula:
  - `currentRep - lockedRep`

### Public auto-generated getters

#### `iouNft() external view returns (address)`

- Authorized IOUNFT contract address.

#### `dao() external view returns (address)`

- Authorized DAO address.

#### `reputations(address account) external view returns (ReputationData)`

- Reputation struct for one account.

#### `interactions(bytes32 key) external view returns (InteractionRecord)`

- Decay state for a pairwise interaction key.

#### `DECAY_WINDOW() external view returns (uint256)`

- Constant helper value, currently 10 days.

### Owner / admin setters

#### `setIOUNFT(address iouNft_)`

- Caller: owner.
- Sets the authorized IOUNFT address.
- Emits: `IOUNFTUpdated(iouNft_)`

#### `setDAO(address dao_)`

- Caller: owner.
- Sets the authorized DAO address.
- Emits: `DAOUpdated(dao_)`

### Events

- `ReputationChanged(address account, int256 currentDelta, int256 lifetimeDelta, int256 lockedDelta)`
- `IOUNFTUpdated(address iouNft)`
- `DAOUpdated(address dao)`

## Treasury contract

Contract name in frontend artifacts: `Treasury`

### Write APIs

#### `withdraw(address payable to, uint256 amount)`

- Purpose: transfer ETH out of the treasury.
- Caller: DAO only.
- Inputs:
  - `to`: recipient address.
  - `amount`: wei amount.
- Output:
  - Transaction response.
- Emits:
  - `TreasuryWithdrawn(to, amount)`
- Reverts when:
  - caller is not DAO
  - `to == address(0)`
  - insufficient balance
  - ETH transfer fails

### Read / receive behavior

#### `receive() external payable`

- Purpose: accept ETH transfers directly.
- Output:
  - no return value.

#### `dao() external view returns (address)`

- Current DAO address allowed to withdraw.

### Owner / admin setters

#### `setDAO(address dao_)`

- Caller: owner.
- Sets the authorized DAO address.
- Emits: `DAOUpdated(dao_)`

### Events

- `DAOUpdated(address dao)`
- `TreasuryWithdrawn(address to, uint256 amount)`

## SDGsDAO contract

Contract name in frontend artifacts: `SDGsDAO`

### Write APIs

#### `createProposal(address payable recipient, uint256 amount, bytes calldata data) external returns (uint256 proposalId)`

- Purpose: create a governance proposal.
- Caller: any account.
- Inputs:
  - `recipient`: treasury payout recipient.
  - `amount`: wei amount to withdraw from treasury.
  - `data`: optional calldata to execute on the recipient after withdrawal.
- Output:
  - Transaction response.
  - Solidity return value: `proposalId`.
- Emits:
  - `ProposalCreated(proposalId, proposer, recipient, amount)`

#### `vote(uint256 proposalId, bool support)`

- Purpose: vote on a proposal using reputation-weighted power.
- Caller: any account with positive voting power.
- Inputs:
  - `proposalId`
  - `support`: `true` for yes, `false` for no
- Output:
  - Transaction response.
- Emits:
  - `Voted(proposalId, voter, support, weight)`
- Reverts when:
  - proposal already executed
  - caller already voted
  - voting power is zero

#### `executeProposal(uint256 proposalId)`

- Purpose: execute a passed proposal and release funds from treasury.
- Caller: any account.
- Inputs:
  - `proposalId`
- Output:
  - Transaction response.
- Side effects:
  - calls `treasury.withdraw(recipient, amount)`
  - optionally calls `recipient.call(data)` if data exists
- Emits:
  - `Executed(proposalId, true)`
- Reverts when:
  - proposal already executed
  - votesFor <= votesAgainst
  - treasury withdrawal or recipient callback fails

### Public auto-generated getters

#### `reputationLedger() external view returns (address)`

- Linked reputation ledger contract.

#### `treasury() external view returns (Treasury)`

- Linked treasury contract.

#### `proposalCount() external view returns (uint256)`

- Next proposal id counter.

#### `proposals(uint256 proposalId) external view returns (Proposal)`

- Proposal struct for a specific id.

#### `hasVoted(uint256 proposalId, address voter) external view returns (bool)`

- Whether one address has voted on one proposal.

### Owner / admin setters

#### `setTreasury(address treasury_)`

- Caller: owner.
- Updates the treasury contract reference.

### Events

- `ProposalCreated(uint256 proposalId, address proposer, address recipient, uint256 amount)`
- `Voted(uint256 proposalId, address voter, bool support, uint256 weight)`
- `Executed(uint256 proposalId, bool success)`

## Frontend helper APIs in `web/src/api/contract.js`

These are the current functions exported by the frontend wrapper.

### Provider / contract helpers

#### `getProvider() -> ethers.BrowserProvider`

- Uses `window.ethereum`.
- Throws when there is no injected wallet.

#### `getReadProvider() -> ethers.BrowserProvider | ethers.JsonRpcProvider`

- Uses `window.ethereum` when available.
- Falls back to `VITE_RPC_URL` or `http://127.0.0.1:8545` for read-only calls.

#### `connectWallet() -> Provider`

- Requests wallet accounts via `eth_requestAccounts`.
- Useful before any write call.

#### `getContract(name) -> ethers.Contract`

- Parameters:
  - `name`: one of `IOUNFT`, `ReputationLedger`, `Treasury`, `SDGsDAO`
- Uses chain-scoped address lookup from `addresses.json`.
- Returns a signer-bound contract instance for write calls.

#### `getReadContract(name) -> ethers.Contract`

- Parameters:
  - `name`: one of `IOUNFT`, `ReputationLedger`, `Treasury`, `SDGsDAO`
- Uses chain-scoped address lookup from `addresses.json`.
- Returns a provider-bound contract instance for read calls.

#### `getIOU(tokenId)`

- Maps to `IOUNFT.getIOU(tokenId)` through `getReadContract('IOUNFT')`.

#### `getReputation(account)`

- Maps to `ReputationLedger.getReputation(account)` through `getReadContract('ReputationLedger')`.

#### `getVotingPower(account)`

- Maps to `ReputationLedger.getVotingPower(account)` through `getReadContract('ReputationLedger')`.

#### `getProposal(proposalId)`

- Maps to `SDGsDAO.proposals(proposalId)` through `getReadContract('SDGsDAO')`.

### Write wrappers

#### `mintIOU({ fulfiller, deadlineTs, transferable = false, valueEth = '0', description, serviceType })`

- Maps to `IOUNFT.mintIOU(...)`.
- `valueEth` is converted to wei with `ethers.parseEther` when non-zero.
- The frontend wrapper passes the human-readable IOU fields from the create form: `description` and `serviceType`.

#### `modifyPending(tokenId, newDeadline, newDescription, newServiceType)`

- Maps to `IOUNFT.modifyPending(tokenId, newDeadline, newDescription, newServiceType)`.

#### `startTransfer(tokenId, to)`

- Maps to `IOUNFT.startTransfer(tokenId, to)`.

#### `confirmTransferByNewOwner(tokenId)`

- Maps to `IOUNFT.confirmTransferByNewOwner(tokenId)`.
- Must be called with exactly `transferFeeWei` in `msg.value`.

#### `confirmTransferByFulfiller(tokenId)`

- Maps to `IOUNFT.confirmTransferByFulfiller(tokenId)`.

#### `rejectTransfer(tokenId)`

- Maps to `IOUNFT.rejectTransfer(tokenId)`.

#### `acceptIOU(tokenId)`

- Maps to `IOUNFT.acceptIOU(tokenId)`.

#### `settleSocialIOU(tokenId, rating)`

- Maps to `IOUNFT.settleSocialIOU(tokenId, rating)`.

#### `settleBountyIOU(tokenId, rating)`

- Maps to `IOUNFT.settleBountyIOU(tokenId, rating)`.

#### `refundPending(tokenId)`

- Maps to `IOUNFT.refundPending(tokenId)`.

#### `timeoutClaim(tokenId)`

- Maps to `IOUNFT.timeoutClaim(tokenId)`.

## Practical frontend usage notes

- IOU minting uses a signer and typically needs wallet approval.
- Most current UI flows are built around these methods:
  - create IOU: `mintIOU`
  - accept IOU: `acceptIOU`
  - settle social IOU: `settleSocialIOU`
  - settle bounty IOU: `settleBountyIOU`
  - refund pending: `refundPending`
  - timeout claim: `timeoutClaim`
  - modify pending draft: `modifyPending`
  - start transfer: `startTransfer`
  - confirm transfer by new owner: `confirmTransferByNewOwner`
  - confirm transfer by fulfiller: `confirmTransferByFulfiller`
  - reject transfer: `rejectTransfer`
- For read-heavy pages, the next useful addition would be provider-based helpers such as:
  - `getIOU(tokenId)`
  - `getReputation(address)`
  - `getTreasuryBalance()`
  - `getProposal(proposalId)`

## Suggested sync flow

When contract ABIs or signatures change:

1. Rebuild / redeploy contracts.
2. Run `node scripts/deploy-and-sync.js`.
3. Refresh the frontend so `web/src/contracts/*.json` and `addresses.json` stay aligned.

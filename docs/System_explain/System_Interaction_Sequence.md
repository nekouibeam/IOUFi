# System Interaction Sequence During IOU Lifecycle

This document illustrates the interactions between the three main components of the IOUFi ecosystem during the lifecycle of an IOU:
1. **The Frontend (Web)**: The user interface where users (Creators and Fulfillers) interact with the application.
2. **Off-Chain Services**: The Indexer and Query API that listen to blockchain events and serve aggregated data.
3. **Smart Contracts (On-Chain)**: The core blockchain logic (`IOUNFT`, `ReputationLedger`, etc.) maintaining the actual state.

## Overview

The standard lifecycle of an IOU involves four major phases:
1. **Minting (Pending State)**: A Creator proposes a new IOU.
2. **Acceptance (Active State)**: A Fulfiller agrees to the terms and takes on the task.
3. **Fulfillment (Close Requested)**: The Fulfiller completes the work and requests the Creator to close the IOU.
4. **Settlement (Settled State)**: The Creator confirms the work, triggering collateral payouts (if any) and reputation updates.

Throughout all phases, the typical pattern is:
1. User acts via the **Frontend**.
2. **Frontend** submits a transaction to the **Smart Contracts**.
3. **Smart Contracts** execute logic and emit events.
4. **Off-Chain Services (Indexer)** catch these events and update the read-optimized database.
5. **Frontend** queries **Off-Chain Services (API)** to quickly display the updated state to users without needing heavy blockchain reads.

## Sequence Diagram

```mermaid
sequenceDiagram
    autonumber
    actor Creator as User (Creator)
    actor Fulfiller as User (Fulfiller)
    participant Frontend as Frontend (Web)
    participant OffChain as Off-Chain Services<br/>(API / Indexer)
    participant Contracts as Smart Contracts<br/>(On-Chain)

    %% Minting Phase
    rect rgb(245, 245, 245)
    Note over Creator, Contracts: 1. Minting Phase (Pending)
    Creator->>Frontend: Fills out IOU details and clicks "Mint"
    Frontend->>Contracts: tx: `mintIOU(...)` with terms & collateral
    Contracts-->>OffChain: Event: IOUCreated
    OffChain->>OffChain: Indexer saves new IOU to SQLite DB
    Frontend->>OffChain: GET /api/users/{address}/ious
    OffChain-->>Frontend: Returns updated list of IOUs
    Frontend-->>Creator: Shows IOU as "Pending"
    end

    %% Acceptance Phase
    rect rgb(235, 245, 255)
    Note over Creator, Contracts: 2. Acceptance Phase (Active)
    Fulfiller->>Frontend: Browses marketplace for IOUs
    Frontend->>OffChain: GET /api/ious/marketplace
    OffChain-->>Frontend: Returns list of pending IOUs
    Fulfiller->>Frontend: Clicks "Accept IOU"
    Frontend->>Contracts: tx: `acceptIOU(...)`
    Contracts-->>OffChain: Event: IOUAccepted
    OffChain->>OffChain: Indexer updates IOU state to "Active" in DB
    Frontend->>OffChain: GET /api/ious/{id}
    OffChain-->>Frontend: Returns Active IOU details
    Frontend-->>Fulfiller: Shows IOU as "Active"
    end

    %% Fulfillment Phase
    rect rgb(255, 250, 235)
    Note over Creator, Contracts: 3. Fulfillment Phase (Close Requested)
    Fulfiller->>Frontend: Finishes work, clicks "Request Close"
    Frontend->>Contracts: tx: `requestClose(...)`
    Contracts-->>OffChain: Event: CloseRequested
    OffChain->>OffChain: Indexer marks IOU with close request in DB
    Creator->>Frontend: Checks Inbox / Active IOUs
    Frontend->>OffChain: GET /api/users/{address}/ious
    OffChain-->>Frontend: Returns IOUs showing "Close Requested"
    Frontend-->>Creator: Displays request to verify work
    end

    %% Settlement Phase
    rect rgb(235, 255, 235)
    Note over Creator, Contracts: 4. Settlement Phase (Settled)
    Creator->>Frontend: Verifies work, clicks "Confirm Close" & Rates
    Frontend->>Contracts: tx: `confirmClose(...)` / `settle...`
    Contracts->>Contracts: Transfer Collateral (if Bounty)
    Contracts->>Contracts: Update ReputationLedger (mint points)
    Contracts-->>OffChain: Events: IOUSettled, ReputationUpdated
    OffChain->>OffChain: Indexer updates IOU to "Settled" & syncs Rep
    Frontend->>OffChain: GET /api/users/{address}/ious
    OffChain-->>Frontend: Returns finalized IOU data
    Frontend-->>Creator: Displays Success & new Reputation
    end
```

## Transferring Social IOU Flow

For Social IOUs (where no collateral is locked), the current owner can transfer the IOU to a new owner. This is a multi-signature process requiring consent from both the new owner and the fulfiller.

```mermaid
sequenceDiagram
    autonumber
    actor Owner as Current Owner
    actor NewOwner as New Owner
    actor Fulfiller as Fulfiller
    participant Frontend as Frontend (Web)
    participant OffChain as Off-Chain Services<br/>(API / Indexer)
    participant Contracts as Smart Contracts<br/>(On-Chain)

    %% Initiate Transfer Phase
    rect rgb(245, 245, 255)
    Note over Owner, Contracts: 1. Initiate Transfer
    Owner->>Frontend: Selects Social IOU, enters New Owner address
    Frontend->>Contracts: tx: `startTransfer(...)`
    Contracts-->>OffChain: Event: TransferInitiated
    OffChain->>OffChain: Indexer logs pending transfer state
    Frontend->>OffChain: GET /api/users/{address}/ious
    OffChain-->>Frontend: Returns IOU marked "Transfer Initiated"
    Frontend-->>Owner: Shows transfer as pending
    end

    %% Approval Phase (Any Order)
    rect rgb(255, 250, 235)
    Note over NewOwner, Contracts: 2. Approvals (Can be in any order)
    NewOwner->>Frontend: Checks incoming transfer requests
    Frontend->>Contracts: tx: `confirmTransferByNewOwner(...)`
    Contracts-->>OffChain: Event: TransferConfirmed
    OffChain->>OffChain: Indexer updates approval status

    Fulfiller->>Frontend: Checks active IOUs
    Frontend->>Contracts: tx: `confirmTransferByFulfiller(...)`
    Contracts-->>OffChain: Event: TransferConfirmed
    OffChain->>OffChain: Indexer updates approval status
    end

    %% Execution Phase
    rect rgb(235, 255, 235)
    Note over Contracts, OffChain: 3. Execution (Triggered by 2nd Approval)
    Contracts->>Contracts: internal: Transfer ERC721 Ownership
    Contracts-->>OffChain: Event: TransferExecuted, Transfer
    OffChain->>OffChain: Indexer updates owner, clears transfer state
    Frontend->>OffChain: GET /api/users/{newOwner}/ious
    OffChain-->>Frontend: Returns IOU under New Owner
    end
```

## Failure/Edge Cases (Timeouts and Rejections)

In addition to the happy path, the system handles edge cases using the same interaction paradigm:
- **Refund / Cancel**: A Creator can call `refundPending()` before an IOU is accepted. The contract emits an cancellation event, the indexer updates the DB, and the UI reflects the cancelled state.
- **Reject Close**: If the Creator is unhappy with the work, they call `rejectClose()`. The system stays in the `Active` state, an event is emitted, and the UI clears the close request flag so the Fulfiller can keep working.
- **Timeout**: If the Fulfiller disappears and the deadline passes, the Creator can call `timeoutClaim()`. This emits a cancellation event, refunds the Creator's collateral, and marks the IOU as cancelled in the off-chain DB.

# IOUFi Indexer (staging scaffold)

Quick scaffold for the off-chain indexer used by the user-NFT query MVP.

Setup

1. Copy `.env.example` to `.env` and fill `JSON_RPC_URL` and `IOUNFT_ADDRESS`.
2. Install deps:

```bash
cd services/indexer
npm install
```

Run

```bash
npm start
```

What this does

- Creates an on-disk sqlite DB at `./data/indexer.db` using `schema.sql`.
- Listens for `Transfer`, `IOUCreated`, `IOUAccepted`, `IOUSettled`, `IOURefunded`, `ReputationAwarded`, `TreasuryUpdated`, and `ReputationLedgerUpdated` events (requires `IOUNFT_ADDRESS`).
- Upserts the `tokens` table and stores the latest on-chain IOU snapshot fields alongside the event stream.

Backfill

```bash
cd services/indexer
npm run backfill
```

The `backfill` script will scan the `tokens` table for rows with missing snapshot fields and attempt to call `getIOU(tokenId)` to populate collateral, deadline, description, service type, lifetime reward, and close flags (with retries).

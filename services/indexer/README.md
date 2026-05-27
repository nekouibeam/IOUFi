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
- Listens for `Transfer` and `IOUCreated` events (requires `IOUNFT_ADDRESS`).
- Minimal upsert logic populates `tokens` table. Extend handlers for other events.

Backfill

```bash
cd services/indexer
npm run backfill
```

The `backfill` script will scan the `tokens` table for rows where `description` or `service_type` is NULL and attempt to call `getIOU(tokenId)` to populate those fields (with retries).

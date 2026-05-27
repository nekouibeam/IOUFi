# IOUFi Query API (scaffold)

Quick scaffold for the read-only query API used by the frontend during MVP.

Setup

```bash
cd services/api
npm install
```

Run (expects the indexer DB at ../indexer/data/indexer.db):

```bash
INDEXER_DB=../indexer/data/indexer.db npm start
```

Endpoint

- `GET /api/users/:address/ious` — supports `roles`, `states`, `cursor`, `limit`.

require('dotenv').config();
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const { ethers } = require('ethers');

const RPC = process.env.JSON_RPC_URL || 'http://127.0.0.1:8545';
const IOUNFT_ADDRESS = process.env.IOUNFT_ADDRESS || '';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'indexer.db');

if (!fs.existsSync(DB_PATH)) {
  console.error('Indexer DB not found at', DB_PATH);
  process.exit(1);
}

const db = new Database(DB_PATH);

const IOUNFT_ABI = [
  'function getIOU(uint256) view returns (address creator, address fulfiller, address owner, uint8 state, string description, string serviceType)'
];

const provider = new ethers.JsonRpcProvider(RPC);
const contract = new ethers.Contract(IOUNFT_ADDRESS, IOUNFT_ABI, provider);

const selectMissing = db.prepare(`SELECT token_id FROM tokens WHERE description IS NULL OR service_type IS NULL ORDER BY token_id LIMIT @limit`);
const updateStmt = db.prepare(`UPDATE tokens SET description=@description, service_type=@service_type, updated_at=@updated_at WHERE token_id=@token_id`);

async function fetchIOUWithRetry(tokenId, maxRetries = 3) {
  const baseDelay = 500;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const r = await contract.getIOU(BigInt(tokenId));
      return {
        description: r.description || r[4] || null,
        serviceType: r.serviceType || r[5] || r.service_type || null
      };
    } catch (err) {
      const wait = baseDelay * Math.pow(2, attempt);
      console.warn(`getIOU failed for ${tokenId} attempt ${attempt + 1}, retrying ${wait}ms`, err.message || err);
      await new Promise(r => setTimeout(r, wait));
    }
  }
  return null;
}

async function runBatch(limit = 100) {
  const rows = selectMissing.all({ limit });
  if (!rows.length) {
    console.log('No tokens need backfill.');
    return;
  }
  console.log(`Backfilling ${rows.length} tokens`);
  for (const r of rows) {
    const tokenId = r.token_id;
    try {
      const fetched = await fetchIOUWithRetry(tokenId);
      if (fetched) {
        updateStmt.run({ token_id: tokenId, description: fetched.description, service_type: fetched.serviceType, updated_at: Math.floor(Date.now() / 1000) });
        console.log('Backfilled', tokenId);
      } else {
        console.warn('Failed to fetch after retries for', tokenId);
      }
    } catch (err) {
      console.error('Error backfilling token', tokenId, err);
    }
  }
}

(async () => {
  try {
    await runBatch(500);
    console.log('Backfill complete');
    db.close();
    process.exit(0);
  } catch (err) {
    console.error('Backfill failed', err);
    db.close();
    process.exit(1);
  }
})();

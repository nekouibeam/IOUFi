require('dotenv').config();
const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');
const { ethers } = require('ethers');

const RPC = process.env.JSON_RPC_URL || 'http://127.0.0.1:8545';
const IOUNFT_ADDRESS = process.env.IOUNFT_ADDRESS || '';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'indexer.db');
const IOUNFT_ABI = require('../../web/src/contracts/IOUNFT.json').abi;

if (!fs.existsSync(DB_PATH)) {
  console.error('Indexer DB not found at', DB_PATH);
  process.exit(1);
}

const db = new DatabaseSync(DB_PATH);

const provider = new ethers.JsonRpcProvider(RPC);
const contract = new ethers.Contract(IOUNFT_ADDRESS, IOUNFT_ABI, provider);

function prepare(sql) {
  const stmt = db.prepare(sql);
  stmt.setAllowBareNamedParameters(true);
  return stmt;
}

const selectMissing = prepare(`SELECT token_id FROM tokens WHERE description IS NULL OR service_type IS NULL OR collateral IS NULL OR deadline IS NULL OR lifetime_rep_reward IS NULL ORDER BY token_id LIMIT @limit`);
const updateStmt = prepare(`UPDATE tokens SET collateral=@collateral, deadline=@deadline, description=@description, service_type=@service_type, lifetime_rep_reward=@lifetime_rep_reward, transferable=@transferable, unhappy_close=@unhappy_close, updated_at=@updated_at WHERE token_id=@token_id`);

async function fetchIOUWithRetry(tokenId, maxRetries = 3) {
  const baseDelay = 500;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const r = await contract.getIOU(BigInt(tokenId));
      return {
        collateral: r.collateral !== undefined ? r.collateral : r[2],
        deadline: r.deadline !== undefined ? r.deadline : r[5],
        description: r.description || r[6] || null,
        serviceType: r.serviceType || r[7] || r.service_type || null,
        lifetimeRepReward: r.lifetimeRepReward !== undefined ? r.lifetimeRepReward : r[8],
        transferable: r.transferable !== undefined ? r.transferable : r[9] ? 1 : 0,
        unhappyClose: r.unhappyClose !== undefined ? r.unhappyClose : r[10] ? 1 : 0
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
        updateStmt.run({
          token_id: tokenId,
          collateral: fetched.collateral,
          deadline: fetched.deadline,
          description: fetched.description,
          service_type: fetched.serviceType,
          lifetime_rep_reward: fetched.lifetimeRepReward,
          transferable: fetched.transferable,
          unhappy_close: fetched.unhappyClose,
          updated_at: Math.floor(Date.now() / 1000)
        });
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

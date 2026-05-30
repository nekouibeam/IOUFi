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

const selectMissing = prepare(`SELECT token_id FROM tokens WHERE description IS NULL OR service_type IS NULL OR collateral IS NULL OR deadline IS NULL OR decayed_creator_rep_base IS NULL OR decayed_fulfiller_rep_base IS NULL ORDER BY token_id LIMIT @limit`);
const updateStmt = prepare(`UPDATE tokens SET collateral=@collateral, deadline=@deadline, description=@description, service_type=@service_type, decayed_creator_rep_base=@decayed_creator_rep_base, decayed_fulfiller_rep_base=@decayed_fulfiller_rep_base, close_requested=@close_requested, close_requested_at=@close_requested_at, rep_pre_awarded=@rep_pre_awarded, rep_pre_awarded_amount=@rep_pre_awarded_amount, transferable=@transferable, unhappy_close=@unhappy_close, transfer_requested=@transfer_requested, transfer_to=@transfer_to, transfer_new_owner_confirmed=@transfer_new_owner_confirmed, transfer_fulfiller_confirmed=@transfer_fulfiller_confirmed, transfer_requested_at=@transfer_requested_at, transfer_fee_paid=@transfer_fee_paid, updated_at=@updated_at WHERE token_id=@token_id`);

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
        decayedCreatorRepBase: r.decayedCreatorRepBase !== undefined ? r.decayedCreatorRepBase : r[8],
        decayedFulfillerRepBase: r.decayedFulfillerRepBase !== undefined ? r.decayedFulfillerRepBase : r[9],
        closeRequested: r.closeRequested !== undefined ? r.closeRequested : r[10] ? 1 : 0,
        closeRequestedAt: r.closeRequestedAt !== undefined ? r.closeRequestedAt : r[11],
        repPreAwarded: r.repPreAwarded !== undefined ? r.repPreAwarded : r[12] ? 1 : 0,
        repPreAwardedAmount: r.repPreAwardedAmount !== undefined ? r.repPreAwardedAmount : r[13],
        transferable: r.transferable !== undefined ? r.transferable : r[14] ? 1 : 0,
        unhappyClose: r.unhappyClose !== undefined ? r.unhappyClose : r[15] ? 1 : 0,
        transferRequested: r.transferRequested !== undefined ? r.transferRequested : r[16] ? 1 : 0,
        transferTo: r.transferTo || r[17] || null,
        transferNewOwnerConfirmed: r.transferNewOwnerConfirmed !== undefined ? r.transferNewOwnerConfirmed : r[18] ? 1 : 0,
        transferFulfillerConfirmed: r.transferFulfillerConfirmed !== undefined ? r.transferFulfillerConfirmed : r[19] ? 1 : 0,
        transferRequestedAt: r.transferRequestedAt !== undefined ? r.transferRequestedAt : r[20],
        transferFeePaid: r.transferFeePaid !== undefined ? r.transferFeePaid : r[21]
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
          decayed_creator_rep_base: fetched.decayedCreatorRepBase,
          decayed_fulfiller_rep_base: fetched.decayedFulfillerRepBase,
          close_requested: fetched.closeRequested,
          close_requested_at: fetched.closeRequestedAt,
          rep_pre_awarded: fetched.repPreAwarded,
          rep_pre_awarded_amount: fetched.repPreAwardedAmount,
          transferable: fetched.transferable,
          unhappy_close: fetched.unhappyClose,
          transfer_requested: fetched.transferRequested,
          transfer_to: fetched.transferTo ? fetched.transferTo.toLowerCase() : null,
          transfer_new_owner_confirmed: fetched.transferNewOwnerConfirmed,
          transfer_fulfiller_confirmed: fetched.transferFulfillerConfirmed,
          transfer_requested_at: fetched.transferRequestedAt,
          transfer_fee_paid: fetched.transferFeePaid,
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

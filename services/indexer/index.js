require('dotenv').config();
const path = require('path');
const fs = require('fs');
const { ethers } = require('ethers');
const { DatabaseSync } = require('node:sqlite');

const RPC = process.env.JSON_RPC_URL || 'http://127.0.0.1:8545';
const IOUNFT_ADDRESS = process.env.IOUNFT_ADDRESS || process.env.CONTRACT_ADDRESS || '';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = path.join(DATA_DIR, 'indexer.db');


const provider = new ethers.JsonRpcProvider(RPC);

// Minimal ABI: events we care about. Indexer can be extended later.
const IOUNFT_ABI = [
  'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
  'event IOUCreated(uint256 indexed tokenId, address indexed creator, address indexed fulfiller, uint256 collateral)',
  'event IOUAccepted(uint256 indexed tokenId, address fulfiller)',
  'event IOUSettled(uint256 indexed tokenId, uint256 fee, uint256 payout)',
  'event IOURefunded(uint256 indexed tokenId, uint256 amount)',
  'event ReputationAwarded(uint256 indexed tokenId, address indexed account, uint256 amount)',
  'event TreasuryUpdated(address indexed treasury)',
  'event ReputationLedgerUpdated(address indexed reputationLedger)',
  'function getIOU(uint256 tokenId) view returns (address creator, address fulfiller, uint256 collateral, uint8 state, uint256 createdAt, uint256 deadline, string description, string serviceType, uint256 lifetimeRepReward, bool transferable, bool unhappyClose)'
];

const db = new DatabaseSync(DB_PATH);

// initialize schema
const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schemaSql);

function ensureColumn(tableName, columnName, definition) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  if (columns.some((column) => column.name === columnName)) return;
  db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${definition}`);
}

function migrateSchema() {
  ensureColumn('tokens', 'collateral', 'collateral INTEGER');
  ensureColumn('tokens', 'deadline', 'deadline INTEGER');
  ensureColumn('tokens', 'lifetime_rep_reward', 'lifetime_rep_reward INTEGER');
  ensureColumn('tokens', 'transferable', 'transferable INTEGER DEFAULT 0');
  ensureColumn('tokens', 'unhappy_close', 'unhappy_close INTEGER DEFAULT 0');
}

migrateSchema();

const CONFIRMATIONS = parseInt(process.env.CONFIRMATIONS || '2', 10);

// Prepared statements
function prepare(sql) {
  const stmt = db.prepare(sql);
  stmt.setAllowBareNamedParameters(true);
  return stmt;
}

const insertProcessedEventStmt = prepare(`INSERT INTO processed_events(tx_hash, log_index, block_number, token_id, event_name, event_data) VALUES(@tx_hash, @log_index, @block_number, @token_id, @event_name, @event_data)`);

const insertOrUpdateTokenStmt = prepare(`
INSERT INTO tokens(token_id, creator, fulfiller, owner, state, description, service_type, collateral, deadline, lifetime_rep_reward, transferable, unhappy_close, is_burned, created_at, updated_at, last_block, last_tx_hash, last_log_index)
VALUES(@token_id, @creator, @fulfiller, @owner, @state, @description, @service_type, @collateral, @deadline, @lifetime_rep_reward, @transferable, @unhappy_close, @is_burned, @created_at, @updated_at, @last_block, @last_tx_hash, @last_log_index)
ON CONFLICT(token_id) DO UPDATE SET
  creator=COALESCE(excluded.creator, creator),
  fulfiller=COALESCE(excluded.fulfiller, fulfiller),
  owner=COALESCE(excluded.owner, owner),
  state=COALESCE(excluded.state, state),
  description=COALESCE(excluded.description, description),
  service_type=COALESCE(excluded.service_type, service_type),
  collateral=COALESCE(excluded.collateral, collateral),
  deadline=COALESCE(excluded.deadline, deadline),
  lifetime_rep_reward=COALESCE(excluded.lifetime_rep_reward, lifetime_rep_reward),
  transferable=COALESCE(excluded.transferable, transferable),
  unhappy_close=COALESCE(excluded.unhappy_close, unhappy_close),
  is_burned=COALESCE(excluded.is_burned, is_burned),
  updated_at=excluded.updated_at,
  last_block=excluded.last_block,
  last_tx_hash=excluded.last_tx_hash,
  last_log_index=excluded.last_log_index;
`);

const updateSnapshotStmt = prepare(`
UPDATE tokens SET
  creator=COALESCE(@creator, creator),
  fulfiller=COALESCE(@fulfiller, fulfiller),
  state=COALESCE(@state, state),
  collateral=COALESCE(@collateral, collateral),
  deadline=COALESCE(@deadline, deadline),
  description=COALESCE(@description, description),
  service_type=COALESCE(@service_type, service_type),
  lifetime_rep_reward=COALESCE(@lifetime_rep_reward, lifetime_rep_reward),
  transferable=COALESCE(@transferable, transferable),
  unhappy_close=COALESCE(@unhappy_close, unhappy_close),
  updated_at=@updated_at,
  last_block=@last_block,
  last_tx_hash=@last_tx_hash,
  last_log_index=@last_log_index
WHERE token_id=@token_id
`);

const updateStateStmt = prepare(`UPDATE tokens SET state=@state, updated_at=@updated_at, last_block=@last_block, last_tx_hash=@last_tx_hash, last_log_index=@last_log_index WHERE token_id=@token_id`);

const updateOwnerStmt = prepare(`UPDATE tokens SET owner=@owner, is_burned=@is_burned, updated_at=@updated_at, last_block=@last_block, last_tx_hash=@last_tx_hash, last_log_index=@last_log_index WHERE token_id=@token_id`);

const deleteProcessedEventsGtBlock = prepare(`DELETE FROM processed_events WHERE block_number > @block`);
const selectAllProcessedEventsOrdered = prepare(`SELECT event_name, event_data FROM processed_events ORDER BY block_number, log_index`);
const insertOrReplaceLastSync = prepare(`INSERT OR REPLACE INTO last_sync(id, last_block) VALUES(1, @last_block)`);
const selectLastSync = prepare(`SELECT last_block FROM last_sync WHERE id=1`);

const contract = IOUNFT_ADDRESS ? new ethers.Contract(IOUNFT_ADDRESS, IOUNFT_ABI, provider) : null;

console.log('Indexer starting', { RPC, IOUNFT_ADDRESS, DB_PATH, CONFIRMATIONS });

function serializeEventData(obj) {
  try { return JSON.stringify(obj); } catch (e) { return null; }
}

function normalizeIOUSnapshot(result) {
  return {
    creator: result.creator || result[0] || null,
    fulfiller: result.fulfiller || result[1] || null,
    collateral: result.collateral !== undefined ? result.collateral : result[2],
    state: result.state !== undefined ? result.state : result[3],
    createdAt: result.createdAt !== undefined ? result.createdAt : result[4],
    deadline: result.deadline !== undefined ? result.deadline : result[5],
    description: result.description || result[6] || null,
    serviceType: result.serviceType || result[7] || result.service_type || null,
    lifetimeRepReward: result.lifetimeRepReward !== undefined ? result.lifetimeRepReward : result[8],
    transferable: result.transferable !== undefined ? result.transferable : result[9],
    unhappyClose: result.unhappyClose !== undefined ? result.unhappyClose : result[10],
  };
}

function updateTokenSnapshot(tokenId, snapshot, eventContext) {
  updateSnapshotStmt.run({
    token_id: Number(tokenId),
    creator: snapshot.creator ? snapshot.creator.toLowerCase() : null,
    fulfiller: snapshot.fulfiller ? snapshot.fulfiller.toLowerCase() : null,
    state: snapshot.state,
    collateral: snapshot.collateral ?? null,
    deadline: snapshot.deadline ?? null,
    description: snapshot.description ?? null,
    service_type: snapshot.serviceType ?? null,
    lifetime_rep_reward: snapshot.lifetimeRepReward ?? null,
    transferable: snapshot.transferable ? 1 : 0,
    unhappy_close: snapshot.unhappyClose ? 1 : 0,
    updated_at: eventContext.timestamp || Math.floor(Date.now() / 1000),
    last_block: eventContext.blockNumber,
    last_tx_hash: eventContext.txHash,
    last_log_index: eventContext.logIndex,
  });
}

function applyEventToTokens(eventName, data) {
  const now = Math.floor(Date.now() / 1000);
  const token_id = Number(data.tokenId);
  if (eventName === 'IOUCreated') {
    insertOrUpdateTokenStmt.run({
      token_id,
      creator: data.creator.toLowerCase(),
      fulfiller: data.fulfiller ? data.fulfiller.toLowerCase() : null,
      owner: null,
      state: 0,
      description: data.description || null,
      service_type: data.serviceType || null,
      collateral: data.collateral ?? null,
      deadline: data.deadline ?? null,
      lifetime_rep_reward: data.lifetimeRepReward ?? null,
      transferable: data.transferable ? 1 : 0,
      unhappy_close: data.unhappyClose ? 1 : 0,
      is_burned: 0,
      created_at: data.timestamp || now,
      updated_at: data.timestamp || now,
      last_block: data.blockNumber,
      last_tx_hash: data.txHash,
      last_log_index: data.logIndex
    });
  } else if (eventName === 'IOUAccepted' || eventName === 'IOUSettled' || eventName === 'IOURefunded') {
    const stateMap = { IOUAccepted: 1, IOUSettled: 2, IOURefunded: 3 };
    updateStateStmt.run({ token_id, state: stateMap[eventName] ?? null, updated_at: data.timestamp || now, last_block: data.blockNumber, last_tx_hash: data.txHash, last_log_index: data.logIndex });
  } else if (eventName === 'Transfer') {
    const to = data.to;
    const is_burned = (to === ethers.ZeroAddress) ? 1 : 0;
    updateOwnerStmt.run({ token_id, owner: is_burned ? null : (to ? to.toLowerCase() : null), is_burned, updated_at: data.timestamp || now, last_block: data.blockNumber, last_tx_hash: data.txHash, last_log_index: data.logIndex });
  }
}

function rebuildTokensFromProcessedEvents() {
  console.log('Rebuilding tokens table from processed_events...');
  try {
    db.exec('BEGIN');
    db.exec('DELETE FROM tokens');
    const rows = selectAllProcessedEventsOrdered.all();
    for (const r of rows) {
      const eventName = r.event_name;
      const data = JSON.parse(r.event_data);
      applyEventToTokens(eventName, data);
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

async function reconcileOnStartup() {
  try {
    const last = selectLastSync.get();
    const currentBlock = await provider.getBlockNumber();
    const lastBlock = last ? last.last_block : 0;
    if (lastBlock > currentBlock) {
      console.log('Detected possible reorg: last synced block', lastBlock, 'is greater than current chain head', currentBlock);
      // remove processed events above current head and rebuild tokens
      deleteProcessedEventsGtBlock.run({ block: currentBlock });
      rebuildTokensFromProcessedEvents();
    }
    insertOrReplaceLastSync.run({ last_block: currentBlock });
  } catch (err) {
    console.error('reconcileOnStartup error', err);
  }
}

async function processEventIfConfirmed(eventName, args, event) {
  try {
    const currentBlock = await provider.getBlockNumber();
    const blockNumber = Number(event.blockNumber || event.blockNumber === 0 ? event.blockNumber : event.blockNumber);
    if (currentBlock < blockNumber + CONFIRMATIONS) {
      // not enough confirmations yet, retry later
      setTimeout(() => processEventIfConfirmed(eventName, args, event), 5000);
      return;
    }

    const tokenId = args.tokenId ? args.tokenId.toString() : (args[2] ? args[2].toString() : null);
    const txHash = event.transactionHash;
    const logIndex = event.logIndex;
    const payload = { tokenId, blockNumber, txHash, logIndex, timestamp: Math.floor(Date.now() / 1000) };
    if (eventName === 'Transfer') {
      payload.from = args.from || args[0] || null;
      payload.to = args.to || args[1] || null;
    } else if (eventName === 'IOUCreated') {
      payload.creator = args.creator || args[1] || null;
      payload.fulfiller = args.fulfiller || args[2] || null;
      payload.collateral = args.collateral ?? args[3] ?? null;
    } else if (eventName === 'IOUAccepted') {
      payload.fulfiller = args.fulfiller || args[1] || null;
    } else if (eventName === 'IOUSettled') {
      payload.fee = args.fee ?? args[1] ?? null;
      payload.payout = args.payout ?? args[2] ?? null;
    } else if (eventName === 'IOURefunded') {
      payload.amount = args.amount ?? args[1] ?? null;
    } else if (eventName === 'ReputationAwarded') {
      payload.account = args.account || args[1] || null;
      payload.amount = args.amount ?? args[2] ?? null;
    } else if (eventName === 'TreasuryUpdated') {
      payload.treasury = args.treasury || args[0] || null;
    } else if (eventName === 'ReputationLedgerUpdated') {
      payload.reputationLedger = args.reputationLedger || args[0] || null;
    }

    // persist processed_events for idempotency
    try {
      insertProcessedEventStmt.run({ tx_hash: txHash, log_index: logIndex, block_number: blockNumber, token_id: tokenId ? Number(tokenId) : null, event_name: eventName, event_data: serializeEventData(payload) });
    } catch (e) {
      if (e && e.code && e.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
        // duplicate, already processed
        return;
      }
      // sqlite3 error message may differ; treat any error with PRIMARYKEY text as duplicate
      if (String(e).includes('UNIQUE') || String(e).includes('PRIMARY')) return;
      throw e;
    }

    // apply to tokens table
    applyEventToTokens(eventName, payload);

    if (tokenId && ['IOUCreated', 'IOUAccepted', 'IOUSettled', 'IOURefunded'].includes(eventName)) {
      try {
        const fetched = await fetchIOUWithRetry(tokenId);
        if (fetched) {
          updateTokenSnapshot(tokenId, fetched, payload);
        } else {
          console.warn('getIOU returned no data for token', tokenId);
        }
      } catch (err) {
        console.error('Error fetching getIOU for token', tokenId, err);
      }
    }

    // update last sync
    insertOrReplaceLastSync.run({ last_block: blockNumber });
  } catch (err) {
    console.error('processEventIfConfirmed error', err);
  }
}

async function fetchIOUWithRetry(tokenId) {
  const maxRetries = 3;
  const baseDelay = 500; // ms
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // call contract.getIOU
      const result = await contract.getIOU(BigInt(tokenId));
      // ethers v6 may return an array-like with named keys; normalize
      return normalizeIOUSnapshot(result);
    } catch (err) {
      const wait = baseDelay * Math.pow(2, attempt);
      console.warn(`getIOU attempt ${attempt + 1} failed for ${tokenId}, retrying in ${wait}ms`, err.message || err);
      await new Promise(r => setTimeout(r, wait));
    }
  }
  // failed all retries — return null so it can be backfilled later
  return null;
}

if (contract) {
  // wire events
  contract.on('Transfer', (from, to, tokenId, event) => {
    try { processEventIfConfirmed('Transfer', { from, to, tokenId }, event); } catch (err) { console.error(err); }
  });

  contract.on('IOUCreated', (tokenId, creator, fulfiller, collateral, event) => {
    try { processEventIfConfirmed('IOUCreated', { tokenId, creator, fulfiller, collateral }, event); } catch (err) { console.error(err); }
  });

  contract.on('IOUAccepted', (tokenId, fulfiller, event) => {
    try { processEventIfConfirmed('IOUAccepted', { tokenId, fulfiller }, event); } catch (err) { console.error(err); }
  });

  contract.on('IOUSettled', (tokenId, fee, payout, event) => {
    try { processEventIfConfirmed('IOUSettled', { tokenId, fee, payout }, event); } catch (err) { console.error(err); }
  });

  contract.on('IOURefunded', (tokenId, amount, event) => {
    try { processEventIfConfirmed('IOURefunded', { tokenId, amount }, event); } catch (err) { console.error(err); }
  });

  contract.on('ReputationAwarded', (tokenId, account, amount, event) => {
    try { processEventIfConfirmed('ReputationAwarded', { tokenId, account, amount }, event); } catch (err) { console.error(err); }
  });

  contract.on('TreasuryUpdated', (treasury, event) => {
    try { processEventIfConfirmed('TreasuryUpdated', { treasury }, event); } catch (err) { console.error(err); }
  });

  contract.on('ReputationLedgerUpdated', (reputationLedger, event) => {
    try { processEventIfConfirmed('ReputationLedgerUpdated', { reputationLedger }, event); } catch (err) { console.error(err); }
  });

  // perform reconciliation on startup
  reconcileOnStartup();

} else {
  console.warn('No IOUNFT address provided; indexer started in passive mode. Set IOUNFT_ADDRESS in .env to enable contract listeners.');
}

process.on('SIGINT', () => {
  console.log('Shutting down indexer...');
  db.close();
  process.exit(0);
});

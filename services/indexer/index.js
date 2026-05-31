require('dotenv').config();
const path = require('path');
const fs = require('fs');
const { ethers } = require('ethers');
const { DatabaseSync } = require('node:sqlite');
const addressesByChain = require('../../web/src/contracts/addresses.json');

const RPC = process.env.JSON_RPC_URL || 'http://127.0.0.1:8545';
const IOUNFT_ADDRESS = process.env.IOUNFT_ADDRESS || process.env.CONTRACT_ADDRESS || '';
const REPUTATION_LEDGER_ADDRESS = process.env.REPUTATION_LEDGER_ADDRESS || '';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = path.join(DATA_DIR, 'indexer.db');
const IOUNFT_ABI = require('../../web/src/contracts/IOUNFT.json').abi;
const REPUTATION_LEDGER_ABI = require('../../web/src/contracts/ReputationLedger.json').abi;


const provider = new ethers.JsonRpcProvider(RPC);

const db = new DatabaseSync(DB_PATH);
let contract = null;
let contractAddress = '';
let reputationContract = null;
let reputationContractAddress = '';

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
  ensureColumn('tokens', 'decayed_creator_rep_base', 'decayed_creator_rep_base INTEGER');
  ensureColumn('tokens', 'decayed_fulfiller_rep_base', 'decayed_fulfiller_rep_base INTEGER');
  ensureColumn('tokens', 'close_requested', 'close_requested INTEGER DEFAULT 0');
  ensureColumn('tokens', 'close_requested_at', 'close_requested_at INTEGER');
  ensureColumn('tokens', 'rep_pre_awarded', 'rep_pre_awarded INTEGER DEFAULT 0');
  ensureColumn('tokens', 'rep_pre_awarded_amount', 'rep_pre_awarded_amount INTEGER DEFAULT 0');
  ensureColumn('tokens', 'transferable', 'transferable INTEGER DEFAULT 0');
  ensureColumn('tokens', 'unhappy_close', 'unhappy_close INTEGER DEFAULT 0');
   ensureColumn('tokens', 'transfer_requested', 'transfer_requested INTEGER DEFAULT 0');
   ensureColumn('tokens', 'transfer_to', 'transfer_to TEXT');
   ensureColumn('tokens', 'transfer_new_owner_confirmed', 'transfer_new_owner_confirmed INTEGER DEFAULT 0');
   ensureColumn('tokens', 'transfer_fulfiller_confirmed', 'transfer_fulfiller_confirmed INTEGER DEFAULT 0');
   ensureColumn('tokens', 'transfer_requested_at', 'transfer_requested_at INTEGER');
   ensureColumn('tokens', 'transfer_fee_paid', 'transfer_fee_paid INTEGER DEFAULT 0');
}

migrateSchema();

const CONFIRMATIONS = parseInt(process.env.CONFIRMATIONS || '0', 10);

// Prepared statements
function prepare(sql) {
  const stmt = db.prepare(sql);
  stmt.setAllowBareNamedParameters(true);
  return stmt;
}

const insertProcessedEventStmt = prepare(`INSERT INTO processed_events(tx_hash, log_index, block_number, token_id, event_name, event_data) VALUES(@tx_hash, @log_index, @block_number, @token_id, @event_name, @event_data)`);

const insertReputationEventStmt = prepare(`INSERT INTO reputation_events(tx_hash, log_index, block_number, address, current_delta, lifetime_delta, locked_delta, event_data) VALUES(@tx_hash, @log_index, @block_number, @address, @current_delta, @lifetime_delta, @locked_delta, @event_data)`);

const insertInteractionEventStmt = prepare(`INSERT INTO interaction_events(tx_hash, log_index, block_number, addr_a, addr_b, decay_level, last_interaction_ts, event_data) VALUES(@tx_hash, @log_index, @block_number, @addr_a, @addr_b, @decay_level, @last_interaction_ts, @event_data)`);

const upsertReputationAccountStmt = prepare(`
INSERT INTO reputation_accounts(address, current_rep, lifetime_rep, locked_rep, voting_power, updated_at, last_block, last_tx_hash, last_log_index)
VALUES(@address, @current_rep, @lifetime_rep, @locked_rep, @voting_power, @updated_at, @last_block, @last_tx_hash, @last_log_index)
ON CONFLICT(address) DO UPDATE SET
  current_rep=excluded.current_rep,
  lifetime_rep=excluded.lifetime_rep,
  locked_rep=excluded.locked_rep,
  voting_power=excluded.voting_power,
  updated_at=excluded.updated_at,
  last_block=excluded.last_block,
  last_tx_hash=excluded.last_tx_hash,
  last_log_index=excluded.last_log_index
`);

const deleteAllReputationAccountsStmt = prepare(`DELETE FROM reputation_accounts`);
const deleteReputationEventsGtBlock = prepare(`DELETE FROM reputation_events WHERE block_number > @block`);
const selectReputationEventRowsOrdered = prepare(`SELECT event_data FROM reputation_events ORDER BY block_number, log_index`);
const selectReputationAccountCountStmt = prepare(`SELECT COUNT(1) AS total FROM reputation_accounts`);
const selectReputationAccountStmt = prepare(`SELECT address, current_rep, lifetime_rep, locked_rep, voting_power, updated_at, last_block, last_tx_hash, last_log_index FROM reputation_accounts WHERE lower(address)=lower(@address) LIMIT 1`);

const insertOrUpdateTokenStmt = prepare(`
INSERT INTO tokens(token_id, creator, fulfiller, owner, state, description, service_type, collateral, deadline, decayed_creator_rep_base, decayed_fulfiller_rep_base, close_requested, close_requested_at, rep_pre_awarded, rep_pre_awarded_amount, transferable, unhappy_close, transfer_requested, transfer_to, transfer_new_owner_confirmed, transfer_fulfiller_confirmed, transfer_requested_at, transfer_fee_paid, is_burned, created_at, updated_at, last_block, last_tx_hash, last_log_index)
VALUES(@token_id, @creator, @fulfiller, @owner, @state, @description, @service_type, @collateral, @deadline, @decayed_creator_rep_base, @decayed_fulfiller_rep_base, @close_requested, @close_requested_at, @rep_pre_awarded, @rep_pre_awarded_amount, @transferable, @unhappy_close, @transfer_requested, @transfer_to, @transfer_new_owner_confirmed, @transfer_fulfiller_confirmed, @transfer_requested_at, @transfer_fee_paid, @is_burned, @created_at, @updated_at, @last_block, @last_tx_hash, @last_log_index)
ON CONFLICT(token_id) DO UPDATE SET
  creator=COALESCE(excluded.creator, creator),
  fulfiller=COALESCE(excluded.fulfiller, fulfiller),
  owner=COALESCE(excluded.owner, owner),
  state=COALESCE(excluded.state, state),
  description=COALESCE(excluded.description, description),
  service_type=COALESCE(excluded.service_type, service_type),
  collateral=COALESCE(excluded.collateral, collateral),
  deadline=COALESCE(excluded.deadline, deadline),
  decayed_creator_rep_base=COALESCE(excluded.decayed_creator_rep_base, decayed_creator_rep_base),
  decayed_fulfiller_rep_base=COALESCE(excluded.decayed_fulfiller_rep_base, decayed_fulfiller_rep_base),
  close_requested=COALESCE(excluded.close_requested, close_requested),
  close_requested_at=COALESCE(excluded.close_requested_at, close_requested_at),
  rep_pre_awarded=COALESCE(excluded.rep_pre_awarded, rep_pre_awarded),
  rep_pre_awarded_amount=COALESCE(excluded.rep_pre_awarded_amount, rep_pre_awarded_amount),
  transferable=COALESCE(excluded.transferable, transferable),
  unhappy_close=COALESCE(excluded.unhappy_close, unhappy_close),
  transfer_requested=COALESCE(excluded.transfer_requested, transfer_requested),
  transfer_to=COALESCE(excluded.transfer_to, transfer_to),
  transfer_new_owner_confirmed=COALESCE(excluded.transfer_new_owner_confirmed, transfer_new_owner_confirmed),
  transfer_fulfiller_confirmed=COALESCE(excluded.transfer_fulfiller_confirmed, transfer_fulfiller_confirmed),
  transfer_requested_at=COALESCE(excluded.transfer_requested_at, transfer_requested_at),
  transfer_fee_paid=COALESCE(excluded.transfer_fee_paid, transfer_fee_paid),
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
  decayed_creator_rep_base=COALESCE(@decayed_creator_rep_base, decayed_creator_rep_base),
  decayed_fulfiller_rep_base=COALESCE(@decayed_fulfiller_rep_base, decayed_fulfiller_rep_base),
  close_requested=COALESCE(@close_requested, close_requested),
  close_requested_at=COALESCE(@close_requested_at, close_requested_at),
  rep_pre_awarded=COALESCE(@rep_pre_awarded, rep_pre_awarded),
  rep_pre_awarded_amount=COALESCE(@rep_pre_awarded_amount, rep_pre_awarded_amount),
  transferable=COALESCE(@transferable, transferable),
  unhappy_close=COALESCE(@unhappy_close, unhappy_close),
  transfer_requested=COALESCE(@transfer_requested, transfer_requested),
  transfer_to=COALESCE(@transfer_to, transfer_to),
  transfer_new_owner_confirmed=COALESCE(@transfer_new_owner_confirmed, transfer_new_owner_confirmed),
  transfer_fulfiller_confirmed=COALESCE(@transfer_fulfiller_confirmed, transfer_fulfiller_confirmed),
  transfer_requested_at=COALESCE(@transfer_requested_at, transfer_requested_at),
  transfer_fee_paid=COALESCE(@transfer_fee_paid, transfer_fee_paid),
  updated_at=@updated_at,
  last_block=@last_block,
  last_tx_hash=@last_tx_hash,
  last_log_index=@last_log_index
WHERE token_id=@token_id
`);

const selectTokenByIdStmt = prepare(`SELECT token_id, transfer_to, transfer_requested FROM tokens WHERE token_id=@token_id`);

const setTransferInitiatedStmt = prepare(`
UPDATE tokens SET
  transfer_requested=1,
  transfer_to=@transfer_to,
  transfer_new_owner_confirmed=0,
  transfer_fulfiller_confirmed=0,
  transfer_requested_at=@transfer_requested_at,
  transfer_fee_paid=0,
  updated_at=@updated_at,
  last_block=@last_block,
  last_tx_hash=@last_tx_hash,
  last_log_index=@last_log_index
WHERE token_id=@token_id
`);

const setTransferConfirmedStmt = prepare(`
UPDATE tokens SET
  transfer_requested=1,
  transfer_new_owner_confirmed=COALESCE(@transfer_new_owner_confirmed, transfer_new_owner_confirmed),
  transfer_fulfiller_confirmed=COALESCE(@transfer_fulfiller_confirmed, transfer_fulfiller_confirmed),
  transfer_fee_paid=COALESCE(@transfer_fee_paid, transfer_fee_paid),
  updated_at=@updated_at,
  last_block=@last_block,
  last_tx_hash=@last_tx_hash,
  last_log_index=@last_log_index
WHERE token_id=@token_id
`);

const clearTransferStmt = prepare(`
UPDATE tokens SET
  transfer_requested=0,
  transfer_to=NULL,
  transfer_new_owner_confirmed=0,
  transfer_fulfiller_confirmed=0,
  transfer_requested_at=NULL,
  transfer_fee_paid=0,
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
const countTokensStmt = prepare(`SELECT COUNT(1) AS total FROM tokens`);

let syncTimer = null;
let syncInFlight = false;

console.log('Indexer starting', { RPC, IOUNFT_ADDRESS, DB_PATH, CONFIRMATIONS });

async function resolveIOUNFTAddress() {
  const network = await provider.getNetwork();
  const chainId = String(network.chainId);
  const chainScopedAddress = addressesByChain?.[chainId]?.IOUNFT;

  if (chainScopedAddress) {
    return chainScopedAddress;
  }

  return IOUNFT_ADDRESS || '';
}

async function resolveReputationLedgerAddress() {
  const network = await provider.getNetwork();
  const chainId = String(network.chainId);
  const chainScopedAddress = addressesByChain?.[chainId]?.ReputationLedger;

  if (chainScopedAddress) {
    return chainScopedAddress;
  }

  return REPUTATION_LEDGER_ADDRESS || '';
}

async function initContract() {
  const resolvedAddress = await resolveIOUNFTAddress();
  if (!resolvedAddress) {
    contract = null;
    contractAddress = '';
    return null;
  }

  contractAddress = resolvedAddress;
  contract = new ethers.Contract(resolvedAddress, IOUNFT_ABI, provider);
  console.log('Using IOUNFT contract', contractAddress);
  return contract;
}

async function initReputationContract() {
  const resolvedAddress = await resolveReputationLedgerAddress();
  if (!resolvedAddress) {
    reputationContract = null;
    reputationContractAddress = '';
    return null;
  }

  reputationContractAddress = resolvedAddress;
  reputationContract = new ethers.Contract(resolvedAddress, REPUTATION_LEDGER_ABI, provider);
  console.log('Using ReputationLedger contract', reputationContractAddress);
  return reputationContract;
}

function wireContractListeners(targetContract) {
  targetContract.on('Transfer', (from, to, tokenId, event) => {
    try { processEventIfConfirmed('Transfer', { from, to, tokenId }, event); } catch (err) { console.error(err); }
  });

  targetContract.on('IOUCreated', (tokenId, creator, fulfiller, collateral, event) => {
    try { processEventIfConfirmed('IOUCreated', { tokenId, creator, fulfiller, collateral }, event); } catch (err) { console.error(err); }
  });

  targetContract.on('IOUAccepted', (tokenId, fulfiller, event) => {
    try { processEventIfConfirmed('IOUAccepted', { tokenId, fulfiller }, event); } catch (err) { console.error(err); }
  });

  targetContract.on('IOUSettled', (tokenId, fee, payout, event) => {
    try { processEventIfConfirmed('IOUSettled', { tokenId, fee, payout }, event); } catch (err) { console.error(err); }
  });

  targetContract.on('IOURefunded', (tokenId, amount, event) => {
    try { processEventIfConfirmed('IOURefunded', { tokenId, amount }, event); } catch (err) { console.error(err); }
  });

  targetContract.on('CloseRequested', (tokenId, fulfiller, event) => {
    try { processEventIfConfirmed('CloseRequested', { tokenId, fulfiller }, event); } catch (err) { console.error(err); }
  });

  targetContract.on('CloseConfirmed', (tokenId, owner, event) => {
    try { processEventIfConfirmed('CloseConfirmed', { tokenId, owner }, event); } catch (err) { console.error(err); }
  });

  targetContract.on('CloseRejected', (tokenId, owner, event) => {
    try { processEventIfConfirmed('CloseRejected', { tokenId, owner }, event); } catch (err) { console.error(err); }
  });

  targetContract.on('TransferInitiated', (tokenId, from, to, event) => {
    try { processEventIfConfirmed('TransferInitiated', { tokenId, from, to }, event); } catch (err) { console.error(err); }
  });

  targetContract.on('TransferConfirmed', (tokenId, by, event) => {
    try { processEventIfConfirmed('TransferConfirmed', { tokenId, by }, event); } catch (err) { console.error(err); }
  });

  targetContract.on('TransferCompleted', (tokenId, from, to, fee, event) => {
    try { processEventIfConfirmed('TransferCompleted', { tokenId, from, to, fee }, event); } catch (err) { console.error(err); }
  });

  targetContract.on('TransferRejected', (tokenId, by, event) => {
    try { processEventIfConfirmed('TransferRejected', { tokenId, by }, event); } catch (err) { console.error(err); }
  });

  targetContract.on('TreasuryUpdated', (treasury, event) => {
    try { processEventIfConfirmed('TreasuryUpdated', { treasury }, event); } catch (err) { console.error(err); }
  });

  targetContract.on('ReputationLedgerUpdated', (reputationLedger, event) => {
    try { processEventIfConfirmed('ReputationLedgerUpdated', { reputationLedger }, event); } catch (err) { console.error(err); }
  });
}

function wireReputationListeners(targetContract) {
  targetContract.on('ReputationChanged', (account, currentDelta, lifetimeDelta, lockedDelta, event) => {
    try { processEventIfConfirmed('ReputationChanged', { account, currentDelta, lifetimeDelta, lockedDelta }, event); } catch (err) { console.error(err); }
  });
  
  targetContract.on('InteractionRecorded', (addrA, addrB, decayLevel, lastInteractionTs, event) => {
    try { processEventIfConfirmed('InteractionRecorded', { addrA, addrB, decayLevel, lastInteractionTs }, event); } catch (err) { console.error(err); }
  });
}

function serializeEventData(obj) {
  try { return JSON.stringify(obj); } catch (e) { return null; }
}

function safeNumber(value) {
  if (value === null || value === undefined) return null;
  try {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  } catch (_) {
    return null;
  }
}

function toNumber(value, fallback = 0) {
  if (value === null || value === undefined) return fallback;
  try {
    if (typeof value === 'bigint') return Number(value);
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  } catch (_) {
    return fallback;
  }
}

function normalizeAddress(value) {
  return value ? String(value).toLowerCase() : null;
}

function extractEventMeta(event) {
  const txHash = event?.transactionHash || event?.log?.transactionHash || event?.hash || null;
  const logIndex = safeNumber(event?.logIndex ?? event?.log?.index ?? event?.index);
  const blockNumber = safeNumber(event?.blockNumber ?? event?.log?.blockNumber);
  return { txHash, logIndex, blockNumber };
}

async function replayEventsInRange(fromBlock, toBlock) {
  if (!contract || fromBlock > toBlock) return;

  const eventNames = ['Transfer', 'IOUCreated', 'IOUAccepted', 'IOUSettled', 'IOURefunded', 'CloseRequested', 'CloseConfirmed', 'CloseRejected', 'TransferInitiated', 'TransferConfirmed', 'TransferCompleted', 'TransferRejected', 'TreasuryUpdated', 'ReputationLedgerUpdated'];
  for (const eventName of eventNames) {
    const logs = await contract.queryFilter(eventName, fromBlock, toBlock);
    for (const log of logs) {
      try {
        if (eventName === 'Transfer') {
          await processEventIfConfirmed('Transfer', { from: log.args?.from, to: log.args?.to, tokenId: log.args?.tokenId }, log);
        } else if (eventName === 'IOUCreated') {
          await processEventIfConfirmed('IOUCreated', { tokenId: log.args?.tokenId, creator: log.args?.creator, fulfiller: log.args?.fulfiller, collateral: log.args?.collateral }, log);
        } else if (eventName === 'IOUAccepted') {
          await processEventIfConfirmed('IOUAccepted', { tokenId: log.args?.tokenId, fulfiller: log.args?.fulfiller }, log);
        } else if (eventName === 'IOUSettled') {
          await processEventIfConfirmed('IOUSettled', { tokenId: log.args?.tokenId, fee: log.args?.fee, payout: log.args?.payout }, log);
        } else if (eventName === 'IOURefunded') {
          await processEventIfConfirmed('IOURefunded', { tokenId: log.args?.tokenId, amount: log.args?.amount }, log);
        } else if (eventName === 'CloseRequested') {
          await processEventIfConfirmed('CloseRequested', { tokenId: log.args?.tokenId, fulfiller: log.args?.fulfiller }, log);
        } else if (eventName === 'CloseConfirmed') {
          await processEventIfConfirmed('CloseConfirmed', { tokenId: log.args?.tokenId, owner: log.args?.owner }, log);
        } else if (eventName === 'CloseRejected') {
          await processEventIfConfirmed('CloseRejected', { tokenId: log.args?.tokenId, owner: log.args?.owner }, log);
        } else if (eventName === 'TreasuryUpdated') {
          await processEventIfConfirmed('TreasuryUpdated', { treasury: log.args?.treasury }, log);
        } else if (eventName === 'ReputationLedgerUpdated') {
          await processEventIfConfirmed('ReputationLedgerUpdated', { reputationLedger: log.args?.reputationLedger }, log);
        }
      } catch (err) {
        console.error(`replayEventsInRange error for ${eventName}`, err);
      }
    }
  }
}

async function replayReputationEventsInRange(fromBlock, toBlock) {
  if (!reputationContract || fromBlock > toBlock) return;

  const logs = await reputationContract.queryFilter('ReputationChanged', fromBlock, toBlock);
  for (const log of logs) {
    try {
      await processEventIfConfirmed('ReputationChanged', {
        account: log.args?.account,
        currentDelta: log.args?.currentDelta,
        lifetimeDelta: log.args?.lifetimeDelta,
        lockedDelta: log.args?.lockedDelta,
      }, log);
    } catch (err) {
      console.error('replayReputationEventsInRange error', err);
    }
  }

  // replay InteractionRecorded events as well
  const iLogs = await reputationContract.queryFilter('InteractionRecorded', fromBlock, toBlock);
  for (const log of iLogs) {
    try {
      await processEventIfConfirmed('InteractionRecorded', {
        addrA: log.args?.addrA,
        addrB: log.args?.addrB,
        decayLevel: log.args?.decayLevel,
        lastInteractionTs: log.args?.lastInteractionTs,
      }, log);
    } catch (err) {
      console.error('replayReputationEventsInRange InteractionRecorded error', err);
    }
  }
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
    decayedCreatorRepBase: result.decayedCreatorRepBase !== undefined ? result.decayedCreatorRepBase : result[8],
    decayedFulfillerRepBase: result.decayedFulfillerRepBase !== undefined ? result.decayedFulfillerRepBase : result[9],
    closeRequested: result.closeRequested !== undefined ? result.closeRequested : result[10],
    closeRequestedAt: result.closeRequestedAt !== undefined ? result.closeRequestedAt : result[11],
    repPreAwarded: result.repPreAwarded !== undefined ? result.repPreAwarded : result[12],
    repPreAwardedAmount: result.repPreAwardedAmount !== undefined ? result.repPreAwardedAmount : result[13],
    transferable: result.transferable !== undefined ? result.transferable : result[14],
    unhappyClose: result.unhappyClose !== undefined ? result.unhappyClose : result[15],
    transferRequested: result.transferRequested !== undefined ? result.transferRequested : result[16],
    transferTo: result.transferTo || result[17] || null,
    transferNewOwnerConfirmed: result.transferNewOwnerConfirmed !== undefined ? result.transferNewOwnerConfirmed : result[18],
    transferFulfillerConfirmed: result.transferFulfillerConfirmed !== undefined ? result.transferFulfillerConfirmed : result[19],
    transferRequestedAt: result.transferRequestedAt !== undefined ? result.transferRequestedAt : result[20],
    transferFeePaid: result.transferFeePaid !== undefined ? result.transferFeePaid : result[21],
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
    decayed_creator_rep_base: snapshot.decayedCreatorRepBase ?? null,
    decayed_fulfiller_rep_base: snapshot.decayedFulfillerRepBase ?? null,
    close_requested: snapshot.closeRequested ? 1 : 0,
    close_requested_at: snapshot.closeRequestedAt ?? null,
    rep_pre_awarded: snapshot.repPreAwarded ? 1 : 0,
    rep_pre_awarded_amount: snapshot.repPreAwardedAmount ?? null,
    transferable: snapshot.transferable ? 1 : 0,
    unhappy_close: snapshot.unhappyClose ? 1 : 0,
    transfer_requested: snapshot.transferRequested ? 1 : 0,
    transfer_to: snapshot.transferTo ? snapshot.transferTo.toLowerCase() : null,
    transfer_new_owner_confirmed: snapshot.transferNewOwnerConfirmed ? 1 : 0,
    transfer_fulfiller_confirmed: snapshot.transferFulfillerConfirmed ? 1 : 0,
    transfer_requested_at: snapshot.transferRequestedAt ?? null,
    transfer_fee_paid: snapshot.transferFeePaid ?? null,
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
      decayed_creator_rep_base: data.decayedCreatorRepBase ?? null,
      decayed_fulfiller_rep_base: data.decayedFulfillerRepBase ?? null,
      close_requested: data.closeRequested ? 1 : 0,
      close_requested_at: data.closeRequestedAt ?? null,
      rep_pre_awarded: data.repPreAwarded ? 1 : 0,
      rep_pre_awarded_amount: data.repPreAwardedAmount ?? null,
      transferable: data.transferable ? 1 : 0,
      unhappy_close: data.unhappyClose ? 1 : 0,
      transfer_requested: data.transferRequested ? 1 : 0,
      transfer_to: data.transferTo ? data.transferTo.toLowerCase() : null,
      transfer_new_owner_confirmed: data.transferNewOwnerConfirmed ? 1 : 0,
      transfer_fulfiller_confirmed: data.transferFulfillerConfirmed ? 1 : 0,
      transfer_requested_at: data.transferRequestedAt ?? null,
      transfer_fee_paid: data.transferFeePaid ?? null,
      is_burned: 0,
      created_at: data.timestamp || now,
      updated_at: data.timestamp || now,
      last_block: data.blockNumber,
      last_tx_hash: data.txHash,
      last_log_index: data.logIndex
    });
  } else if (eventName === 'IOUAccepted' || eventName === 'IOUSettled' || eventName === 'IOURefunded' || eventName === 'CloseRequested' || eventName === 'CloseConfirmed' || eventName === 'CloseRejected') {
    const stateMap = { IOUAccepted: 1, IOUSettled: 2, IOURefunded: 3, CloseRequested: 1, CloseConfirmed: 2, CloseRejected: 1 };
    updateStateStmt.run({ token_id, state: stateMap[eventName] ?? null, updated_at: data.timestamp || now, last_block: data.blockNumber, last_tx_hash: data.txHash, last_log_index: data.logIndex });
  } else if (eventName === 'TransferInitiated') {
    setTransferInitiatedStmt.run({
      token_id,
      transfer_to: data.to ? data.to.toLowerCase() : null,
      transfer_requested_at: data.timestamp || now,
      updated_at: data.timestamp || now,
      last_block: data.blockNumber,
      last_tx_hash: data.txHash,
      last_log_index: data.logIndex,
    });
  } else if (eventName === 'TransferConfirmed') {
    const existing = selectTokenByIdStmt.get({ token_id });
    const transferTo = existing?.transfer_to ? String(existing.transfer_to).toLowerCase() : null;
    const confirmer = data.by ? String(data.by).toLowerCase() : null;
    setTransferConfirmedStmt.run({
      token_id,
      transfer_new_owner_confirmed: confirmer && transferTo && confirmer === transferTo ? 1 : null,
      transfer_fulfiller_confirmed: confirmer && transferTo && confirmer === transferTo ? null : 1,
      transfer_fee_paid: null,
      updated_at: data.timestamp || now,
      last_block: data.blockNumber,
      last_tx_hash: data.txHash,
      last_log_index: data.logIndex,
    });
  } else if (eventName === 'TransferCompleted' || eventName === 'TransferRejected') {
    clearTransferStmt.run({
      token_id,
      updated_at: data.timestamp || now,
      last_block: data.blockNumber,
      last_tx_hash: data.txHash,
      last_log_index: data.logIndex,
    });
  } else if (eventName === 'Transfer') {
    const to = data.to;
    const is_burned = (to === ethers.ZeroAddress) ? 1 : 0;
    updateOwnerStmt.run({ token_id, owner: is_burned ? null : (to ? to.toLowerCase() : null), is_burned, updated_at: data.timestamp || now, last_block: data.blockNumber, last_tx_hash: data.txHash, last_log_index: data.logIndex });
  }
}

function applyEventToReputation(eventName, data) {
  if (eventName !== 'ReputationChanged') return;

  const now = Math.floor(Date.now() / 1000);
  const address = normalizeAddress(data.account);
  if (!address) return;

  const existing = selectReputationAccountStmt.get({ address });
  const currentDelta = toNumber(data.currentDelta, 0);
  const lifetimeDelta = toNumber(data.lifetimeDelta, 0);
  const lockedDelta = toNumber(data.lockedDelta, 0);

  const currentRep = Math.max(0, toNumber(existing?.current_rep, 0) + currentDelta);
  const lifetimeRep = Math.max(0, toNumber(existing?.lifetime_rep, 0) + lifetimeDelta);
  const lockedRep = Math.max(0, toNumber(existing?.locked_rep, 0) + lockedDelta);
  const votingPower = Math.max(0, currentRep - lockedRep);

  upsertReputationAccountStmt.run({
    address,
    current_rep: currentRep,
    lifetime_rep: lifetimeRep,
    locked_rep: lockedRep,
    voting_power: votingPower,
    updated_at: data.timestamp || now,
    last_block: data.blockNumber,
    last_tx_hash: data.txHash,
    last_log_index: data.logIndex,
  });
}

function rebuildReputationFromEvents() {
  console.log('Rebuilding reputation_accounts table from reputation_events...');
  try {
    db.exec('BEGIN');
    deleteAllReputationAccountsStmt.run();
    const rows = selectReputationEventRowsOrdered.all();
    for (const row of rows) {
      const data = JSON.parse(row.event_data);
      applyEventToReputation('ReputationChanged', data);
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
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
    if (!contract) {
      await initContract();
    }
    await syncFromChain('startup');
  } catch (err) {
    console.error('reconcileOnStartup error', err);
  }
}

async function syncFromChain(source = 'poll') {
  if (!contract && !reputationContract) return;
  if (syncInFlight) return;

  syncInFlight = true;
  try {
    const last = selectLastSync.get();
    const currentBlock = await provider.getBlockNumber();
    const lastBlock = last ? last.last_block : 0;
    const tokenCountRow = countTokensStmt.get();
    const tokenCount = tokenCountRow ? Number(tokenCountRow.total || 0) : 0;
    const repAccountCountRow = selectReputationAccountCountStmt.get();
    const repAccountCount = repAccountCountRow ? Number(repAccountCountRow.total || 0) : 0;

    if (lastBlock > currentBlock) {
      console.log('Detected possible reorg: last synced block', lastBlock, 'is greater than current chain head', currentBlock);
      deleteProcessedEventsGtBlock.run({ block: currentBlock });
      deleteReputationEventsGtBlock.run({ block: currentBlock });
      rebuildTokensFromProcessedEvents();
      rebuildReputationFromEvents();
      insertOrReplaceLastSync.run({ last_block: currentBlock });
      return;
    }

    const replayFrom = last ? lastBlock + 1 : 0;
    const replayTo = currentBlock - CONFIRMATIONS;
    if (replayFrom <= replayTo) {
      console.log(!last ? 'Rebuilding index from chain logs' : 'Syncing missed events', { replayFrom, replayTo });
      if (contract) {
        await replayEventsInRange(replayFrom, replayTo);
      }
      if (reputationContract) {
        const reputationReplayFrom = repAccountCount === 0 ? 0 : replayFrom;
        await replayReputationEventsInRange(reputationReplayFrom, replayTo);
      }
    }

    insertOrReplaceLastSync.run({ last_block: currentBlock });
  } finally {
    syncInFlight = false;
  }
}

async function processEventIfConfirmed(eventName, args, event) {
  try {
    const currentBlock = await provider.getBlockNumber();
    const { txHash, logIndex, blockNumber } = extractEventMeta(event);
    if (blockNumber === null) {
      throw new Error('Missing block number on event');
    }
    if (currentBlock < blockNumber + CONFIRMATIONS) {
      setTimeout(() => processEventIfConfirmed(eventName, args, event), 5000);
      return;
    }

    const tokenId = args.tokenId ? args.tokenId.toString() : (args[2] ? args[2].toString() : null);
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
    } else if (eventName === 'CloseRequested') {
      payload.fulfiller = args.fulfiller || args[1] || null;
    } else if (eventName === 'CloseConfirmed' || eventName === 'CloseRejected') {
      payload.owner = args.owner || args[1] || null;
    } else if (eventName === 'TransferInitiated') {
      payload.from = args.from || args[1] || null;
      payload.to = args.to || args[2] || null;
    } else if (eventName === 'TransferConfirmed') {
      payload.by = args.by || args[1] || null;
    } else if (eventName === 'TransferCompleted') {
      payload.from = args.from || args[1] || null;
      payload.to = args.to || args[2] || null;
      payload.fee = args.fee ?? args[3] ?? null;
    } else if (eventName === 'TransferRejected') {
      payload.by = args.by || args[1] || null;
    } else if (eventName === 'TreasuryUpdated') {
      payload.treasury = args.treasury || args[0] || null;
    } else if (eventName === 'ReputationLedgerUpdated') {
      payload.reputationLedger = args.reputationLedger || args[0] || null;
    } else if (eventName === 'ReputationChanged') {
      payload.account = args.account || args[0] || null;
      payload.currentDelta = args.currentDelta ?? args[1] ?? null;
      payload.lifetimeDelta = args.lifetimeDelta ?? args[2] ?? null;
      payload.lockedDelta = args.lockedDelta ?? args[3] ?? null;
    } else if (eventName === 'InteractionRecorded') {
      payload.addrA = args.addrA || args[0] || null;
      payload.addrB = args.addrB || args[1] || null;
      payload.decayLevel = args.decayLevel ?? args[2] ?? null;
      payload.lastInteractionTs = args.lastInteractionTs ?? args[3] ?? null;
    }

    try {
      insertProcessedEventStmt.run({ tx_hash: txHash, log_index: logIndex, block_number: blockNumber, token_id: tokenId ? Number(tokenId) : null, event_name: eventName, event_data: serializeEventData(payload) });
    } catch (e) {
      if (e && e.code && e.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') return;
      if (String(e).includes('UNIQUE') || String(e).includes('PRIMARY')) return;
      throw e;
    }

    applyEventToTokens(eventName, payload);
    if (eventName === 'ReputationChanged') {
      try {
        insertReputationEventStmt.run({
          tx_hash: txHash,
          log_index: logIndex,
          block_number: blockNumber,
          address: normalizeAddress(payload.account),
          current_delta: toNumber(payload.currentDelta, 0),
          lifetime_delta: toNumber(payload.lifetimeDelta, 0),
          locked_delta: toNumber(payload.lockedDelta, 0),
          event_data: serializeEventData(payload),
        });
      } catch (e) {
        if (e && e.code && e.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') return;
        if (String(e).includes('UNIQUE') || String(e).includes('PRIMARY')) return;
        throw e;
      }
      applyEventToReputation(eventName, payload);
    }

    if (eventName === 'InteractionRecorded') {
      try {
        const addrA = normalizeAddress(payload.addrA);
        const addrB = normalizeAddress(payload.addrB);
        insertInteractionEventStmt.run({
          tx_hash: txHash,
          log_index: logIndex,
          block_number: blockNumber,
          addr_a: addrA,
          addr_b: addrB,
          decay_level: toNumber(payload.decayLevel, 0),
          last_interaction_ts: toNumber(payload.lastInteractionTs, 0),
          event_data: serializeEventData(payload),
        });
      } catch (e) {
        if (e && e.code && e.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') return;
        if (String(e).includes('UNIQUE') || String(e).includes('PRIMARY')) return;
        throw e;
      }
    }

    if (tokenId && ['IOUCreated', 'IOUAccepted', 'IOUSettled', 'IOURefunded', 'CloseRequested', 'CloseConfirmed', 'CloseRejected', 'TransferInitiated', 'TransferConfirmed', 'TransferCompleted', 'TransferRejected'].includes(eventName)) {
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

    insertOrReplaceLastSync.run({ last_block: blockNumber });
  } catch (err) {
    console.error('processEventIfConfirmed error', err);
  }
}

async function replayEventsInRange(fromBlock, toBlock) {
  if (!contract || fromBlock > toBlock) return;

  const eventNames = ['Transfer', 'IOUCreated', 'IOUAccepted', 'IOUSettled', 'IOURefunded', 'CloseRequested', 'CloseConfirmed', 'CloseRejected', 'TransferInitiated', 'TransferConfirmed', 'TransferCompleted', 'TransferRejected', 'TreasuryUpdated', 'ReputationLedgerUpdated'];
  for (const eventName of eventNames) {
    const logs = await contract.queryFilter(eventName, fromBlock, toBlock);
    for (const log of logs) {
      try {
        if (eventName === 'Transfer') {
          await processEventIfConfirmed('Transfer', { from: log.args?.from, to: log.args?.to, tokenId: log.args?.tokenId }, log);
        } else if (eventName === 'IOUCreated') {
          await processEventIfConfirmed('IOUCreated', { tokenId: log.args?.tokenId, creator: log.args?.creator, fulfiller: log.args?.fulfiller, collateral: log.args?.collateral }, log);
        } else if (eventName === 'IOUAccepted') {
          await processEventIfConfirmed('IOUAccepted', { tokenId: log.args?.tokenId, fulfiller: log.args?.fulfiller }, log);
        } else if (eventName === 'IOUSettled') {
          await processEventIfConfirmed('IOUSettled', { tokenId: log.args?.tokenId, fee: log.args?.fee, payout: log.args?.payout }, log);
        } else if (eventName === 'IOURefunded') {
          await processEventIfConfirmed('IOURefunded', { tokenId: log.args?.tokenId, amount: log.args?.amount }, log);
        } else if (eventName === 'CloseRequested') {
          await processEventIfConfirmed('CloseRequested', { tokenId: log.args?.tokenId, fulfiller: log.args?.fulfiller }, log);
        } else if (eventName === 'CloseConfirmed') {
          await processEventIfConfirmed('CloseConfirmed', { tokenId: log.args?.tokenId, owner: log.args?.owner }, log);
        } else if (eventName === 'CloseRejected') {
          await processEventIfConfirmed('CloseRejected', { tokenId: log.args?.tokenId, owner: log.args?.owner }, log);
        } else if (eventName === 'TransferInitiated') {
          await processEventIfConfirmed('TransferInitiated', { tokenId: log.args?.tokenId, from: log.args?.from, to: log.args?.to }, log);
        } else if (eventName === 'TransferConfirmed') {
          await processEventIfConfirmed('TransferConfirmed', { tokenId: log.args?.tokenId, by: log.args?.by }, log);
        } else if (eventName === 'TransferCompleted') {
          await processEventIfConfirmed('TransferCompleted', { tokenId: log.args?.tokenId, from: log.args?.from, to: log.args?.to, fee: log.args?.fee }, log);
        } else if (eventName === 'TransferRejected') {
          await processEventIfConfirmed('TransferRejected', { tokenId: log.args?.tokenId, by: log.args?.by }, log);
        } else if (eventName === 'TreasuryUpdated') {
          await processEventIfConfirmed('TreasuryUpdated', { treasury: log.args?.treasury }, log);
        } else if (eventName === 'ReputationLedgerUpdated') {
          await processEventIfConfirmed('ReputationLedgerUpdated', { reputationLedger: log.args?.reputationLedger }, log);
        }
      } catch (err) {
        console.error(`replayEventsInRange error for ${eventName}`, err);
      }
    }
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

async function bootstrap() {
  try {
    await initContract();
    await initReputationContract();
    if (contract) {
      wireContractListeners(contract);
    } else {
      console.warn('No IOUNFT address resolved yet; indexer will stay passive until addresses.json is in sync.');
    }
    if (reputationContract) {
      wireReputationListeners(reputationContract);
    } else {
      console.warn('No ReputationLedger address resolved yet; reputation indexing will stay passive until addresses.json is in sync.');
    }

    await reconcileOnStartup();
    syncTimer = setInterval(() => {
      syncFromChain('poll').catch((err) => console.error('syncFromChain poll error', err));
    }, 5000);
  } catch (err) {
    console.error('Indexer bootstrap failed', err);
  }
}

bootstrap();

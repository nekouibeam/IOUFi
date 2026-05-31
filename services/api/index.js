require('dotenv').config();
const express = require('express');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const PORT = process.env.PORT || 4000;
const DATA_DB = process.env.INDEXER_DB || path.join(__dirname, '..', 'indexer', 'data', 'indexer.db');

const db = new DatabaseSync(DATA_DB, { readOnly: true });

function prepare(sql) {
  const stmt = db.prepare(sql);
  stmt.setAllowBareNamedParameters(true);
  return stmt;
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

function tableExists(tableName) {
  try {
    const stmt = prepare('SELECT name FROM sqlite_master WHERE type = \'table\' AND name = @name LIMIT 1');
    const row = stmt.get({ name: tableName });
    return !!row;
  } catch (_) {
    return false;
  }
}

function mapReputationRow(row) {
  if (!row) return null;
  const currentRep = toNumber(row.currentRep ?? row.current_rep, 0);
  const lockedRep = toNumber(row.lockedRep ?? row.locked_rep, 0);
  return {
    address: row.address ? String(row.address).toLowerCase() : null,
    currentRep,
    lifetimeRep: toNumber(row.lifetimeRep ?? row.lifetime_rep, 0),
    lockedRep,
    votingPower: toNumber(row.votingPower ?? row.voting_power, Math.max(0, currentRep - lockedRep)),
    updatedAt: row.updatedAt ?? row.updated_at ?? null,
    lastBlock: row.lastBlock ?? row.last_block ?? null,
    lastTxHash: row.lastTxHash ?? row.last_tx_hash ?? null,
    lastLogIndex: row.lastLogIndex ?? row.last_log_index ?? null,
  };
}

const selectReputationSummaryStmt = prepare(`
  SELECT
    COUNT(1) AS account_count,
    COALESCE(SUM(current_rep), 0) AS total_current_rep,
    COALESCE(SUM(lifetime_rep), 0) AS total_lifetime_rep,
    COALESCE(SUM(locked_rep), 0) AS total_locked_rep,
    COALESCE(SUM(voting_power), 0) AS total_voting_power
  FROM reputation_accounts
`);
const selectReputationByAddressStmt = prepare(`
  SELECT address, current_rep AS currentRep, lifetime_rep AS lifetimeRep, locked_rep AS lockedRep, voting_power AS votingPower, updated_at AS updatedAt, last_block AS lastBlock, last_tx_hash AS lastTxHash, last_log_index AS lastLogIndex
  FROM reputation_accounts
  WHERE lower(address) = lower(@address)
  LIMIT 1
`);
const selectReputationLeaderboardStmt = prepare(`
  SELECT address, current_rep AS currentRep, lifetime_rep AS lifetimeRep, locked_rep AS lockedRep, voting_power AS votingPower, updated_at AS updatedAt, last_block AS lastBlock, last_tx_hash AS lastTxHash, last_log_index AS lastLogIndex
  FROM reputation_accounts
  ORDER BY current_rep DESC, lifetime_rep DESC, address ASC
  LIMIT @limit OFFSET @offset
`);
const hasInteractionEvents = tableExists('interaction_events');
const selectInteractionEventsStmt = hasInteractionEvents ? prepare(`
  SELECT tx_hash AS txHash, log_index AS logIndex, block_number AS blockNumber, addr_a AS addrA, addr_b AS addrB, decay_level AS decayLevel, last_interaction_ts AS lastInteractionTs
  FROM interaction_events
  WHERE (@address IS NULL OR lower(addr_a) = lower(@address) OR lower(addr_b) = lower(@address))
  ORDER BY block_number DESC, log_index DESC
  LIMIT @limit OFFSET @offset
`) : null;

const selectInteractionEventsCountStmt = hasInteractionEvents ? prepare(`
  SELECT COUNT(1) AS total
  FROM interaction_events
  WHERE (@address IS NULL OR lower(addr_a) = lower(@address) OR lower(addr_b) = lower(@address))
`) : null;

const selectInteractionSummaryStmt = hasInteractionEvents ? prepare(`
  WITH expanded AS (
    SELECT tx_hash, log_index, block_number, last_interaction_ts, decay_level, lower(addr_a) AS address
    FROM interaction_events
    WHERE addr_a IS NOT NULL
    UNION ALL
    SELECT tx_hash, log_index, block_number, last_interaction_ts, decay_level, lower(addr_b) AS address
    FROM interaction_events
    WHERE addr_b IS NOT NULL
  ),
  filtered AS (
    SELECT * FROM expanded
    WHERE (@address IS NULL OR lower(address) = lower(@address))
  ),
  ranked AS (
    SELECT
      address,
      block_number,
      log_index,
      COALESCE(last_interaction_ts, 0) AS last_interaction_ts,
      COALESCE(decay_level, 0) AS decay_level,
      ROW_NUMBER() OVER (
        PARTITION BY address
        ORDER BY COALESCE(last_interaction_ts, 0) DESC, block_number DESC, log_index DESC
      ) AS rn
    FROM filtered
  )
  SELECT
    f.address AS address,
    COUNT(1) AS interaction_count,
    MAX(COALESCE(f.last_interaction_ts, 0)) AS last_interaction_ts,
    COALESCE(MAX(CASE WHEN r.rn = 1 THEN r.decay_level END), 0) AS latest_decay_level
  FROM filtered f
  LEFT JOIN ranked r ON r.address = f.address
  GROUP BY f.address
  ORDER BY interaction_count DESC, last_interaction_ts DESC, address ASC
  LIMIT @limit OFFSET @offset
`) : null;

const selectInteractionSummaryCountStmt = hasInteractionEvents ? prepare(`
  WITH expanded AS (
    SELECT lower(addr_a) AS address FROM interaction_events WHERE addr_a IS NOT NULL
    UNION ALL
    SELECT lower(addr_b) AS address FROM interaction_events WHERE addr_b IS NOT NULL
  )
  SELECT COUNT(DISTINCT address) AS total
  FROM expanded
  WHERE (@address IS NULL OR lower(address) = lower(@address))
`) : null;

const app = express();

app.get('/api/reputation/summary', (req, res) => {
  try {
    const row = selectReputationSummaryStmt.get();
    res.json({
      accountCount: toNumber(row?.account_count, 0),
      totalCurrentRep: toNumber(row?.total_current_rep, 0),
      totalLifetimeRep: toNumber(row?.total_lifetime_rep, 0),
      totalLockedRep: toNumber(row?.total_locked_rep, 0),
      totalVotingPower: toNumber(row?.total_voting_power, 0),
    });
  } catch (err) {
    console.error(err);
    res.status(503).json({ error: 'service unavailable' });
  }
});

app.get('/api/reputation/leaderboard', (req, res) => {
  try {
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit || '20', 10)));
    const offset = Math.max(0, parseInt(req.query.offset || '0', 10));
    const rows = selectReputationLeaderboardStmt.all({ limit, offset });
    res.json({
      data: rows.map(mapReputationRow),
      pagination: { limit, offset, hasMore: rows.length === limit },
    });
  } catch (err) {
    console.error(err);
    res.status(503).json({ error: 'service unavailable' });
  }
});

app.get('/api/reputation/:address(0x[0-9a-fA-F]{40})', (req, res) => {
  try {
    const address = normalizeAddress(req.params.address);
    if (!address || !/^0x[0-9a-f]{40}$/.test(address)) {
      return res.status(400).json({ error: 'invalid address' });
    }

    const row = selectReputationByAddressStmt.get({ address });
    if (!row) {
      return res.json({
        address,
        currentRep: 0,
        lifetimeRep: 0,
        lockedRep: 0,
        votingPower: 0,
        exists: false,
      });
    }

    res.json({ ...mapReputationRow(row), exists: true });
  } catch (err) {
    console.error(err);
    res.status(503).json({ error: 'service unavailable' });
  }
});

app.get('/api/reputation/interactions', (req, res) => {
  try {
    if (!hasInteractionEvents || !selectInteractionEventsStmt || !selectInteractionEventsCountStmt) {
      return res.json({
        data: [],
        pagination: { limit: 0, offset: 0, hasMore: false, total: 0 },
        available: false,
      });
    }

    const address = req.query.address ? normalizeAddress(req.query.address) : null;
    if (address && !/^0x[0-9a-f]{40}$/.test(address)) {
      return res.status(400).json({ error: 'invalid address' });
    }

    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit || '20', 10)));
    const offset = Math.max(0, parseInt(req.query.offset || '0', 10));

    const rows = selectInteractionEventsStmt.all({ address, limit, offset });
    const countRow = selectInteractionEventsCountStmt.get({ address });
    const total = toNumber(countRow?.total, 0);

    res.json({
      data: rows.map((row) => ({
        txHash: row.txHash,
        logIndex: toNumber(row.logIndex, 0),
        blockNumber: toNumber(row.blockNumber, 0),
        addrA: normalizeAddress(row.addrA),
        addrB: normalizeAddress(row.addrB),
        decayLevel: toNumber(row.decayLevel, 0),
        lastInteractionTs: toNumber(row.lastInteractionTs, 0),
      })),
      pagination: { limit, offset, hasMore: offset + rows.length < total, total },
      available: true,
    });
  } catch (err) {
    console.error(err);
    res.status(503).json({ error: 'service unavailable' });
  }
});

app.get('/api/reputation/interactions/summary', (req, res) => {
  try {
    if (!hasInteractionEvents || !selectInteractionSummaryStmt || !selectInteractionSummaryCountStmt) {
      return res.json({
        data: [],
        pagination: { limit: 0, offset: 0, hasMore: false, total: 0 },
        available: false,
      });
    }

    const address = req.query.address ? normalizeAddress(req.query.address) : null;
    if (address && !/^0x[0-9a-f]{40}$/.test(address)) {
      return res.status(400).json({ error: 'invalid address' });
    }

    const limit = Math.max(1, Math.min(200, parseInt(req.query.limit || '50', 10)));
    const offset = Math.max(0, parseInt(req.query.offset || '0', 10));
    const rows = selectInteractionSummaryStmt.all({ address, limit, offset });
    const countRow = selectInteractionSummaryCountStmt.get({ address });
    const total = toNumber(countRow?.total, 0);

    res.json({
      data: rows.map((row) => ({
        address: normalizeAddress(row.address),
        interactionCount: toNumber(row.interaction_count, 0),
        lastInteractionTs: toNumber(row.last_interaction_ts, 0),
        latestDecayLevel: toNumber(row.latest_decay_level, 0),
      })),
      pagination: { limit, offset, hasMore: offset + rows.length < total, total },
      available: true,
    });
  } catch (err) {
    console.error(err);
    res.status(503).json({ error: 'service unavailable' });
  }
});

// GET /api/users/:address/ious?roles=creator,owner,fulfiller,transferTarget&states=0,1&cursor=...&limit=20
app.get('/api/users/:address/ious', (req, res) => {
  try {
    const account = (req.params.address || '').toLowerCase();
    if (!account || !/^0x[0-9a-fA-F]{40}$/.test(account)) return res.status(400).json({ error: 'invalid address' });

    const roles = (req.query.roles || 'creator,fulfiller,owner').split(',').map(r => r.trim()).filter(Boolean);
    const states = (req.query.states || '').split(',').map(s => s.trim()).filter(Boolean);
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit || '20')));
    const cursor = req.query.cursor ? parseInt(req.query.cursor, 10) : null; // simple created_at cursor

    // build simple WHERE based on roles
    const roleClauses = [];
    const params = {};
    if (roles.includes('creator')) roleClauses.push('lower(creator)=@account');
    if (roles.includes('fulfiller')) roleClauses.push('lower(fulfiller)=@account');
    if (roles.includes('owner')) roleClauses.push('lower(owner)=@account');
    if (roles.includes('transferTarget')) roleClauses.push('lower(transfer_to)=@account');
    if (roles.includes('historical')) roleClauses.push('(lower(creator)=@account OR lower(fulfiller)=@account OR lower(owner)=@account)');

    if (roleClauses.length === 0) roleClauses.push('1=0');

    let where = `(${roleClauses.join(' OR ')}) AND is_burned=0`;
    if (states.length) {
      const ints = states.map((s, i) => { params['s'+i] = parseInt(s,10); return `state=@s${i}`; });
      where += ` AND (${ints.join(' OR ')})`;
    }
    if (cursor) {
      where += ` AND created_at < @cursor`;
      params.cursor = cursor;
    }

    params.account = account;
    params.limit = limit;

    const stmt = prepare(`SELECT token_id, creator, fulfiller, owner, state, CAST(collateral AS TEXT) AS collateral, deadline, decayed_creator_rep_base, decayed_fulfiller_rep_base, close_requested, close_requested_at, rep_pre_awarded, rep_pre_awarded_amount, transferable, unhappy_close, transfer_requested, transfer_to, transfer_new_owner_confirmed, transfer_fulfiller_confirmed, transfer_requested_at, transfer_fee_paid, description, service_type, created_at, updated_at, last_block, last_tx_hash, last_log_index, is_burned FROM tokens WHERE ${where} ORDER BY created_at DESC LIMIT @limit`);
    const rows = stmt.all(params);

    const nextCursor = rows.length ? rows[rows.length-1].created_at : null;
    res.json({ account, data: rows, pagination: { nextCursor, hasMore: rows.length === limit } });
  } catch (err) {
    console.error(err);
    res.status(503).json({ error: 'service unavailable' });
  }
});

// GET /api/marketplace/ious?limit=100
// Demo B marketplace: open bounty IOUs only.
app.get('/api/marketplace/ious', (req, res) => {
  try {
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit || '100', 10)));
    const zeroAddress = '0x0000000000000000000000000000000000000000';

    const stmt = prepare(`
      SELECT token_id, creator, fulfiller, owner, state, CAST(collateral AS TEXT) AS collateral, deadline, decayed_creator_rep_base, decayed_fulfiller_rep_base, close_requested, close_requested_at, rep_pre_awarded, rep_pre_awarded_amount, transferable, unhappy_close, description, service_type, created_at, updated_at, last_block, last_tx_hash, last_log_index, is_burned
      FROM tokens
      WHERE is_burned = 0
        AND state = 0
        AND COALESCE(collateral, 0) > 0
        AND lower(COALESCE(fulfiller, '')) = lower(@zeroAddress)
      ORDER BY created_at DESC, token_id DESC
      LIMIT @limit
    `);

    const rows = stmt.all({ zeroAddress, limit });
    res.json({
      data: rows,
      pagination: {
        hasMore: rows.length === limit,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(503).json({ error: 'service unavailable' });
  }
});

app.listen(PORT, () => console.log(`Query API listening on ${PORT} (db=${DATA_DB})`));

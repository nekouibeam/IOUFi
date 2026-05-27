require('dotenv').config();
const express = require('express');
const path = require('path');
const Database = require('better-sqlite3');

const PORT = process.env.PORT || 4000;
const DATA_DB = process.env.INDEXER_DB || path.join(__dirname, '..', 'indexer', 'data', 'indexer.db');

const db = new Database(DATA_DB, { readonly: true });
const app = express();

// GET /api/users/:address/ious?roles=creator,owner&states=0,1&cursor=...&limit=20
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

    const stmt = db.prepare(`SELECT token_id, creator, fulfiller, owner, state, description, service_type, created_at FROM tokens WHERE ${where} ORDER BY created_at DESC LIMIT @limit`);
    const rows = stmt.all(params);

    const nextCursor = rows.length ? rows[rows.length-1].created_at : null;
    res.json({ account, data: rows, pagination: { nextCursor, hasMore: rows.length === limit } });
  } catch (err) {
    console.error(err);
    res.status(503).json({ error: 'service unavailable' });
  }
});

app.listen(PORT, () => console.log(`Query API listening on ${PORT} (db=${DATA_DB})`));

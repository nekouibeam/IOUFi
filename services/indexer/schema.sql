
-- tokens 扁平化主表 schema (flat table per MVP)
CREATE TABLE IF NOT EXISTS tokens (
  token_id INTEGER PRIMARY KEY,
  creator TEXT NOT NULL,
  fulfiller TEXT,
  owner TEXT,
  state INTEGER,
  description TEXT,
  service_type TEXT,
  collateral INTEGER,
  deadline INTEGER,
  decayed_creator_rep_base INTEGER,
  decayed_fulfiller_rep_base INTEGER,
  close_requested INTEGER DEFAULT 0,
  close_requested_at INTEGER,
  rep_pre_awarded INTEGER DEFAULT 0,
  rep_pre_awarded_amount INTEGER DEFAULT 0,
  transferable INTEGER DEFAULT 0,
  unhappy_close INTEGER DEFAULT 0,
  is_burned INTEGER DEFAULT 0,
  created_at INTEGER,
  updated_at INTEGER,
  last_block INTEGER,
  last_tx_hash TEXT,
  last_log_index INTEGER
);

CREATE INDEX IF NOT EXISTS idx_tokens_creator ON tokens(creator);
CREATE INDEX IF NOT EXISTS idx_tokens_fulfiller ON tokens(fulfiller);
CREATE INDEX IF NOT EXISTS idx_tokens_owner ON tokens(owner);
CREATE INDEX IF NOT EXISTS idx_tokens_state ON tokens(state);
CREATE INDEX IF NOT EXISTS idx_tokens_created_at ON tokens(created_at DESC);

-- processed_events: track processed logs with unique tx_hash + log_index
CREATE TABLE IF NOT EXISTS processed_events (
  tx_hash TEXT NOT NULL,
  log_index INTEGER NOT NULL,
  block_number INTEGER NOT NULL,
  token_id INTEGER,
  event_name TEXT NOT NULL,
  event_data TEXT,
  PRIMARY KEY(tx_hash, log_index)
);

-- last_sync: persist last synced block for simple reconciliation
CREATE TABLE IF NOT EXISTS last_sync (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  last_block INTEGER
);


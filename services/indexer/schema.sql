
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
  transfer_requested INTEGER DEFAULT 0,
  transfer_to TEXT,
  transfer_new_owner_confirmed INTEGER DEFAULT 0,
  transfer_fulfiller_confirmed INTEGER DEFAULT 0,
  transfer_requested_at INTEGER,
  transfer_fee_paid INTEGER DEFAULT 0,
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

-- reputation_accounts: materialized snapshot for repository queries
CREATE TABLE IF NOT EXISTS reputation_accounts (
  address TEXT PRIMARY KEY,
  current_rep INTEGER NOT NULL DEFAULT 0,
  lifetime_rep INTEGER NOT NULL DEFAULT 0,
  locked_rep INTEGER NOT NULL DEFAULT 0,
  voting_power INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER,
  last_block INTEGER,
  last_tx_hash TEXT,
  last_log_index INTEGER
);

CREATE INDEX IF NOT EXISTS idx_reputation_accounts_current_rep ON reputation_accounts(current_rep DESC, lifetime_rep DESC, address ASC);
CREATE INDEX IF NOT EXISTS idx_reputation_accounts_updated_at ON reputation_accounts(updated_at DESC);

-- reputation_events: append-only log of rep changes for rebuilds / auditing
CREATE TABLE IF NOT EXISTS reputation_events (
  tx_hash TEXT NOT NULL,
  log_index INTEGER NOT NULL,
  block_number INTEGER NOT NULL,
  address TEXT NOT NULL,
  current_delta INTEGER NOT NULL,
  lifetime_delta INTEGER NOT NULL,
  locked_delta INTEGER NOT NULL,
  event_data TEXT,
  PRIMARY KEY(tx_hash, log_index)
);

CREATE INDEX IF NOT EXISTS idx_reputation_events_address ON reputation_events(address);
CREATE INDEX IF NOT EXISTS idx_reputation_events_block ON reputation_events(block_number, log_index);

-- interaction_events: append-only log of recorded interactions (decay progression)
CREATE TABLE IF NOT EXISTS interaction_events (
  tx_hash TEXT NOT NULL,
  log_index INTEGER NOT NULL,
  block_number INTEGER NOT NULL,
  addr_a TEXT,
  addr_b TEXT,
  decay_level INTEGER,
  last_interaction_ts INTEGER,
  event_data TEXT,
  PRIMARY KEY(tx_hash, log_index)
);

CREATE INDEX IF NOT EXISTS idx_interaction_events_addr ON interaction_events(addr_a, addr_b);
CREATE INDEX IF NOT EXISTS idx_interaction_events_block ON interaction_events(block_number, log_index);

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


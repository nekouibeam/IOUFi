function normalizeAddress(value) {
  return value ? String(value).toLowerCase() : null;
}

function toNumber(value, fallback = 0) {
  if (value === null || value === undefined) return fallback;
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function toBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    if (value === '1') return true;
    if (value === '0') return false;
  }
  return Boolean(value);
}

function pick(row, camelKey, snakeKey, fallback = null) {
  if (row?.[camelKey] !== undefined) return row[camelKey];
  if (row?.[snakeKey] !== undefined) return row[snakeKey];
  return fallback;
}

export function mapIndexerIouRow(row) {
  const tokenId = toNumber(pick(row, 'tokenId', 'token_id', null), 0);
  return {
    tokenId,
    creator: normalizeAddress(pick(row, 'creator', 'creator', null)),
    fulfiller: normalizeAddress(pick(row, 'fulfiller', 'fulfiller', null)),
    owner: normalizeAddress(pick(row, 'owner', 'owner', null)),
    state: toNumber(pick(row, 'state', 'state', null), 0),
    collateral: pick(row, 'collateral', 'collateral', null),
    deadline: toNumber(pick(row, 'deadline', 'deadline', null), 0),
    decayedCreatorRepBase: toNumber(pick(row, 'decayedCreatorRepBase', 'decayed_creator_rep_base', null), 0),
    decayedFulfillerRepBase: toNumber(pick(row, 'decayedFulfillerRepBase', 'decayed_fulfiller_rep_base', null), 0),
    closeRequested: toBoolean(pick(row, 'closeRequested', 'close_requested', false)),
    closeRequestedAt: toNumber(pick(row, 'closeRequestedAt', 'close_requested_at', null), 0),
    repPreAwarded: toBoolean(pick(row, 'repPreAwarded', 'rep_pre_awarded', false)),
    repPreAwardedAmount: toNumber(pick(row, 'repPreAwardedAmount', 'rep_pre_awarded_amount', null), 0),
    transferable: toBoolean(pick(row, 'transferable', 'transferable', false)),
    unhappyClose: toBoolean(pick(row, 'unhappyClose', 'unhappy_close', false)),
    transferRequested: toBoolean(pick(row, 'transferRequested', 'transfer_requested', false)),
    transferTo: normalizeAddress(pick(row, 'transferTo', 'transfer_to', null)),
    transferNewOwnerConfirmed: toBoolean(pick(row, 'transferNewOwnerConfirmed', 'transfer_new_owner_confirmed', false)),
    transferFulfillerConfirmed: toBoolean(pick(row, 'transferFulfillerConfirmed', 'transfer_fulfiller_confirmed', false)),
    transferRequestedAt: toNumber(pick(row, 'transferRequestedAt', 'transfer_requested_at', null), 0),
    transferFeePaid: toNumber(pick(row, 'transferFeePaid', 'transfer_fee_paid', null), 0),
    description: pick(row, 'description', 'description', null),
    serviceType: pick(row, 'serviceType', 'service_type', null),
    createdAt: toNumber(pick(row, 'createdAt', 'created_at', null), 0),
    updatedAt: toNumber(pick(row, 'updatedAt', 'updated_at', null), 0),
    lastBlock: toNumber(pick(row, 'lastBlock', 'last_block', null), 0),
    lastTxHash: pick(row, 'lastTxHash', 'last_tx_hash', null),
    lastLogIndex: toNumber(pick(row, 'lastLogIndex', 'last_log_index', null), 0),
    isBurned: toBoolean(pick(row, 'isBurned', 'is_burned', false)),
  };
}

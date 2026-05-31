function normalizeAddress(value) {
  return value ? String(value).toLowerCase() : null;
}

function toNumber(value, fallback = 0) {
  if (value === null || value === undefined) return fallback;
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

async function requestJson(path) {
  const res = await fetch(path);
  if (!res.ok) {
    throw new Error(`API error ${res.status}`);
  }
  return res.json();
}

export async function getReputationSummary() {
  const payload = await requestJson('/api/reputation/summary');
  return {
    accountCount: toNumber(payload.accountCount, 0),
    totalCurrentRep: toNumber(payload.totalCurrentRep, 0),
    totalLifetimeRep: toNumber(payload.totalLifetimeRep, 0),
    totalLockedRep: toNumber(payload.totalLockedRep, 0),
    totalVotingPower: toNumber(payload.totalVotingPower, 0),
  };
}

export async function getReputationProfile(address) {
  const normalized = normalizeAddress(address);
  if (!normalized) {
    return {
      address: null,
      currentRep: 0,
      lifetimeRep: 0,
      lockedRep: 0,
      votingPower: 0,
      exists: false,
    };
  }

  const payload = await requestJson(`/api/reputation/${normalized}`);
  return {
    address: normalizeAddress(payload.address),
    currentRep: toNumber(payload.currentRep, 0),
    lifetimeRep: toNumber(payload.lifetimeRep, 0),
    lockedRep: toNumber(payload.lockedRep, 0),
    votingPower: toNumber(payload.votingPower, 0),
    exists: Boolean(payload.exists),
    updatedAt: payload.updatedAt ?? null,
    lastBlock: payload.lastBlock ?? null,
  };
}

export async function getReputationLeaderboard(options = {}) {
  const params = new URLSearchParams();
  if (options.limit) params.set('limit', String(options.limit));
  if (options.offset) params.set('offset', String(options.offset));

  const payload = await requestJson(`/api/reputation/leaderboard?${params.toString()}`);
  const rows = Array.isArray(payload.data) ? payload.data : [];

  return {
    data: rows.map((row) => ({
      address: normalizeAddress(row.address),
      currentRep: toNumber(row.currentRep, 0),
      lifetimeRep: toNumber(row.lifetimeRep, 0),
      lockedRep: toNumber(row.lockedRep, 0),
      votingPower: toNumber(row.votingPower, 0),
      updatedAt: row.updatedAt ?? null,
      lastBlock: row.lastBlock ?? null,
    })),
    pagination: payload.pagination || { limit: toNumber(options.limit, 20), offset: toNumber(options.offset, 0), hasMore: false },
  };
}

export async function getInteractionEvents(options = {}) {
  const params = new URLSearchParams();
  if (options.address) params.set('address', normalizeAddress(options.address));
  if (options.limit) params.set('limit', String(options.limit));
  if (options.offset) params.set('offset', String(options.offset));

  const payload = await requestJson(`/api/reputation/interactions?${params.toString()}`);
  return {
    available: Boolean(payload.available),
    data: Array.isArray(payload.data) ? payload.data : [],
    pagination: payload.pagination || { limit: 0, offset: 0, hasMore: false, total: 0 },
  };
}

export async function getInteractionSummary(options = {}) {
  const params = new URLSearchParams();
  if (options.address) params.set('address', normalizeAddress(options.address));
  if (options.limit) params.set('limit', String(options.limit));
  if (options.offset) params.set('offset', String(options.offset));

  const payload = await requestJson(`/api/reputation/interactions/summary?${params.toString()}`);
  const rows = Array.isArray(payload.data) ? payload.data : [];

  return {
    available: Boolean(payload.available),
    data: rows.map((row) => ({
      address: normalizeAddress(row.address),
      interactionCount: toNumber(row.interactionCount, 0),
      latestDecayLevel: toNumber(row.latestDecayLevel, 0),
      lastInteractionTs: toNumber(row.lastInteractionTs, 0),
    })),
    pagination: payload.pagination || { limit: toNumber(options.limit, 50), offset: toNumber(options.offset, 0), hasMore: false, total: 0 },
  };
}

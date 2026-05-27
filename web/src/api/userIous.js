// Frontend helper stubs for user IOU queries
export async function getUserIOUs(address, options = {}) {
  const params = new URLSearchParams();
  if (options.roles) params.set('roles', options.roles.join(','));
  if (options.states) params.set('states', options.states.join(','));
  if (options.limit) params.set('limit', String(options.limit));
  if (options.cursor) params.set('cursor', String(options.cursor));

  const res = await fetch(`/api/users/${address}/ious?${params.toString()}`);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

export async function getUserIOUSummary(address) {
  // Simple summary: request small limit and reduce locally.
  const data = await getUserIOUs(address, { limit: 10 });
  return { account: data.account, totalPreview: data.data.length };
}

export async function enrichWithOnChainData(provider, iouAbi, contractAddress, tokenIds, opts = {}) {
  // uses multicall wrapper (fallback to batched RPC calls)
  const multicall = await import('./multicall');
  const raw = await multicall.default(provider, iouAbi, contractAddress, tokenIds, opts);
  // normalize results to a map tokenId -> { state, description, serviceType }
  const map = {};
  for (const id of tokenIds) {
    const r = raw[String(id)];
    if (!r) { map[id] = null; continue; }
    // attempt to read named fields
    const normalized = {
      tokenId: Number(id),
      creator: r.creator || r[0],
      fulfiller: r.fulfiller || r[1],
      owner: r.owner || r[2],
      state: r.state !== undefined ? r.state : r[3],
      description: r.description || r[4],
      serviceType: r.serviceType || r[5] || r.service_type || null
    };
    map[id] = normalized;
  }
  return map;
}

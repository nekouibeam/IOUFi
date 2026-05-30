import { Contract } from 'ethers';

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
  const contract = new Contract(contractAddress, iouAbi, provider);
  // normalize results to a map tokenId -> full IOU view
  const map = {};
  for (const id of tokenIds) {
    const r = raw[String(id)];
    if (!r) { map[id] = null; continue; }
    // attempt to read named fields
    const normalized = {
      tokenId: Number(id),
      creator: r.creator || r[0],
      fulfiller: r.fulfiller || r[1],
      collateral: r.collateral !== undefined ? r.collateral : r[2],
      state: r.state !== undefined ? r.state : r[3],
      createdAt: r.createdAt !== undefined ? r.createdAt : r[4],
      deadline: r.deadline !== undefined ? r.deadline : r[5],
      description: r.description || r[6],
      serviceType: r.serviceType || r[7] || r.service_type || null,
      decayedCreatorRepBase: r.decayedCreatorRepBase !== undefined ? r.decayedCreatorRepBase : r[8],
      decayedFulfillerRepBase: r.decayedFulfillerRepBase !== undefined ? r.decayedFulfillerRepBase : r[9],
      closeRequested: r.closeRequested !== undefined ? r.closeRequested : r[10],
      closeRequestedAt: r.closeRequestedAt !== undefined ? r.closeRequestedAt : r[11],
      repPreAwarded: r.repPreAwarded !== undefined ? r.repPreAwarded : r[12],
      repPreAwardedAmount: r.repPreAwardedAmount !== undefined ? r.repPreAwardedAmount : r[13],
      transferable: r.transferable !== undefined ? r.transferable : r[14],
      unhappyClose: r.unhappyClose !== undefined ? r.unhappyClose : r[15],
    };

    try {
      normalized.owner = await contract.ownerOf(BigInt(id));
    } catch (_) {
      normalized.owner = null;
    }

    map[id] = normalized;
  }
  return map;
}

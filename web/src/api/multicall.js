import { Contract } from 'ethers';

// Minimal Multicall wrapper. If a Multicall contract address is provided, this can be extended
// to use aggregate3; otherwise it falls back to parallel RPC calls with limited concurrency.

export async function batchGetIOUsFallback(provider, iouAbi, contractAddress, tokenIds, concurrency = 8) {
  const contract = new Contract(contractAddress, iouAbi, provider);
  const out = {};
  const chunks = [];
  for (let i = 0; i < tokenIds.length; i += concurrency) chunks.push(tokenIds.slice(i, i + concurrency));
  for (const chunk of chunks) {
    const promises = chunk.map(id => contract.getIOU(id).then(r => ({ id, ok: true, res: r })).catch(e => ({ id, ok: false, err: e })));
    const settled = await Promise.all(promises);
    for (const s of settled) {
      if (s.ok) out[String(s.id)] = s.res;
      else out[String(s.id)] = null;
    }
  }
  return out;
}

export default async function multicallGetIOUs(provider, iouAbi, contractAddress, tokenIds, opts = {}) {
  // opts.multicallAddress can be used in future to call an on-chain multicall contract
  // For now, run fallback RPC batching which works in local/dev and doesn't require external deps.
  return batchGetIOUsFallback(provider, iouAbi, contractAddress, tokenIds, opts.concurrency || 8);
}

import { mapIndexerIouRow } from './iouMapping';

export async function getMarketplaceIOUs(options = {}) {
  const params = new URLSearchParams();
  if (options.limit) params.set('limit', String(options.limit));

  const res = await fetch(`/api/marketplace/ious?${params.toString()}`);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  const payload = await res.json();
  const rows = Array.isArray(payload?.data) ? payload.data : [];
  return {
    ...payload,
    data: rows.map(mapIndexerIouRow),
  };
}
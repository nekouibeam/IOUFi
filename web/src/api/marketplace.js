export async function getMarketplaceIOUs(options = {}) {
  const params = new URLSearchParams();
  if (options.limit) params.set('limit', String(options.limit));

  const res = await fetch(`/api/marketplace/ious?${params.toString()}`);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}
const HISTORICAL_STATES = new Set(['2', '3', 2, 3]);

export function normalizeAddress(value) {
  return (value || '').trim().toLowerCase();
}

export function buildTokenView(row, enriched) {
  const chain = enriched[String(row.token_id)] || null;
  const displayedState = chain?.state ?? row.state;
  const displayedDescription = chain?.description ?? row.description ?? '—';
  const displayedServiceType = chain?.serviceType ?? chain?.service_type ?? row.service_type ?? '—';
  const syncing = String(row.state) !== String(displayedState)
    || (row.description || null) !== (displayedDescription === '—' ? null : displayedDescription)
    || (row.service_type || null) !== (displayedServiceType === '—' ? null : displayedServiceType);

  return {
    tokenId: row.token_id,
    creator: normalizeAddress(row.creator),
    fulfiller: normalizeAddress(row.fulfiller),
    owner: normalizeAddress(row.owner),
    state: displayedState,
    description: displayedDescription,
    serviceType: displayedServiceType,
    syncing,
  };
}

export function buildSections(rows, enriched, account) {
  const acct = normalizeAddress(account);
  const sections = { created: [], owedToMe: [], owedByMe: [], history: [] };

  for (const row of rows) {
    const token = buildTokenView(row, enriched);
    const isHistorical = HISTORICAL_STATES.has(token.state) || HISTORICAL_STATES.has(String(token.state));
    const roleMatch = [];

    if (token.creator === acct) roleMatch.push('creator');
    if (token.owner === acct) roleMatch.push('owner');
    if (token.fulfiller === acct) roleMatch.push('fulfiller');

    if (isHistorical) {
      sections.history.push({ ...token, roleMatch });
      continue;
    }

    if (token.creator === acct) sections.created.push({ ...token, roleMatch });
    if (token.owner === acct) sections.owedToMe.push({ ...token, roleMatch });
    if (token.fulfiller === acct) sections.owedByMe.push({ ...token, roleMatch });
  }

  return sections;
}

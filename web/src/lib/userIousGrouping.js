const HISTORICAL_STATES = new Set(['2', '3', 2, 3]);

export function normalizeAddress(value) {
  return (value || '').trim().toLowerCase();
}

export function buildTokenView(row, enriched) {
  const chain = enriched[String(row.token_id)] || null;
  const displayedState = chain?.state ?? row.state;
  const displayedDescription = chain?.description ?? row.description ?? '—';
  const displayedServiceType = chain?.serviceType ?? chain?.service_type ?? row.service_type ?? '—';
  const displayedCollateral = chain?.collateral ?? row.collateral ?? row.value ?? null;
  const displayedCloseRequested = chain?.closeRequested ?? row.close_requested ?? false;
  const displayedCloseRequestedAt = chain?.closeRequestedAt ?? row.close_requested_at ?? null;
  const displayedRepPreAwarded = chain?.repPreAwarded ?? row.rep_pre_awarded ?? false;
  const displayedRepPreAwardedAmount = chain?.repPreAwardedAmount ?? row.rep_pre_awarded_amount ?? null;
  const displayedTransferRequested = chain?.transferRequested ?? row.transfer_requested ?? false;
  const displayedTransferTo = chain?.transferTo ?? row.transfer_to ?? null;
  const displayedTransferNewOwnerConfirmed = chain?.transferNewOwnerConfirmed ?? row.transfer_new_owner_confirmed ?? false;
  const displayedTransferFulfillerConfirmed = chain?.transferFulfillerConfirmed ?? row.transfer_fulfiller_confirmed ?? false;
  const displayedTransferRequestedAt = chain?.transferRequestedAt ?? row.transfer_requested_at ?? null;
  const displayedTransferFeePaid = chain?.transferFeePaid ?? row.transfer_fee_paid ?? null;
  const syncing = String(row.state) !== String(displayedState);

  return {
    tokenId: row.token_id,
    creator: normalizeAddress(row.creator),
    fulfiller: normalizeAddress(row.fulfiller),
    owner: normalizeAddress(chain?.owner ?? row.owner),
    state: displayedState,
    description: displayedDescription,
    serviceType: displayedServiceType,
    collateral: displayedCollateral,
    closeRequested: Boolean(displayedCloseRequested),
    closeRequestedAt: displayedCloseRequestedAt,
    repPreAwarded: Boolean(displayedRepPreAwarded),
    repPreAwardedAmount: displayedRepPreAwardedAmount,
    transferRequested: Boolean(displayedTransferRequested),
    transferTo: displayedTransferTo,
    transferNewOwnerConfirmed: Boolean(displayedTransferNewOwnerConfirmed),
    transferFulfillerConfirmed: Boolean(displayedTransferFulfillerConfirmed),
    transferRequestedAt: displayedTransferRequestedAt,
    transferFeePaid: displayedTransferFeePaid,
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

import React, { useEffect, useMemo, useState } from 'react';
import { getUserIOUs, enrichWithOnChainData } from '../api/userIous';
import * as api from '../api/contract';
import { getReadProvider } from '../api/contract';
import addressesByChain from '../contracts/addresses.json';
import { buildSections, normalizeAddress } from '../lib/userIousGrouping';
import IOUNFTArtifact from '../contracts/IOUNFT.json';

const IOU_ABI = Array.isArray(IOUNFTArtifact) ? IOUNFTArtifact : (IOUNFTArtifact.abi || []);
const SECTION_ORDER = [
  { key: 'created', title: 'Created by me', subtitle: 'IOU minted by me', empty: 'No active IOUs created by you.' },
  { key: 'owedToMe', title: 'Owed to me', subtitle: 'I hold, can request fulfillment or transfer', empty: 'No active IOUs owed to you.' },
  { key: 'owedByMe', title: 'Owed by me', subtitle: 'IOU I need to provide services for', empty: 'No active IOUs owed by you.' },
  { key: 'history', title: 'History', subtitle: 'Settled / Cancelled historical records (priority display)', empty: 'No historical records.' },
];

function SkeletonCard() {
  return (
    <div className="iou-card skeleton-card" aria-hidden="true">
      <div className="skeleton skeleton-line short" />
      <div className="skeleton skeleton-line" />
      <div className="skeleton skeleton-line medium" />
      <div className="skeleton skeleton-chip-row">
        <span className="skeleton skeleton-chip" />
        <span className="skeleton skeleton-chip" />
        <span className="skeleton skeleton-chip" />
      </div>
    </div>
  );
}

function TokenCard({ token, onRequestClose, onConfirmClose, onRejectClose }) {
  const [rating, setRating] = useState(2);
  const [busyAction, setBusyAction] = useState('');
  const stateLabel = {
    0: 'Pending',
    1: 'Active',
    2: 'Settled',
    3: 'Cancelled',
  }[String(token.state)] ?? String(token.state ?? '—');
  const typeLabel = Number(token.collateral ?? 0) > 0 ? 'Bounty' : 'Social';
  const closeStatus = token.closeRequested ? 'Close requested' : 'Close open';
  const unhappyCloseStatus = String(token.state) === '2'
    ? (token.unhappyClose ? 'Unhappy Close' : 'Happy Close')
    : '';
  const transferStatus = token.transferRequested ? `Transferring → ${token.transferTo || '—'}` : 'Transfer open';
  const canRequestClose = token.sectionKey === 'owedByMe' && !token.closeRequested && !token.syncing;
  const canRespondClose = token.sectionKey === 'owedToMe' && token.closeRequested && !token.syncing;

  async function runAction(actionKey, action) {
    try {
      setBusyAction(actionKey);
      await action();
    } finally {
      setBusyAction('');
    }
  }

  return (
    <article className="iou-card">
      <div className="card-topline">
        <div>
          <div className="iou-token">Token #{token.tokenId}</div>
          <div className="iou-subtitle">{token.description}</div>
        </div>
        <div className={`state-pill state-${stateLabel.toLowerCase()}`}>{stateLabel}</div>
      </div>

      <div className="iou-meta">
        <span className="chip chip-type">{typeLabel}</span>
        <span className="chip">{token.serviceType || 'No service type'}</span>
        <span className={`chip ${token.closeRequested ? 'chip-warn' : 'chip-ok'}`}>{closeStatus}</span>
        <span className={`chip ${token.transferRequested ? 'chip-warn' : 'chip-ok'}`}>{transferStatus}</span>
        <span className={`chip ${token.unhappyClose ? 'chip-warn' : 'chip-ok'}`}>{unhappyCloseStatus}</span>
        <span className={`chip ${token.syncing ? 'chip-warn' : 'chip-ok'}`}>{token.syncing ? 'Syncing' : 'Synced'}</span>
      </div>

      <div className="role-row">
        {token.roleMatch?.length ? token.roleMatch.map((role) => (
          <span key={role} className="role-pill">{role}</span>
        )) : <span className="role-pill muted">No role match</span>}
      </div>

      <div className="address-grid">
        <div><span className="label">Creator</span><div className="mono small">{token.creator || '—'}</div></div>
        <div><span className="label">Owner</span><div className="mono small">{token.owner || '—'}</div></div>
        <div><span className="label">Fulfiller</span><div className="mono small">{token.fulfiller || '—'}</div></div>
        <div><span className="label">Close requested at</span><div className="mono small">{token.closeRequestedAt || '—'}</div></div>
      </div>

      {token.sectionKey === 'owedByMe' ? (
        <div className="card-actions">
          <button
            type="button"
            className={token.closeRequested ? 'btn full' : 'btn primary full'}
            disabled={!canRequestClose || busyAction === 'request'}
            title={token.closeRequested ? 'Close requested' : 'Request close'}
            onClick={() => runAction('request', () => onRequestClose(token.tokenId))}
          >
            {busyAction === 'request' ? 'Requesting…' : (token.closeRequested ? 'Close requested' : 'Request Close')}
          </button>
          <div className="action-note">
            {token.closeRequested ? 'Close requested, waiting for owner to confirm or reject in the "Owed to me" section.' : 'First, have the fulfiller submit a close request.'}
          </div>
        </div>
      ) : null}

      {token.sectionKey === 'owedToMe' ? (
        <div className="card-actions">
          {token.closeRequested ? (
            <>
              <div className="action-note">Close request received, please confirm or reject.</div>
              <div className="rating-row">
                <label className="label" htmlFor={`close-rating-${token.tokenId}`}>Owner rating</label>
                <select
                  id={`close-rating-${token.tokenId}`}
                  className="rating-select"
                  value={rating}
                  onChange={(event) => setRating(Number(event.target.value))}
                  disabled={busyAction === 'confirm' || busyAction === 'reject' || token.syncing}
                >
                  <option value={2}>2 · Great</option>
                  <option value={1}>1 · Neutral</option>
                  <option value={0}>0 · Bad</option>
                </select>
              </div>
              <div className="card-actions-grid">
                <button
                  type="button"
                  className="btn primary"
                  disabled={!canRespondClose || busyAction === 'confirm'}
                  onClick={() => runAction('confirm', () => onConfirmClose(token.tokenId, rating))}
                >
                  {busyAction === 'confirm' ? 'Confirming…' : 'Confirm Close'}
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={!canRespondClose || busyAction === 'reject'}
                  onClick={() => runAction('reject', () => onRejectClose(token.tokenId))}
                >
                  {busyAction === 'reject' ? 'Rejecting…' : 'Reject Close'}
                </button>
              </div>
            </>
          ) : (
            <button type="button" className="btn full" disabled title="Wait for the fulfiller to submit a close request before you can take action">
              Waiting for Close Request
            </button>
          )}
        </div>
      ) : null}
    </article>
  );
}

function SectionBlock({ section, items, loading, onRequestClose, onConfirmClose, onRejectClose }) {
  return (
    <section className="iou-section">
      <div className="section-divider">
        <div>
          <h3>{section.title}</h3>
          <p>{section.subtitle}</p>
        </div>
        <div className="section-count">{items.length}</div>
      </div>

      {loading ? (
        <div className="iou-grid">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : items.length ? (
        <div className="iou-grid">
          {items.map((token) => (
            <TokenCard
              key={`${section.key}-${token.tokenId}`}
              token={{ ...token, sectionKey: section.key }}
              onRequestClose={onRequestClose}
              onConfirmClose={onConfirmClose}
              onRejectClose={onRejectClose}
            />
          ))}
        </div>
      ) : (
        <div className="empty-state">{section.empty}</div>
      )}
    </section>
  );
}

export default function UserIous() {
  const [account, setAccount] = useState('');
  const [busy, setBusy] = useState(false);
  const [submittedAddress, setSubmittedAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [enrichmentLoading, setEnrichmentLoading] = useState(false);
  const [results, setResults] = useState([]);
  const [enriched, setEnriched] = useState({});
  const [error, setError] = useState(null);
  const [queryTime, setQueryTime] = useState('');

  const sections = useMemo(() => buildSections(results, enriched, submittedAddress), [results, enriched, submittedAddress]);

  async function refreshAccount() {
    if (!window.ethereum) {
      setError('Wallet not detected, please install and enable MetaMask.');
      return '';
    }

    const provider = await api.getProvider();
    const accounts = await provider.send('eth_accounts', []);
    if (!accounts?.length) {
      setAccount('');
      return '';
    }

    const signer = await provider.getSigner();
    const addr = await signer.getAddress();
    setAccount(addr);
    return addr;
  }

  async function connectWalletAndQuery() {
    setError(null);
    setBusy(true);
    try {
      const provider = await api.connectWallet();
      const signer = await provider.getSigner();
      const addr = await signer.getAddress();
      setAccount(addr);
      await loadAddress(normalizeAddress(addr));
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  async function loadAddress(normalizedAddress, { retainVisibleData = false } = {}) {
    setError(null);
    setSubmittedAddress(normalizedAddress);
    setLoading(true);
    if (!retainVisibleData) {
      setEnriched({});
      setResults([]);
    }

    try {
      const data = await getUserIOUs(normalizedAddress, { limit: 200 });
      const rows = data.data || [];
      setResults(rows);
      setQueryTime(new Date().toLocaleString());

      if (!rows.length) return;

      const tokenIds = rows.map((row) => row.tokenId).filter((id) => id !== undefined && id !== null);
      const readProvider = await getReadProvider();
      const network = await readProvider.getNetwork();
      const contractAddress = addressesByChain?.[String(network.chainId)]?.IOUNFT
        || import.meta.env.VITE_IOUNFT_ADDRESS
        || window.__IOUNFT_ADDRESS__
        || '';
      if (!contractAddress) return;

      setEnrichmentLoading(true);
      const chainMap = await enrichWithOnChainData(readProvider, IOU_ABI, contractAddress, tokenIds);
      setEnriched(chainMap || {});
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setEnrichmentLoading(false);
      setLoading(false);
    }
  }

  async function handleRefreshByWallet() {
    setError(null);
    const addr = await refreshAccount();
    const normalized = normalizeAddress(addr);
    if (!/^0x[0-9a-f]{40}$/.test(normalized)) {
      setError('Please connect your wallet, then search for IOUs.');
      return;
    }
    await loadAddress(normalized, { retainVisibleData: true });
  }

  async function refreshSubmittedAddress() {
    if (!submittedAddress) return;
    await loadAddress(submittedAddress, { retainVisibleData: true });
  }

  async function runCloseAction(label, action) {
    try {
      setError(null);
      const tx = await action();
      setQueryTime(`${label} submitted ${new Date().toLocaleString()}`);
      await tx.wait();
      await refreshSubmittedAddress();
    } catch (err) {
      setError(err.message || String(err));
    }
  }

  async function handleRequestClose(tokenId) {
    return runCloseAction('Request Close', () => api.requestClose(tokenId));
  }

  async function handleConfirmClose(tokenId, rating) {
    return runCloseAction('Confirm Close', () => api.confirmClose(tokenId, rating));
  }

  async function handleRejectClose(tokenId) {
    return runCloseAction('Reject Close', () => api.rejectClose(tokenId));
  }

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        const addr = await refreshAccount();
        if (!cancelled && addr) {
          await loadAddress(normalizeAddress(addr));
        }
      } catch (_) {
        // no-op, keep page usable for manual connect flow
      }
    }

    bootstrap();

    return () => {
      cancelled = true;
    };
  }, []);

  const hasResults = results.length > 0;

  return (
    <div className="user-ious-page">
      <section className="user-ious-hero panel">
        <div className="user-ious-copy">
          <span className="eyebrow">Address query · off-chain index + on-chain verification</span>
          <h1>Search for IOUs related to you, automatically grouped by role.</h1>
          <p>
            History has the highest priority. If the status is Settled or Cancelled, it will only appear in History.
            Pending / Active tokens can appear in Created by me, Owed to me, and Owed by me based on their role.
          </p>
          <div className="status-row">
            <span className={`badge ${loading ? 'warn' : 'ok'}`}>{loading ? 'Fetching indexer results...' : 'Indexer ready'}</span>
            <span className={`badge ${enrichmentLoading ? 'warn' : 'ok'}`}>{enrichmentLoading ? 'Fetching on-chain details...' : 'On-chain verification ready'}</span>
            {queryTime ? <span className="badge">Last query: {queryTime}</span> : null}
          </div>
        </div>

        <div className="query-card">
          <label className="label">Wallet query</label>
          <div className="query-row">
            <button type="button" className="btn primary" onClick={connectWalletAndQuery} disabled={busy || loading || enrichmentLoading}>
              {busy ? '連線中…' : 'Connect Wallet'}
            </button>
            <button type="button" className="btn" onClick={handleRefreshByWallet} disabled={busy || loading || enrichmentLoading || !account}>
              Refresh IOU
            </button>
          </div>
          <div className="mono small" style={{ color: 'var(--muted)' }}>currentAccount: {account || 'not connected'}</div>
          <div className="helper-text">
            Search by the currently connected wallet address, results will be grouped as <strong>Created by me</strong>, <strong>Owed to me</strong>, <strong>Owed by me</strong>, and <strong>History</strong>.
          </div>
          {error ? <div className="alert warn" style={{ marginTop: 12 }}>{error}</div> : null}
        </div>
      </section>

      <section className="panel user-ious-summary">
        <div className="summary-grid">
          <div className="summary-card">
            <div className="summary-label">Address</div>
            <div className="mono summary-value">{submittedAddress || '—'}</div>
          </div>
          <div className="summary-card">
            <div className="summary-label">Loaded tokens</div>
            <div className="summary-value">{results.length}</div>
          </div>
          <div className="summary-card">
            <div className="summary-label">History</div>
            <div className="summary-value">{sections.history.length}</div>
          </div>
          <div className="summary-card">
            <div className="summary-label">Active / Pending matches</div>
            <div className="summary-value">{sections.created.length + sections.owedToMe.length + sections.owedByMe.length}</div>
          </div>
        </div>
      </section>

      {loading && !hasResults ? (
        <section className="panel">
          <div className="section-divider">
            <div>
              <h3>Loading</h3>
              <p>Indexer results and on-chain verification are being fetched.</p>
            </div>
          </div>
          <div className="iou-grid">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        </section>
      ) : (
        <div className="user-ious-sections">
          {SECTION_ORDER.map((section) => (
            <SectionBlock
              key={section.key}
              section={section}
              items={sections[section.key]}
              loading={loading && !hasResults}
              onRequestClose={handleRequestClose}
              onConfirmClose={handleConfirmClose}
              onRejectClose={handleRejectClose}
            />
          ))}
        </div>
      )}
    </div>
  );
}

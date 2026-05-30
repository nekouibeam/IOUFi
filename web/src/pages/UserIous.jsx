import React, { useMemo, useState } from 'react';
import { ethers } from 'ethers';
import { getUserIOUs, enrichWithOnChainData } from '../api/userIous';
import * as api from '../api/contract';
import { getReadProvider } from '../api/contract';
import addressesByChain from '../contracts/addresses.json';
import { buildSections, normalizeAddress } from '../lib/userIousGrouping';
import IOUNFTArtifact from '../contracts/IOUNFT.json';

const IOU_ABI = Array.isArray(IOUNFTArtifact) ? IOUNFTArtifact : (IOUNFTArtifact.abi || []);
const SECTION_ORDER = [
  { key: 'created', title: 'Created by me', subtitle: '我發出的 IOU', empty: '沒有你作為 creator 的進行中 IOU。' },
  { key: 'owedToMe', title: 'Owed to me', subtitle: '我持有、可要求履約或轉移的 IOU', empty: '沒有你作為 owner 的進行中 IOU。' },
  { key: 'owedByMe', title: 'Owed by me', subtitle: '我需要提供服務的 IOU', empty: '沒有你作為 fulfiller 的進行中 IOU。' },
  { key: 'history', title: 'History', subtitle: '已結清 / 已取消的歷史紀錄（優先顯示）', empty: '沒有歷史紀錄。' },
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
            title={token.closeRequested ? '已送出結案申請' : '由 fulfiller 發起結案申請'}
            onClick={() => runAction('request', () => onRequestClose(token.tokenId))}
          >
            {busyAction === 'request' ? '申請中…' : (token.closeRequested ? '已申請結案' : '申請結案')}
          </button>
          <div className="action-note">
            {token.closeRequested ? '已送出申請，等待 owner 在 Owed to me 區塊確認或退回。' : '先由 fulfiller 送出結案申請。'}
          </div>
        </div>
      ) : null}

      {token.sectionKey === 'owedToMe' ? (
        <div className="card-actions">
          {token.closeRequested ? (
            <>
              <div className="action-note">已收到結案申請，請確認或退回。</div>
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
                  {busyAction === 'confirm' ? '確認中…' : '確認結案'}
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={!canRespondClose || busyAction === 'reject'}
                  onClick={() => runAction('reject', () => onRejectClose(token.tokenId))}
                >
                  {busyAction === 'reject' ? '退回中…' : '退回申請'}
                </button>
              </div>
            </>
          ) : (
            <button type="button" className="btn full" disabled title="等待 fulfiller 送出結案申請後才可操作">
              等待結案申請
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
  const [address, setAddress] = useState('');
  const [submittedAddress, setSubmittedAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [enrichmentLoading, setEnrichmentLoading] = useState(false);
  const [results, setResults] = useState([]);
  const [enriched, setEnriched] = useState({});
  const [error, setError] = useState(null);
  const [queryTime, setQueryTime] = useState('');

  const sections = useMemo(() => buildSections(results, enriched, submittedAddress), [results, enriched, submittedAddress]);

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

      const tokenIds = rows.map((row) => row.token_id).filter((id) => id !== undefined && id !== null);
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

  async function handleQuery(event) {
    event.preventDefault();
    const normalized = normalizeAddress(address);
    setError(null);
    if (!/^0x[0-9a-f]{40}$/.test(normalized)) {
      setError('請輸入有效的 0x 地址。');
      return;
    }

    await loadAddress(normalized);
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
    return runCloseAction('申請結案', () => api.requestClose(tokenId));
  }

  async function handleConfirmClose(tokenId, rating) {
    return runCloseAction('確認結案', () => api.confirmClose(tokenId, rating));
  }

  async function handleRejectClose(tokenId) {
    return runCloseAction('退回申請', () => api.rejectClose(tokenId));
  }

  const hasResults = results.length > 0;

  return (
    <div className="user-ious-page">
      <section className="user-ious-hero panel">
        <div className="user-ious-copy">
          <span className="eyebrow">Address query · off-chain index + on-chain verification</span>
          <h1>查詢與你有關的 IOU，並按角色自動分組。</h1>
          <p>
            History 具有最高優先序，若狀態為 Settled 或 Cancelled，只會出現在 History。
            Pending / Active 的 token 則可依角色同時出現在 Created by me、Owed to me、Owed by me。
          </p>
          <div className="status-row">
            <span className={`badge ${loading ? 'warn' : 'ok'}`}>{loading ? 'Fetching indexer results...' : 'Indexer ready'}</span>
            <span className={`badge ${enrichmentLoading ? 'warn' : 'ok'}`}>{enrichmentLoading ? 'Fetching on-chain details...' : 'On-chain verification ready'}</span>
            {queryTime ? <span className="badge">Last query: {queryTime}</span> : null}
          </div>
        </div>

        <form className="query-card" onSubmit={handleQuery}>
          <label className="label" htmlFor="user-ious-address">User address</label>
          <div className="query-row">
            <input
              id="user-ious-address"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              placeholder="0x..."
              autoComplete="off"
              spellCheck="false"
            />
            <button type="submit" className="btn primary" disabled={loading || enrichmentLoading}>Search</button>
          </div>
          <div className="helper-text">
            Results are grouped as <strong>Created by me</strong>, <strong>Owed to me</strong>, <strong>Owed by me</strong>, and <strong>History</strong>. History is exclusive.
          </div>
          {error ? <div className="alert warn" style={{ marginTop: 12 }}>{error}</div> : null}
        </form>
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

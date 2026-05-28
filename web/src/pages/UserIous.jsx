import React, { useMemo, useState } from 'react';
import { ethers } from 'ethers';
import { getUserIOUs, enrichWithOnChainData } from '../api/userIous';
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

function TokenCard({ token }) {
  const stateLabel = {
    0: 'Pending',
    1: 'Active',
    2: 'Settled',
    3: 'Cancelled',
  }[String(token.state)] ?? String(token.state ?? '—');
  const typeLabel = Number(token.collateral ?? 0) > 0 ? 'Bounty' : 'Social';

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
      </div>

      {token.sectionKey === 'owedToMe' ? (
        <div className="card-actions">
          <button type="button" className="btn full" disabled title="結案功能待下一步實作">
            結案
          </button>
        </div>
      ) : null}
    </article>
  );
}

function SectionBlock({ section, items, loading }) {
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
          {items.map((token) => <TokenCard key={`${section.key}-${token.tokenId}`} token={{ ...token, sectionKey: section.key }} />)}
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

  async function handleQuery(event) {
    event.preventDefault();
    const normalized = normalizeAddress(address);
    setError(null);
    if (!/^0x[0-9a-f]{40}$/.test(normalized)) {
      setError('請輸入有效的 0x 地址。');
      return;
    }

    setSubmittedAddress(normalized);
    setLoading(true);
    setEnriched({});
    setResults([]);

    try {
      const data = await getUserIOUs(normalized, { limit: 200 });
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
            />
          ))}
        </div>
      )}
    </div>
  );
}

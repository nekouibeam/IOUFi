import React, { useEffect, useMemo, useState } from 'react';
import { ethers } from 'ethers';
import * as contractApi from '../api/contract';
import { getMarketplaceIOUs } from '../api/marketplace';

function normalizeAddress(value) {
  return String(value || '').toLowerCase();
}

function formatDeadline(value) {
  const timestamp = Number(value || 0);
  if (!timestamp) return '—';
  const date = new Date(timestamp * 1000);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

function formatCollateral(value) {
  try {
    return `${ethers.formatEther(BigInt(value || 0))} ETH`;
  } catch (_) {
    return String(value ?? '0');
  }
}

export default function Marketplace() {
  const [account, setAccount] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busyTokenId, setBusyTokenId] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  const accountLabel = useMemo(() => account || 'not connected', [account]);

  async function refreshAccount() {
    if (!window.ethereum) {
      setAccount('');
      return '';
    }

    const provider = await contractApi.getProvider();
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

  async function loadMarketplace() {
    setLoading(true);
    setError('');
    try {
      const payload = await getMarketplaceIOUs({ limit: 100 });
      setItems(payload.data || []);
      setStatus('Marketplace updated.');
    } catch (err) {
      setError(err?.message || String(err));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  async function connectWallet() {
    setError('');
    setStatus('Connecting wallet...');
    try {
      await contractApi.connectWallet();
      const addr = await refreshAccount();
      setStatus(addr ? 'Wallet connected.' : 'Wallet connected, but no account available.');
      await loadMarketplace();
    } catch (err) {
      setError(err?.message || String(err));
    }
  }

  async function handleAccept(tokenId) {
    setBusyTokenId(String(tokenId));
    setError('');
    setStatus(`Token #${tokenId} submitting acceptIOU transaction...`);
    try {
      await contractApi.connectWallet();
      const tx = await contractApi.acceptIOU(tokenId);
      setStatus(`Token #${tokenId} transaction submitted, waiting for confirmation...`);
      await tx.wait();
      // optimistic removal: remove token locally first to avoid indexer lag
      setItems((prev) => prev.filter((r) => String(r.tokenId) !== String(tokenId)));
      setStatus(`Token #${tokenId} accepted and converted to Active.`);
      // then refresh listing in background
      loadMarketplace();
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setBusyTokenId('');
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      if (typeof window === 'undefined' || !window.ethereum) {
        return;
      }

      try {
        const addr = await refreshAccount();
        if (cancelled) return;
        if (addr) {
          await loadMarketplace();
        }
      } catch (_) {
        // keep page usable via manual connect
      }
    }

    bootstrap();

    const handleAccountsChanged = async (accounts) => {
      if (!accounts?.length) {
        setAccount('');
        setItems([]);
        return;
      }
      const next = String(accounts[0]);
      setAccount(next);
      await loadMarketplace();
    };

    window.ethereum?.on?.('accountsChanged', handleAccountsChanged);

    return () => {
      cancelled = true;
      window.ethereum?.removeListener?.('accountsChanged', handleAccountsChanged);
    };
  }, []);

  return (
    <div className="marketplace-page">
      <div className="page-title">Marketplace</div>
      <div className="page-sub">Display all open bounty IOUs that meet the criteria, and accept them directly with the currently connected account.</div>

      <div className="card">
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
          <div>
            <div className="section-title">Current account</div>
            <div className="mono">{accountLabel}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn primary" onClick={connectWallet} disabled={loading}>Connect Wallet</button>
            <button className="btn" onClick={loadMarketplace} disabled={loading}>Refresh</button>
          </div>
        </div>
        {status ? <div className="alert info" style={{ marginTop: 12 }}>{status}</div> : null}
        {error ? <div className="alert warn" style={{ marginTop: 12 }}>{error}</div> : null}
      </div>

      <div className="stats">
        <div className="stat">
          <div className="stat-label">Available tokens</div>
          <div className="stat-val up">{items.length}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Filter</div>
          <div className="stat-val">Pending + collateral &gt; 0</div>
        </div>
        <div className="stat">
          <div className="stat-label">Fulfiller</div>
          <div className="stat-val">Zero address</div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Open bounty IOUs</div>
        {loading ? <div className="muted">Loading marketplace listings...</div> : null}
        {!loading && items.length === 0 ? <div className="muted">No open bounty IOUs match the criteria.</div> : null}

        <div className="nft-grid" style={{ marginTop: 12 }}>
          {items.map((row) => {
            const tokenId = String(row.tokenId);
            const isBusy = busyTokenId === tokenId;

            return (
              <article className="nft-card" key={tokenId}>
                <div className="nft-id">Token #{tokenId}</div>
                <div className="nft-desc" style={{ fontSize: 14, color: 'var(--text)' }}>
                  {row.description || 'No description'}
                </div>

                <div className="nft-meta" style={{ marginBottom: 10 }}>
                  <span className="tag green">Pending</span>
                  <span className="tag blue">Bounty</span>
                  <span className="tag">collateral: {formatCollateral(row.collateral)}</span>
                </div>

                <div className="marketplace-fields">
                  <div><span className="label">Owner</span><div className="mono small">{row.owner || '—'}</div></div>
                  <div><span className="label">Deadline</span><div className="mono small">{formatDeadline(row.deadline)}</div></div>
                  <div><span className="label">Creator</span><div className="mono small">{row.creator || '—'}</div></div>
                  <div><span className="label">Service type</span><div className="mono small">{row.serviceType || '—'}</div></div>
                </div>

                <div className="nft-actions">
                  <button className="btn primary full" onClick={() => handleAccept(tokenId)} disabled={loading || isBusy || !account}>
                    {isBusy ? 'Accepting...' : 'Accept'}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </div>

      {/* <div className="card">
        <div className="card-title">Demo B note</div>
        <p className="muted">Only open bounty IOUs are listed here. After a successful accept and page refresh, the token disappears because it no longer matches state = Pending and fulfiller = zero address.</p>
      </div> */}
    </div>
  );
}

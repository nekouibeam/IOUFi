import React, { useEffect, useMemo, useState } from 'react';
import * as api from '../api/contract';
import { getUserIOUs } from '../api/userIous';

function normalizeAddress(value) {
  return String(value || '').toLowerCase();
}

function asBigInt(value) {
  try {
    return BigInt(value);
  } catch (_) {
    return 0n;
  }
}

export default function AcceptIOU() {
  const [account, setAccount] = useState('');
  const [busy, setBusy] = useState(false);
  const [busyTokenId, setBusyTokenId] = useState('');
  const [loadingList, setLoadingList] = useState(false);
  const [items, setItems] = useState([]);
  const [dismissedTokenIds, setDismissedTokenIds] = useState(() => new Set());
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  const socialPending = useMemo(() => {
    return items.filter((row) => {
      const tokenId = String(row.token_id);
      const state = Number(row.state);
      const collateral = asBigInt(row.collateral);
      const fulfiller = normalizeAddress(row.fulfiller);
      return state === 0 && collateral === 0n && fulfiller === normalizeAddress(account) && !dismissedTokenIds.has(tokenId);
    });
  }, [items, account, dismissedTokenIds]);

  async function isStillPendingOnChain(tokenId) {
    try {
      const snapshot = await api.getIOU(tokenId);
      const state = Number(snapshot?.state ?? snapshot?.[3]);
      const fulfiller = normalizeAddress(snapshot?.fulfiller ?? snapshot?.[1]);
      const collateral = asBigInt(snapshot?.collateral ?? snapshot?.[2]);
      return state === 0 && collateral === 0n && fulfiller === normalizeAddress(account);
    } catch (err) {
      console.warn(`on-chain IOU check failed for token ${tokenId}`, err);
      return true;
    }
  }

  async function refreshAccount() {
    if (!window.ethereum) {
      setError('未偵測到錢包，請安裝並啟用 MetaMask。');
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

  async function connectWallet() {
    setError('');
    setStatus('');
    setBusy(true);
    try {
      const provider = await api.connectWallet();
      const signer = await provider.getSigner();
      const addr = await signer.getAddress();
      setAccount(addr);
      setDismissedTokenIds(new Set());
      setStatus('錢包已連線，正在查詢待確認 Social IOU...');
      await loadInbox(addr);
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  async function loadInbox(accountAddress = account) {
    const normalized = normalizeAddress(accountAddress);
    if (!/^0x[0-9a-f]{40}$/.test(normalized)) {
      setItems([]);
      return;
    }

    setLoadingList(true);
    setError('');
    try {
      const payload = await getUserIOUs(normalized, {
        roles: ['fulfiller'],
        states: [0],
        limit: 100,
      });
      const rows = payload.data || [];
      const verifiedRows = [];
      for (const row of rows) {
        const tokenId = row.token_id ?? row.tokenId;
        if (tokenId === undefined || tokenId === null) continue;
        if (await isStillPendingOnChain(tokenId)) {
          verifiedRows.push(row);
        }
      }
      setItems(verifiedRows);
      setStatus('清單已更新。');
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setLoadingList(false);
    }
  }

  async function acceptToken(tokenId) {
    setBusy(true);
    setBusyTokenId(String(tokenId));
    setError('');
    setStatus('送出 accept 交易中...');
    try {
      await api.connectWallet();
      const tx = await api.acceptIOU(tokenId);
      setStatus('交易已送出，等待確認...');
      await tx.wait();
      // optimistic removal: mark dismissed locally to hide card immediately
      setDismissedTokenIds((prev) => {
        const next = new Set(prev);
        next.add(String(tokenId));
        return next;
      });
      setItems((prev) => prev.filter((r) => String(r.token_id) !== String(tokenId)));
      setStatus(`Token #${tokenId} 已接受，狀態應轉為 Active。`);
      await loadInbox();
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setBusy(false);
      setBusyTokenId('');
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        const addr = await refreshAccount();
        if (!cancelled && addr) {
          await loadInbox(addr);
        }
      } catch (_) {
        // no-op; page remains manual-connect capable
      }
    }

    bootstrap();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      <div className="page-title">Accept Social IOU</div>
      <div className="page-sub">Demo A：以 fulfiller 帳號登入後，查看並接受指派給你的 Pending Social IOU。</div>

      <div className="card">
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn primary" onClick={connectWallet} disabled={busy}>{busy ? '處理中…' : 'Connect Wallet'}</button>
          <button className="btn" onClick={() => loadInbox()} disabled={busy || loadingList || !account}>Refresh Inbox</button>
          <span className="mono" style={{ color: 'var(--muted)' }}>currentAccount: {account || 'not connected'}</span>
        </div>
        {status ? <div className="alert info" style={{ marginTop: 12 }}>{status}</div> : null}
        {error ? <div className="alert warn" style={{ marginTop: 12 }}>{error}</div> : null}
      </div>

      <div className="card">
        <div className="card-title">待確認 Social IOU（只顯示 fulfiller = 目前帳號）</div>
        {loadingList ? <div className="muted">Loading...</div> : null}
        {!loadingList && socialPending.length === 0 ? (
          <div className="muted">目前沒有待你確認的 Social IOU。</div>
        ) : null}

        <div className="nft-grid" style={{ marginTop: 10 }}>
          {socialPending.map((row) => (
            <article className="nft-card" key={String(row.token_id)}>
              <div className="nft-id">Token #{row.token_id}</div>
              <div className="nft-desc">{row.description || 'No description'}</div>
              <div className="nft-meta" style={{ marginBottom: 10 }}>
                <span className="tag">state: Pending</span>
                <span className="tag">collateral: 0</span>
                <span className="tag">deadline: {row.deadline}</span>
              </div>
              <div className="mono small" style={{ color: 'var(--muted)' }}>creator: {row.creator}</div>
              <div className="mono small" style={{ color: 'var(--muted)' }}>fulfiller: {row.fulfiller}</div>
              <div style={{ marginTop: 10 }}>
                <button
                  className="btn primary"
                  onClick={() => acceptToken(row.token_id)}
                  disabled={busy || String(busyTokenId) === String(row.token_id)}
                >
                  {String(busyTokenId) === String(row.token_id) ? '處理中…' : '確認 / 接受此 IOU'}
                </button>
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}

import React, { useEffect, useMemo, useState } from 'react';
import { ethers } from 'ethers';
import * as api from '../api/contract';
import { getReadProvider } from '../api/contract';
import addressesByChain from '../contracts/addresses.json';
import IOUNFTArtifact from '../contracts/IOUNFT.json';
import { buildTokenView, normalizeAddress } from '../lib/userIousGrouping';
import { getUserIOUs, enrichWithOnChainData } from '../api/userIous';

const IOU_ABI = Array.isArray(IOUNFTArtifact) ? IOUNFTArtifact : (IOUNFTArtifact.abi || []);
const QUERY_ROLES = ['creator', 'owner', 'fulfiller', 'transferTarget'];

function formatDeadline(value) {
  const timestamp = Number(value || 0);
  if (!timestamp) return '—';
  const date = new Date(timestamp * 1000);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

function formatEth(value) {
  try {
    return `${ethers.formatEther(BigInt(value || 0))} ETH`;
  } catch (_) {
    return `${String(value ?? 0)} wei`;
  }
}

function TransferCard({ token, mode, busy, onStartTransfer, onConfirmNewOwner, onConfirmFulfiller, onReject, draftTo, onDraftToChange }) {
  const isOwnerMode = mode === 'owner';
  const isTargetMode = mode === 'newOwner';
  const isFulfillerMode = mode === 'fulfiller';
  const transferRequested = Boolean(token.transferRequested);
  const transferEligible = Number(token.state) === 1 && Number(token.collateral || 0) === 0;
  const feeLabel = token.transferFeePaid ? formatEth(token.transferFeePaid) : '0.0015 ETH';
  const confirmLabel = isTargetMode ? 'Confirm as new owner' : 'Confirm as fulfiller';
  const statusTag = transferRequested
    ? `Transferring${token.transferTo ? ` → ${token.transferTo}` : ''}`
    : 'Transfer open';

  return (
    <article className="transfer-card card">
        <div className="transfer-card-top">
        <div>
          <div className="nft-id">Token #{token.tokenId}</div>
          <div className="nft-desc">{token.description || 'No description'}</div>
        </div>
        <div className={`tag ${transferRequested ? 'red' : 'green'}`}>{statusTag}</div>
      </div>

      <div className="nft-meta" style={{ marginTop: 10 }}>
        <span className="tag">{Number(token.collateral || 0) > 0 ? 'Bounty' : 'Social'}</span>
        <span className="tag">state: {token.state === 1 ? 'Active' : String(token.state)}</span>
        <span className="tag">fee: {feeLabel}</span>
      </div>

      <div className="transfer-fields">
        <div><span className="transfer-label">Creator</span><div className="transfer-mono">{token.creator || '—'}</div></div>
        <div><span className="transfer-label">Owner</span><div className="transfer-mono">{token.owner || '—'}</div></div>
        <div><span className="transfer-label">Fulfiller</span><div className="transfer-mono">{token.fulfiller || '—'}</div></div>
        <div><span className="transfer-label">Deadline</span><div className="transfer-mono">{formatDeadline(token.deadline)}</div></div>
      </div>

      {isOwnerMode ? (
        <div className="transfer-actions">
          <div className="form-group">
            <label>Transfer to</label>
            <input
              placeholder="0x..."
              value={draftTo}
              onChange={(event) => onDraftToChange(token.tokenId, event.target.value)}
              disabled={busy}
            />
          </div>
          <button
            type="button"
            className="btn primary full"
            disabled={busy || transferRequested || !draftTo || !transferEligible}
            onClick={() => onStartTransfer(token.tokenId, draftTo)}
          >
            {busy ? 'Processing…' : (transferRequested ? 'Transferring…' : '申請轉送')}
          </button>
          <div className="transfer-note">
            {transferRequested
              ? '這筆 IOU 已經在 transfer 流程中，請由新 owner 與 fulfiller 確認。'
              : (transferEligible ? '僅限 Active social IOU 可發起轉讓。' : '只有 Active 的 Social IOU 能發起轉讓。')}
          </div>
        </div>
      ) : null}

      {isTargetMode ? (
        <div className="transfer-actions">
          <div className="transfer-note">這筆 IOU 已指定你為新 owner，請確認或退回。</div>
          <div className="card-actions-grid">
            <button className="btn primary" disabled={busy} onClick={() => onConfirmNewOwner(token.tokenId)}>
              {busy ? 'Confirming…' : confirmLabel}
            </button>
            <button className="btn" disabled={busy} onClick={() => onReject(token.tokenId)}>
              Reject
            </button>
          </div>
        </div>
      ) : null}

      {isFulfillerMode ? (
        <div className="transfer-actions">
          <div className="transfer-note">你是 fulfiller，請確認這筆轉讓是否同意更換幫助對象。</div>
          <div className="card-actions-grid">
            <button className="btn primary" disabled={busy} onClick={() => onConfirmFulfiller(token.tokenId)}>
              {busy ? 'Confirming…' : confirmLabel}
            </button>
            <button className="btn" disabled={busy} onClick={() => onReject(token.tokenId)}>
              Reject
            </button>
          </div>
        </div>
      ) : null}
    </article>
  );
}

function Column({ title, subtitle, tokens, empty, mode, busy, draftTargets, onDraftToChange, onStartTransfer, onConfirmNewOwner, onConfirmFulfiller, onReject }) {
  return (
    <section className="transfer-column panel">
      <div className="section-divider">
        <div>
          <h3>{title}</h3>
          <p>{subtitle}</p>
        </div>
        <div className="section-count">{tokens.length}</div>
      </div>

      {tokens.length ? (
        <div className="transfer-list">
          {tokens.map((token) => (
            <TransferCard
              key={`${mode}-${token.tokenId}`}
              token={token}
              mode={mode}
              busy={busy === `${mode}-${token.tokenId}`}
              draftTo={draftTargets[token.tokenId] || ''}
              onDraftToChange={onDraftToChange}
              onStartTransfer={onStartTransfer}
              onConfirmNewOwner={onConfirmNewOwner}
              onConfirmFulfiller={onConfirmFulfiller}
              onReject={onReject}
            />
          ))}
        </div>
      ) : (
        <div className="empty-state">{empty}</div>
      )}
    </section>
  );
}

export default function SocialIOUTransfer() {
  const [account, setAccount] = useState('');
  const [busyKey, setBusyKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [queryTime, setQueryTime] = useState('');
  const [feeWei, setFeeWei] = useState(0n);
  const [rows, setRows] = useState([]);
  const [enriched, setEnriched] = useState({});
  const [draftTargets, setDraftTargets] = useState({});

  const acct = normalizeAddress(account);

  const tokens = useMemo(() => rows.map((row) => buildTokenView(row, enriched)), [rows, enriched]);
  const ownerTokens = useMemo(() => tokens.filter((token) => token.owner === acct && Number(token.collateral || 0) === 0), [tokens, acct]);
  const newOwnerTokens = useMemo(() => tokens.filter((token) => token.transferRequested && normalizeAddress(token.transferTo) === acct && Number(token.state) === 1 && Number(token.collateral || 0) === 0), [tokens, acct]);
  const fulfillerTokens = useMemo(() => tokens.filter((token) => token.transferRequested && token.fulfiller === acct && Number(token.state) === 1 && Number(token.collateral || 0) === 0), [tokens, acct]);

  async function refreshAccount() {
    if (!window.ethereum) return '';
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

  async function loadTransferData(accountAddress = account) {
    const normalized = normalizeAddress(accountAddress);
    if (!/^0x[0-9a-f]{40}$/.test(normalized)) {
      setRows([]);
      setEnriched({});
      return;
    }

    setLoading(true);
    setError('');
    try {
      const payload = await getUserIOUs(normalized, { roles: QUERY_ROLES, limit: 200 });
      const rawRows = payload.data || [];
      setRows(rawRows);
      setQueryTime(new Date().toLocaleString());

      const tokenIds = rawRows.map((row) => row.token_id).filter((id) => id !== undefined && id !== null);
      if (tokenIds.length) {
        const readProvider = await getReadProvider();
        const network = await readProvider.getNetwork();
        const contractAddress = addressesByChain?.[String(network.chainId)]?.IOUNFT
          || import.meta.env.VITE_IOUNFT_ADDRESS
          || window.__IOUNFT_ADDRESS__
          || '';
        if (contractAddress) {
          const chainMap = await enrichWithOnChainData(readProvider, IOU_ABI, contractAddress, tokenIds);
          setEnriched(chainMap || {});
        }
      }

      const fee = await api.getTransferFeeWei();
      setFeeWei(BigInt(fee));
    } catch (err) {
      setError(err?.message || String(err));
      setRows([]);
      setEnriched({});
    } finally {
      setLoading(false);
    }
  }

  async function connectWalletAndLoad() {
    setError('');
    setStatus('正在連線錢包...');
    try {
      const provider = await api.connectWallet();
      const signer = await provider.getSigner();
      const addr = await signer.getAddress();
      setAccount(addr);
      setStatus('錢包已連線。');
      await loadTransferData(addr);
    } catch (err) {
      setError(err?.message || String(err));
    }
  }

  async function runAction(key, action) {
    setBusyKey(key);
    setError('');
    try {
      const tx = await action();
      setStatus(`${key} submitted...`);
      await tx.wait();
      setStatus(`${key} confirmed.`);
      await loadTransferData(account);
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setBusyKey('');
    }
  }

  async function onStartTransfer(tokenId, to) {
    return runAction(`owner-${tokenId}`, () => api.startTransfer(tokenId, to));
  }

  async function onConfirmNewOwner(tokenId) {
    return runAction(`newOwner-${tokenId}`, () => api.confirmTransferByNewOwner(tokenId));
  }

  async function onConfirmFulfiller(tokenId) {
    return runAction(`fulfiller-${tokenId}`, () => api.confirmTransferByFulfiller(tokenId));
  }

  async function onReject(tokenId) {
    return runAction(`reject-${tokenId}`, () => api.rejectTransfer(tokenId));
  }

  function onDraftToChange(tokenId, value) {
    setDraftTargets((prev) => ({ ...prev, [tokenId]: value }));
  }

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        const addr = await refreshAccount();
        if (!cancelled && addr) {
          await loadTransferData(addr);
        }
      } catch (_) {
        // keep page usable via manual connect
      }
    }

    bootstrap();

    const handleAccountsChanged = async (accounts) => {
      if (!accounts?.length) {
        setAccount('');
        setRows([]);
        setEnriched({});
        return;
      }
      const next = String(accounts[0]);
      setAccount(next);
      await loadTransferData(next);
    };

    window.ethereum?.on?.('accountsChanged', handleAccountsChanged);

    return () => {
      cancelled = true;
      window.ethereum?.removeListener?.('accountsChanged', handleAccountsChanged);
    };
  }, []);

  return (
    <div className="transfer-page">
      <section className="transfer-hero panel">
        <div>
          <span className="eyebrow">Three-party transfer · active social IOU only</span>
          <h1>Social IOU Transfer</h1>
          <p>先由原 owner 申請轉送，再由新 owner 與 fulfiller 逐一確認。固定手續費為 {formatEth(feeWei)}，且必須精準支付。</p>
        </div>
        <div className="transfer-hero-side">
          <button className="btn primary" onClick={connectWalletAndLoad}>{account ? 'Reconnect wallet' : 'Connect wallet'}</button>
          <button className="btn" onClick={() => loadTransferData(account)} disabled={!account || loading}>Refresh</button>
          <div className="mono small">currentAccount: {account || 'not connected'}</div>
          {queryTime ? <div className="mono small">Last query: {queryTime}</div> : null}
        </div>
      </section>

      {status ? <div className="alert info">{status}</div> : null}
      {error ? <div className="alert warn">{error}</div> : null}

      <section className="transfer-board">
        <Column
          title="左邊 - 元 owner"
          subtitle="列出你作為 owner 的 Active social IOU，並可對指定新 owner 申請轉送。"
          tokens={ownerTokens}
          empty={loading ? 'Loading...' : '目前沒有可轉送的 Active social IOU。'}
          mode="owner"
          busy={busyKey}
          draftTargets={draftTargets}
          onDraftToChange={onDraftToChange}
          onStartTransfer={onStartTransfer}
          onConfirmNewOwner={onConfirmNewOwner}
          onConfirmFulfiller={onConfirmFulfiller}
          onReject={onReject}
        />

        <Column
          title="中間 - 新 owner"
          subtitle="列出已被指定為你為新 owner 的待確認轉讓。"
          tokens={newOwnerTokens}
          empty={loading ? 'Loading...' : '目前沒有指定給你的轉讓。'}
          mode="newOwner"
          busy={busyKey}
          draftTargets={draftTargets}
          onDraftToChange={onDraftToChange}
          onStartTransfer={onStartTransfer}
          onConfirmNewOwner={onConfirmNewOwner}
          onConfirmFulfiller={onConfirmFulfiller}
          onReject={onReject}
        />

        <Column
          title="右邊 - Fulfiller"
          subtitle="列出你作為 fulfiller 的待確認轉讓。"
          tokens={fulfillerTokens}
          empty={loading ? 'Loading...' : '目前沒有你需要確認的轉讓。'}
          mode="fulfiller"
          busy={busyKey}
          draftTargets={draftTargets}
          onDraftToChange={onDraftToChange}
          onStartTransfer={onStartTransfer}
          onConfirmNewOwner={onConfirmNewOwner}
          onConfirmFulfiller={onConfirmFulfiller}
          onReject={onReject}
        />
      </section>
    </div>
  );
}

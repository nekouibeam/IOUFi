import React, { useMemo, useState, useEffect } from 'react';
import { ethers } from 'ethers';
import * as api from '../api/contract';
import IOUNFTArtifact from '../contracts/IOUNFT.json';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

const DEMO_RECIPIENTS = [
  { name: 'Andy', address: '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266' },
  { name: 'Woody', address: '0x70997970c51812dc3a010c7d01b50e0d17dc79c8' },
  { name: 'Amy', address: '0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc' },
  { name: 'Kevin', address: '0x90f79bf6eb2c4f870365e785982e1f101e93b906' },
];

function defaultDeadlineDate() {
  return new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10);
}

export default function CreateIOU() {
  const [account, setAccount] = useState('');
  const [connecting, setConnecting] = useState(false);

  async function refreshAccount() {
    if (!window.ethereum) return '';
    try {
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
    } catch (_) {
      return '';
    }
  }

  async function connectWallet() {
    setConnecting(true);
    try {
      const provider = await api.connectWallet();
      const signer = await provider.getSigner();
      const addr = await signer.getAddress();
      setAccount(addr);
      return addr;
    } catch (err) {
      throw err;
    } finally {
      setConnecting(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const addr = await refreshAccount();
        if (!cancelled && addr) setAccount(addr);
      } catch (_) {}
    })();
    return () => { cancelled = true };
  }, []);
  const [tab, setTab] = useState('social');
  const [form, setForm] = useState({
    fulfiller: '',
    description: '',
    deadline: defaultDeadlineDate(),
    serviceType: '',
    collateralEth: '0.01',
  });
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState({});
  const [result, setResult] = useState(null);

  const feeHint = useMemo(() => {
    if (tab === 'social') return 'Transfer Fee: Social IOU transfer policy';
    return 'Transfer Fee: Bounty IOU transfer policy';
  }, [tab]);

  function onField(key) {
    return (event) => setForm((prev) => ({ ...prev, [key]: event.target.value }));
  }

  function isAddress(value) {
    return /^0x[a-fA-F0-9]{40}$/.test(value);
  }

  function validate() {
    const next = {};
    if (tab === 'social') {
      if (!form.fulfiller) next.fulfiller = 'Social IOU 需要指定 fulfiller。';
      if (form.fulfiller && !isAddress(form.fulfiller)) next.fulfiller = '請輸入有效的 fulfiller 地址。';
    } else {
      if (form.fulfiller && !isAddress(form.fulfiller)) next.fulfiller = '請輸入有效的 fulfiller 地址，或留空代表 open marketplace。';
      if (!form.collateralEth || Number(form.collateralEth) <= 0) next.collateralEth = 'Bounty IOU 需要大於 0 的 collateral。';
    }

    if (!form.description.trim()) next.description = '請填寫事件描述。';

    const deadlineTs = Math.floor(new Date(form.deadline).getTime() / 1000);
    if (!form.deadline || Number.isNaN(deadlineTs)) {
      next.deadline = '請輸入有效的 Deadline。';
    } else if (deadlineTs <= Math.floor(Date.now() / 1000)) {
      next.deadline = 'Deadline 必須晚於現在時間。';
    }

    return next;
  }

  function extractTokenId(receipt) {
    try {
      const abi = Array.isArray(IOUNFTArtifact) ? IOUNFTArtifact : (IOUNFTArtifact.abi || []);
      const iface = new ethers.Interface(abi);
      for (const log of receipt.logs || []) {
        try {
          const parsed = iface.parseLog(log);
          if (parsed?.name === 'IOUCreated') {
            return parsed.args?.tokenId?.toString?.() ?? String(parsed.args?.[0]);
          }
        } catch (_) {
          // ignore non-IOUNFT logs
        }
      }
    } catch (_) {
      // fallback below
    }
    return null;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const nextErrors = validate();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    setBusy(true);
    setResult(null);
    try {
      await api.connectWallet();
      const deadlineTs = Math.floor(new Date(form.deadline).getTime() / 1000);
      const fulfiller = tab === 'social' ? form.fulfiller : (form.fulfiller || ZERO_ADDRESS);
      const valueEth = tab === 'social' ? '0' : form.collateralEth;

      const tx = await api.mintIOU({
        fulfiller,
        deadlineTs,
        transferable: false,
        valueEth,
        description: form.description,
        serviceType: form.serviceType,
      });
      const receipt = await tx.wait();
      const tokenId = extractTokenId(receipt);

      setResult({
        kind: tab,
        txHash: tx.hash,
        tokenId: tokenId || `tx:${receipt.transactionHash}`,
        fulfiller,
      });
      setErrors({});
    } catch (err) {
      setErrors({ submit: err?.message || String(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <div className="page-title">發放人情債 NFT</div>
          <div className="page-sub">Social / Bounty 分頁與合約參數語意對齊（`transferable` 固定 false）。</div>
        </div>

        <div style={{ minWidth: 220, display: 'grid', gap: 8, justifyItems: 'end' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn primary" onClick={connectWallet} disabled={connecting}>{connecting ? '連線中…' : (account ? 'Reconnect wallet' : 'Connect wallet')}</button>
          </div>
          <div className="mono small" style={{ color: 'var(--muted)' }}>currentAccount: {account || 'not connected'}</div>
        </div>
      </div>

      <div className="tabs" role="tablist" aria-label="Create IOU Type">
        <button type="button" className={`tab ${tab === 'social' ? 'active' : ''}`} onClick={() => setTab('social')}>Social IOU</button>
        <button type="button" className={`tab ${tab === 'bounty' ? 'active' : ''}`} onClick={() => setTab('bounty')}>Bounty IOU</button>
      </div>

      <div className="alert info" style={{ marginBottom: 16 }}>
        已預載 Anvil demo 地址。Social 需指定 fulfiller；Bounty 留空 fulfiller 代表 open marketplace。
      </div>

      <form className="card" onSubmit={handleSubmit}>
        <div className="form-row">
          <div className="form-group">
            <label>Fulfiller 地址 {tab === 'social' ? '（必填）' : '（可留空）'}</label>
            <select value={form.fulfiller} onChange={onField('fulfiller')}>
              <option value="">{tab === 'social' ? '-- 選擇 fulfiller --' : '-- 留空代表 open marketplace --'}</option>
              {DEMO_RECIPIENTS.map((recipient) => (
                <option key={recipient.address} value={recipient.address}>
                  {recipient.name} · {recipient.address}
                </option>
              ))}
            </select>
            {errors.fulfiller ? <div style={{ color: 'var(--warn)', marginTop: 6 }}>{errors.fulfiller}</div> : null}
          </div>

          <div className="form-group">
            <label>Reputation reward</label>
            <input value="由合約依 IOU 類型與衰減規則自動計算" disabled />
          </div>
        </div>

        <div className="form-group">
          <label>人情事件描述</label>
          <input placeholder="例如：幫忙搬家、技術諮詢" value={form.description} onChange={onField('description')} />
          {errors.description ? <div style={{ color: 'var(--warn)', marginTop: 6 }}>{errors.description}</div> : null}
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Deadline</label>
            <input type="date" value={form.deadline} onChange={onField('deadline')} />
            {errors.deadline ? <div style={{ color: 'var(--warn)', marginTop: 6 }}>{errors.deadline}</div> : null}
          </div>
          <div className="form-group">
            <label>Service type（可選）</label>
            <input placeholder="例如：修電腦、搬家、UI 設計" value={form.serviceType} onChange={onField('serviceType')} />
          </div>
        </div>

        {tab === 'bounty' ? (
          <div className="form-group">
            <label>Collateral (ETH)</label>
            <input type="number" min="0.000000000000000001" step="0.0001" value={form.collateralEth} onChange={onField('collateralEth')} />
            {errors.collateralEth ? <div style={{ color: 'var(--warn)', marginTop: 6 }}>{errors.collateralEth}</div> : null}
          </div>
        ) : null}

        <div style={{ marginTop: 8, padding: 12, background: 'var(--bg)', borderRadius: 6, fontSize: 12, color: 'var(--muted)' }}>
          {feeHint}
        </div>

        {errors.submit ? <div className="alert warn">{errors.submit}</div> : null}
        <div style={{ marginTop: 14, display: 'flex', gap: 10 }}>
          <button className="btn primary" type="submit" disabled={busy}>{busy ? '送出中…' : '確認發放'}</button>
        </div>
      </form>

      {result ? (
        <div className="card" style={{ marginTop: 14 }}>
          <div className="alert success" style={{ marginBottom: 10 }}>
            ✓ {result.kind === 'social' ? 'Social' : 'Bounty'} IOU 已建立，Token #{result.tokenId}
          </div>
          <div className="muted">txHash: <span className="mono">{result.txHash}</span></div>
          <div className="muted">fulfiller: <span className="mono">{result.fulfiller}</span></div>
          {result.kind === 'social' ? <div className="muted" style={{ marginTop: 8 }}>下一步：請切換到 fulfiller 帳號，在 Accept 頁面確認此 IOU。</div> : null}
        </div>
      ) : null}
    </div>
  );
}

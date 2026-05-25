import React, { useState } from 'react';
import * as api from '../api/contract';

const DEMO_RECIPIENTS = [
  { name: 'Andy', address: '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266' },
  { name: 'Woody', address: '0x70997970c51812dc3a010c7d01b50e0d17dc79c8' },
  { name: 'Amy', address: '0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc' },
  { name: 'Kevin', address: '0x90f79bf6eb2c4f870365e785982e1f101e93b906' },
];

export default function CreateIOU() {
  const [form, setForm] = useState({
    fulfiller: '',
    fulfillerLabel: '',
    issuer: 'You (@you)',
    description: '',
    value: '',
    date: new Date().toISOString().slice(0, 10),
    serviceType: '',
  });
  const [errors, setErrors] = useState({});
  const [confirmed, setConfirmed] = useState(false);
  const [issuedTokenId, setIssuedTokenId] = useState(null);

  function validate() {
    const e = {};
    if (!form.fulfiller) e.fulfiller = '請選擇受讓人';
    if (form.fulfiller && !/^0x[a-fA-F0-9]{40}$/.test(form.fulfiller)) e.fulfiller = '請選擇有效的以太坊地址';
    if (!form.description) e.description = '請填寫人情事件描述';
    if (!form.value || Number(form.value) <= 0) e.value = '請填寫大於 0 的 FAVOR 數值';
    return e;
  }

  function handleChange(field) {
    return (ev) => setForm({ ...form, [field]: ev.target.value });
  }

  function handleSubmit(ev) {
    ev.preventDefault();
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length === 0) {
      // call on-chain mint flow
      handleMintOnchain();
    }
  }

  // busy and tx state for async flows
  const [busy, setBusy] = useState(false);
  const [txHash, setTxHash] = useState('');

  async function handleMintOnchain() {
    setBusy(true);
    setTxHash('');
    try {
      await api.connectWallet();
      // convert date to unix seconds
      const deadlineTs = Math.floor(new Date(form.date).getTime() / 1000);
      // lifetimeRepReward use numeric value field, valueEth left as '0'
      const tx = await api.mintIOU({
        fulfiller: form.fulfiller,
        deadlineTs,
        transferable: true,
        lifetimeRepReward: Number(form.value) || 0,
        valueEth: '0',
        description: form.description,
        serviceType: form.serviceType,
      });
      setTxHash(tx.hash ?? tx.transactionHash ?? String(tx));
      // wait for confirmation
      const receipt = await tx.wait();
      // try to extract tokenId from Transfer event (if available)
      let tokenId = null;
      try {
        const transferEvent = receipt.events?.find((e) => e.event === 'Transfer' || e.topics?.length === 3);
        if (transferEvent) {
          // fallback to decoding: if args exist
          tokenId = transferEvent.args?.tokenId ?? transferEvent.args?.[2];
        }
      } catch (_) {}
      if (!tokenId) {
        // fallback to using tx hash as identifier
        tokenId = `tx:${receipt.transactionHash}`;
      }
      setIssuedTokenId(String(tokenId));
      setConfirmed(true);
    } catch (err) {
      console.error('mint failed', err);
      setErrors({ submit: err?.message || String(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="page-title">發放人情債 NFT</div>
      <div className="page-sub">幫助對方後，對方可主動掃碼，或你直接發放給對方</div>

      <div className="steps">
        <div className="step active"><div className="step-num">1</div><span>填寫資訊</span></div>
        <div className="step-line"></div>
        <div className={`step ${confirmed ? 'done' : ''}`}><div className="step-num">2</div><span>確認發放</span></div>
        <div className="step-line"></div>
        <div className={`step ${confirmed ? 'done' : ''}`}><div className="step-num">3</div><span>完成</span></div>
      </div>

      <div className="alert info" style={{ marginBottom: 16 }}>
        已預載 Anvil demo 地址，可直接選擇真實 recipient address 進行 mint。
      </div>

      {!confirmed ? (
        <form className="card" onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="form-group">
              <label>對方帳戶（欠你人情的人）</label>
              <select
                value={form.fulfiller}
                onChange={(ev) => {
                  const selected = DEMO_RECIPIENTS.find((item) => item.address === ev.target.value);
                  setForm({
                    ...form,
                    fulfiller: ev.target.value,
                    fulfillerLabel: selected ? `${selected.name} (${selected.address.slice(0, 10)}…)` : '',
                  });
                }}
              >
                <option value="">-- 選擇地址 --</option>
                {DEMO_RECIPIENTS.map((recipient) => (
                  <option key={recipient.address} value={recipient.address}>
                    {recipient.name} · {recipient.address}
                  </option>
                ))}
              </select>
              {errors.fulfiller ? <div style={{ color: 'var(--warn)', marginTop: 6 }}>{errors.fulfiller}</div> : null}
              <div style={{ marginTop: 6, fontSize: 12, color: 'var(--muted)' }}>
                選到的是實際地址，不只是名稱標籤。
              </div>
            </div>

            <div className="form-group">
              <label>你方帳戶（你）</label>
              <input value={form.issuer} disabled />
            </div>
          </div>

          <div className="form-group">
            <label>人情事件描述</label>
            <input placeholder="例如：幫忙搬家、提供技術諮詢…" value={form.description} onChange={handleChange('description')} />
            {errors.description ? <div style={{ color: 'var(--warn)', marginTop: 6 }}>{errors.description}</div> : null}
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>FAVOR 積分價值</label>
              <input type="number" min="1" value={form.value} onChange={handleChange('value')} />
              {errors.value ? <div style={{ color: 'var(--warn)', marginTop: 6 }}>{errors.value}</div> : null}
            </div>
            <div className="form-group">
              <label>發生日期</label>
              <input type="date" value={form.date} onChange={handleChange('date')} />
            </div>
          </div>

          <div className="form-group">
            <label>指定償還服務類型（可選）</label>
            <input placeholder="例如：修電腦、搬家、UI 設計" value={form.serviceType} onChange={handleChange('serviceType')} />
          </div>

          <div style={{ marginTop: 8, padding: 12, background: 'var(--bg)', borderRadius: 6, fontSize: 12, color: 'var(--muted)', lineHeight: 1.7 }}>
            NFT 鑄造後：<br />
            • 受讓人信譽積分 -{form.value || 'N/A'} · 發放人 +{form.value || 'N/A'}<br />
            • 1% Transfer Fee 進入 DAO Treasury
          </div>

          {errors.submit ? <div className="alert warn">{errors.submit}</div> : null}
          <div style={{ marginTop: 14, display: 'flex', gap: 10 }}>
            <button className="btn primary" type="submit" disabled={busy}>{busy ? '發送中…' : '確認發放'}</button>
            <button className="btn" type="button" onClick={() => setForm({ ...form, description: '', value: '', serviceType: '' })} disabled={busy}>取消</button>
          </div>
          {txHash ? <div style={{ marginTop: 8 }} className="muted">交易: <a href={`https://etherscan.io/tx/${txHash}`} target="_blank" rel="noreferrer" className="mono">{txHash}</a></div> : null}
        </form>
      ) : (
        <div className="card">
          <div className="alert success">✓ 人情債 NFT 已發放！NFT #{issuedTokenId} — {form.fulfillerLabel || form.fulfiller} 欠 {form.issuer} {form.value} FAVOR（{form.description}）。</div>
          <div className="nft-grid">
            <div className="nft-card highlight">
              <div className="nft-id">#{issuedTokenId} · 剛發放</div>
              <div className="nft-parties"><div className="avatar woody" style={{ width: 22, height: 22, fontSize: 10 }}>{form.fulfillerLabel?.[0] || 'U'}</div> {form.fulfillerLabel || form.fulfiller} <span className="nft-arrow">→</span> <div className="avatar andy" style={{ width: 22, height: 22, fontSize: 10 }}>Y</div> {form.issuer}</div>
              <div className="nft-amount">{form.value} FAVOR</div>
              <div className="nft-desc">{form.description}</div>
              <div className="nft-meta">
                <span className="tag">{form.date}</span>
                <span className="tag green">有效</span>
                {form.serviceType ? <span className="tag">{form.serviceType}</span> : null}
                <span className="tag">{form.fulfiller}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

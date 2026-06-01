import React, { useEffect, useState } from 'react';
import { getVotingPower } from '../api/contract'; // 檔案中已存在的 helper
// 如果沒有 helper，可改為 fetch('/api/reputation/{address}')

const LS_PROPOSALS = 'dao:proposals_v1';
const LS_VOTES = 'dao:votes_v1';

export default function DAO() {
  const [account, setAccount] = useState(null);
  const [proposals, setProposals] = useState([]);
  const [votes, setVotes] = useState({}); // { proposalId: { voterAddr: true } }
  const [totalAvailableRep, setTotalAvailableRep] = useState(0);

  const openProposals = proposals.filter((proposal) => proposal.status === 'open');
  const closedProposals = proposals.filter((proposal) => proposal.status === 'closed');
  const totalRepParticipated = proposals.reduce((sum, proposal) => sum + Number(proposal.totalRepParticipated || 0), 0);

  useEffect(() => {
    const p = localStorage.getItem(LS_PROPOSALS);
    const v = localStorage.getItem(LS_VOTES);
    if (p) setProposals(JSON.parse(p));
    if (v) setVotes(JSON.parse(v));
    // 取 total available rep（indexer endpoint）
    fetch('/api/reputation/summary').then(r => r.json()).then(j => {
      if (j && j.totalVotingPower) setTotalAvailableRep(Number(j.totalVotingPower));
    }).catch(()=>{});
    // get connected account if possible
    if (window.ethereum) {
      window.ethereum.request({ method: 'eth_accounts' }).then(accs => {
        if (accs && accs[0]) setAccount(accs[0]);
      });
      window.ethereum.on && window.ethereum.on('accountsChanged', (accs) => {
        setAccount(accs[0] || null);
      });
    }
  }, []);

  useEffect(() => localStorage.setItem(LS_PROPOSALS, JSON.stringify(proposals)), [proposals]);
  useEffect(() => localStorage.setItem(LS_VOTES, JSON.stringify(votes)), [votes]);

  async function ensureAccount() {
    if (!account && window.ethereum) {
      const accs = await window.ethereum.request({ method: 'eth_requestAccounts' });
      setAccount(accs[0]);
      return accs[0];
    }
    return account;
  }

  async function handleCreateProposal(e) {
    e.preventDefault();
    const form = e.target;
    const title = form.title.value.trim();
    const description = form.description.value.trim();
    const requestedAmount = form.requestedAmount.value.trim() || '0';
    if (!title) return alert('請輸入標題');
    const addr = await ensureAccount();
    if (!addr) return alert('請連線錢包');
    const rep = await getVotingPower(addr).catch(()=>0);
    if (!rep || Number(rep) <= 0) return alert('只有 rep > 0 的帳號可以提案');
    const id = Date.now().toString();
    const newP = {
      id, title, description, requestedAmount,
      proposer: addr, createdAt: new Date().toISOString(),
      status: 'open',
      votesFor: 0,
      votesAgainst: 0,
      totalRepParticipated: 0,
      result: null
    };
    setProposals([newP, ...proposals]);
    form.reset();
  }

  async function handleVote(proposalId, support) {
    const addr = await ensureAccount();
    if (!addr) return alert('請連線錢包');
    const p = proposals.find(x => x.id === proposalId);
    if (!p || p.status !== 'open') return alert('此提案不可投票');
    const has = votes[proposalId] && votes[proposalId][addr];
    if (has) return alert('此帳號已投過票');
    const rep = await getVotingPower(addr).catch(()=>0);
    const r = Number(rep || 0);
    if (r <= 0) return alert('沒有可用 rep');
    // 記錄 vote
    const newVotes = { ...votes, [proposalId]: { ...(votes[proposalId]||{}), [addr]: { support, repUsed: r, timestamp: Date.now() } } };
    setVotes(newVotes);
    // 更新 proposal tally
    setProposals(proposals.map(x => {
      if (x.id !== proposalId) return x;
      return {
        ...x,
        votesFor: x.votesFor + (support ? r : 0),
        votesAgainst: x.votesAgainst + (support ? 0 : r),
        totalRepParticipated: x.totalRepParticipated + r
      };
    }));
  }

  function handleEndAllVoting() {
    if (!confirm('確定要結束所有投票中的提案嗎？')) return;
    const updated = proposals.map(p => {
      if (p.status !== 'open') return p;
      const turnout = totalAvailableRep > 0 ? (p.totalRepParticipated / totalAvailableRep) : 0;
      const passed = turnout > 0.5 && p.votesFor > p.votesAgainst;
      return {
        ...p,
        status: 'closed',
        result: passed ? 'passed' : 'failed',
        repTurnoutRate: turnout
      };
    });
    setProposals(updated);
  }

  return (
    <div className="dao-page user-ious-page">
      <section className="user-ious-hero panel dao-hero">
        <div className="user-ious-copy">
          <span className="eyebrow">DAO governance · demo flow</span>
          <h1>DAO  提案、投票 演示</h1>
          <p>
            這個頁面保留簡化投票流程，但會沿用相同的卡片、區塊標頭、圓角與留白，讓整個專案看起來像同一個產品。
          </p>
          <div className="status-row">
            <span className="badge ok">Open proposals: {openProposals.length}</span>
            <span className="badge ok">Closed proposals: {closedProposals.length}</span>
            <span className="badge">Connected: {account || 'not connected'}</span>
          </div>
        </div>

        <div className="query-card dao-action-card">
          <label className="label">DAO control</label>
          <div className="query-row dao-action-row">
            <button type="button" className="btn primary" onClick={() => handleEndAllVoting()}>
              結束所有投票中的提案
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => window.location.reload()}
            >
              Refresh
            </button>
          </div>
          <div className="helper-text">
            投票結束後，結果區會即時更新；提案與投票資料仍會保留在 localStorage。
          </div>
        </div>
      </section>

      <section className="panel user-ious-summary dao-summary">
        <div className="summary-grid">
          <div className="summary-card">
            <div className="summary-label">Open proposals</div>
            <div className="summary-value">{openProposals.length}</div>
          </div>
          <div className="summary-card">
            <div className="summary-label">Closed proposals</div>
            <div className="summary-value">{closedProposals.length}</div>
          </div>
          <div className="summary-card">
            <div className="summary-label">Total rep used</div>
            <div className="summary-value">{totalRepParticipated}</div>
          </div>
          <div className="summary-card">
            <div className="summary-label">Available rep</div>
            <div className="summary-value">{totalAvailableRep || '—'}</div>
          </div>
        </div>
      </section>

      <div className="user-ious-sections dao-sections">
        <section className="iou-section dao-block">
          <div className="section-divider">
            <div>
              <h3>建立提案</h3>
              <p>Rep &gt; 0 的 account 可以送出新提案，並立即出現在投票區。</p>
            </div>
            <div className="section-count">{proposals.length}</div>
          </div>

          <div className="dao-form-card">
            <form onSubmit={handleCreateProposal} className="dao-form">
              <div className="form-grid two">
                <div className="form-group">
                  <label htmlFor="dao-title">標題</label>
                  <input id="dao-title" name="title" placeholder="例如：增加社群活動預算" />
                </div>
                <div className="form-group">
                  <label htmlFor="dao-amount">需要資金</label>
                  <input id="dao-amount" name="requestedAmount" placeholder="例如：10" />
                </div>
              </div>
              <div className="form-group">
                <label htmlFor="dao-desc">敘述</label>
                <textarea id="dao-desc" name="description" placeholder="簡述提案內容與目的" />
              </div>
              <div className="form-actions">
                <button type="submit" className="btn primary">送出提案</button>
              </div>
            </form>
          </div>

        </section>

        <section className="iou-section dao-block">
          <div className="section-divider">
            <div>
              <h3>投票區</h3>
              <p>只有 open 狀態的提案可以投票，投票權數直接沿用真實 rep。</p>
            </div>
            <div className="section-count">{openProposals.length}</div>
          </div>

          <div className="iou-grid dao-list-grid">
            {openProposals.map((proposal) => (
              <article key={proposal.id} className="iou-card dao-card">
                <div className="card-topline">
                  <div>
                    <div className="iou-token">{proposal.title}</div>
                    <div className="iou-subtitle">提案人：{proposal.proposer}</div>
                  </div>
                  <div className="state-pill state-active">Voting</div>
                </div>

                <div className="dao-vote-meta">
                  <span className="chip">For: {proposal.votesFor}</span>
                  <span className="chip">Against: {proposal.votesAgainst}</span>
                  <span className="chip">Rep used: {proposal.totalRepParticipated}</span>
                </div>

                <div className="card-actions-grid dao-vote-actions">
                  <button type="button" className="btn primary" onClick={() => handleVote(proposal.id, true)}>同意</button>
                  <button type="button" className="btn" onClick={() => handleVote(proposal.id, false)}>反對</button>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="iou-section dao-block">
          <div className="section-divider">
            <div>
              <h3>結果區</h3>
              <p>已結束的提案會保留在這裡，顯示票數、參與率與通過狀態。</p>
            </div>
            <div className="section-count">{closedProposals.length}</div>
          </div>

          <div className="iou-grid dao-list-grid">
            {closedProposals.map((proposal) => (
              <article key={proposal.id} className="iou-card dao-card">
                <div className="card-topline">
                  <div>
                    <div className="iou-token">{proposal.title}</div>
                    <div className="iou-subtitle">{proposal.description}</div>
                  </div>
                  <div className={`state-pill ${proposal.result === 'passed' ? 'state-active' : 'state-cancelled'}`}>
                    {proposal.result}
                  </div>
                </div>

                <div className="dao-result-grid">
                  <span className="chip">同意: {proposal.votesFor}</span>
                  <span className="chip">反對: {proposal.votesAgainst}</span>
                  <span className="chip">rep 投票率: {(proposal.repTurnoutRate || 0).toFixed(3)}</span>
                  <span className="chip">Proposer: {proposal.proposer}</span>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
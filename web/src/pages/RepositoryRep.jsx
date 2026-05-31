import React, { useEffect, useState } from 'react';
import * as api from '../api/contract';
import {
  getReputationSummary,
  getReputationProfile,
  getReputationLeaderboard,
  getInteractionEvents,
  getInteractionSummary,
} from '../api/reputation';

function normalize(a){ return a ? String(a).toLowerCase() : null; }

export default function RepositoryRep(){
  const [account, setAccount] = useState(null);
  const [summary, setSummary] = useState(null);
  const [profile, setProfile] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [interactions, setInteractions] = useState([]);
  const [activityByAddress, setActivityByAddress] = useState({});
  const [loading, setLoading] = useState(false);

  async function connect(){
    try{
      const provider = await api.connectWallet();
      const signer = await provider.getSigner();
      const addr = await signer.getAddress();
      setAccount(addr);
    }catch(e){
      console.error(e);
      alert(e.message || String(e));
    }
  }

  async function fetchSummary(){
    try{
      const data = await getReputationSummary();
      setSummary(data);
    }catch(e){
      console.error(e);
    }
  }

  async function fetchProfile(addr){
    if(!addr) { setProfile(null); return; }
    try{
      const data = await getReputationProfile(addr);
      setProfile(data);
    }catch(e){ console.error(e); }
  }

  async function fetchLeaderboard(){
    try{
      const payload = await getReputationLeaderboard({ limit: 100 });
      setLeaderboard(payload.data || []);
    }catch(e){ console.error(e); }
  }

  async function fetchInteractionSummary(){
    try{
      const payload = await getInteractionSummary({ limit: 200 });
      const map = {};
      for (const row of (payload.data || [])) {
        if (!row.address) continue;
        map[row.address] = row;
      }
      setActivityByAddress(map);
    } catch (e) {
      console.error(e);
      setActivityByAddress({});
    }
  }

  async function fetchInteractions(addr){
    try{
      const payload = await getInteractionEvents({ address: addr || undefined, limit: 10 });
      setInteractions(payload.data || []);
    }catch(e){
      console.error(e);
      setInteractions([]);
    }
  }

  useEffect(()=>{
    setLoading(true);
    Promise.all([fetchSummary(), fetchLeaderboard(), fetchInteractionSummary()]).finally(()=>setLoading(false));
  },[]);

  useEffect(()=>{ fetchProfile(account); },[account]);

  useEffect(()=>{ fetchInteractions(account); },[account]);

  const totalCurrent = summary?.totalCurrentRep || 0;
  const totalLifetime = summary?.totalLifetimeRep || 0;
  const myCurrent = profile?.currentRep || 0;
  const myLifetime = profile?.lifetimeRep || 0;
  const myLocked = profile?.lockedRep || 0;
  const myVoting = profile?.votingPower || 0;

  const pctCurrent = totalCurrent ? ((myCurrent/totalCurrent)*100).toFixed(2) : '0.00';
  const pctLifetime = totalLifetime ? ((myLifetime/totalLifetime)*100).toFixed(2) : '0.00';

  const myAddrNorm = normalize(account);

  return (
    <div>
      <div className="page-header">
        <h1>Repository Reputation</h1>
        <div>
          <button onClick={connect}>{account ? 'Reconnect wallet' : 'Connect wallet'}</button>
        </div>
      </div>

      <div className="section">
        <div className="panel">
          <h3>Personal Reputation</h3>
          {account ? (
            <div>
              <div>Address: <span className="mono">{account}</span></div>
              <div>Current Rep: <strong>{myCurrent}</strong></div>
              <div>Lifetime Rep: <strong>{myLifetime}</strong></div>
              <div>Locked Rep: <strong>{myLocked}</strong></div>
              <div>Voting Power: <strong>{myVoting}</strong></div>
            </div>
          ) : (
            <div className="muted">Connect a wallet to view your reputation.</div>
          )}
        </div>

        <div className="panel" style={{ marginTop: 12 }}>
          <h3>Global Totals</h3>
          <div className="stat-grid">
            <div className="stat-card"><div className="stat-label">Total Current Rep</div><div className="stat-value">{summary ? summary.totalCurrentRep : '—'}</div></div>
            <div className="stat-card"><div className="stat-label">Total Lifetime Rep</div><div className="stat-value">{summary ? summary.totalLifetimeRep : '—'}</div></div>
            <div className="stat-card"><div className="stat-label">Total Locked Rep</div><div className="stat-value">{summary ? summary.totalLockedRep : '—'}</div></div>
            <div className="stat-card"><div className="stat-label">Total Voting Power</div><div className="stat-value">{summary ? summary.totalVotingPower : '—'}</div></div>
            <div className="stat-card"><div className="stat-label">My Current %</div><div className="stat-value">{pctCurrent}%</div></div>
            <div className="stat-card"><div className="stat-label">My Lifetime %</div><div className="stat-value">{pctLifetime}%</div></div>
          </div>
        </div>

        <div className="panel" style={{ marginTop: 12 }}>
          <h3>Leaderboard (by currentRep)</h3>
          {loading ? <div className="muted">Loading leaderboard…</div> : (
            <table className="leaderboard">
              <thead>
                <tr><th>#</th><th>Account</th><th>Current</th><th>Lifetime</th><th>Activity</th><th>Latest Decay</th></tr>
              </thead>
              <tbody>
                {leaderboard.map((row, idx) => {
                  const isMe = myAddrNorm && normalize(row.address) === myAddrNorm;
                  const activity = activityByAddress[normalize(row.address)] || null;
                  return (
                    <tr key={row.address} className={isMe ? 'highlight' : ''}>
                      <td>{idx+1}</td>
                      <td className="mono">{row.address}</td>
                      <td>{row.currentRep}</td>
                      <td>{row.lifetimeRep}</td>
                      <td>{activity ? activity.interactionCount : 0}</td>
                      <td>{activity ? activity.latestDecayLevel : 0}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="panel" style={{ marginTop: 12 }}>
          <h3>Recent Interaction Records</h3>
          <div className="muted" style={{ marginBottom: 8 }}>
            Showing latest decay advancement records from indexer.
          </div>
          {interactions.length === 0 ? (
            <div className="muted">No interaction records yet.</div>
          ) : (
            <table className="leaderboard">
              <thead>
                <tr><th>Block</th><th>Pair A</th><th>Pair B</th><th>Decay Level</th><th>Interaction Ts</th></tr>
              </thead>
              <tbody>
                {interactions.map((row, idx) => (
                  <tr key={`${row.txHash}-${row.logIndex ?? idx}`}>
                    <td>{row.blockNumber}</td>
                    <td className="mono">{row.addrA}</td>
                    <td className="mono">{row.addrB}</td>
                    <td>{row.decayLevel}</td>
                    <td>{row.lastInteractionTs}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

import React, { useEffect, useMemo, useState } from 'react';
import * as api from './api/contract';
import { addressesByChain } from './api/contract';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import CreateIOU from './pages/CreateIOU';
import Marketplace from './pages/Marketplace';
import IOUDetail from './pages/IOUDetail';
import DAO from './pages/DAO';
import Treasury from './pages/Treasury';
import UserIous from './pages/UserIous';
import Layout from './components/Layout';
import './styles.css';

export default function App() {
  const [account, setAccount] = useState(null);
  const [chainId, setChainId] = useState(null);
  const [networkName, setNetworkName] = useState('unknown');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('Connect a wallet on the active chain to start sending IOUs.');
  const [txHash, setTxHash] = useState('');

  const [mintForm, setMintForm] = useState({
    fulfiller: '',
    deadlineDays: 7,
    transferable: false,
    reward: 10,
    valueEth: '0',
  });

  const [tokenForm, setTokenForm] = useState({
    acceptTokenId: '',
    socialTokenId: '',
    socialRating: 5,
    bountyTokenId: '',
    bountyRating: 5,
    refundTokenId: '',
    timeoutTokenId: '',
  });

  const activeContracts = useMemo(() => {
    if (!chainId) return null;
    return addressesByChain[String(chainId)] ?? null;
  }, [chainId]);

  const chainLabel = chainId ? `${networkName} (${chainId})` : 'not connected';

  async function refreshWalletState(provider) {
    if (!provider) return;
    const signer = await provider.getSigner();
    const addr = await signer.getAddress();
    const network = await provider.getNetwork();
    setAccount(addr);
    setChainId(Number(network.chainId));
    setNetworkName(network.name || 'unknown');
  }

  async function connect() {
    try {
      setBusy(true);
      const provider = await api.connectWallet();
      await refreshWalletState(provider);
      setStatus('Wallet connected.');
    } catch (e) {
      setStatus(e.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      if (!window.ethereum) return;
      try {
        const provider = await api.getProvider();
        const accounts = await provider.send('eth_accounts', []);
        const network = await provider.getNetwork();

        if (cancelled) return;
        setChainId(Number(network.chainId));
        setNetworkName(network.name || 'unknown');
        if (accounts?.length) {
          const signer = await provider.getSigner();
          setAccount(await signer.getAddress());
          setStatus('Wallet already connected.');
        }
      } catch (e) {
        if (!cancelled) setStatus(e.message || String(e));
      }
    }

    bootstrap();

    return () => {
      cancelled = true;
    };
  }, []);

  async function runTx(label, action) {
    try {
      setBusy(true);
      setStatus(`${label} pending...`);
      setTxHash('');
      const tx = await action();
      setTxHash(tx.hash);
      setStatus(`${label} submitted. Waiting for confirmation...`);
      await tx.wait();
      setStatus(`${label} confirmed.`);
    } catch (e) {
      setStatus(e.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleMint(event) {
    event.preventDefault();
    const deadline = Math.floor(Date.now() / 1000) + Number(mintForm.deadlineDays || 0) * 24 * 3600;
    await runTx('Mint IOU', () => api.mintIOU({
      fulfiller: mintForm.fulfiller,
      deadlineTs: deadline,
      transferable: mintForm.transferable,
      lifetimeRepReward: Number(mintForm.reward || 0),
      valueEth: mintForm.valueEth || '0',
    }));
  }

  async function handleAccept(event) {
    event.preventDefault();
    await runTx('Accept IOU', () => api.acceptIOU(tokenForm.acceptTokenId));
  }

  async function handleSettleSocial(event) {
    event.preventDefault();
    await runTx('Settle social IOU', () => api.settleSocialIOU(tokenForm.socialTokenId, Number(tokenForm.socialRating || 0)));
  }

  async function handleSettleBounty(event) {
    event.preventDefault();
    await runTx('Settle bounty IOU', () => api.settleBountyIOU(tokenForm.bountyTokenId, Number(tokenForm.bountyRating || 0)));
  }

  async function handleRefund(event) {
    event.preventDefault();
    await runTx('Refund pending IOU', () => api.refundPending(tokenForm.refundTokenId));
  }

  async function handleTimeout(event) {
    event.preventDefault();
    await runTx('Timeout claim', () => api.timeoutClaim(tokenForm.timeoutTokenId));
  }

  // Home view wraps the existing UI so it can be used as a route element
  function Home() {
    return (
      <>
        <section className="hero">
          <div className="hero-card">
            <span className="eyebrow">IOUFi MVP · chain-aware · ERC-721</span>
            <h1>Ship IOUs as NFTs, settle them with one dashboard.</h1>
            <p>
              This MVP wires the deployed contracts to a single surface for minting, accepting, settling,
              refunding, and timeout claims. It reads the active chain ID, so local Anvil and future testnets
              can coexist without address collisions.
            </p>
            <div className="hero-actions">
              <button onClick={connect} disabled={busy}>{account ? 'Reconnect wallet' : 'Connect wallet'}</button>
              <button className="secondary" onClick={() => window.location.reload()} disabled={busy}>Refresh chain state</button>
            </div>
            <div className="status-bar">
              <strong>Wallet:</strong> {account ?? 'not connected'} · <strong>Chain:</strong> {chainLabel}
              {txHash ? <div className="mono" style={{ marginTop: 8 }}>Latest tx: {txHash}</div> : null}
            </div>
          </div>

          <div className="side-stack">
            <div className="panel">
              <h2>Deployment snapshot</h2>
              <div className="stat-grid">
                <div className="stat-card"><div className="stat-label">Active chain</div><div className="stat-value">{chainId ?? '—'}</div></div>
                <div className="stat-card"><div className="stat-label">Contracts loaded</div><div className="stat-value">{activeContracts ? Object.keys(activeContracts).length : 0}</div></div>
                <div className="stat-card"><div className="stat-label">Network</div><div className="stat-value">{networkName}</div></div>
                <div className="stat-card"><div className="stat-label">Status</div><div className="stat-value">{busy ? 'processing' : 'ready'}</div></div>
              </div>
            </div>

            <div className="panel">
              <h3>Current chain contracts</h3>
              {activeContracts ? (
                <div className="contract-grid">
                  {Object.entries(activeContracts).map(([name, address]) => (
                    <div className="contract-card" key={name}>
                      <div className="contract-name">{name}</div>
                      <div className="mono">{address}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="muted">No addresses found for this chain yet. Run the deploy/sync flow first.</div>
              )}
            </div>
          </div>
        </section>

        <section className="section">
          <h2>IOU lifecycle</h2>
          <div className="workflow-grid">
            <form className="panel" onSubmit={handleMint}>
              <h3>1. Mint IOU</h3>
              <div className="form-grid">
                <input
                  placeholder="Fulfiller address"
                  value={mintForm.fulfiller}
                  onChange={(event) => setMintForm({ ...mintForm, fulfiller: event.target.value })}
                />
                <div className="form-grid two">
                  <input
                    type="number"
                    min="1"
                    placeholder="Deadline days"
                    value={mintForm.deadlineDays}
                    onChange={(event) => setMintForm({ ...mintForm, deadlineDays: event.target.value })}
                  />
                  <input
                    type="number"
                    min="0"
                    placeholder="Lifetime rep reward"
                    value={mintForm.reward}
                    onChange={(event) => setMintForm({ ...mintForm, reward: event.target.value })}
                  />
                </div>
                <div className="form-grid two">
                  <input
                    type="text"
                    placeholder="ETH value (optional)"
                    value={mintForm.valueEth}
                    onChange={(event) => setMintForm({ ...mintForm, valueEth: event.target.value })}
                  />
                  <label className="badge" style={{ justifyContent: 'space-between', padding: '0.85rem 0.95rem' }}>
                    <span>Transferable</span>
                    <input
                      type="checkbox"
                      checked={mintForm.transferable}
                      onChange={(event) => setMintForm({ ...mintForm, transferable: event.target.checked })}
                      style={{ width: 'auto' }}
                    />
                  </label>
                </div>
                <button type="submit" disabled={busy || !account}>Mint IOU</button>
              </div>
            </form>

            <div className="panel">
              <h3>2. Accept / settle / refund</h3>
              <div className="form-grid">
                <form onSubmit={handleAccept} className="form-grid">
                  <input
                    placeholder="Token ID to accept"
                    value={tokenForm.acceptTokenId}
                    onChange={(event) => setTokenForm({ ...tokenForm, acceptTokenId: event.target.value })}
                  />
                  <button type="submit" className="secondary" disabled={busy || !account}>Accept IOU</button>
                </form>

                <form onSubmit={handleSettleSocial} className="form-grid">
                  <div className="form-grid two">
                    <input
                      placeholder="Social settle token ID"
                      value={tokenForm.socialTokenId}
                      onChange={(event) => setTokenForm({ ...tokenForm, socialTokenId: event.target.value })}
                    />
                    <input
                      type="number"
                      min="0"
                      max="255"
                      placeholder="Rating"
                      value={tokenForm.socialRating}
                      onChange={(event) => setTokenForm({ ...tokenForm, socialRating: event.target.value })}
                    />
                  </div>
                  <button type="submit" className="secondary" disabled={busy || !account}>Settle social IOU</button>
                </form>

                <form onSubmit={handleSettleBounty} className="form-grid">
                  <div className="form-grid two">
                    <input
                      placeholder="Bounty settle token ID"
                      value={tokenForm.bountyTokenId}
                      onChange={(event) => setTokenForm({ ...tokenForm, bountyTokenId: event.target.value })}
                    />
                    <input
                      type="number"
                      min="0"
                      max="255"
                      placeholder="Rating"
                      value={tokenForm.bountyRating}
                      onChange={(event) => setTokenForm({ ...tokenForm, bountyRating: event.target.value })}
                    />
                  </div>
                  <button type="submit" className="secondary" disabled={busy || !account}>Settle bounty IOU</button>
                </form>

                <div className="tx-grid">
                  <form onSubmit={handleRefund} className="form-grid">
                    <input
                      placeholder="Pending token ID"
                      value={tokenForm.refundTokenId}
                      onChange={(event) => setTokenForm({ ...tokenForm, refundTokenId: event.target.value })}
                    />
                    <button type="submit" className="ghost" disabled={busy || !account}>Refund pending</button>
                  </form>
                  <form onSubmit={handleTimeout} className="form-grid">
                    <input
                      placeholder="Active token ID"
                      value={tokenForm.timeoutTokenId}
                      onChange={(event) => setTokenForm({ ...tokenForm, timeoutTokenId: event.target.value })}
                    />
                    <button type="submit" className="ghost" disabled={busy || !account}>Timeout claim</button>
                  </form>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="section panel">
          <h2>Runtime notes</h2>
          <div className="badge ok">Chain-aware address resolution is enabled</div>{' '}
          <div className={`badge ${activeContracts ? 'ok' : 'warn'}`}>{activeContracts ? 'addresses found for active chain' : 'no chain-specific addresses yet'}</div>
          <p className="muted" style={{ marginTop: 12 }}>
            The UI uses the connected wallet&apos;s chain ID to load the correct contract addresses from <span className="mono">web/src/contracts/addresses.json</span>.
          </p>
          <p className="muted">
            Contract ABI files are loaded from the same folder, so the frontend can be pointed at Anvil today and a testnet later without changing the UI code.
          </p>
        </section>
      </>
    );
  }

  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/create" element={<CreateIOU />} />
          <Route path="/market" element={<Marketplace />} />
          <Route path="/detail" element={<IOUDetail />} />
          <Route path="/ious" element={<UserIous />} />
          <Route path="/dao" element={<DAO />} />
          <Route path="/treasury" element={<Treasury />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}

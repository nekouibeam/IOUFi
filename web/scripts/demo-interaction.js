import fs from 'fs';
import { ethers } from 'ethers';

/*
  Demo script (Node)

  Purpose:
    1) Load latest deployed addresses + ABIs from web/src/contracts
    2) Use Anvil unlocked accounts as creator / fulfiller
    3) Run two flows against current contract interface:
       - Social flow: mint (0 collateral) -> accept -> settleSocialIOU
       - Bounty flow: mint (>0 collateral) -> accept -> settleBountyIOU
    4) Check IOU snapshots at each stage
    5) Verify InteractionRecorded and optional indexer API aggregation

  Requirements:
    - Local Anvil RPC at http://127.0.0.1:8545
    - Contract addresses synced in web/src/contracts/addresses.json
    - (Optional) Query API at http://127.0.0.1:4000 for interaction summary check
*/

const RPC_URL = process.env.RPC_URL || 'http://127.0.0.1:8545';
const API_BASE = process.env.API_BASE || 'http://127.0.0.1:4000';

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(new URL(relativePath, import.meta.url), 'utf8'));
}

function toInt(value, fallback = 0) {
  try {
    return Number(value);
  } catch (_) {
    return fallback;
  }
}

function normalizeAddress(value) {
  return value ? String(value).toLowerCase() : null;
}

function formatIOU(snapshot) {
  return {
    creator: normalizeAddress(snapshot.creator ?? snapshot[0]),
    fulfiller: normalizeAddress(snapshot.fulfiller ?? snapshot[1]),
    collateral: (snapshot.collateral ?? snapshot[2])?.toString?.() ?? String(snapshot.collateral ?? snapshot[2] ?? 0),
    state: toInt(snapshot.state ?? snapshot[3], -1),
    deadline: toInt(snapshot.deadline ?? snapshot[5], 0),
    description: snapshot.description ?? snapshot[6] ?? '',
    serviceType: snapshot.serviceType ?? snapshot[7] ?? '',
    rawCreatorRepBase: toInt(snapshot.rawCreatorRepBase ?? snapshot[8], 0),
    rawFulfillerRepBase: toInt(snapshot.rawFulfillerRepBase ?? snapshot[9], 0),
    decayedCreatorRepBase: toInt(snapshot.decayedCreatorRepBase ?? snapshot[10], 0),
    decayedFulfillerRepBase: toInt(snapshot.decayedFulfillerRepBase ?? snapshot[11], 0),
    repBaseFrozen: Boolean(snapshot.repBaseFrozen ?? snapshot[12]),
    repPreAwarded: Boolean(snapshot.repPreAwarded ?? snapshot[15]),
    repPreAwardedAmount: toInt(snapshot.repPreAwardedAmount ?? snapshot[16], 0),
  };
}

async function waitTx(label, txPromise) {
  const tx = await txPromise;
  const receipt = await tx.wait();
  console.log(`${label} tx: ${receipt.hash} @ block ${receipt.blockNumber}`);
  return receipt;
}

async function printInteractionRecord(reputationContract, creatorAddr, fulfillerAddr) {
  const a = normalizeAddress(creatorAddr) < normalizeAddress(fulfillerAddr)
    ? normalizeAddress(creatorAddr)
    : normalizeAddress(fulfillerAddr);
  const b = a === normalizeAddress(creatorAddr)
    ? normalizeAddress(fulfillerAddr)
    : normalizeAddress(creatorAddr);
  const key = ethers.keccak256(ethers.solidityPacked(['address', 'address'], [a, b]));
  const record = await reputationContract.interactions(key);
  console.log('interaction record:', {
    decayLevel: toInt(record.decayLevel ?? record[0], 0),
    lastInteractionTs: toInt(record.lastInteractionTs ?? record[1], 0),
    key,
  });
}

async function maybeCheckInteractionSummaryApi(addresses, expectedMinTs = 0) {
  try {
    const deadline = Date.now() + 15000;
    let tracked = [];
    while (Date.now() < deadline) {
      const url = `${API_BASE}/api/reputation/interactions/summary?limit=20`;
      const res = await fetch(url);
      if (!res.ok) {
        console.log(`interaction summary api unavailable: ${res.status}`);
        return;
      }
      const payload = await res.json();
      const rows = Array.isArray(payload.data) ? payload.data : [];
      tracked = rows.filter((row) => addresses.includes(normalizeAddress(row.address)));

      const hasExpected = tracked.length > 0 && tracked.every((row) => toInt(row.lastInteractionTs, 0) >= expectedMinTs);
      if (hasExpected || expectedMinTs <= 0) {
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    console.log('interaction summary api rows (tracked addresses):', tracked);
    if (expectedMinTs > 0) {
      const stale = tracked.some((row) => toInt(row.lastInteractionTs, 0) < expectedMinTs);
      if (stale) {
        console.log('warning: api summary has not fully caught up to latest chain interaction yet');
      }
    }
  } catch (err) {
    console.log('interaction summary api not reachable, skipped:', err?.message || String(err));
  }
}

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);

  const addressesByChain = readJson('../src/contracts/addresses.json');
  const iouArtifact = readJson('../src/contracts/IOUNFT.json');
  const reputationArtifact = readJson('../src/contracts/ReputationLedger.json');

  const network = await provider.getNetwork();
  const chainId = String(network.chainId);
  const scoped = addressesByChain[chainId];
  if (!scoped?.IOUNFT || !scoped?.ReputationLedger) {
    throw new Error(`Missing IOUNFT/ReputationLedger address for chain ${chainId} in addresses.json`);
  }

  const accounts = await provider.send('eth_accounts', []);
  if (accounts.length < 2) {
    throw new Error('Need at least 2 unlocked accounts on RPC node');
  }

  const creatorAddr = accounts[0];
  const fulfillerAddr = accounts[1];
  const creator = await provider.getSigner(creatorAddr);
  const fulfiller = await provider.getSigner(fulfillerAddr);

  console.log('network:', { chainId, rpc: RPC_URL });
  console.log('creator:', creatorAddr);
  console.log('fulfiller:', fulfillerAddr);
  console.log('contracts:', { IOUNFT: scoped.IOUNFT, ReputationLedger: scoped.ReputationLedger });

  const iouAsCreator = new ethers.Contract(scoped.IOUNFT, iouArtifact.abi, creator);
  const iouAsFulfiller = new ethers.Contract(scoped.IOUNFT, iouArtifact.abi, fulfiller);
  const iouRead = new ethers.Contract(scoped.IOUNFT, iouArtifact.abi, provider);
  const reputationRead = new ethers.Contract(scoped.ReputationLedger, reputationArtifact.abi, provider);

  const now = Math.floor(Date.now() / 1000);

  // Flow A: Social IOU (collateral = 0)
  console.log('\n=== Flow A: Social IOU ===');
  const socialId = await iouRead.nextTokenId();
  await waitTx(
    'social mint',
    iouAsCreator.mintIOU(fulfillerAddr, BigInt(now + 3600), false, 'demo social iou', 'general')
  );
  console.log('social after mint:', formatIOU(await iouRead.getIOU(socialId)));

  await waitTx('social accept', iouAsFulfiller.acceptIOU(socialId));
  console.log('social after accept:', formatIOU(await iouRead.getIOU(socialId)));

  await waitTx('social settle', iouAsCreator.settleSocialIOU(socialId, 2));
  console.log('social after settle:', formatIOU(await iouRead.getIOU(socialId)));

  // Flow B: Bounty IOU (collateral > 0)
  console.log('\n=== Flow B: Bounty IOU ===');
  const bountyId = await iouRead.nextTokenId();
  await waitTx(
    'bounty mint',
    iouAsCreator.mintIOU(
      fulfillerAddr,
      BigInt(now + 7200),
      false,
      'demo bounty iou',
      'bugfix',
      { value: ethers.parseEther('0.01') }
    )
  );
  console.log('bounty after mint:', formatIOU(await iouRead.getIOU(bountyId)));

  await waitTx('bounty accept', iouAsFulfiller.acceptIOU(bountyId));
  console.log('bounty after accept:', formatIOU(await iouRead.getIOU(bountyId)));

  await waitTx('bounty settle', iouAsCreator.settleBountyIOU(bountyId, 1));
  console.log('bounty after settle:', formatIOU(await iouRead.getIOU(bountyId)));

  // Reputation checks
  const creatorRep = await reputationRead.getReputation(creatorAddr);
  const fulfillerRep = await reputationRead.getReputation(fulfillerAddr);
  console.log('\nreputation snapshot:', {
    creator: {
      currentRep: toInt(creatorRep[0], 0),
      lifetimeRep: toInt(creatorRep[1], 0),
      lockedRep: toInt(creatorRep[2], 0),
    },
    fulfiller: {
      currentRep: toInt(fulfillerRep[0], 0),
      lifetimeRep: toInt(fulfillerRep[1], 0),
      lockedRep: toInt(fulfillerRep[2], 0),
    },
  });

  await printInteractionRecord(reputationRead, creatorAddr, fulfillerAddr);
  const nowOnChain = await provider.getBlock('latest');
  const expectedMinTs = toInt(nowOnChain?.timestamp, 0) - 1;
  await maybeCheckInteractionSummaryApi([normalizeAddress(creatorAddr), normalizeAddress(fulfillerAddr)], expectedMinTs);

  console.log('\nDemo completed successfully.');
}

main().catch((err) => {
  console.error('Demo script error:', err);
  process.exit(1);
});

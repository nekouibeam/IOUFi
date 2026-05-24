import { ethers } from 'ethers';
import addressesByChain from '../contracts/addresses.json';
import IOUNFTAbi from '../contracts/IOUNFT.json';
import ReputationLedgerAbi from '../contracts/ReputationLedger.json';
import TreasuryAbi from '../contracts/Treasury.json';
import SDGsDAOAbi from '../contracts/SDGsDAO.json';

export { addressesByChain };

function normalizeAbi(artifact) {
  if (Array.isArray(artifact)) return artifact;
  if (artifact && Array.isArray(artifact.abi)) return artifact.abi;
  return [];
}

const abiByName = {
  IOUNFT: normalizeAbi(IOUNFTAbi),
  ReputationLedger: normalizeAbi(ReputationLedgerAbi),
  Treasury: normalizeAbi(TreasuryAbi),
  SDGsDAO: normalizeAbi(SDGsDAOAbi),
};

async function getAddresses() {
  return addressesByChain ?? {};
}

async function getChainScopedAddresses() {
  const addresses = await getAddresses();
  const provider = await getProvider();
  const network = await provider.getNetwork();
  const chainId = String(network.chainId);

  if (addresses && typeof addresses === 'object' && addresses[chainId]) {
    return addresses[chainId];
  }

  return addresses;
}

export async function getProvider() {
  if (!window.ethereum) throw new Error('No injected wallet');
  return new ethers.BrowserProvider(window.ethereum);
}

export async function connectWallet() {
  const provider = await getProvider();
  await provider.send('eth_requestAccounts', []);
  return provider;
}

async function getSigner() {
  const provider = await getProvider();
  return provider.getSigner();
}

export async function getContract(name) {
  const addresses = await getChainScopedAddresses();
  const addr = addresses[name];
  if (!addr) throw new Error(`${name} address not found in contracts/addresses.json`);
  const abi = abiByName[name] ?? [];
  const signer = await getSigner();
  return new ethers.Contract(addr, abi, signer);
}

export async function mintIOU({ fulfiller, deadlineTs, transferable = false, lifetimeRepReward = 0, valueEth = '0' }) {
  const c = await getContract('IOUNFT');
  const value = valueEth && valueEth !== '0' ? ethers.parseEther(valueEth) : 0n;
  return c.mintIOU(fulfiller, BigInt(deadlineTs), transferable, BigInt(lifetimeRepReward), { value });
}

export async function acceptIOU(tokenId) {
  const c = await getContract('IOUNFT');
  return c.acceptIOU(BigInt(tokenId));
}

export async function settleSocialIOU(tokenId, rating) {
  const c = await getContract('IOUNFT');
  return c.settleSocialIOU(BigInt(tokenId), rating);
}

export async function settleBountyIOU(tokenId, rating) {
  const c = await getContract('IOUNFT');
  return c.settleBountyIOU(BigInt(tokenId), rating);
}

export async function refundPending(tokenId) {
  const c = await getContract('IOUNFT');
  return c.refundPending(BigInt(tokenId));
}

export async function timeoutClaim(tokenId) {
  const c = await getContract('IOUNFT');
  return c.timeoutClaim(BigInt(tokenId));
}

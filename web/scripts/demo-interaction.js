//此腳本待修正
import fs from 'fs';
import { ethers } from 'ethers';

async function main() {
  const provider = new ethers.JsonRpcProvider('http://127.0.0.1:8545');
  const addresses = JSON.parse(fs.readFileSync(new URL('../src/contracts/addresses.json', import.meta.url)));
  const iouJson = JSON.parse(fs.readFileSync(new URL('../src/contracts/IOUNFT.json', import.meta.url)));
  const abi = iouJson.abi;
  const chainId = Object.keys(addresses)[0] || '31337';
  const iouAddr = addresses[chainId].IOUNFT;

  const accounts = await provider.send('eth_accounts', []);
  const creatorAddr = accounts[0];
  const fulfillerAddr = accounts[1];
  const creator = provider.getSigner(creatorAddr);
  const fulfiller = provider.getSigner(fulfillerAddr);
  console.log('Creator:', creatorAddr);
  console.log('Fulfiller:', fulfillerAddr);

  const iouCreator = new ethers.Contract(iouAddr, abi, creator);
  const iouFulfiller = new ethers.Contract(iouAddr, abi, fulfiller);
  const iouProvider = new ethers.Contract(iouAddr, abi, provider);

  const nextIdBefore = await iouProvider.nextTokenId();
  console.log('nextTokenId (before):', nextIdBefore.toString());

  const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
  console.log('Minting IOU (paying 0.01 ETH collateral) via eth_sendTransaction...');
  const mintData = iouProvider.interface.encodeFunctionData('mintIOU', [fulfillerAddr, deadline, false, 100]);
  const mintValue = '0x' + ethers.parseEther('0.01').toString(16);
  const mintHash = await provider.send('eth_sendTransaction', [
    { from: creatorAddr, to: iouAddr, data: mintData, value: mintValue }
  ]);
  console.log('mint tx hash:', mintHash);
  const mintRec = await provider.waitForTransaction(mintHash);
  console.log('mint mined, block:', mintRec.blockNumber);

  const tokenId = nextIdBefore;
  console.log('Minted tokenId:', tokenId.toString());

  const iouData = await iouProvider.getIOU(tokenId);
  console.log('IOU data after mint:', iouData);

  console.log('Calling acceptIOU from fulfiller via eth_sendTransaction...');
  const acceptData = iouProvider.interface.encodeFunctionData('acceptIOU', [tokenId]);
  const acceptHash = await provider.send('eth_sendTransaction', [
    { from: fulfillerAddr, to: iouAddr, data: acceptData }
  ]);
  console.log('accept tx hash:', acceptHash);
  await provider.waitForTransaction(acceptHash);
  console.log('Accepted.');
  const iouAfterAccept = await iouProvider.getIOU(tokenId);
  console.log('IOU after accept:', iouAfterAccept);

  console.log('Settling (settleSocialIOU) from creator with rating 5 via eth_sendTransaction...');
  const settleData = iouProvider.interface.encodeFunctionData('settleSocialIOU', [tokenId, 5]);
  const settleHash = await provider.send('eth_sendTransaction', [
    { from: creatorAddr, to: iouAddr, data: settleData }
  ]);
  console.log('settle tx hash:', settleHash);
  const settleRec = await provider.waitForTransaction(settleHash);
  console.log('settled, block:', settleRec.blockNumber);

  const final = await iouProvider.getIOU(tokenId);
  console.log('Final IOU:', final);
}

main().catch((err) => {
  console.error('Demo script error:', err);
  process.exit(1);
});

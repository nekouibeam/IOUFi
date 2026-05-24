import fs from 'fs';
import { ethers } from 'ethers';

/*
  Demo script (Node) — 中文註解說明

  目的：在本地 Anvil 節點上自動化驗證 IOUNFT 的完整流程：
    1) 讀取前端的部署地址與 ABI
    2) 使用 Anvil 解鎖的帳戶（eth_accounts）當作 creator/fulfiller
    3) 送出 mintIOU (payable) 交易並等待打包
    4) 呼叫 acceptIOU
    5) 呼叫 settleSocialIOU
    6) 在每個階段以 getIOU 檢查合約狀態

  注意事項：
    - 本腳本使用 `provider.send('eth_sendTransaction', [...])` 與 `eth_accounts`，
      這需要節點（Anvil）提供已解鎖帳戶；此方式不適用於 MetaMask 瀏覽器環境。
    - 若要在瀏覽器進行同樣流程，前端需透過 injected signer 與使用者簽名。
    - 本腳本主要用於 CI / 本地快速驗證合約邏輯與 ABI 正確性。

  測試重點（此腳本驗證）：
    - ABI 與地址是否正確讀取。
    - mintIOU 在鏈上被接收並改變合約狀態（檢查 nextTokenId 與 getIOU）。
    - acceptIOU 能讓 IOU 由 Pending 轉為 Active（或設定 fulfiller）。
    - settleSocialIOU（social 路徑）在 creator 呼叫下能完成結算流程。
    - 交易被礦工接受與打包（使用 waitForTransaction 檢查）。
*/

async function main() {
  // 建立到本地 Anvil 的 JSON-RPC provider
  const provider = new ethers.JsonRpcProvider('http://127.0.0.1:8545');

  // 讀取前端同步後的合約地址與 ABI 檔案
  // addresses.json 以 chainId 作為最外層鍵，內含多個合約地址
  const addresses = JSON.parse(fs.readFileSync(new URL('../src/contracts/addresses.json', import.meta.url)));
  // 讀取 IOUNFT 的 ABI JSON（artifact）並從中取出 ABI 陣列
  const iouJson = JSON.parse(fs.readFileSync(new URL('../src/contracts/IOUNFT.json', import.meta.url)));
  const abi = iouJson.abi;
  const chainId = Object.keys(addresses)[0] || '31337';
  const iouAddr = addresses[chainId].IOUNFT;

  // 取得節點解鎖（unlocked）的帳戶列表
  // 注意：此方法依賴 Anvil 自動解鎖帳戶；在真實節點或 MetaMask 下行為不同
  const accounts = await provider.send('eth_accounts', []);
  // 使用第一個帳戶做為 creator（發起者）、第二個做為 fulfiller（履行者）
  const creatorAddr = accounts[0];
  const fulfillerAddr = accounts[1];
  // 透過 provider 取得 signer 物件，以便後續建立 signer-bound contract
  const creator = provider.getSigner(creatorAddr);
  const fulfiller = provider.getSigner(fulfillerAddr);
  console.log('Creator:', creatorAddr);
  console.log('Fulfiller:', fulfillerAddr);

  const iouCreator = new ethers.Contract(iouAddr, abi, creator);
  const iouFulfiller = new ethers.Contract(iouAddr, abi, fulfiller);
  const iouProvider = new ethers.Contract(iouAddr, abi, provider);

  // 在 mint 前查詢 nextTokenId，作為本次 mint 將使用的 tokenId
  const nextIdBefore = await iouProvider.nextTokenId();
  console.log('nextTokenId (before):', nextIdBefore.toString());

  // 設定一小時後到期（deadline 是 UNIX timestamp）
  const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
  console.log('Minting IOU (paying 0.01 ETH collateral) via eth_sendTransaction...');

  // 使用 Contract Interface 將 mintIOU() 的參數 ABI encode 成 calldata
  // 參數順序與合約定義相符：fulfiller, deadline, transferable, lifetimeRepReward
  const mintData = iouProvider.interface.encodeFunctionData('mintIOU', [fulfillerAddr, deadline, false, 100]);

  // 將 ETH 數值轉成 16 進位的 hex string 作為 tx.value
  const mintValue = '0x' + ethers.parseEther('0.01').toString(16);

  // 由於我們使用的是本地節點（Anvil）且帳戶已解鎖，直接呼叫 eth_sendTransaction
  // 注意：在有錢包（MetaMask）時應使用 signer.sendTransaction 或 contract.connect(signer).mintIOU(...)
  const mintHash = await provider.send('eth_sendTransaction', [
    { from: creatorAddr, to: iouAddr, data: mintData, value: mintValue }
  ]);
  console.log('mint tx hash:', mintHash);

  // 等待交易被礦工（Anvil）打包並回傳交易 receipt
  const mintRec = await provider.waitForTransaction(mintHash);
  console.log('mint mined, block:', mintRec.blockNumber);

  // 由於 nextTokenId 在 mint 前回傳的值為本次 tokenId，直接使用它
  const tokenId = nextIdBefore;
  console.log('Minted tokenId:', tokenId.toString());

  // 讀取合約上的 IOU 資料以驗證 mint 結果（creator、fulfiller、collateral、state 等）
  const iouData = await iouProvider.getIOU(tokenId);
  console.log('IOU data after mint:', iouData);

  console.log('Calling acceptIOU from fulfiller via eth_sendTransaction...');
  // encode 並送出 acceptIOU，由 fulfiller 帳戶呼叫（或由任意帳戶成為 fulfiller）
  const acceptData = iouProvider.interface.encodeFunctionData('acceptIOU', [tokenId]);
  const acceptHash = await provider.send('eth_sendTransaction', [
    { from: fulfillerAddr, to: iouAddr, data: acceptData }
  ]);
  console.log('accept tx hash:', acceptHash);

  // 等待 accept 的交易被打包
  await provider.waitForTransaction(acceptHash);
  console.log('Accepted.');

  // 再次查詢 IOU 狀態以確認已從 Pending 變成 Active
  const iouAfterAccept = await iouProvider.getIOU(tokenId);
  console.log('IOU after accept:', iouAfterAccept);

  console.log('Settling (settleSocialIOU) from creator with rating 5 via eth_sendTransaction...');
  // settleSocialIOU 由 creator 呼叫；此路徑要求 collateral == 0（social IOU）
  const settleData = iouProvider.interface.encodeFunctionData('settleSocialIOU', [tokenId, 5]);
  const settleHash = await provider.send('eth_sendTransaction', [
    { from: creatorAddr, to: iouAddr, data: settleData }
  ]);
  console.log('settle tx hash:', settleHash);

  // 等待結算交易被打包
  const settleRec = await provider.waitForTransaction(settleHash);
  console.log('settled, block:', settleRec.blockNumber);

  const final = await iouProvider.getIOU(tokenId);
  console.log('Final IOU:', final);
}

main().catch((err) => {
  console.error('Demo script error:', err);
  process.exit(1);
});

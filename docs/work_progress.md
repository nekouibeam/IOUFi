# IOUFi 工作進度

## 1. 專案系統架構簡介

IOUFi 是一個以 Web3 為核心的 DApp 原型，目標是把 IOU（欠條）流程做成可上鏈、可追蹤、可治理的 NFT 系統。整體架構分成三層：

### (1) Solidity 智能合約層

位於 `solidity/`，負責所有鏈上邏輯。

- `IOUNFT.sol`：核心合約，負責 mint IOU NFT、接受 IOU、結算、退款與逾時處理。
- `ReputationLedger.sol`：管理聲譽資料，包含 current / lifetime / locked reputation，並支援投票權計算。
- `Treasury.sol`：管理金庫資金，接收與釋出 ETH。
- `SDGsDAO.sol`：簡易 DAO 合約，使用聲譽作為投票權並可執行資金分配。
- `interfaces/IReputationLedger.sol`：聲譽合約介面，供其他合約解耦使用。

這一層同時使用 OpenZeppelin 的 `ERC721`、`Ownable`、`ReentrancyGuard` 來降低重複實作與安全風險。

### (2) 部署與同步工具層

位於 `scripts/` 與 `solidity/script/`，負責本地部署、合約同步與測試流程。

- `solidity/script/DeployBroadcast.s.sol`：Foundry 部署腳本。
- `scripts/deploy-and-sync.js`：一鍵部署並同步 ABI 與地址到前端。
- `scripts/sync-contracts.js`：將 `solidity/out/` 的 ABI 複製到 `web/src/contracts/`，並更新 `addresses.json`。
- `web/scripts/demo-interaction.js`：使用本地 Anvil 驗證 mint → accept → settle 流程的 demo 腳本。

### (3) 前端應用層

位於 `web/`，負責使用者介面與錢包互動。

- `src/App.jsx`：主要頁面，提供錢包連線、mint、accept、settle、refund、timeout 等操作。
- `src/api/contract.js`：統一管理 ethers provider、signer、ABI 與合約呼叫。
- `src/contracts/*.json`：前端使用的 ABI 與鏈上地址資料。
- `src/pages/`：各功能頁面元件，例如 CreateIOU、Marketplace、DAO、Treasury。

前端會根據錢包所連接的 chain id 自動讀取對應合約地址，因此可同時支援本地 Anvil 與未來測試網。

## 2. 目前為止的實作內容彙報

### 已完成的核心功能

1. 已完成 `IOUNFT` 核心合約實作。
   - 支援 IOU NFT mint。
   - 支援 accept / settle / refund / timeout 流程。
   - 已拆分 social IOU 與 bounty IOU 兩種結算路徑。

2. 已完成聲譽與治理相關合約。
   - `ReputationLedger.sol` 可記錄聲譽變化、鎖定與解鎖聲譽。
   - `SDGsDAO.sol` 可依聲譽投票並驅動金庫資金釋出。
   - `Treasury.sol` 可作為資金集中管理與 DAO 出款的金庫。

3. 已完成部署與同步流程。
   - 可透過 Foundry / Anvil 在本地鏈部署合約。
   - 可自動同步 ABI 與地址到前端。
   - 已將部署結果寫入 `web/src/contracts/addresses.json`。

4. 已完成前端 MVP 串接。
   - 可連接 MetaMask。
   - 可依 chain id 載入正確地址與 ABI。
   - 可從頁面發送 mint、accept、settle、refund、timeout 等交易。

5. 已完成本地端功能驗證。
   - 成功用 demo 腳本完成 mint → accept → settle 的完整流程。
   - 成功在 Anvil 上送出交易並確認區塊落地。
   - 已排查並修正前端 ABI 載入問題，讓 `ethers.Contract` 可正常建立。

### 已完成的文件整理

1. 已新增 `docs/solidity_structure.md`，說明 `solidity/` 目錄與檔案職責。
2. 已新增 `docs/web_structure.md`，說明 `web/` 目錄與檔案職責。
3. 已新增 `docs/openzeppelin_usage.md`，說明 OpenZeppelin 在本專案中的使用方式。

### 目前的整體狀態

目前專案已具備「可部署、可同步、可前端互動、可驗證流程」的最小可行版本。接下來若要繼續深化，建議方向會是：

- 補齊更完整的測試案例。
- 強化前端錯誤提示與狀態顯示。
- 增加 README 與文件中對各流程的圖示與操作範例。
- 進一步整理 DAO / Treasury 的治理流程與權限設計。

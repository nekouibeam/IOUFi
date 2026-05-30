# IOUNFT 合約結案申請流程調整規格

## IOUData v2 重構主方案

本文件目前以這一版為準。舊段落中以 `lifetimeRepReward` 為核心、或以單一 `decayedRepBase` 為核心的說明，視為歷史記錄與討論痕跡，不再作為最終實作依據。

### 核心判斷

你現在的設計已經不是「雙方共用一個固定總 rep pool」的模型，而是：

- `creator` 與 `fulfiller` 各自有自己的預設 reward 上限
- 預設 reward 只會受到 pairwise 衰減規則影響
- 最終發放還會再乘上評分係數

因此，`IOUData` 不應再保留 `lifetimeRepReward` 作為唯一來源，應改成直接儲存兩個「已衰減的基準值」：

- `decayedCreatorRepBase`
- `decayedFulfillerRepBase`

這兩個欄位在 mint 時就先算好，後續 accept / confirmClose 都只使用這兩個值做比例計算，不再重算衰減。

### 建議的新 `IOUData` 結構

建議 `IOUData` 改為以下欄位組合：

- `address creator`
- `address fulfiller`
- `uint256 collateral`
- `State state`
- `uint256 createdAt`
- `uint256 deadline`
- `string description`
- `string serviceType`
- `uint256 decayedCreatorRepBase`
- `uint256 decayedFulfillerRepBase`
- `bool transferable`
- `bool unhappyClose`
- `bool closeRequested`
- `uint256 closeRequestedAt`
- `bool repPreAwarded`
- `uint256 repPreAwardedAmount`

### 固定預設 reward matrix

你目前的預設值是寫死的，不再來自使用者輸入：

- Social IOU：`creator = 10`, `fulfiller = 8`
- Bounty IOU：`creator = 8`, `fulfiller = 10`

mint 時就先依 pairwise 衰減規則分別算出：

- `decayedCreatorRepBase = computeDecayedAmount(rawCreatorBase, creator, fulfiller)`
- `decayedFulfillerRepBase = computeDecayedAmount(rawFulfillerBase, fulfiller, creator)`

### 目前已確認的 Social IOU 數字示範

假設建立後：

- `decayedCreatorRepBase = 10`
- `decayedFulfillerRepBase = 8`

則流程如下：

#### Step 1: `acceptIOU`

- `preAward = floor(decayedCreatorRepBase * 5 / 10) = floor(10 * 5 / 10) = 5`
- `iou.repPreAwarded = true`
- `iou.repPreAwardedAmount = 5`
- `reputationLedger.awardRep(A, 5, B)`
- emit `ReputationChanged(A, 5, 5, 0)`

#### Step 2a: `confirmClose(rating = 2)`

- creator final award = `floor(decayedCreatorRepBase * 5 / 10) = floor(10 * 5 / 10) = 5`
- fulfiller final award = `decayedFulfillerRepBase= 8`
- `reputationLedger.awardRep(A, 5, B)`
- `reputationLedger.awardRep(B, 8, A)`
- emit `ReputationChanged(A, 5, 5, 0)`
- emit `ReputationChanged(B, 8, 8, 0)`
- `iou.state = Settled`

#### Step 2b: `confirmClose(rating = 1)`

- creator final award = `floor(decayedCreatorRepBase * 3 / 10) = floor(10 * 3 / 10) = 3`
- fulfiller final award = `floor(decayedFulfillerRepBase * 6 / 10) = floor(8 * 6 / 10) = 4`
- `reputationLedger.awardRep(B, 4, A)`
- `reputationLedger.awardRep(A, 3, B)`
- emit `ReputationChanged(B, 4, 4, 0)`
- emit `ReputationChanged(A, 3, 3, 0)`
- `iou.state = Settled`

#### Step 2c: `confirmClose(rating = 0)`

- creator final award = `floor(decayedCreatorRepBase * 1 / 10) = floor(10 * 1 / 10) = 1`
- fulfiller final award = `0`
- fulfiller 會被扣 1 currentRep
- `reputationLedger.awardRep(A, 1, B)`
- `reputationLedger.slashRep(B, 1)`
- emit `ReputationChanged(A, 1, 1, 0)`
- emit `ReputationChanged(B, -1, 0, 0)`
- `iou.unhappyClose = true`
- `iou.state = Settled`

### 這次重構的設計重點

1. `lifetimeRepReward` 刪除，不再使用單一總額欄位。
2. `decayedCreatorRepBase` / `decayedFulfillerRepBase` 是 mint 時一次算好的固定基準值。
3. accept / confirmClose 只做比例乘法，不再重算衰減。
4. 這樣可以讓 Social / Bounty 兩種 IOU 各自擁有不同的 reward 上限與評分配方。

---

## 需要修改的檔案清單

下面是因 `IOUData` 結構變更後，預期需要修改的檔案。這份清單以「必改」與「通常會跟著改」區分，方便你排工。

### Solidity 層

- `solidity/src/IOUNFT.sol`
- `solidity/test/IOUNFT.t.sol`
- `solidity/test/ReputationRules.t.sol`
- `solidity/test/TimeoutRefund.t.sol`
- `solidity/script/deploy.s.sol`
- `solidity/script/DeployBroadcast.s.sol`

### Sync / 部署腳本

- `scripts/deploy-and-sync.js`
- `scripts/sync-contracts.js`

### Web 前端

- `web/src/api/contract.js`
- `web/src/api/userIous.js`
- `web/src/api/multicall.js`
- `web/src/App.jsx`
- `web/src/pages/CreateIOU.jsx`
- `web/src/pages/AcceptIOU.jsx`
- `web/src/pages/Marketplace.jsx`
- `web/src/pages/UserIous.jsx`
- `web/src/pages/IOUDetail.jsx`
- `web/src/contracts/IOUNFT.json`（由 sync 重新產生）
- `web/src/contracts/addresses.json`（若重新部署地址會變）

### Services / Indexer

- `services/indexer/schema.sql`
- `services/indexer/index.js`
- `services/indexer/backfill.js`
- `services/api/index.js`

### 可能需要更新的資料檔 / 產物

- `services/indexer/data/indexer.db`（重建或 migration 後資料會變）
- `web/src/contracts/IOUNFT.json`（ABI 更新後同步產生）
- `web/src/contracts/addresses.json`（若部署新地址）

### 需要特別注意的欄位使用點

- 所有還在讀 `lifetimeRepReward` 的地方，都要改成讀 `decayedCreatorRepBase` / `decayedFulfillerRepBase`
- 所有依賴 `r[8] / r[9] / r[10]` 這類 positional tuple index 的地方，要重新對齊新的 `IOUData` 回傳結構
- 所有把 `unhappyClose` 當成唯一定義的地方，要檢查是否也需要讀 `closeRequested`、`repPreAwarded`、`decayed*Base`

### 目前已找到的直接引用點

- `web/src/api/contract.js`：`mintIOU(...)` 目前還在傳 `lifetimeRepReward`
- `web/src/api/userIous.js`：還在用 `r[8] / r[9] / r[10]` 讀舊 tuple
- `web/src/App.jsx`：舊的 mint form 還有 `reward`
- `web/src/pages/CreateIOU.jsx`：目前固定送 `lifetimeRepReward`
- `web/src/pages/UserIous.jsx`：顯示卡片時仍依舊資料格式組裝
- `services/indexer/index.js`：DB schema 與 token snapshot 還是舊欄位
- `services/indexer/backfill.js`：backfill 還在回填舊欄位
- `services/api/index.js`：查詢 API 還在 select 舊欄位
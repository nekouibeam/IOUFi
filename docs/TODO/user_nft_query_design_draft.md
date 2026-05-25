# 使用者 NFT 管理查詢設計草案

## 目標

讓前端可以輸入一個使用者帳戶地址，查詢所有與該地址有關的 IOUNFT，並且依角色與狀態分類顯示。

這裡的「有關」至少包含：

- 我是 `creator`
- 我是 `fulfiller`
- 我是目前持有人
- 我是歷史相關方（已結清、已取消、已逾期）

## 目前狀況

現有合約已提供單筆 IOU 查詢，但沒有提供依地址列出清單的 API。

### 現有讀取能力

- `IOUNFT.getIOU(tokenId)`
- `IOUNFT.ious(tokenId)`
- `ReputationLedger.getReputation(account)`
- `ReputationLedger.getVotingPower(account)`
- `SDGsDAO.proposals(proposalId)`

### 目前缺口

- 沒有 `getIOUsByUser(address)`
- 沒有 `getIOUsByCreator(address)`
- 沒有 `getIOUsByFulfiller(address)`
- 沒有 `getIOUsByOwner(address)`
- 沒有事件索引層來快速查地址相關的 token

## 建議的查詢架構

### 方案 A：鏈下索引 + 鏈上單筆讀取

這是目前最實際、最容易擴充的做法。

#### 做法

1. 前端或索引服務先掃描 `IOUCreated`, `IOUAccepted`, `IOUSettled`, `IOURefunded` 等事件。
2. 用事件資料建立一個「地址 → tokenId 清單」的索引。
3. 使用者輸入地址後，先從索引拿 tokenId list。
4. 再用 `getIOU(tokenId)` 或 `ious(tokenId)` 補齊詳細資料。

#### 優點

- 不需要修改 ERC-721 核心設計。
- 可以支援歷史資料與多條件篩選。
- 速度比單純鏈上遍歷好。

#### 缺點

- 需要額外索引層。
- 若只靠前端掃事件，資料量大時會慢。

### 方案 B：合約新增地址查詢函式

如果想把查詢能力直接放在鏈上，可以加 helper functions。

#### 可考慮新增

- `getIOUsByCreator(address account)`
- `getIOUsByFulfiller(address account)`
- `getIOUsByParty(address account)`
- `getIOUsByStatus(address account, State state)`

#### 優點

- 前端可以直接呼叫。
- 不必先寫完整索引服務。

#### 缺點

- 合約要維護額外陣列或索引映射。
- 若 token 數量成長，on-chain 掃描成本會上升。
- 目前 `IOUNFT` 沒有 Enumerable，所以不能直接用 owner 查完整列表。

### 方案 C：使用 ERC721Enumerable

如果要支援「某地址目前持有哪些 token」這種持有者視圖，最標準的方法是改成 Enumerable 版本。

#### 優點

- 可直接查某地址的持有 token。
- 適合做「我的 NFT」頁面。

#### 缺點

- 需要改動合約繼承與部署。
- 仍然不夠回答「歷史上與我有關」這個問題，因為它只看現在持有狀態。

## 建議的資料分類

前端顯示時建議分成四類：

1. `Created by me`
   - 我是 creator
   - 代表我發出的人情債

2. `Owed to me`
   - 我是 fulfiller 或目前持有人
   - 代表別人欠我的 IOU

3. `Owed by me`
   - 我是 fulfiller，但不是持有人
   - 代表我需要履行的人情

4. `History`
   - 已結清 / 已取消 / 已逾期 / 已違約
   - 用來做紀錄與追蹤

## 推薦資料結構

### 查詢輸入

```ts
{
  address: string;
  includeHistory: boolean;
  states?: number[];
}
```

### 查詢輸出

```ts
{
  account: string;
  created: IOUItem[];
  owedToMe: IOUItem[];
  owedByMe: IOUItem[];
  history: IOUItem[];
}
```

### `IOUItem`

```ts
{
  tokenId: string;
  creator: string;
  fulfiller: string;
  collateral: string;
  state: 'Pending' | 'Active' | 'Settled' | 'Cancelled';
  createdAt: number;
  deadline: number;
  lifetimeRepReward: string;
  transferable: boolean;
  unhappyClose: boolean;
}
```

## 建議的前端查詢流程

1. 使用者輸入帳戶地址。
2. 前端先呼叫索引器或本地快取，取得 tokenId 清單。
3. 依 tokenId 逐筆呼叫 `getIOU(tokenId)`。
4. 依 `creator` / `fulfiller` / `state` 分類。
5. 顯示為三到四個區塊：
   - 我發出的
   - 欠我的
   - 我欠別人的
   - 歷史紀錄

## 建議的最小 API 擴充

若短期內只想補足前端查詢功能，建議先新增以下 read helpers：

- `getIOUsByCreator(address)`
- `getIOUsByFulfiller(address)`
- `getIOUIdsByOwner(address)`
- `getIOUsByStatus(address, uint8 state)`

若想長期維護，建議改成：

- 鏈上保留單筆資料與事件
- 鏈下 indexer 處理地址清單
- 前端只負責呈現與細節查詢

## 目前專案的限制

- `IOUNFT` 只有 `mapping(uint256 => IOUData) public ious`，沒有地址索引。
- `ERC721` 目前不是 enumerable 版本。
- 前端 `web/src/api/contract.js` 目前只有單筆寫入 wrapper，還沒有地址查詢 wrapper。

## 結論

如果目標是讓使用者輸入地址後看到「跟自己有關的所有 NFT」，最合理的方案是：

- 短期：事件索引 + `getIOU(tokenId)` 補資料
- 中期：加 read helpers，讓前端能按 creator / fulfiller 查詢
- 長期：若真的需要持有者枚舉，再評估 ERC721Enumerable 或完整 indexer


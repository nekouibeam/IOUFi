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

## 方案 A（鏈下索引 + 鏈上單筆讀取）

本草案以方案 A 為主：

- 搜尋、過濾、排序交給鏈下索引器
- 鏈上保留權威狀態與單筆查詢
- 前端負責組裝結果與顯示

### 系統分工

1. 鏈上合約（On-chain）
   - 儲存 IOU 的真實狀態（`ious(tokenId)` / `getIOU(tokenId)`）
   - 在狀態變更時發送事件（至少包含 `IOUCreated`, `IOUAccepted`, `IOUSettled`, `IOURefunded`）
   - 若要正確追蹤目前持有人，索引器還需監聽 ERC721 `Transfer` 事件

2. 鏈下索引服務（Off-chain Indexer）
   - 長期監聽區塊與事件
   - 維護地址與 token 的關聯資料庫
   - 提供查詢 API（REST 或 GraphQL）給前端

3. 前端（Frontend）
   - 以地址向索引器查 tokenId 清單
   - 依需求補打鏈上 `getIOU(tokenId)` 做權威驗證
   - 將資料分組呈現（我發出的、欠我的、我欠別人的、歷史）

### 實際運作流程

#### 階段一：背景同步（持續執行）

1. 合約在每次 IOU 狀態變更時寫入事件 Log。
2. 索引器消費事件，更新資料庫。
3. 索引器建立關聯：
   - `creator -> tokenId`
   - `fulfiller -> tokenId`
   - `owner -> tokenId`（透過 `Transfer`）
4. 索引器記錄可追蹤欄位：`blockNumber`, `txHash`, `logIndex`, `updatedAt`，用於去重與排序。

#### 階段二：即時查詢（使用者操作）

1. 使用者輸入地址。
2. 前端向索引器查詢該地址的 tokenId 清單（可附帶狀態、分頁、排序條件）。
3. 前端拿到 tokenId 陣列後，批次呼叫鏈上 `getIOU(tokenId)`（建議批次/分頁，不要一次全打）。
4. 前端依欄位 `creator`, `fulfiller`, `state` 分類後渲染。

### 為什麼方案 A 適合目前專案

- 合約不用新增複雜迴圈與索引映射，降低 Gas 與安全風險。
- 查詢可以做分頁、關鍵字、狀態篩選，不消耗鏈上資源。
- 即使未來 token 量增長，查詢壓力主要在鏈下資料庫，而非鏈上合約。

### 一致性策略（建議）

- 快速模式：先顯示索引器結果，再背景以 `getIOU(tokenId)` 校驗。
- 嚴謹模式：重要畫面（例如結算前確認）以鏈上資料為最終準則。
- 索引器延遲：若發現剛發生的交易尚未被索引，前端顯示「同步中」提示。

### 索引器最小資料表（建議）

```sql
-- token 主表
tokens(
  token_id bigint primary key,
  creator text,
  fulfiller text,
  owner text,
  state smallint,
  created_at bigint,
  deadline bigint,
  updated_at timestamptz,
  last_block bigint,
  last_tx_hash text,
  last_log_index integer
)

-- 地址關聯表（可多角色）
address_token_relations(
  account text,
  token_id bigint,
  role text, -- creator | fulfiller | owner | historical_party
  updated_at timestamptz,
  primary key(account, token_id, role)
)
```

### 索引器查詢 API（建議）

```http
GET /api/users/:address/ious?roles=creator,fulfiller,owner&states=0,1,2,3&page=1&pageSize=20
```

回傳範例：

```json
{
  "account": "0x...",
  "tokenIds": [1, 5, 12, 45],
  "total": 4,
  "page": 1,
  "pageSize": 20
}
```

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


這是一份根據最新 MVP 任務清單（扁平化資料庫、Multicall、Cursor 分頁、銷毀狀態處理等優化）全面修訂後的設計草案。

---

# 使用者 NFT 管理查詢設計草案 (v2)

## 目標

讓前端可以輸入一個使用者帳戶地址，查詢所有與該地址有關的 IOUNFT，並且依角色與狀態分類顯示。

這裡的「有關」包含：

* 我是 `creator` (發出者)
* 我是 `fulfiller` (履行者)
* 我是目前持有人 (`owner`)
* 我是歷史相關方（已結清、已取消等）

## 目前狀況與架構決策

現有合約已提供單筆 IOU 查詢 (`IOUNFT.getIOU(tokenId)`)，但缺乏依地址列出清單的 API。

為保持智慧合約輕量化、節省 Gas 成本並提供最強大的查詢彈性，本系統採用「鏈下索引 + 鏈上驗證 (方案 A)」架構。此架構不需修改現有 `IOUNFT` 合約。

## 系統分工與運作流程

### 1. 鏈下索引服務 (Off-chain Indexer)

* **長期監聽區塊事件**：包含 `IOUCreated`, `IOUAccepted`, `IOUSettled`, `IOURefunded`，以及 ERC721 `Transfer` 事件。
* **快取不可變資料**：在建立 `IOUCreated` 索引時，預先快取 `description` 與 `serviceType`，減輕前端負擔。
* **處理銷毀狀態**：監聽 `Transfer` 至 `address(0)` 的事件，標記 `is_burned` 避免出現幽靈資料。
* **提供 API**：提供具備 Cursor-based 分頁的高效查詢端點。

### 2. 前端 (Frontend)

* **獲取清單**：以地址向 API 查詢 tokenId 陣列與精簡摘要。
* **批次驗證**：透過 **Multicall** 批次呼叫鏈上 `getIOU(tokenId)`，確保畫面上呈現的動態狀態為最新權威資料。
* **分類呈現**：將資料分組呈現（我發出的、欠我的、我欠別人的、歷史）。

### 3. 鏈上合約 (On-chain)

* 保持現狀，做為資料狀態的絕對權威，僅在狀態變更時發出 Events。

## 資料庫模型設計 (扁平化架構)

為了極致化查詢效能，採用單一扁平化主表設計，省略關聯表 (JOIN) 操作。

```sql
-- tokens 扁平化主表
CREATE TABLE tokens (
  token_id BIGINT PRIMARY KEY,
  creator TEXT NOT NULL,
  fulfiller TEXT,
  owner TEXT,
  state SMALLINT,
  description TEXT,       -- 不可變資料快取
  service_type TEXT,      -- 不可變資料快取
  is_burned BOOLEAN DEFAULT FALSE, -- 銷毀標記
  created_at BIGINT,
  updated_at TIMESTAMPTZ,
  last_block BIGINT,
  last_tx_hash TEXT,
  last_log_index INTEGER
);

-- 建立必要索引以加速查詢與排序
CREATE INDEX idx_tokens_creator ON tokens(creator);
CREATE INDEX idx_tokens_fulfiller ON tokens(fulfiller);
CREATE INDEX idx_tokens_owner ON tokens(owner);
CREATE INDEX idx_tokens_state ON tokens(state);
CREATE INDEX idx_tokens_created_at ON tokens(created_at DESC);

```

## 查詢 API 規格

採用 Cursor-based 分頁，避免區塊鏈資料即時更新造成的重複或遺漏。

**端點：**
`GET /api/users/:address/ious`

**查詢參數：**

* `roles` (string): `creator,fulfiller,owner,historical`
* `states` (string): `0,1,2,3` (對應 Pending, Active, Settled, Cancelled)
* `cursor` (string): 分頁指標 (例如 `blockNumber_logIndex` 或 `createdAt` 編碼)
* `limit` (number): 單次請求數量 (預設 20)

**回傳範例：**

```json
{
  "account": "0x123...",
  "data": [
    {
      "tokenId": 1,
      "description": "幫忙代購",
      "serviceType": "Shopping",
      "roleMatch": ["creator"]
    },
    {
      "tokenId": 5,
      "description": "修電腦",
      "serviceType": "Tech",
      "roleMatch": ["fulfiller", "owner"]
    }
  ],
  "pagination": {
    "nextCursor": "18456722_15",
    "hasMore": true
  }
}

```

## 建議的資料分類 (前端顯示)

前端取得資料後，依據合約即時 `state` 與角色關係分成四類。
規則優先順序如下：

### History 優先：若 `state` 為 `Settled` 或 `Cancelled`，一律只進入 History。

**History (歷史紀錄)**
* 條件：狀態為已結清 (Settled)、已取消 (Cancelled)。
* 意義：歷史追蹤與信用評價參考。
* 備註：只要進入 History，就不再重複出現在其他三個區塊。

### Active / Pending 類別：若不是 History，則可依角色同時進入多個區塊。

1. **Created by me (我發出的)**
* 條件：我是 creator。
* 意義：我對外發出的人情債。
* 備註：若同時也是 owner，仍可同時出現在 Owed to me。


2. **Owed to me (欠我的)**
* 條件：我是 owner。
* 意義：我持有該 IOU，並可要求履行或依規則進行轉移。
* 備註：若同時也是 creator，仍可同時出現在 Created by me。


3. **Owed by me (我欠別人的)**
* 條件：我是 fulfiller。
* 意義：我是需要提供服務給 owner 的人。
* 備註：若同時也是 creator 或 owner，仍可同時出現在對應區塊。

## 前端實作流程與 UX 設計

1. **發起請求**：使用者輸入地址，前端帶入參數向 `/api/users/:address/ious` 請求資料。
2. **顯示骨架屏 (Skeleton)**：在等待期間顯示載入狀態。
3. **Multicall 補全資料**：取得 `data` 陣列後，前端提取 `tokenId`，並透過 Multicall 合約批次呼叫 `IOUNFT.getIOU(tokenId)`。
4. **比對與渲染**：
* 結合 API 提供的 `description` (靜態) 與 Multicall 回傳的 `state` (動態)。
* 若發現 API 回傳的狀態與鏈上不一致（例如合約已 Settled 但 API 仍顯示 Active），一律**以鏈上狀態為準**，並可於 UI 顯示微小的「同步中」圖示。


5. **分頁載入**：使用者滾動到底部時，使用 `nextCursor` 發起下一次請求。
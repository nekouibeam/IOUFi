# Repository 查詢頁面實作計畫

目標：先以 `indexer / API` 層完成 Repository 查詢頁面所需的 rep 資料能力，避免為了排行榜去改動既有合約介面。

## 需求範圍

- 顯示全體 rep 總覽
- 顯示個人 rep 數據
- 顯示 rep 榜單
- 盡量沿用現有 `ReputationLedger` 的 `ReputationChanged` 事件與 `getReputation` / `getVotingPower` 語意

## 實作策略

### 1. Indexer 先補 rep 事件索引

- 讓 indexer 監聽 `ReputationLedger.ReputationChanged`
- 將每次變動寫入資料表，保留可回放的事件歷史
- 同步維護可直接查詢的彙總資料，避免前端即時計算成本過高

### 2. 新增 rep 相關資料表

- `reputation_accounts`
  - 以 address 為主鍵，存 current / lifetime / locked / voting power 等快取欄位
- `reputation_events`
  - 保留每次 `ReputationChanged` 的事件紀錄，作為重建與稽核來源
- 視需要補 `reputation_stats`
  - 存全體總 rep、活躍帳戶數、排行榜更新時間等聚合資訊

### 3. API 層提供查詢接口

- `GET /reputation/summary`
  - 回傳全體 rep 總覽
- `GET /reputation/:address`
  - 回傳單一帳戶 rep 詳情
- `GET /reputation/leaderboard?limit=...&offset=...`
  - 回傳依指定排序條件的排行榜資料

### 4. 排名規則先定義清楚

- 預設以 `currentRep` 排序
- 同分時以 `lifetimeRep` 或最近更新時間作次排序
- 前端顯示時同時保留 `lockedRep` 與 `votingPower`

### 5. 前端接線

- Repository 頁先串 API，不直接自己掃鏈上事件
- 個人頁面可用錢包地址查自己的 rep
- 榜單支援分頁，避免一次載入全部資料

## 驗證方式

- 補 indexer 單元或整合測試，確認 `ReputationChanged` 會正確更新資料表
- 補 API 測試，確認 summary / profile / leaderboard 的輸出格式
- 前端頁面確認能顯示：全體 rep、個人 rep、榜單列表

## 暫不處理

- 不先改 `ReputationLedger` 合約來支持全鏈上枚舉
- 不先做複雜的即時 on-chain 聚合查詢
- 不先加入額外的投票權計算規則變更

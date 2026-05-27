# 使用者 NFT 管理查詢 MVP 任務清單

這份清單把「方案 A：鏈下索引 + 鏈上單筆讀取」拆成可執行任務，目標是讓前端可以輸入使用者地址，查到與該地址有關的 IOUNFT，並依角色與狀態分類。

## 目標範圍

- 可輸入地址查詢相關 IOUNFT
- 可區分 `creator` / `fulfiller` / `owner` / `history`
- 可支援狀態篩選與分頁
- 查詢細節仍以鏈上 `getIOU(tokenId)` 為準

## 任務 1：Indexer 資料模型與事件同步

### 1.1 定義事件來源

- [ ] 整理 IOUNFT 需要監聽的事件
- [ ] 確認至少包含 `IOUCreated`, `IOUAccepted`, `IOUSettled`, `IOURefunded`
- [ ] 補上 ERC721 `Transfer` 事件，用來追蹤目前持有人
- [ ] 定義 `Transfer` 轉移至 `address(0)` 時的 burn / 無效化規則

### 1.2 設計資料表

- [ ] 建立 `tokens` 主表
- [ ] 記錄 `blockNumber`, `txHash`, `logIndex`, `updatedAt`
- [ ] 定義 token 狀態與角色欄位
- [ ] 以扁平化欄位直接存 `creator`, `fulfiller`, `owner`
- [ ] 為 `creator`, `fulfiller`, `owner`, `state`, `createdAt`, `updatedAt` 建立資料庫索引
- [ ] 新增 `is_burned` / `is_invalid` 標記避免幽靈資料

### 1.3 同步邏輯

- [ ] 撰寫事件 consumer
- [ ] 從區塊高度順序處理事件
- [ ] 以 `txHash + logIndex` 去重
- [ ] 支援鏈重組重播 / 回滾

### 1.4 索引規則

- [ ] `IOUCreated` 時建立 creator 與 fulfiller 關聯
- [ ] `IOUAccepted` 時更新 fulfiller 與 active 狀態
- [ ] `IOUSettled` 時更新 settled 狀態
- [ ] `IOURefunded` 時更新 cancelled 狀態
- [ ] `Transfer` 時更新 owner 關聯
- [ ] `Transfer` 轉移至 zero address 時標記 token 已銷毀
- [ ] 若 IOU 為 burned / invalid，查詢結果需自動排除或標示為不可用

## 任務 2：查詢 API 設計與實作

### 2.1 API 規格

- [ ] 設計 `GET /api/users/:address/ious`
- [ ] 支援 `roles` 參數：`creator`, `fulfiller`, `owner`, `historical_party`
- [ ] 支援 `states` 參數：`Pending`, `Active`, `Settled`, `Cancelled`
- [ ] 優先採用 cursor-based pagination
- [ ] 使用 `cursor` 參數，內容可由 `blockNumber` + `logIndex` 或 `createdAt` 組成
- [ ] 保留 `page` / `pageSize` 僅作兼容或管理端用途

### 2.2 API 回傳格式

- [ ] 回傳 `account`
- [ ] 回傳 `tokenIds`
- [ ] 回傳 `total`, `cursor`, `nextCursor`, `hasMore`
- [ ] 可選擇回傳精簡 token 摘要資料

### 2.3 查詢邏輯

- [ ] 先由資料庫查 tokenId list
- [ ] 依角色與狀態過濾
- [ ] 依 createdAt / updatedAt 排序
- [ ] 預留快取層
- [ ] 分頁查詢需穩定排序，避免新增事件造成重複或遺漏

### 2.4 錯誤處理

- [ ] 無效地址格式回傳 400
- [ ] 找不到資料回傳空陣列
- [ ] 資料庫不可用時回傳 503

## 任務 3：前端串接

### 3.1 新增前端查詢 helper

- [ ] 新增 `getUserIOUs(address, options)`
- [ ] 新增 `getUserIOUSummary(address)`
- [ ] 保留現有 `getIOU(tokenId)` 作為細節補資料
- [ ] 新增 Multicall wrapper 或採用現成 Multicall SDK

### 3.2 前端頁面設計

- [ ] 建立使用者地址輸入欄位
- [ ] 顯示查詢結果區塊
- [ ] 分成 `我發出的`, `欠我的`, `我欠別人的`, `歷史紀錄`
- [ ] 支援狀態篩選與分頁

### 3.3 細節資料補全

- [ ] 對查詢到的 tokenId 以 Multicall 批次補資料
- [ ] 若索引資料與鏈上資料不一致，顯示同步中提示
- [ ] 顯示 `description` 與 `serviceType`
- [ ] 將 `description` 與 `serviceType` 視為不可變資料，優先由索引器預先快取並回傳

### 3.4 UX / loading 狀態

- [ ] 空結果提示
- [ ] 載入中 skeleton / spinner
- [ ] RPC 或 API 錯誤提示
- [ ] 查詢快照與鏈上驗證結果分開顯示

## 任務 4：驗收條件

### 4.1 功能驗收

- [ ] 輸入地址後可以查到該地址相關 IOUNFT
- [ ] 可正確分類 creator / fulfiller / owner / history
- [ ] 可依 state 篩選結果
- [ ] 可正確顯示 `description` 與 `serviceType`
- [ ] burned / invalid token 不會以正常 token 形式出現在清單中

### 4.2 一致性驗收

- [ ] 索引器事件與鏈上 `getIOU(tokenId)` 結果一致
- [ ] 交易完成後 1 個索引刷新週期內可查到最新結果
- [ ] 若鏈上資料更新，前端可透過補查更新畫面

### 4.3 效能驗收

- [ ] 查詢結果可分頁
- [ ] 單次查詢不需要一次載入所有 token 細節
- [ ] 使用 Multicall 後，單頁補資料呼叫數維持在可控範圍
- [ ] 大量 token 時仍能維持可接受回應時間

### 4.4 測試驗收

- [ ] 建立至少一組地址查詢測試資料
- [ ] 測試 creator / fulfiller / owner 三種角色
- [ ] 測試 settled / cancelled / active 三種狀態
- [ ] 測試 address 無資料時的空結果

## 建議實作順序

1. 先做 indexer 與資料表。
2. 再做查詢 API。
3. 接著補前端 helper 與頁面。
4. 最後做驗收與測試。

## 備註

- 合約本身仍以單筆 `getIOU(tokenId)` 作為權威資料來源。
- 若未來需要進一步支援「持有人枚舉」，再評估 ERC721Enumerable 或額外索引欄位。

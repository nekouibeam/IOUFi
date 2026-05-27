# CreateIOU 頁面改版與 Social / Bounty 收件流設計

## 目標

把目前的發放人情債頁面重構成兩個明確分頁：

- Social IOU
- Bounty IOU

並補齊「對方收到通知後確認」的最小可行流程，讓整體資料流與 `mintIOU` / `acceptIOU` 的語意一致。

## 核心原則

1. `creator` 是發放人，會保留在 `IOUData.creator`。
2. NFT 鑄造後的當前持有人由 ERC721 `ownerOf(tokenId)` 決定，不需要另外加 `owner` 欄位到 `IOUData`。
3. `createdAt` 是鑄造當下自動記錄，不是使用者輸入。
4. `deadline` 才是使用者可輸入的日期欄位。
5. `lifetimeRepReward` 是 reputation reward，應固定為 10。
6. Social / Bounty 的分類以 `collateral` 為準：
   - `collateral == 0` -> Social
   - `collateral > 0` -> Bounty

## 一、Social / Bounty 兩個分頁的欄位對應

### 共通欄位

兩個分頁共用：

- `fulfiller`: 對方錢包地址
- `deadline`: 到期日
- `description`: 事件描述
- `serviceType`: 可選的服務類型
- `lifetimeRepReward`: 固定 10
- `transferable`: 前端不提供欄位，送出時固定 `false`

### Social 分頁

- `collateral`: 固定為 0
- `msg.value`: 固定為 0
- `settleSocialIOU(tokenId, rating)` 為主要結算方式
- 不顯示任何可輸入的押金欄位

### Bounty 分頁

- `collateral`: 由使用者輸入或選定
- `msg.value`: 等於使用者輸入的 collateral
- `settleBountyIOU(tokenId, rating)` 為主要結算方式
- 顯示押金欄位與預估 payout / fee 說明

### 欄位文案調整

- `FAVOR 積分價值` 改成 `Reputation reward`
- 數值固定為 `10`
- `發生日期` 改成 `Deadline`
- `createdAt` 由系統在鑄造時自動產生，不要在表單中讓使用者編輯

### 底部提示調整

移除以下提示：

- `NFT 鑄造後：• 受讓人信譽積分 -N/A · 發放人 +N/A`

僅保留 Transfer Fee 提示，並依分頁顯示不同說明：

- Social 分頁：
  - `Transfer Fee: Social IOU transfer policy`
- Bounty 分頁：
  - `Transfer Fee: Bounty IOU transfer policy`

## 二、CreateIOU 頁面改版

### 頁面結構

將目前單頁改為分頁式介面：

- Tab 1: Social IOU
- Tab 2: Bounty IOU

### 表單結構建議

#### Social IOU 表單

- 對方帳戶（fulfiller）
- 人情事件描述
- Deadline
- Service Type
- Reputation reward = 10
- 發放按鈕

#### Bounty IOU 表單

- 對方帳戶（fulfiller）
- 人情事件描述
- Deadline
- Service Type
- Reputation reward = 10
- Collateral
- 發放按鈕

### 互動行為

- Social 表單送出時：
  - `valueEth = '0'`
  - `transferable = false`
  - `lifetimeRepReward = 10`
  - `mintIOU(..., { value: 0 })`
- Bounty 表單送出時：
  - `valueEth = collateral`
  - `transferable = false`
  - `lifetimeRepReward = 10`
  - `mintIOU(..., { value: parseEther(collateral) })`

### 提交後顯示

- 顯示交易 hash
- 顯示已建立的 tokenId
- 顯示當前 token 狀態為 `Pending`
- 若為 Social IOU，提示對方需要到 inbox 按下確認

## 三、recipient inbox 與 accept flow 的最小實作方案

### 目標

讓 fulfiller 能在前端看到「待我確認」的 Social / Bounty IOU，並可直接按鈕接受，完成 `Pending -> Active` 的轉換。

### 最小資料流

1. 發放人 mint IOU。
2. Indexer 監聽 `IOUCreated`.
3. API 回傳 fulfiller 相關的 pending IOU。
4. recipient inbox 顯示通知。
5. 對方按下「確認」後呼叫 `acceptIOU(tokenId)`。
6. 交易成功後狀態變成 `Active`。

### Inbox 最小規格

#### 來源

- 使用 indexer API 查詢：
  - `fulfiller == currentAccount`
  - `state == Pending`

#### 顯示欄位

- tokenId
- creator
- description
- serviceType
- collateral
- deadline
- createdAt
- type: Social / Bounty
- action: `確認`

#### 排序建議

- 先顯示最新建立的 pending IOU
- 以 `createdAt desc` 排序

### Accept flow 最小規格

#### 按鈕文案

- `確認`
- 或 `接受此 IOU`

#### 前端行為

- 呼叫 `acceptIOU(tokenId)`
- 顯示 loading
- 成功後重新拉取 inbox 資料
- 將該筆從 pending 區塊移到 active 區塊

#### 錯誤處理

- 若帳號不是 fulfiller，顯示無權限
- 若該 IOU 已被接受，提示狀態已變更
- 若交易失敗，顯示錯誤訊息

## 四、通知演示方式

### MVP 演示

不先做即時推播，先做頁面輪詢或手動刷新：

- 發放後，recipient inbox 顯示一筆新 pending IOU
- 使用者切換到 inbox 頁面即可看到通知
- 點擊確認後，狀態變為 active

### 進階版演示

若之後要更像「通知」：

- indexer 監聽 `IOUCreated`
- 前端輪詢 API
- 或改成 WebSocket / SSE 推播新增事件

## 五、詳細演示流程（Demo A / Demo B）

本節定義可直接對外展示的最小端到端腳本，使用 Anvil + MetaMask 多帳號。

### 前置條件

- 已啟動本地鏈（Anvil）並完成合約部署。
- 前端連線到正確 chainId 與合約地址。
- Indexer / API 已啟動，且可查詢 pending IOU。
- MetaMask 已匯入至少 4 個帳號：
  - A：creator（發放者）
  - B：Social 指定 fulfiller
  - C、D：Bounty marketplace 接單者

### Demo A（Social）：A 發給 B -> B 在 accept 頁看到並接受

#### A 端操作（CreateIOU / Social 分頁）

1. 以帳號 A 連線網站。
2. 進入 Social 分頁。
3. 輸入 / 選擇：
  - `fulfiller = B`
  - `deadline`（未來時間）
  - `description`
  - `serviceType`（可選）
  - `lifetimeRepReward = 10`（固定）
  - `msg.value = 0`
4. 按下「確認發放」，在 MetaMask 以 A 簽章送出交易。
5. 成功後頁面顯示 tokenId 與交易 hash。

#### B 端操作（Accept 頁）

1. 在同一個網站切換 MetaMask 當前帳號為 B。
2. 重新連線錢包（必要時刷新頁面），確保 signer 已切到 B。
3. 進入 accept/inbox 頁面。
4. 系統查詢條件：
  - `fulfiller == B`
  - `state == Pending`
5. 頁面列出該筆 Social IOU。
6. B 點擊「確認 / 接受此 IOU」，MetaMask 以 B 簽章送出 `acceptIOU(tokenId)`。
7. 交易成功後，狀態 `Pending -> Active`。

#### Demo A 預期結果

- 只有 B 能看到並成功接受該筆 Social IOU。
- A 或其他非指定 fulfiller 帳號在 accept/inbox 頁不會看到該筆 Social IOU；即使手動呼叫 accept 也會被合約拒絕。
- 接受後該筆應從「待確認」清單移除，並出現在 Active 區塊。

### Demo B（Bounty）：A 上架 -> C / D 任一帳號到 marketplace 接單

#### A 端操作（CreateIOU / Bounty 分頁）

1. 以帳號 A 連線網站。
2. 進入 Bounty 分頁。
3. 輸入 / 選擇：
  - `fulfiller = 0x0000000000000000000000000000000000000000`（不指定）
  - `deadline`（未來時間）
  - `description`
  - `serviceType`（可選）
  - `lifetimeRepReward = 10`（固定）
  - `collateral > 0`（例如 0.01 ETH）
4. 按下「確認發放」，以 A 在 MetaMask 簽章送出交易。
5. 成功後，該筆 Bounty IOU 進入 marketplace 的 Pending 清單。

#### C / D 端操作（Marketplace 頁）

1. 切換 MetaMask 到 C（或 D）帳號並重新連線。
2. 進入 marketplace 頁，查詢條件：
  - `state == Pending`
  - `type == Bounty`（`collateral > 0`）
  - `fulfiller == zero address`（未指定接單者）
3. 任一帳號（C 或 D）選一筆點擊「Accept」。
4. MetaMask 以該帳號簽章送出 `acceptIOU(tokenId)`。
5. 首位成功上鏈者成為 fulfiller，該筆狀態轉為 `Active`。

#### Demo B 預期結果

- C 與 D 都能在 marketplace 看見該筆 pending bounty。
- 只有第一筆成功上鏈的 accept 會生效。
- 另一方若稍後送出 accept，應因狀態不再是 pending 而失敗。

### 演示時常見問題與排查

- 切換帳號後仍顯示舊資料：重新執行 connect wallet 或刷新頁面。
- 看不到待確認清單：先確認 indexer 已同步到最新區塊。
- accept 失敗：檢查是否為正確 fulfiller、token 是否仍為 pending。
- bounty 不顯示在 marketplace：檢查 mint 時是否真的用 zero address 作為 fulfiller。

## 六、資料與合約對應

### mintIOU 對應

- `fulfiller` -> 對方地址
- `deadline` -> 到期日
- `transferable` -> 依策略設定
- `lifetimeRepReward` -> 固定 10
- `description` -> 人情事件描述
- `serviceType` -> 類型
- `msg.value` -> Social 為 0，Bounty 為 collateral

### acceptIOU 對應

- fulfiller 在 inbox 中按確認
- 前端呼叫 `acceptIOU(tokenId)`
- 合約將狀態從 `Pending` 改為 `Active`

### owner / creator / fulfiller 關係

- `creator`：發放人，不變
- `owner`：ERC721 當前持有人，由 `ownerOf(tokenId)` 提供
- `fulfiller`：債務人 / 收件人，保留在 IOUData 中

## 七、實作順序建議

1. 拆分 CreateIOU 頁面為 Social / Bounty 兩個分頁。
2. 修正 mint 資料映射，讓 `msg.value` 真正承擔 collateral。
3. 建立 recipient inbox 頁面。
4. 接上 `acceptIOU` 動作與狀態刷新。
5. 再補通知效果與更細的 UX。

## 八、驗收條件

- Social / Bounty 兩個分頁可正常建立 IOU。
- `Reputation reward` 固定為 10。
- `Deadline` 正確送進 `mintIOU`。
- Social IOU 的 `msg.value` 為 0。
- Bounty IOU 可帶 collateral。
- recipient inbox 能看到 pending IOU。
- fulfiller 可按鈕接受並將狀態改成 Active。
- `createdAt` 由合約自動記錄，不再由表單輸入。
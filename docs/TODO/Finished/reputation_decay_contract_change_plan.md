# Reputation Decay 合約修改方案

## 目的

把 `IOUNFT` / `ReputationLedger` 的 rep 計算語意改成更直覺、可預期的版本：

- Social IOU：只在 `mintIOU` 時計算一次 decay，之後結算不再重新計算。
- Bounty IOU：不在 `mintIOU` 時決定最終 decayed rep，改成在市場接單 / `acceptIOU` 的時點才計算一次 decay，之後結算不再重新計算。

這份方案的核心是「rep base 在某個事件點 freeze 一次，後續流程只使用 freeze 後的值」，避免同一張 IOU 在 mint / accept / settle 期間被多次套用 decay，造成結果不直觀。

## 問題描述

目前的實作流程是：

1. `mintIOU` 時先呼叫 `computeDecayedAmount()`。
2. `acceptIOU` 時又對 creator 做一次 `awardRep()`。
3. `settle` 時再對 creator / fulfiller 做一次或兩次 `awardRep()` / `slashRep()`。

因此同一組 pair 的 interaction record 會在不同階段被重複推進，導致：

- Social IOU 的 pre-award 與 settlement award 互相影響。
- Bounty IOU 若在 mint 階段就先算 decay，會把「尚未接單」的時間因素提前帶進來，和直覺不符。

## 目標行為

### Social IOU

- `mintIOU` 當下就決定這張 IOU 的最終 rep base。
- `decayedCreatorRepBase` 與 `decayedFulfillerRepBase` 在 mint 後視為固定值。
- 後續 `acceptIOU`、`settle`、`confirmClose` 都只消耗這兩個已凍結的值，不再再做 decay。

### Bounty IOU

- `mintIOU` 只記錄 raw base，不做最終 decay 結果的定案。
- 等市場接單 / `acceptIOU` 時，再對 creator / fulfiller 計算一次 decay，並把結果凍結。
- 一旦接受成功，後續結算只用凍結後的值，不再重新計算 decay。

## 建議的合約資料欄位調整

### IOUNFT.IOUData

建議把目前的：

- `decayedCreatorRepBase`
- `decayedFulfillerRepBase`

改成更清楚的 freeze 語意，例如：

- `creatorRepBase`
- `fulfillerRepBase`
- `repBaseFrozen`

如果想保留現有欄位名稱，也可以不改欄位名，但要明確定義：

- `decayedCreatorRepBase` 代表「已經 freeze 後的 creator base」
- `decayedFulfillerRepBase` 代表「已經 freeze 後的 fulfiller base」

這樣會比較容易把語意從「每次都可以再 decay」改成「只在特定階段 decay 一次」。

## 方案 B：語意更清楚版（採用）

這份提案採用方案 B，並把方案 A 的內容視為不採用的簡化路線。原因很直接：方案 A 只是在既有欄位上搬移計算時機，雖然改動小，但 `decayed*RepBase` 的語意仍然不夠清楚，未來很容易再把「已凍結值」和「動態 decay 值」混用。

### 建議的欄位設計

在 `IOUData` 中拆成兩組欄位：

- 原始值：`rawCreatorRepBase`、`rawFulfillerRepBase`
- 凍結值：`finalCreatorRepBase`、`finalFulfillerRepBase`
- 狀態旗標：`repBaseFrozen`

若想保留舊欄位名稱，也可以保留 `decayedCreatorRepBase`、`decayedFulfillerRepBase`，但文件與程式碼都必須明確把它們解釋成「freeze 後的最終值」，不能再把它們當成每次都會重新 decay 的中間值。

### 方案 B 的流程

1. `mintIOU` 先寫入 raw 值，不直接把最終 rep 影響視為完成。
2. Social IOU 在 mint 時就呼叫一次 freeze，產生 `finalCreatorRepBase` / `finalFulfillerRepBase`。
3. Bounty IOU 在 `acceptIOU()` 或市場接單成功時才呼叫 freeze，之後才產生最終 rep base。
4. 後續 settlement / close 都只讀 freeze 後的值，不再重新做 decay。

### Social IOU 的實作意義

- 目的是讓 Social IOU 的 rep 規則在建立當下就固定。
- mint 之後，之後的 `acceptIOU()`、`settleSocialIOU()`、`confirmClose()` 都不應再改變 rep base 的判定方式。
- 這樣可以避免「先 pre-award 一次，再 settle 又被 decay 一次」的雙重影響。

### Bounty IOU 的實作意義

- 目的是把 Bounty 的 decay 計算延後到真正接單時才發生。
- 這樣市場上尚未被接單的等待時間，不會過早影響 reward base。
- 一旦接受成功，後續 settlement 只使用 freeze 後的值，不再重新計算 decay。

## 建議新增 / 調整的函式

### 1. `freezeRepBase(tokenId)`

用途：把某張 IOU 的 rep base 只計算一次並寫回 storage。

建議規則：

- 只能在 `Pending` 狀態呼叫。
- Social IOU 可在 `mintIOU` 內直接呼叫。
- Bounty IOU 可在 `acceptIOU` 內呼叫。
- 若 `repBaseFrozen == true`，直接跳過。

### 2. `computeInitialRepBase(...)`

用途：抽出目前 `mintIOU` 裡的 decay 計算邏輯，讓它只做一件事。

建議拆成兩段：

- Social mint：立即 freeze。
- Bounty accept：接單時 freeze。

### 3. `useFrozenRepBase(...)`

用途：settlement / close 時只讀 freeze 後的值，不再碰 decay。

## `ReputationLedger` 的調整建議

這份方案下，`ReputationLedger` 會同時扮演兩種角色：

1. 提供「計算某次 rep 會拿到多少」的純查詢能力。
2. 提供「真的把 rep 發出去」的寫入能力。

目前這兩件事都混在 `awardRep()` 裡：它不只更新 `reputations`，還會透過 `_applyDecay()` 去改變 pair 的 `interaction` 狀態。這對現在的設計來說太重，因為 freeze 與實際加分是兩個不同時點的事情。

### 建議保留的部分

- `awardRep()`：保留現有行為，給需要持續吃 decay 的互動使用。
- `slashRep()`、`lockRep()`、`unlockRep()`：維持現有寫入責任，不需要為了這份提案重新設計。
- `computeDecayedAmount()`：保留作為 freeze 前的計算依據。

### 建議新增的部分

- `previewDecayedAmount(base, from, to)` 或類似命名的 view helper。
  - 用途是讓 `IOUNFT` 在 mint / accept 時先算出 freeze 值。
  - 這個 helper 不應修改 `interactions`，只是純計算。

  此外，新增一個事件 `InteractionRecorded(address indexed addrA, address indexed addrB, uint8 decayLevel, uint256 lastInteractionTs)`，當 `recordInteraction()` 執行且寫入 interaction record 時發出，以便離線 indexer 可以觀察並持久化該變動（mapping 寫入在鏈上無法從 logs 直接查到）。
- `awardRepFixed(address to, uint256 amount)` 或 `awardRepWithoutDecay(...)`。
  - 用途是讓 freeze 後的最終結算直接加分，不再影響 pair 的 decay 狀態。
  - 如果你希望 settlement 完全不再推進 decay level，這個函式是必要的。

### 為什麼要拆這兩條路

如果還是只用現在的 `awardRep()`，那麼：

- freeze 雖然能算出固定值，但最後寫分數時仍然會把 pair 的 decay 狀態往前推。
- 這會讓後續互動的 decay 起點被 settlement 影響，和「freeze 後後續不再用 decay」的目標不一致。

因此方案 B 的重點不只是把計算時機往前或往後移，而是要把「計算 decay」與「實際發 rep」分成兩個 API 路徑。

### 對 `IOUNFT` 的配合方式

- Social / Bounty 的 freeze 階段：只呼叫 `previewDecayedAmount()` 類型的 view helper。
- 真正 settle 發放 rep 時：呼叫 `awardRepFixed()` 類型的函式，避免再次污染 pair decay。
- 這樣才能保證「freeze 一次，後面只使用 freeze 值」真的成立。

### `decay` / 互動次數什麼時候更新？

如果結算時呼叫的是 `awardRepFixed()`，那麼 **`awardRepFixed()` 本身不應更新 decay 狀態**。decay / 互動次數應該在 **freeze 階段** 更新，也就是：

- Social IOU：在 `mintIOU()` 內執行 `freezeRepBase()` 時更新一次。
- Bounty IOU：在 `acceptIOU()` 內執行 `freezeRepBase()` 時更新一次。

更精確地說，`freezeRepBase()` 的順序是：**先完成 rep 數值計算（例如透過 `previewDecayedAmount()`），再把這次結果寫回 `finalCreatorRepBase` / `finalFulfillerRepBase`，同時更新 decay 狀態**。也就是說，decay 狀態不是先改再算，而是**算完後再 freeze**。

換句話說，`previewDecayedAmount()` 只負責「算出會是多少」，`freezeRepBase()` 才是「把這次互動的 decay 進度往前推一次」的時點；而 `awardRepFixed()` 只是把 freeze 後的最終值發出去，不再碰 interaction record。

這樣的切分可以保證：

1. decay 只在 IOU 的定案時更新一次。
2. 結算時不會再多推一次 decay。
3. `awardRep()` 仍然保留給那些真的需要「發分同時推進 decay」的互動型流程。

### 流程範例：A 發 Social IOU，B 接單，Great 結案

以下用一個具體例子把 `ReputationLedger` 的調度順序講清楚：

1. A 呼叫 `mintIOU()` 建立 Social IOU，指定 fulfiller 為 B。
2. `IOUNFT.mintIOU()` 先呼叫 `computeInitialRepBase()`。
3. `computeInitialRepBase()` 內部再透過 `previewDecayedAmount()` 算出這張 IOU 在 mint 當下的最終 rep base，並寫入 `finalCreatorRepBase` / `finalFulfillerRepBase`，同時把 `repBaseFrozen` 設為 `true`。
4. 這一步**不會**呼叫 `awardRep()`，因為 Social IOU 的 rep base 已經在 mint 時 freeze 完成。
5. B 之後把這張 IOU 變成 `Active`，若流程上需要在接單時先發一筆固定 creator rep，則改呼叫 `awardRepFixed(A, finalCreatorRepBase)`；如果這張 Social IOU 的設計不需要 pre-award，這一步就只會改狀態、不動 `ReputationLedger`。
6. Great 後續執行結案 / settle 時，只讀取已 freeze 的 `finalCreatorRepBase` / `finalFulfillerRepBase`，再依結案結果呼叫 `awardRepFixed()` 或 `slashRep()`。
7. 整個過程中，`awardRep()` 只保留給「還要持續吃 decay」的互動型流程使用，不會出現在這張 Social IOU 的 mint / accept / settle / close 主路徑裡。

這個例子下最重要的原則是：**Social IOU 只在 mint 時決定 decay 結果，後續 B 接單與 Great 結案都只能使用 freeze 後的值**。

### 補充風險

- 若未來仍希望某些行為要持續吃 decay，就要明確區分使用 `awardRep()` 還是 `awardRepFixed()`。
- 也就是說，`ReputationLedger` 會從單一路徑，變成「互動型發分」與「固定值發分」兩條路，這是這次改動最重要的架構切分。

## 預期效果

完成後應可達成：

- Social IOU：mint 時 freeze 一次，結算值固定。
- Bounty IOU：accept 時 freeze 一次，結算值固定。
- 同一張 IOU 不會在 pre-award / settlement / close 多次吃 decay。
- leaderboard / query 看到的數字會更接近產品直覺。

## 驗收方式

建議用以下場景驗證：

1. 乾淨鏈上只建立一張 Social IOU：確認 mint 後的 rep 與 settle 後的 rep 符合 freeze 規則。
2. 乾淨鏈上只建立一張 Bounty IOU：確認 mint 不先定案，accept 才 freeze。
3. 同一 pair 連續兩次互動：確認第二次才會吃到 decay，且不會在同一張 IOU 的不同階段重複 decay。
4. `getReputation()` 與 indexer snapshot 必須一致。

## TODO

- [ ] 拆出 `freezeRepBase()` / `computeInitialRepBase()`
- [ ] 讓 Social / Bounty 使用不同 freeze 時機
- [ ] 補合約測試，涵蓋 mint / accept / settle 的 rep 行為
- [ ] 確認 indexer 不需要因為這個改動而修改資料結構

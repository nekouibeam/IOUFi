## 舊版內容的定位

以下章節保留作為討論記錄，但不再是主設計：

- `lifetimeRepReward` 單一總額模型
- `decayedRepBase` 單一基底模型
- 「先算 half 再按 rating 分配剩餘」的舊示範

如果你要，我下一步可以直接把整份文件再整理成「只保留新版主方案」的乾淨版本，把上述舊段落整併掉。

## 目標

把目前只有 creator / owner 主導的結案流程，改成符合 USERIOUs 頁面需求的雙階段流程：

- `Owed by me`：Fulfiller 申請結案
- `Owed to me`：Owner 收到申請後，確認 / 退回

也就是說，合約需要先記錄「結案申請已送出」的狀態，讓前端能依 token 狀態控制兩個按鈕：

- 申請前：`Owed by me` 可按、`Owed to me` 灰色不可用
- 申請後：`Owed by me` 灰色不可用、`Owed to me` 可按

## 舊版紀錄（已精簡）

此檔保留為討論歷史記錄，但已移除與現行 `close_flow_contract_change_spec.md`（最新規格）不一致的詳細段落。

保留要點：
- 此檔不再是主設計，主設計請以 `docs/TODO/close_flow_contract_change_spec.md` 為準。
- 已移除的主題包括：把 `lifetimeRepReward` 當作單一總額模型、以及以舊版分配細節為主的逐步示範段落。

如需完整變更紀錄或還原某段歷史內容，請告知要還原的章節，我會從版本紀錄或回收站還原該段內容。

---

（此檔案已被清理——只留最小歷史註記以免與現行規格混淆）
- 如果要守恆，請改為使用 `lifetimeRepReward` 作為總額，再按比例分配（我可替你把 Reference 的語意轉成守恆分配公式）。
- 決定衰減位置：建議把衰減邏輯保留在 `ReputationLedger`，合約只傳入基數（例如 5、8、10），由 ledger 計算 pairwise 衰減並更新 `currentRep` / `lifetimeRep`。

註：你已指定要把衰減邏輯保留在 `ReputationLedger` 並先計算一次再做比例發放。為支援此做法，`ReputationLedger` 需提供一個 view / pure helper 函式，例如：

```solidity
function computeDecayedAmount(uint256 base, address to, address from) external view returns (uint256);
```

合約會在適當時機呼叫此函式取得 `decayedBase`，並且（若需要）把 `decayedBase` 寫入 `IOUData.decayedRepBase` 以便後續按比例分配。

---

## 更新後的小型合約修改清單（含 reputation 部分）

1. 在 `IOUData` 新增：`bool closeRequested`, `uint256 closeRequestedAt`, `bool repPreAwarded`, `uint256 repPreAwardedAmount`。
2. 新增 `requestClose(tokenId)`、`confirmClose(tokenId, rating)`、`rejectClose(tokenId)`。
3. 新增 events：`CloseRequested`, `CloseConfirmed`, `CloseRejected`。
4. 在 `acceptIOU` 中加入 creator pre-award 流程（Social IOU）。
5. 調整 `_awardReputation` 或新增 `finalizeReputation` 以依 Reference 規則在 `confirmClose`/`settle*` 時發放。
6. 確認 `reputationLedger.awardRep` 的衰減責任位置（ledger 內或合約端先計算）。

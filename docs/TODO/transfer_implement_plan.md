## Goal：
演示 Active 的 social IOU 的轉移流程，進行三方驗證。

本版規格：
- 固定 transfer fee 為 `0.0015 ETH`（`1_500_000_000_000_000 wei`），由新 owner 支付且必須精準等於此金額。
- Bounty IOU 在 Active 狀態永遠不可轉讓。
- Social IOU 只支援 Active 狀態的三方轉讓。
- Pending 階段不修改 `transferable`。

## 前端設計：
- 右上角 和其他頁面一樣 設置連接錢包按鈕
- 左上角 放頁面標題 「Social IOU Transfer」
- 主面板 分為三個區塊
    - 左邊-元owner區塊：列出所有 Owed to me 的 IOU，每個 IOU 下方都有一個 Transfer 按鈕。
        - 按下按鈕後，顯示 Transfer 介面，選擇要Transfer到哪個帳號，並有個 申請轉送 button。
    - 中間-新owner區塊：列出所有 作為新owner 的待同意 Transfering IOU，每個IOU下方都有一個 Confirm 和 Reject 按鈕。
    - 右邊-Fulfiller區塊：列出所有 作為Fulfiller 的待同意 Transfering IOU，每個IOU下方都有一個 Confirm 和 Reject 按鈕。
- IOU 的查詢功能實作，請直接參考 UserIous 頁面的方法，

## 轉移流程：
0. 假設： 有一個 social IOU，fulfiller 為 B，元owner 為 A，A 要轉給 C
1. 連接 錢包的帳號A，在 左邊-元owner區塊 選擇要轉給C 的那個 social IOU，並按下 申請轉送 button。此 social IOU 標記為 Transfering，並記錄 Transfer 對象為 C。
2. 連接 錢包的帳號C，在 中間-新owner區塊 要看到 那個 標記為 Transfering 且 對象為C 的 social IOU 出現。可選擇要按 Confirm 還是 Reject。
3. 連接 錢包的帳號B，在 右邊-Fulfiller區塊 要看到 那個 標記為 Transfering 且 fulfiller為B 的 social IOU 出現。可選擇要按 Confirm 還是 Reject。
4. Transfering 的 social IOU 要能記錄 B 和 C 是否 Confirm。無論是 B 還是 C 按下 Confirm，都要檢查 B 和 C 是否皆 Confirm 了。
    - 若 B 和 C 皆 Confirm 了 -> 執行轉移，成功後取消 Transfering 標記。
        - 轉讓時向新 owner 收取固定 transfer fee `0.0015 ETH` 進 Treasury。
    - 若 一方未 Confirm -> 等待另一方 confirm，不動作。
    - 任一方 Reject -> 直接退出Transfer程序，將此 IOU 取消 Transfering標記。
5. 驗證 Transfer 結果：
    - 若 Transfer 成功 -> 連接 錢包的帳號C ， 應在 左邊-元owner區塊 看到剛才的 social IOU。
    - 若 Transfer 失敗 -> 連接 錢包的帳號A ， 應在 左邊-元owner區塊 看到剛才的 social IOU。
    - 無論 成功 or 失敗 -> 連接 錢包的帳號B ， 右邊-Fulfiller區塊 都應為空。

## 合約修改方向:
- 參考之前 IOU 結算的方法，在 `IOUData` 內用欄位記錄 transfer 狀態與 transfer 目標地址。
- 目前合約已改成固定手續費、精準付款、Active social only、Pending 不可轉讓。
- `modifyPending` 僅允許更新 `deadline`、`description` 與 `serviceType`。

## 變更清單：
### IOUNFT 合約:

- 新增欄位: 在 `IOUData` 加入轉移狀態與同意旗標（例如 `transferRequested`, `transferTo`, `transferNewOwnerConfirmed`, `transferFulfillerConfirmed`, `transferRequestedAt`）。
- 新增變數: `uint256 public constant transferFeeWei = 1_500_000_000_000_000`（固定 0.0015 ETH，不可由 owner 調整）。
- 新增事件: TransferInitiated, TransferConfirmed, TransferCompleted, TransferRejected（包含 tokenId、from、to、by）。
- 函式 startTransfer(uint256 tokenId, address to): 由 ownerOf(tokenId) 呼叫，標記 transfer，記錄 transferTo 與 requester，emit TransferInitiated。
- 函式 confirmTransferByNewOwner(uint256 tokenId) payable: 由 transferTo 呼叫，需 `msg.value == transferFeeWei`，標記新 owner 確認；若 fulfiller 也已確認則執行轉移並把 fee 轉入 treasury（使用 `nonReentrant` 與安全轉帳）；emit TransferConfirmed/TransferCompleted。
- 函式 confirmTransferByFulfiller(uint256 tokenId): 由 ious[tokenId].fulfiller 呼叫，標記 fulfiller 確認；同上檢查雙方確認後執行轉移。
- 函式 rejectTransfer(uint256 tokenId): 由 transferTo 或 fulfiller 或 owner（視政策）呼叫以取消申請，若 `confirmTransferByNewOwner` 已付 fee 要在取消時退款給付費者並 emit TransferRejected。
- 執行轉移細節: 執行 token 變更時呼叫 `super._update(transferTo, tokenId, address(this))`（或合約現有的內部轉移方式），然後清除 transfer 欄位。
- Pending 可修改: `modifyPending(uint256 tokenId, uint256 newDeadline, string calldata newDescription, string calldata newServiceType)`，只能由 creator 在 Pending 更新，並 emit 對應 event；不修改 `transferable`。
- 安全檢查: 所有狀態改動使用 `nonReentrant`（有價值移轉時）、適當 `require` 檢查、保留現有 `_update` 的轉移規則。

### 其他需更新的檔案/測試/介面:

- Docs: 更新 `transfer_implement_plan.md` 與 `api_list.md`（新增 API 描述與固定收費流程）。
- 前端: 修改 `IOUCard.jsx` 與 `userIous.js`（新增 UI、呼叫 `startTransfer`、`confirmTransferByNewOwner`（payable）、`confirmTransferByFulfiller`、`rejectTransfer`）；新增頁面 `SocialIOUTransfer`（可在 `App.jsx` 加路由）。
- Indexer / Backend: 更新 `indexer/index.js`（或相應 indexer）以監聽新增事件 `TransferInitiated`/`TransferCompleted`/`TransferRejected`，使前端能查到三方確認狀態。
- 測試: 新增或擴充 `IOUNFT.t.sol`（或 JS/Foundry 測試）驗證：啟動 transfer、雙方確認流程、固定 fee 支付/拒絕案例、Pending 修改限制、Bounty 鎖定不允許轉移。
- Changelog / docs: 在 transfer_implement_plan.md 底下記錄合約修改條目（我可以直接 append）。
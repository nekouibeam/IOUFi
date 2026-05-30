I'll inspect the current mint flow in CreateIOU.jsx and the contract wrapper to answer the UI/ownership questions against the actual code.

Searched for text `mintIOU({ fulfiller, deadlineTs` (`**/web/src/**`), 1 result

Read [](file:///c%3A/Users/USER/Blockchain/IOUFi/web/src/api/contract.js)

Read [](file:///c%3A/Users/USER/Blockchain/IOUFi/web/src/pages/CreateIOU.jsx)

**結論**
目前的設計需要調整。核心點是：

1. `IOUData` 不需要再加 owner 欄位，因為 ERC721 的當前持有人已經由 `ownerOf(tokenId)` 管理；`creator` 則保留為原始發放人。
2. 你現在的 `CreateIOU` 頁面確實和 `mintIOU` 的語意不一致，尤其是把 `value` 當成 `lifetimeRepReward`，而真正的 collateral 應該是交易的 `msg.value`。
3. 「收到通知並確認」不是鏈上自動完成的事，必須由前端 + indexer 做出 inbox/通知，再由對方按下接受，呼叫 `acceptIOU`。

**1. 鑄造後誰持有 NFT**
目前在 solidity/src/IOUNFT.sol 的 `mintIOU`，實際是 `_mint(msg.sender, tokenId)`，所以鑄造後的 owner 是發放人，也就是債權人，不是 fulfiller。

這代表：
- `creator` = 發放人，會保留在 `IOUData.creator`
- `owner` = ERC721 持有人，現在是發放人
- `fulfiller` = 債務人，只是 IOU 裡記錄的對象，不等於 NFT 當前持有人

所以你不需要在 `IOUData` 再加 owner 欄位；owner 已經由 ERC721 本身提供。若之後要更換持有人，直接走 ERC721 transfer 即可，`creator` 不會被覆蓋。

**2. 目前頁面為什麼不符合 mintIOU**
你貼的 web/src/pages/CreateIOU.jsx 目前有幾個語意問題：

- 它把輸入的 `value` 塞進 `lifetimeRepReward`
- 它把 `valueEth` 固定成 `'0'`
- 它把 `date` 當成 deadline，標籤卻叫「發生日期」
- 它預設 `transferable: true`

這和合約的真實參數不一致。合約裡的關係應該是：

- `msg.value` = collateral
- `lifetimeRepReward` = reputation reward
- `deadline` = 到期日
- `createdAt` = 鑄造當下自動記錄，不是使用者輸入

你要的新版 UI 應該拆成兩個分頁：

- Social 分頁：collateral 固定 0，reward 固定 10
- Bounty 分頁：collateral 由使用者決定，reward 固定 10

兩個分頁都應該把「FAVOR 積分價值」改成「Reputation reward」，而且鎖死為 10。  
「發生日期」應改成「Deadline」。  
底部那段「NFT 鑄造後：• 受讓人信譽積分 -N/A · 發放人 +N/A」應刪掉，只保留 Transfer Fee 的提示。

另外，因為現在合約是用 `mintIOU(..., payable)`，所以 bounty/social 的差異不該靠頁面文案，而要靠是否有送 `msg.value`。

**3. 轉移是在 MetaMask 還是 web 上**
兩者都對，但分工不同：

- 實際授權和簽章一定會經過 MetaMask
- 觸發轉移的動作可以從 web 頁面按按鈕發起

也就是說，使用者在 web 上點「Transfer」，前端呼叫 ERC721 的 `transferFrom` 或 `safeTransferFrom`，接著 MetaMask 彈出簽章確認。  
所以是「在 web 上操作、由 MetaMask 簽名」。

**4. Social IOU 的通知與確認怎麼演示**
鏈上本身不會自動送通知，所以要靠應用層做：

- 發放人 mint Social IOU 後，indexer 收到 `IOUCreated`
- 前端或服務層把這筆 IOU 放進對方的「待確認」清單
- 對方登入後在 inbox 看到「你有一筆 Social IOU 待確認」
- 對方按「確認」按鈕，前端呼叫 `acceptIOU(tokenId)`
- 交易成功後，state 從 `Pending` 變成 `Active`

如果你要「演示通知」，最簡單是做成：
- 一個 recipient inbox 頁面
- 由 indexer API 查出 `fulfiller == me && state == Pending` 的 IOU
- 頁面上顯示通知卡片與「接受」按鈕

如果你要真的像即時通知：
- 用 indexer event + WebSocket/SSE 推到前端
- 或先用輪詢做 MVP

**我建議的下一步**
如果你要，我可以直接幫你規劃這個新頁面的資料流，包含：
- Social / Bounty 兩個分頁的欄位對應
- CreateIOU 頁面改版
- recipient inbox 與 accept flow 的最小實作方案

如果你要我繼續，我下一步會直接把這三件事拆成可落地的前端改造清單。
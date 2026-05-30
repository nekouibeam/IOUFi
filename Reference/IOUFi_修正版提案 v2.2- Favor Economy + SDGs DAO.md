這份是根據單一合約與統一狀態機架構更新後的 **IOUFi v2.2** 提案文檔。此版本將 Favor Marketplace 的需求完全整合進 IOU NFT 的資料結構中，大幅降低了系統的複雜度。

---

# IOUFi（修正版提案 v2.2）— Favor Economy + SDGs DAO

## 前言

「人情本來就是一種社會契約（social contract）」，Smart Contract 是可被驗證、不可竄改的數位契約。  
現實世界「你欠我一次」的問題：沒有紀錄、不能轉移、沒有信譽系統。

---

## 與 SDGs 的連結（為什麼 IOUFi 不只是「人情記帳」）

IOUFi 想解決的不是單純「誰欠誰一次」，而是把 **可信的互助關係** 擴展成可持續的公共協作網路，並把這股「互助能量」導向 SDGs（聯合國永續發展目標）。

* **Favor Economy → 讓互助可被衡量、可被累積、可被擴散**：  
透過可驗證的履約紀錄（IOU NFT / escrow 交易）與不可交易的 Reputation，將「互助」從一次性的情誼，變成可被長期建立信譽的協作行為。
* **Reputation → 公共治理的資格，而非財富**：  
Reputation 不可交易，避免影響力變成買得到的權力；它作為「參與公共事務的信用」，讓真正投入互助的人，能在 DAO 中擁有合理的發言權。
* **Treasury → SDGs 行動的可持續資金來源**：  
協議透過 marketplace fee / governance fee 建立可持續的公共資金池，讓 SDGs 提案不依賴單一捐款，而由協議的使用與成長自然供血。
* **DAO → 把本地互助升級成可審計的公共支出**：  
每月以 SDGs tags 提案、投票、撥款，並公開記錄資金流向，使社會協作成為可被驗證與追蹤的機制。

---

## (zero) 前提：唯一身份 + 反互刷

### 0-1. World ID

與 Worldcoin 合作：每人僅有一個通過 Orb 驗證的 World ID，並綁定一個主錢包地址（可選：允許換綁，需設定冷卻期）。

### 0-2. Repeated interaction diminishing return（同一對帳戶）

為避免熟人互刷，對同一對（A,B）之間的「Reputation 獲得」採衰減機制：

* 第 1 次：100%
* 第 2 次：50%
* 第 3 次：25% …（每次 /2）
* 冷卻恢復：每隔 10 天，該對帳戶衰減係數回復一階（例如 25%→50%），上限回到 100%。

> 作用範圍：僅作用於「發人情/償還人情/完成服務 時的 Reputation 獎勵」，不影響 DAO 投票權計算（避免治理被操控）。

---

## (zero.1) 系統資產分工（關鍵設計）

### A) Reputation（聲望/治理權）

* Reputation 是「不可交易、不可轉讓」的聲望與治理權（不作為支付資產）。
* 顯示格式：CurrentRep / LifetimeRep（例如 120 / 500）
* LifetimeRep：歷史累積（只增不減）
* CurrentRep：治理 stake 的可用額度（可被鎖定；客觀違約時扣減，但不扣 Lifetime）



### B) Treasury（資金庫，持有可花資產）

* Treasury 持有 **ETH / USDC** 作為可花資產，用於 SDGs 活動撥款與協議公共支出。
* Treasury 透明可查，任何人可看到餘額與撥款紀錄。

---

## (zero.2) Treasury 的「創世捐款」與後續收入來源

### 0-2-1. 初始資金（Genesis Donation）

* 協議部署啟動時，由創世捐款者向 Treasury 注入一筆 **ETH/USDC**，作為第一期 SDGs grant 的啟動資金。

### 0-2-2. 後續主要收入

Treasury 後續資金主要來自協議內建的手續費：

1. **Marketplace fee**：每筆 Bounty IOU 完成（Escrow 放款）時，抽取固定比例手續費進 Treasury。
2. **Governance fee**：DAO 投票或提案執行時收取小額治理費用進 Treasury。

---

## (zero.3) 核心架構：IOU NFT 的雙重型態與統一狀態機

系統將「一般人情」與「Marketplace 懸賞」整合為單一 IOU NFT 合約。透過參數 collateralAmount（擔保金額）來區分兩者：

* **Social IOU（一般人情）**：無資金擔保（collateralAmount = 0）的信用借貸。
* **Bounty IOU（Marketplace 懸賞）**：有 ETH/USDC 資金擔保（collateralAmount > 0）的任務委託。

兩者共用同一套狀態機（State Machine）生命週期：

| 狀態 | Social IOU (一般人情：Woody 欠 Andy) | Bounty IOU (Marketplace：Amy 徵求服務) |
| --- | --- | --- |
| **Pending** | Andy 建立草稿，等待 Woody 鏈上確認。 | Amy 建立懸賞，將 ETH/USDC 打入合約鎖定 (Escrow)。 |
| **Active** | Woody 鏈上確認，合約發放前半段 Reputation 給 Andy。 | Woody 接單，NFT 綁定 Woody 為 Fulfiller (執行者)。 |
| **Settled** | Woody 償還，Andy 評價確認，發放後半段 Reputation 給雙方。 | Amy 確認服務完成，合約放款並發放 Reputation 給雙方。 |

---

## (one) 情境一：Social IOU 流程（信用借貸）

**建立與確認（Pending → Active）：**

1. Andy 建立 Social IOU 草稿：記錄欠方fulfiller(Woody)、債權人owner(Andy)、描述、技能 tag、deadline。
2. Woody 進行 on-chain 確認（Confirm），狀態轉為 Active。
3. 確認當下，為獎勵 Andy 建立人情紀錄，系統先發放 5/10 * function_衰減規則(10 Reputation) 給 Andy。

**償還與結算（Active → Settled）：**
Woody 實際償還後，Andy 進行結算並給予 a/b/c 評價：

* **a 物超所值**:Woody 獲得 function_衰減規則(8 Reputation)，Andy 獲得 5/10 * function_衰減規則(10 Reputation)。
* **b 中規中矩**:Woody 獲得 6/10*function_衰減規則(8 Reputation)，Andy 獲得 3/10 * function_衰減規則(10 Reputation)。
* **c 很糟糕**：Woody 扣減 1 CurrentRep，Andy 獲得 1/10 * function_衰減規則(10 Reputation)，IOU 標記為 UnhappyClose（污點 +1）。
* 結案後，NFT 狀態轉為 Settled，保留履約紀錄。

---

## (two) 情境二：Bounty IOU 流程（Favor Marketplace）

**發案與鎖倉（Pending）：**

1. Amy 建立 Bounty IOU（含 Reward 金額、期限、技能 tag）。
2. Amy 將 Reward (ETH/USDC) 存入智能合約 (Escrow)，狀態為 Pending。

**接單（Pending → Active）：**

1. Woody 在市場看到需求並接單，合約將 Fulfiller 設為 Woody，狀態轉為 Active。
2. *(防卡死機制)*：若為 Pending 狀態無人接單，Amy 可隨時撤銷並取回資金。

**結算與放款（Active → Settled）：**

1. Woody 完成服務送出結算申請，Amy 按下完成確認。
2. 合約自動執行結算：
* 抽取 5% **Marketplace fee** 轉入 Treasury。
* 剩餘資金放款給 Woody。
* 狀態轉為 Settled。
3. Reputation 發放：Woody 加 function_衰減規則(10 Reputation)，Amy 加 function_衰減規則(8 Reputation)。

*(邊界條件)*：若任務處於 Active 狀態但 Woody 逾期未完成，Amy 可觸發 Timeout 機制取回資金。

---

## (three) 情境三：轉讓 IOU NFT（社交義務的移轉）

IOU NFT 的轉讓規則依其型態而定：

1. **Social IOU**：需三方確認（原債權人-現任owner 同意轉讓、新債權人-新owner 願意接受、債務人-fulfiller 確認願意更改幫助對象）。轉讓時收取小額 transfer fee (假設 0.0015 eth) 進 Treasury。
2. **Bounty IOU**：在 Pending 狀態（無人接單）下可修改或撤銷；進入 Active 狀態（已有人接單執行中）時，**鎖定不可轉讓**，以保障執行者與發案方的資金與權益。

---

## (four) 情境四：DAO（SDGs 活動投票與 Treasury 撥款）

每月進行 SDGs 提案與投票：

* **提案內容**：活動細節、SDGs tags、申請撥款金額（ETH/USDC）、收款地址、截止時間。
* **投票權重**：以使用者的 Reputation 計算（採 LifetimeRep + CurrentRep 混合規則）。
* **質押機制**：投票時需鎖定部分 CurrentRep 作為 stake（鎖定期間無法用於其他提案，但不燃燒）。
* **執行（Execute）**：投票通過的提案，可呼叫合約執行撥款，Treasury 會將 ETH/USDC 發送給活動主辦方。執行時可收取小額 governance fee 進 Treasury。

> 備註：此版本暫不實作「通過後自動更改協議參數」的功能，以維持治理安全性與系統簡潔。

---

## (five) 借貸（future work）
抵押 USDC/ETH 借貸 Reputation
- 貸款目的 限制為 提案/支持 特定 SDGs 活動。
- 能借的上限為 LifetimeRep 的 10%。
- SDGs 活動若未通過/通過但未舉辦 -> 收回 Reputation，發還抵押品。
- SDGs 活動若通過且舉辦 -> 借貸人可選擇在時間內累積足額 Reputation 贖回 USDC/ETH；或是不贖回作為 Treasury 捐款。
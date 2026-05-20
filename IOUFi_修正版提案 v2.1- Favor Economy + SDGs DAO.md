
# IOUFi（修正版提案 v2.1）— Favor Economy + SDGs DAO

## 前言
「人情本來就是一種社會契約（social contract）」，Smart Contract 是可被驗證、不可竄改的數位契約。  
現實世界「你欠我一次」的問題：沒有紀錄、不能轉移、沒有信譽系統。

---

## 與 SDGs 的連結（為什麼 IOUFi 不只是「人情記帳」）
更進一步，IOUFi 想解決的不是單純「誰欠誰一次」，而是把 **可信的互助關係** 擴展成可持續的公共協作網路，並把這股「互助能量」導向 SDGs（聯合國永續發展目標）。

- **Favor Economy → 讓互助可被衡量、可被累積、可被擴散**：  
  透過可驗證的履約紀錄（IOU NFT / escrow 交易）與不可交易的 Reputation，我們把「互助」從一次性的情誼，變成可被長期建立信譽的協作行為。

- **Reputation → 公共治理的資格，而非財富**：  
  Reputation 不可交易，避免把影響力變成買得到的權力；它更像是「參與公共事務的信用」，讓真正投入互助的人，能在 DAO 中擁有更合理的發言權。

- **Treasury → SDGs 行動的可持續資金來源**：  
  協議透過 marketplace fee / governance fee 建立可持續的公共資金池，讓 SDGs 提案不永遠依賴捐款，而能由協議的使用與成長自然供血。

- **DAO → 把本地互助升級成可審計的公共支出**：  
  每月以 SDGs tags 提案、投票、撥款，並公開記錄資金流向，使「大家一起做善事」不只是口號，而是可被驗證、可被追蹤、可被複製的社會協作機制。

> 總結：IOUFi 以「互助→信譽→治理→撥款」形成閉環，把日常 Favor 經濟的信任積累，轉化成支持 SDGs 行動的公共資源與集體決策能力。

---

## (zero) 前提：唯一身份 + 反互刷
### 0-1. World ID（假設）
我們與 Worldcoin 合作：每人僅有一個通過 Orb 驗證的 World ID，並綁定一個主錢包地址（可選：允許換綁，但需冷卻期）。

### 0-2. Repeated interaction diminishing return（同一對帳戶）
為避免熟人互刷，對同一對（A,B）之間的「Reputation 獲得」採衰減：
- 第 1 次：100%
- 第 2 次：50%
- 第 3 次：25% …（每次 /2）
- 冷卻恢復：每隔 10 天，該對帳戶衰減係數回復一階（例如 25%→50%），上限回到 100%。

> 作用範圍：僅作用於「發人情/償還人情/完成服務 時的 Reputation 獎勵」，不影響 DAO 投票權計算（避免治理被操控）。

---

## (zero.1) 系統資產分工（關鍵設計）
### A) Reputation（聲望/治理權）
- Reputation 是「不可交易、不可轉讓」的聲望與治理權（不作為支付資產）。
- 顯示格式：`CurrentRep / LifetimeRep`（例如 `120 / 500`）
  - `LifetimeRep`：歷史累積（只增不減）
  - `CurrentRep`：治理 stake 的可用額度（可被鎖定；客觀違約時少量扣分，但不扣 Lifetime）

### B) Treasury（資金庫，持有可花資產）
- Treasury 持有 **ETH / USDC** 作為可花資產，用於 SDGs 活動撥款與協議公共支出。
- Treasury 透明可查，任何人可看到餘額與撥款紀錄。

---

## (zero.2) Treasury 的「創世捐款（genesis donation）」與後續收入來源
### 0-2-1. 初始資金（genesis donation）
- 協議部署/啟動時，由創世捐款者（可以是團隊、多簽或社群）向 Treasury 注入一筆 **ETH/USDC**，作為第一期 SDGs grant 的啟動資金。

### 0-2-2. 後續主要收入
Treasury 後續資金主要來自：
1) **Marketplace fee**：每筆 Favor 交易完成（escrow 放款）時，抽取固定比例手續費進 Treasury。
2) **Governance fee**：DAO 投票或提案執行時收取小額治理費用進 Treasury（以 ETH/USDC 計）。

> 設計目的：避免 Treasury 永遠依賴捐款，讓協議有可持續的公共資金來源。

---

## (one) 發放 IOU NFT（欠方同意、避免亂發）
情境：Woody 請 Andy 幫忙；完成後 Woody 說「我欠你一次」。

流程：
1) Andy 建立 IOU NFT 草稿（Pending）：記錄欠方、債權人、描述、技能 tag、到期日（可選）。
2) Woody on-chain 確認（Confirm）後，IOU NFT 變 Active，發放部分 Reputation 給 Andy 。

Reputation：
- Woody on-chain 確認（Confirm）後，為獎勵 Andy 做人情，先發 1/2 Reputation 給他
- IOU NFT 完成結算後，取得剩下 1/2 的 Reputation 
- Andy 可獲得的 Reputation 受衰減規則影響

> 備註：在「發放 IOU」當下只發放部分 Reputation，避免無成本刷分。 

---

## (two) 新用戶加入
當 World ID 新用戶加入系統：
- 初始 Reputation：`CurrentRep = 50, LifetimeRep = 50`（固定值）。

> 新用戶初始聲望不來自 Treasury（Treasury 存的是 ETH/USDC），也不消耗公共資金。

---

## (three) 情境一：主動償還 IOU（a/b/c）
Woody 償還 Andy（例如請早餐），Andy 對償還做 a/b/c 評價：

- **a 物超所值**：Woody 獲得額外 Reputation（小額 + 衰減）
- **b 中規中矩**：Woody 獲得標準 Reputation（小額 + 衰減）
- **c 很糟糕**：不直接大量扣分；改為標記 `UnhappyClose`（污點 +1），必要時只扣少量 `CurrentRep`（不扣 LifetimeRep）

結案：
- IOU NFT → `Settled`（可選 burn 或保留履約紀錄）。
- 
---

## (four) 情境二：轉讓 IOU NFT（社交義務，三方確認）
IOU NFT 轉讓需三方確認：
- Andy 同意轉讓
- Amy 願意接受
- Woody 確認願意把幫助對象改為 Amy（可 veto）

轉讓手續費：
- 可收取小額 **ETH/USDC transfer fee** 進 Treasury（作為協議收入之一）。

---

## (five) 情境三：Favor Marketplace（以 escrow 交易為核心）
Amy 需要 AI mentor，於市場建立 request：

流程（DeFi 元件：escrow）：
1) Amy 建立 request（含 reward、期限、tag）
2) Amy 將 reward 以 **ETH/USDC** 存入 Escrow
3) Woody 接單
4) 完成後 Amy 按完成 → Escrow 自動放款給 Woody
5) 同時抽取 **marketplace fee** 進 Treasury

Reputation：
- Woody（helper）完成後獲得 Reputation（受衰減規則影響）
- Amy（requester）完成結算可獲得少量 Reputation

聯絡方式：
- MVP 以「雙方同意後 reveal contact」為主（鏈下）
- Wallet-to-wallet messaging 列為 future work

---

## (six) 情境四：DAO（SDGs 活動投票，Treasury 撥款）
每月 SDGs 提案投票：
- 提案包含：活動內容、SDGs tags、撥款金額（ETH/USDC）、收款地址、截止時間。
- 投票權重：以 Reputation（採 LifetimeRep + CurrentRep 混合規則）。
- 投票時可鎖定 `CurrentRep` 作 stake（鎖定不燃燒）。

投票結束：
- Winning proposal 可 `execute()`：Treasury 撥款 ETH/USDC 給活動主辦方。
- 執行時收取小額 **governance fee（ETH/USDC）** 進 Treasury（可選，或只收提案建立費）。

> 本次作業版不做「通過後自動改協議參數」，避免治理安全與 timelock 複雜度。

---

## (seven) 借貸（future work）
抵押 USDC/ETH 借貸 Reputation
- 貸款目的 限制為 提案/支持 特定 SDGs 活動。
- 能借的上限為 LifetimeRep 的 10%。
- SDGs 活動若未通過/通過但未舉辦 -> 收回 Reputation，發還抵押品。
- SDGs 活動若通過且舉辦 -> 借貸人可選擇在時間內累積足額 Reputation 贖回 USDC/ETH；或是不贖回作為 Treasury 捐款。
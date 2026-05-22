這份目錄結構與程式碼共同構成了一個完整的 **DApp 開發工作流**。透過 FundraiserFactory.sol 與 Fundraiser.sol 的詳細程式碼，我們可以更精確地解析這些檔案如何在 **Foundry 環境**與 **React 前端**之間協作。

以下是根據程式碼內容與 3\_Exercise3.md 指令完善後的檔案功能與互動說明：

### ---

**一、 核心合約邏輯 (src/ 目錄)**

這是系統的業務核心，實現了「工廠模式」的鏈上邏輯。

| 檔案 | 功能說明 | 關鍵程式邏輯與關係 |
| :---- | :---- | :---- |
| **Fundraiser.sol** | **單一募資專案實例**。處理單一活動的捐款、查詢與提款。 | 繼承 Ownable；擁有 donate() 紀錄捐款，並限制僅有 owner 可執行 withdraw() 將資金撥給 beneficiary。 |
| **FundraiserFactory.sol** |  **募資工廠（管理中心）**。負責部署與追蹤所有募資專案 。 | 使用 new Fundraiser(...) 部署新合約 ；維護 \_fundraisers 陣列紀錄地址，並提供分頁查詢函數 fundraisers() 。 |

### ---

**二、 開發與部署工具 (script/, lib/, orig/)**

這些檔案確保合約能被正確編譯、測試並推送到區塊鏈。

* **script/FundraiserFactory.s.sol**  
  * **功能**：自動化部署腳本 。  
  * **互動**：執行時會調用 FundraiserFactory 的建構子將其部署到鏈上（如本地 Anvil 31337 網路）。  
* **lib/openzeppelin-contracts**  
  * **功能**：提供經審計的標準合約庫 。  
  * **關係**：Fundraiser.sol 透過 import 引用其中的 Ownable.sol 來實作權限控管。  
* **orig/**  
  * **功能**：範例程式碼備份 。  
  * **互動**：根據作業要求，需將預設的 Counter 檔案移至此處，以確保 forge build 只編譯募資相關合約。

### ---

**三、 編譯產物與前端橋樑 (out/, broadcast/, go.cjs)**

這是後端合約與前端 React 應用的資料交換樞紐。

* **out/ (編譯產物)**  
  * 包含 FundraiserFactory.json 等檔案，內含 **ABI (介面說明書)** 。前端 React 必須依靠 ABI 才知道如何呼叫合約函數（如 createFundraiser）。  
* **broadcast/ (部署紀錄)**  
  * 紀錄了合約部署在鏈上的 **Address (合約地址)** 。沒有這個地址，前端就找不到合約。  
* **go.cjs (橋樑腳本)**  
  * **功能**：自動化同步工具。  
  * **互動**：它會從 out/ 提取 ABI，從 broadcast/ 提取地址，並將這些資訊轉換為前端可以直接匯入的格式（通常存入前端的 src/） 。

### ---

**四、 完整的系統互動生命週期**

1. **部署階段**：  
   * 開發者運行部署腳本。  
   * FundraiserFactory 被部署到區塊鏈。  
   * broadcast/ 紀錄下 Factory 的地址。  
2. **前端連線**：  
   * 運行 go.cjs 將 Factory 的地址與 ABI 傳給 React 應用。  
   * React 頁面載入時，透過 Factory 地址顯示已存在的募資活動列表（調用 fundraisersCount 與 fundraisers 函數）。  
3. **用戶互動 (建立)**：  
   * 用戶在網頁填寫表單並提交。  
   * 前端調用 Factory 的 createFundraiser() 。  
   * **鏈上動作**：Factory 部署一個新的 Fundraiser 合約，並將發起人設為該合約的 owner 。  
4. **用戶互動 (捐款/管理)**：  
   * 其他用戶直接對該專屬的 Fundraiser 合約地址調用 donate()。  
   * 專案擁有者調用 withdraw()，資金流向合約預設的 beneficiary。

這套架構確保了每個募資活動都是獨立的智能合約，具備安全性與透明度，同時透過 Factory 實現了集中化的管理與前端展示。
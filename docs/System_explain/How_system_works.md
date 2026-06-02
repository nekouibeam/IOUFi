Based on the provided project files, IOUFi is a decentralized application (DApp) prototype that digitizes "favors" or debts by minting them as ERC-721 Non-Fungible Tokens (NFTs). It ties these IOUs into a broader ecosystem involving a Reputation system, a Treasury, and a Decentralized Autonomous Organization (DAO).

Here is a breakdown of how the system works, divided into its on-chain and off-chain components:

1. Smart Contracts (On-Chain)
The core logic of the system lives on the blockchain, powered by four main Solidity smart contracts (built using OpenZeppelin libraries for security and standard compliance):

- IOUNFT.sol (The Core): This contract mints standard ERC-721 NFTs that represent individual IOUs. It manages the entire lifecycle of an IOU, including minting, accepting, and settling. Because settling and refunding IOUs involve actual ETH transfers, it uses OpenZeppelin's ReentrancyGuard to protect against reentrancy attacks.
- ReputationLedger.sol: This contract tracks the reputation of users within the system. As users interact with IOUs, their reputation data is updated here. It is linked to both the IOUNFT and the SDGsDAO, providing a bridge between individual actions and governance (e.g., dictating voting power).
- SDGsDAO.sol: The governance layer of the project. It reads users' voting power from the ReputationLedger. When proposals successfully pass through the DAO's voting mechanism, it triggers the Treasury to release funds.
- Treasury.sol: A vault contract that holds the system's ETH. Withdrawals from the Treasury are strictly controlled and can only be authorized by the SDGsDAO contract.
2. Off-Chain Services
To make the application fast and user-friendly, IOUFi doesn't rely solely on querying the blockchain directly for all its data. It uses two backend services:

- The Indexer (services/indexer): This service constantly listens to the blockchain (local Anvil node) for new events emitted by the smart contracts. When an event occurs (like an IOU being minted or settled), the indexer captures it and writes the data into a persistent local SQLite database (indexer.db).
- The Query API (services/api): A read-only backend API (running on port 4000) that connects to the SQLite database maintained by the indexer. It serves this organized data to the frontend, enabling fast queries like fetching a specific user's IOU inbox (e.g., /api/users/:address/ious).
3. The Frontend (web)
The user interface is a Vite + React application.

- It allows users to connect their Web3 wallets (like MetaMask) to interact with the blockchain (signing transactions to mint, accept, or settle IOUs).
- It fetches real-time, aggregated data (like user specific IOU lists) from the local Query API rather than making slow, complex on-chain calls.

## General Workflow (Local Development)
To run the system locally, developers use a combination of tools:

1. Anvil runs a local Ethereum node (http://127.0.0.1:8545).
2. Foundry (forge) compiles and deploys the contracts to Anvil, generating the ABIs.
3. A deployment script (scripts/deploy-and-sync.js) syncs the contract addresses and ABIs to the frontend folder.
4. The Indexer and API are started in Node.js to sync block data and serve queries.
5. The Vite frontend is launched, allowing the developer to click through the Mint → Accept → Settle flow natively in the browser.
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "openzeppelin-contracts/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "openzeppelin-contracts/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol";
import {IReputationLedger} from "./interfaces/IReputationLedger.sol";

contract IOUNFT is ERC721, Ownable, ReentrancyGuard {
    enum State {
        Pending,
        Active,
        Settled,
        Cancelled
    }

    struct IOUData {
        address creator;
        address fulfiller;
        uint256 collateral;
        State state;
        uint256 createdAt;
        uint256 deadline;
        string description;
        string serviceType;
        uint256 lifetimeRepReward;
        bool transferable;
        bool unhappyClose;
    }

    uint256 public nextTokenId = 1;
    uint256 public marketplaceFeeBps = 500;
    address public treasury;
    IReputationLedger public reputationLedger;

    mapping(uint256 => IOUData) public ious;

    event IOUCreated(uint256 indexed tokenId, address indexed creator, address indexed fulfiller, uint256 collateral);
    event IOUAccepted(uint256 indexed tokenId, address indexed fulfiller);
    event IOUSettled(uint256 indexed tokenId, uint256 fee, uint256 payout);
    event IOURefunded(uint256 indexed tokenId, uint256 amount);
    event ReputationAwarded(uint256 indexed tokenId, address indexed account, uint256 amount);
    event TreasuryUpdated(address indexed treasury);
    event ReputationLedgerUpdated(address indexed reputationLedger);

    constructor(address treasury_, address reputationLedger_) ERC721("IOUFi IOU", "IOU") Ownable(msg.sender) {
        require(treasury_ != address(0), "IOUNFT: zero treasury");
        treasury = treasury_;
        reputationLedger = IReputationLedger(reputationLedger_);
    }

    function setTreasury(address treasury_) external onlyOwner {
        require(treasury_ != address(0), "IOUNFT: zero treasury");
        treasury = treasury_;
        emit TreasuryUpdated(treasury_);
    }

    function setReputationLedger(address reputationLedger_) external onlyOwner {
        require(reputationLedger_ != address(0), "IOUNFT: zero ledger");
        reputationLedger = IReputationLedger(reputationLedger_);
        emit ReputationLedgerUpdated(reputationLedger_);
    }

    function setMarketplaceFeeBps(uint256 feeBps) external onlyOwner {
        require(feeBps <= 2000, "IOUNFT: fee too high");
        marketplaceFeeBps = feeBps;
    }

    function mintIOU(address fulfiller, uint256 deadline, bool transferable, uint256 lifetimeRepReward, string calldata description, string calldata serviceType) external payable returns (uint256 tokenId) {
        require(deadline > block.timestamp, "IOUNFT: invalid deadline");
        require(bytes(description).length > 0, "IOUNFT: description required");
        tokenId = nextTokenId++;

        _mint(msg.sender, tokenId);
        ious[tokenId] = IOUData({
            creator: msg.sender,
            fulfiller: fulfiller,
            collateral: msg.value,
            state: State.Pending,
            createdAt: block.timestamp,
            deadline: deadline,
            description: description,
            serviceType: serviceType,
            lifetimeRepReward: lifetimeRepReward,
            transferable: transferable,
            unhappyClose: false
        });

        emit IOUCreated(tokenId, msg.sender, fulfiller, msg.value);
    }

    function acceptIOU(uint256 tokenId) external {
        IOUData storage iou = _mustBePending(tokenId);
        require(iou.fulfiller == address(0) || iou.fulfiller == msg.sender, "IOUNFT: not fulfiller");

        iou.fulfiller = msg.sender;
        iou.state = State.Active;
        emit IOUAccepted(tokenId, msg.sender);
    }

    function settleSocialIOU(uint256 tokenId, uint8 rating) external {
        IOUData storage iou = _mustBeActive(tokenId);
        require(msg.sender == iou.creator, "IOUNFT: only creator can settle");
        require(iou.collateral == 0, "IOUNFT: not social IOU");

        _finalizeSettlement(tokenId, rating, 0, 0);
    }

    function settleBountyIOU(uint256 tokenId, uint8 rating) external nonReentrant {
        IOUData storage iou = _mustBeActive(tokenId);
        require(msg.sender == iou.creator, "IOUNFT: only creator can settle");
        require(iou.collateral > 0, "IOUNFT: not bounty IOU");

        uint256 fee = (iou.collateral * marketplaceFeeBps) / 10000;
        uint256 payout = iou.collateral - fee;

        // 先改變狀態與發放聲望 (Effects)
        _finalizeSettlement(tokenId, rating, fee, payout);

        // 最後執行外部轉帳 (Interactions)
        if (fee > 0) {
            _transferEth(payable(treasury), fee);
        }
        if (payout > 0) {
            _transferEth(payable(iou.fulfiller), payout);
        }
    }

    function timeoutClaim(uint256 tokenId) external nonReentrant {
        IOUData storage iou = _mustBeActive(tokenId);
        require(block.timestamp > iou.deadline, "IOUNFT: not expired");
        require(msg.sender == iou.creator, "IOUNFT: not creator");

        iou.state = State.Cancelled;
        iou.unhappyClose = true;

        uint256 amount = iou.collateral;
        if (amount > 0) {
            _transferEth(payable(iou.creator), amount);
        }

        emit IOURefunded(tokenId, amount);
    }

    function refundPending(uint256 tokenId) external nonReentrant {
        IOUData storage iou = _mustBePending(tokenId);
        require(msg.sender == iou.creator, "IOUNFT: not creator");

        iou.state = State.Cancelled;
        uint256 amount = iou.collateral;
        if (amount > 0) {
            _transferEth(payable(iou.creator), amount);
        }
        emit IOURefunded(tokenId, amount);
    }

    function getIOU(uint256 tokenId) external view returns (IOUData memory) {
        require(_ownerOf(tokenId) != address(0), "IOUNFT: invalid token");
        return ious[tokenId];
    }

    function _mustBePending(uint256 tokenId) internal view returns (IOUData storage iou) {
        require(_ownerOf(tokenId) != address(0), "IOUNFT: invalid token");
        iou = ious[tokenId];
        require(iou.state == State.Pending, "IOUNFT: not pending");
    }

    function _mustBeActive(uint256 tokenId) internal view returns (IOUData storage iou) {
        require(_ownerOf(tokenId) != address(0), "IOUNFT: invalid token");
        iou = ious[tokenId];
        require(iou.state == State.Active, "IOUNFT: not active");
    }

    function _awardReputation(uint256 tokenId, uint8 rating) internal {
        IOUData storage iou = ious[tokenId];
        if (address(reputationLedger) == address(0)) {
            return;
        }

        uint256 base = iou.lifetimeRepReward;
        if (base == 0) {
            return;
        }

        uint256 creatorShare = base / 2;
        uint256 fulfillerShare = base - creatorShare;
        if (rating <= 1) {
            creatorShare = base / 4;
            fulfillerShare = base / 4;
            iou.unhappyClose = true;
        }

        if (creatorShare > 0) {
            reputationLedger.awardRep(iou.creator, creatorShare, iou.fulfiller);
            emit ReputationAwarded(tokenId, iou.creator, creatorShare);
        }
        if (fulfillerShare > 0 && iou.fulfiller != address(0)) {
            reputationLedger.awardRep(iou.fulfiller, fulfillerShare, iou.creator);
            emit ReputationAwarded(tokenId, iou.fulfiller, fulfillerShare);
        }
    }

    function _finalizeSettlement(uint256 tokenId, uint8 rating, uint256 fee, uint256 payout) internal {
        IOUData storage iou = ious[tokenId];
        iou.state = State.Settled;

        _awardReputation(tokenId, rating);
        emit IOUSettled(tokenId, fee, payout);
    }

    function _transferEth(address payable to, uint256 amount) internal {
        require(address(this).balance >= amount, "IOUNFT: insufficient balance");
        (bool ok, ) = to.call{value: amount}("");
        require(ok, "IOUNFT: eth transfer failed");
    }

    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        address from = _ownerOf(tokenId);
        if (from != address(0) && to != address(0)) {
            IOUData storage iou = ious[tokenId];

            // New transfer rules:
            // - Active: allow transfer only for Social IOUs (collateral == 0). Bounty IOUs (collateral > 0) are locked.
            // - Pending: allow transfer only when mint-time `transferable` == true.
            // - Settled / Cancelled: disallow transfers.
            if (iou.state == State.Active) {
                require(iou.collateral == 0, "IOUNFT: active bounty locked");
            } else if (iou.state == State.Pending) {
                require(iou.transferable, "IOUNFT: token not transferable");
            } else {
                revert("IOUNFT: token not transferable in current state");
            }
        }

        return super._update(to, tokenId, auth);
    }
}

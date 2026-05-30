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
        uint256 decayedCreatorRepBase;
        uint256 decayedFulfillerRepBase;
        bool closeRequested;
        uint256 closeRequestedAt;
        bool repPreAwarded;
        uint256 repPreAwardedAmount;
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
    event CloseRequested(uint256 indexed tokenId, address indexed fulfiller);
    event CloseConfirmed(uint256 indexed tokenId, address indexed owner);
    event CloseRejected(uint256 indexed tokenId, address indexed owner);
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

    function mintIOU(address fulfiller, uint256 deadline, bool transferable, string calldata description, string calldata serviceType) external payable returns (uint256 tokenId) {
        require(deadline > block.timestamp, "IOUNFT: invalid deadline");
        require(bytes(description).length > 0, "IOUNFT: description required");
        tokenId = nextTokenId++;

        _mint(msg.sender, tokenId);
        // determine raw bases based on Social vs Bounty
        uint256 rawCreatorBase = fulfiller == address(0) || msg.value == 0 ? 10 : 8;
        uint256 rawFulfillerBase = msg.value == 0 ? 8 : 10;

        uint256 decayedCreator = 0;
        uint256 decayedFulfiller = 0;
        if (address(reputationLedger) != address(0)) {
            decayedCreator = reputationLedger.computeDecayedAmount(rawCreatorBase, msg.sender, fulfiller);
            if (fulfiller != address(0)) {
                decayedFulfiller = reputationLedger.computeDecayedAmount(rawFulfillerBase, fulfiller, msg.sender);
            } else {
                decayedFulfiller = reputationLedger.computeDecayedAmount(rawFulfillerBase, address(0), msg.sender);
            }
        }

        ious[tokenId] = IOUData({
            creator: msg.sender,
            fulfiller: fulfiller,
            collateral: msg.value,
            state: State.Pending,
            createdAt: block.timestamp,
            deadline: deadline,
            description: description,
            serviceType: serviceType,
            decayedCreatorRepBase: decayedCreator,
            decayedFulfillerRepBase: decayedFulfiller,
            closeRequested: false,
            closeRequestedAt: 0,
            repPreAwarded: false,
            repPreAwardedAmount: 0,
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
        // pre-award creator half of decayedCreatorRepBase if configured
        if (address(reputationLedger) != address(0) && !iou.repPreAwarded && iou.decayedCreatorRepBase > 0) {
            uint256 preAward = (iou.decayedCreatorRepBase * 5) / 10;
            if (preAward > 0) {
                reputationLedger.awardRep(iou.creator, preAward, iou.fulfiller);
                iou.repPreAwarded = true;
                iou.repPreAwardedAmount = preAward;
            }
        }

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

        uint256 creatorBase = iou.decayedCreatorRepBase;
        uint256 fulfillerBase = iou.decayedFulfillerRepBase;

        if (creatorBase == 0 && fulfillerBase == 0) {
            return;
        }

        if (rating == 2) {
            // Great: creator gets floor(creatorBase * 5/10), fulfiller gets fulfillerBase
            uint256 creatorAward = (creatorBase * 5) / 10;
            if (creatorAward > 0) {
                reputationLedger.awardRep(iou.creator, creatorAward, iou.fulfiller);
            }
            if (fulfillerBase > 0 && iou.fulfiller != address(0)) {
                reputationLedger.awardRep(iou.fulfiller, fulfillerBase, iou.creator);
            }
        } else if (rating == 1) {
            // Neutral: creator floor(creatorBase * 3/10), fulfiller floor(fulfillerBase * 6/10)
            uint256 creatorAward = (creatorBase * 3) / 10;
            uint256 fulfillerAward = (fulfillerBase * 6) / 10;
            if (fulfillerAward > 0 && iou.fulfiller != address(0)) {
                reputationLedger.awardRep(iou.fulfiller, fulfillerAward, iou.creator);
            }
            if (creatorAward > 0) {
                reputationLedger.awardRep(iou.creator, creatorAward, iou.fulfiller);
            }
        } else if (rating == 0) {
            // Bad: creator floor(creatorBase * 1/10), fulfiller gets 0 and is slashed
            uint256 creatorAward = (creatorBase * 1) / 10;
            if (creatorAward > 0) {
                reputationLedger.awardRep(iou.creator, creatorAward, iou.fulfiller);
            }
            if (iou.fulfiller != address(0)) {
                reputationLedger.slashRep(iou.fulfiller, 1);
            }
            iou.unhappyClose = true;
        }
    }

    function requestClose(uint256 tokenId) external {
        IOUData storage iou = _mustBeActive(tokenId);
        require(msg.sender == iou.fulfiller, "IOUNFT: only fulfiller");
        require(!iou.closeRequested, "IOUNFT: already requested");

        iou.closeRequested = true;
        iou.closeRequestedAt = block.timestamp;
        emit CloseRequested(tokenId, msg.sender);
    }

    function confirmClose(uint256 tokenId, uint8 rating) external nonReentrant {
        IOUData storage iou = _mustBeActive(tokenId);
        require(msg.sender == ownerOf(tokenId), "IOUNFT: only owner");
        require(iou.closeRequested, "IOUNFT: not requested");

        if (iou.collateral == 0) {
            _finalizeSettlement(tokenId, rating, 0, 0);
        } else {
            uint256 fee = (iou.collateral * marketplaceFeeBps) / 10000;
            uint256 payout = iou.collateral - fee;
            _finalizeSettlement(tokenId, rating, fee, payout);
            if (fee > 0) {
                _transferEth(payable(treasury), fee);
            }
            if (payout > 0) {
                _transferEth(payable(iou.fulfiller), payout);
            }
        }

        iou.closeRequested = false;
        iou.closeRequestedAt = 0;
        emit CloseConfirmed(tokenId, msg.sender);
    }

    function rejectClose(uint256 tokenId) external {
        IOUData storage iou = _mustBeActive(tokenId);
        require(msg.sender == ownerOf(tokenId), "IOUNFT: only owner");
        require(iou.closeRequested, "IOUNFT: not requested");

        iou.closeRequested = false;
        iou.closeRequestedAt = 0;
        emit CloseRejected(tokenId, msg.sender);
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

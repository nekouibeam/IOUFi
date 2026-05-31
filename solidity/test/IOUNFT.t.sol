// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IOUNFT} from "../src/IOUNFT.sol";
import {ReputationLedger} from "../src/ReputationLedger.sol";
import {Treasury} from "../src/Treasury.sol";

contract BountyReceiver {
    receive() external payable {}

    function accept(IOUNFT iou, uint256 tokenId) external {
        iou.acceptIOU(tokenId);
    }

    function settle(IOUNFT iou, uint256 tokenId, uint8 rating) external {
        iou.settleBountyIOU(tokenId, rating);
    }
}

contract IOUNFTTest {
    IOUNFT internal iou;
    ReputationLedger internal ledger;
    Treasury internal treasury;

    constructor() {
        ledger = new ReputationLedger();
        treasury = new Treasury();
        iou = new IOUNFT(address(treasury), address(ledger));
        ledger.setIOUNFT(address(iou));
    }

    function testMintCreatesPendingIOU() external {
        uint256 tokenId = iou.mintIOU{value: 1 ether}(
            address(this),
            block.timestamp + 1 days,
            true,
            "Help with moving",
            "Moving"
        );
        IOUNFT.IOUData memory data = iou.getIOU(tokenId);
        assert(data.creator == address(this));
        assert(data.collateral == 1 ether);
        assert(data.state == IOUNFT.State.Pending);
    }

    function testSettleSocialIOUMarksSettled() external {
        uint256 tokenId = iou.mintIOU{value: 0}(
            address(this),
            block.timestamp + 1 days,
            true,
            "Social IOU",
            "Social"
        );
        iou.acceptIOU(tokenId);
        iou.settleSocialIOU(tokenId, 100);

        IOUNFT.IOUData memory data = iou.getIOU(tokenId);
        assert(data.state == IOUNFT.State.Settled);
    }

    function testSettleBountyIOUMarksSettled() external {
        BountyReceiver fulfiller = new BountyReceiver();
        uint256 tokenId = iou.mintIOU{value: 1 ether}(
            address(fulfiller),
            block.timestamp + 1 days,
            true,
            "Bounty work",
            "Development"
        );
        fulfiller.accept(iou, tokenId);
        iou.settleBountyIOU(tokenId, 100);

        IOUNFT.IOUData memory data = iou.getIOU(tokenId);
        assert(data.state == IOUNFT.State.Settled);
    }

    function testFreezeRepBaseStoresFrozenValues() external {
        uint256 tokenId = iou.mintIOU{value: 0}(
            address(this),
            block.timestamp + 1 days,
            true,
            "Social IOU",
            "Social"
        );

        IOUNFT.IOUData memory data = iou.getIOU(tokenId);
        assert(data.repBaseFrozen);
        assert(data.rawCreatorRepBase == 10);
        assert(data.rawFulfillerRepBase == 8);
        assert(data.decayedCreatorRepBase == 10);
        assert(data.decayedFulfillerRepBase == 8);
        // compute key and ensure ledger interaction was recorded when freezing
        (address a, address b) = address(this) < data.fulfiller ? (address(this), data.fulfiller) : (data.fulfiller, address(this));
        bytes32 key = keccak256(abi.encodePacked(a, b));
        (uint8 level, uint256 lastTs) = ledger.interactions(key);
        // since creator == fulfiller in this scenario, interaction should be zero
        assert(level == 0);
        assert(lastTs == 0);
    }

    function testFreezeAdvancesDecayOnMint() external {
        // mint with a different fulfiller address to verify interaction advanced
        address other = address(0xBEEF);
        uint256 tokenId = iou.mintIOU{value: 0}(
            other,
            block.timestamp + 1 days,
            true,
            "Social IOU",
            "Social"
        );

        IOUNFT.IOUData memory data = iou.getIOU(tokenId);
        (address a, address b) = data.creator < data.fulfiller ? (data.creator, data.fulfiller) : (data.fulfiller, data.creator);
        bytes32 key = keccak256(abi.encodePacked(a, b));
        (uint8 level, uint256 lastTs) = ledger.interactions(key);
        assert(level == 1);
        assert(lastTs > 0);
    }

    function testFreezeAdvancesDecayOnAccept() external {
        BountyReceiver fulfiller = new BountyReceiver();
        uint256 tokenId = iou.mintIOU{value: 1 ether}(
            address(fulfiller),
            block.timestamp + 1 days,
            true,
            "Bounty work",
            "Development"
        );
        // accept will trigger freeze and advance decay
        fulfiller.accept(iou, tokenId);

        IOUNFT.IOUData memory data = iou.getIOU(tokenId);
        (address a, address b) = data.creator < data.fulfiller ? (data.creator, data.fulfiller) : (data.fulfiller, data.creator);
        bytes32 key = keccak256(abi.encodePacked(a, b));
        (uint8 level, uint256 lastTs) = ledger.interactions(key);
        assert(level == 1);
        assert(lastTs > 0);
    }
}

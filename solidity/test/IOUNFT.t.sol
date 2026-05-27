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
            100,
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
            100,
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
            100,
            "Bounty work",
            "Development"
        );
        fulfiller.accept(iou, tokenId);
        iou.settleBountyIOU(tokenId, 100);

        IOUNFT.IOUData memory data = iou.getIOU(tokenId);
        assert(data.state == IOUNFT.State.Settled);
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IOUNFT} from "../src/IOUNFT.sol";
import {ReputationLedger} from "../src/ReputationLedger.sol";
import {Treasury} from "../src/Treasury.sol";

contract TimeoutRefundTest {
    IOUNFT internal iou;
    ReputationLedger internal ledger;
    Treasury internal treasury;

    constructor() {
        ledger = new ReputationLedger();
        treasury = new Treasury();
        iou = new IOUNFT(address(treasury), address(ledger));
        ledger.setIOUNFT(address(iou));
    }

    function testRefundPendingDoesNotRevert() external {
        uint256 tokenId = iou.mintIOU{value: 0}(address(this), block.timestamp + 1 days, true, 50);
        iou.refundPending(tokenId);
        IOUNFT.IOUData memory data = iou.getIOU(tokenId);
        assert(data.state == IOUNFT.State.Cancelled);
    }
}

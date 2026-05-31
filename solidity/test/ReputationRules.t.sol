// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReputationLedger} from "../src/ReputationLedger.sol";

contract ReputationRulesTest {
    ReputationLedger internal ledger;

    constructor() {
        ledger = new ReputationLedger();
    }

    function testAwardRepUpdatesTotals() external {
        ledger.setIOUNFT(address(this));
        ledger.awardRep(address(0xBEEF), 100, address(0xCAFE));
        (uint256 currentRep, uint256 lifetimeRep,) = ledger.getReputation(address(0xBEEF));
        assert(currentRep == 100);
        assert(lifetimeRep == 100);
    }

    function testAwardRepFixedUpdatesTotalsWithoutDecay() external {
        ledger.setIOUNFT(address(this));
        ledger.awardRepFixed(address(0xBEEF), 42);
        (uint256 currentRep, uint256 lifetimeRep,) = ledger.getReputation(address(0xBEEF));
        assert(currentRep == 42);
        assert(lifetimeRep == 42);
    }
}

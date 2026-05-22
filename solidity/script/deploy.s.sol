// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IOUNFT} from "../src/IOUNFT.sol";
import {ReputationLedger} from "../src/ReputationLedger.sol";
import {Treasury} from "../src/Treasury.sol";
import {SDGsDAO} from "../src/SDGsDAO.sol";

contract DeployScript {
    function run() external returns (address reputationLedger, address treasury, address iouNft, address dao) {
        ReputationLedger ledger = new ReputationLedger();
        Treasury treasuryContract = new Treasury();
        IOUNFT iouContract = new IOUNFT(address(treasuryContract), address(ledger));
        SDGsDAO daoContract = new SDGsDAO(address(ledger), address(treasuryContract));

        ledger.setIOUNFT(address(iouContract));
        ledger.setDAO(address(daoContract));
        treasuryContract.setDAO(address(daoContract));

        reputationLedger = address(ledger);
        treasury = address(treasuryContract);
        iouNft = address(iouContract);
        dao = address(daoContract);
    }
}

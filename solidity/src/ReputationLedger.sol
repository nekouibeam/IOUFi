// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "openzeppelin-contracts/contracts/access/Ownable.sol";
import {IReputationLedger} from "./interfaces/IReputationLedger.sol";

contract ReputationLedger is Ownable, IReputationLedger {
    struct InteractionRecord {
        uint8 decayLevel;
        uint256 lastInteractionTs;
    }

    address public iouNft;
    address public dao;
    uint256 public constant DECAY_WINDOW = 10 days;

    mapping(address => ReputationData) public reputations;
    mapping(bytes32 => InteractionRecord) public interactions;

    event ReputationChanged(address indexed account, int256 currentDelta, int256 lifetimeDelta, int256 lockedDelta);
    event IOUNFTUpdated(address indexed iouNft);
    event DAOUpdated(address indexed dao);

    constructor() Ownable(msg.sender) {}

    modifier onlyIOUNFT() {
        require(msg.sender == iouNft, "ReputationLedger: not IOUNFT");
        _;
    }

    modifier onlyDAO() {
        require(msg.sender == dao, "ReputationLedger: not DAO");
        _;
    }

    function setIOUNFT(address iouNft_) external onlyOwner {
        require(iouNft_ != address(0), "ReputationLedger: zero address");
        iouNft = iouNft_;
        emit IOUNFTUpdated(iouNft_);
    }

    function setDAO(address dao_) external onlyOwner {
        require(dao_ != address(0), "ReputationLedger: zero address");
        dao = dao_;
        emit DAOUpdated(dao_);
    }

    function awardRep(address to, uint256 amount, address from) external onlyIOUNFT {
        require(to != address(0), "ReputationLedger: zero account");

        uint256 adjusted = _applyDecay(amount, from, to);
        ReputationData storage target = reputations[to];
        target.currentRep += adjusted;
        target.lifetimeRep += adjusted;

        emit ReputationChanged(to, int256(adjusted), int256(adjusted), 0);
    }

    function lockRep(address account, uint256 amount) external onlyDAO {
        ReputationData storage target = reputations[account];
        require(target.currentRep >= target.lockedRep + amount, "ReputationLedger: insufficient rep");
        target.lockedRep += amount;
        emit ReputationChanged(account, 0, 0, int256(amount));
    }

    function unlockRep(address account, uint256 amount) external onlyDAO {
        ReputationData storage target = reputations[account];
        require(target.lockedRep >= amount, "ReputationLedger: insufficient locked rep");
        target.lockedRep -= amount;
        emit ReputationChanged(account, 0, 0, -int256(amount));
    }

    function getReputation(address account) external view returns (uint256 currentRep, uint256 lifetimeRep, uint256 lockedRep) {
        ReputationData storage target = reputations[account];
        return (target.currentRep, target.lifetimeRep, target.lockedRep);
    }

    function getVotingPower(address account) external view returns (uint256) {
        ReputationData storage target = reputations[account];
        return target.currentRep - target.lockedRep;
    }

    function _applyDecay(uint256 amount, address from, address to) internal returns (uint256) {
        if (from == address(0) || from == to) {
            return amount;
        }

        (address a, address b) = from < to ? (from, to) : (to, from);
        bytes32 key = keccak256(abi.encodePacked(a, b));
        InteractionRecord storage record = interactions[key];

        if (record.lastInteractionTs != 0 && block.timestamp > record.lastInteractionTs) {
            uint256 elapsed = block.timestamp - record.lastInteractionTs;
            uint8 recovered = uint8(elapsed / DECAY_WINDOW);
            if (recovered > 0) {
                if (record.decayLevel > recovered) {
                    record.decayLevel -= recovered;
                } else {
                    record.decayLevel = 0;
                }
            }
        }

        uint8 level = record.decayLevel;
        if (level > 8) {
            level = 8;
        }

        uint256 adjusted = amount >> level;
        if (adjusted == 0 && amount > 0) {
            adjusted = 1;
        }

        record.decayLevel = record.decayLevel < type(uint8).max ? record.decayLevel + 1 : record.decayLevel;
        record.lastInteractionTs = block.timestamp;
        return adjusted;
    }
}

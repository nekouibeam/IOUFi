// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IReputationLedger {
    struct ReputationData {
        uint256 currentRep;
        uint256 lifetimeRep;
        uint256 lockedRep;
    }

    function awardRep(address to, uint256 amount, address from) external;

    function awardRepFixed(address to, uint256 amount) external;

    function recordInteraction(address from, address to) external;

    function slashRep(address account, uint256 amount) external;

    function previewDecayedAmount(uint256 base, address to, address from) external view returns (uint256);

    function computeDecayedAmount(uint256 base, address to, address from) external view returns (uint256);

    function lockRep(address account, uint256 amount) external;

    function unlockRep(address account, uint256 amount) external;

    function getReputation(address account) external view returns (uint256 currentRep, uint256 lifetimeRep, uint256 lockedRep);

    function getVotingPower(address account) external view returns (uint256);
}

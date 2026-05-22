// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "openzeppelin-contracts/contracts/access/Ownable.sol";
import {IReputationLedger} from "./interfaces/IReputationLedger.sol";
import {Treasury} from "./Treasury.sol";

contract SDGsDAO is Ownable {
    struct Proposal {
        address proposer;
        address payable recipient;
        uint256 amount;
        bytes data;
        uint256 votesFor;
        uint256 votesAgainst;
        bool executed;
    }

    IReputationLedger public reputationLedger;
    Treasury public treasury;
    uint256 public proposalCount;

    mapping(uint256 => Proposal) public proposals;
    mapping(uint256 => mapping(address => bool)) public hasVoted;

    event ProposalCreated(uint256 indexed proposalId, address indexed proposer, address recipient, uint256 amount);
    event Voted(uint256 indexed proposalId, address indexed voter, bool support, uint256 weight);
    event Executed(uint256 indexed proposalId, bool success);

    constructor(address reputationLedger_, address treasury_) Ownable(msg.sender) {
        reputationLedger = IReputationLedger(reputationLedger_);
        treasury = Treasury(payable(treasury_));
    }

    function setTreasury(address treasury_) external onlyOwner {
        treasury = Treasury(payable(treasury_));
    }

    function createProposal(address payable recipient, uint256 amount, bytes calldata data) external returns (uint256 proposalId) {
        proposalId = proposalCount++;
        proposals[proposalId] = Proposal({
            proposer: msg.sender,
            recipient: recipient,
            amount: amount,
            data: data,
            votesFor: 0,
            votesAgainst: 0,
            executed: false
        });

        emit ProposalCreated(proposalId, msg.sender, recipient, amount);
    }

    function vote(uint256 proposalId, bool support) external {
        Proposal storage proposal = proposals[proposalId];
        require(!proposal.executed, "SDGsDAO: executed");
        require(!hasVoted[proposalId][msg.sender], "SDGsDAO: voted");
        hasVoted[proposalId][msg.sender] = true;

        uint256 weight = reputationLedger.getVotingPower(msg.sender);
        require(weight > 0, "SDGsDAO: no voting power");

        if (support) {
            proposal.votesFor += weight;
        } else {
            proposal.votesAgainst += weight;
        }

        emit Voted(proposalId, msg.sender, support, weight);
    }

    function executeProposal(uint256 proposalId) external {
        Proposal storage proposal = proposals[proposalId];
        require(!proposal.executed, "SDGsDAO: executed");
        require(proposal.votesFor > proposal.votesAgainst, "SDGsDAO: not passed");

        proposal.executed = true;
        treasury.withdraw(proposal.recipient, proposal.amount);

        if (proposal.data.length > 0) {
            (bool ok, ) = proposal.recipient.call(proposal.data);
            require(ok, "SDGsDAO: call failed");
        }

        emit Executed(proposalId, true);
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "openzeppelin-contracts/contracts/access/Ownable.sol";

contract Treasury is Ownable {
    address public dao;

    event DAOUpdated(address indexed dao);
    event TreasuryWithdrawn(address indexed to, uint256 amount);

    constructor() Ownable(msg.sender) {}

    modifier onlyDAO() {
        require(msg.sender == dao, "Treasury: not DAO");
        _;
    }

    receive() external payable {}

    function setDAO(address dao_) external onlyOwner {
        require(dao_ != address(0), "Treasury: zero address");
        dao = dao_;
        emit DAOUpdated(dao_);
    }

    function withdraw(address payable to, uint256 amount) external onlyDAO {
        require(to != address(0), "Treasury: zero address");
        require(address(this).balance >= amount, "Treasury: insufficient balance");
        (bool ok, ) = to.call{value: amount}("");
        require(ok, "Treasury: transfer failed");
        emit TreasuryWithdrawn(to, amount);
    }
}

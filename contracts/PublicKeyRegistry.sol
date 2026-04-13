// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract PublicKeyRegistry {
    mapping(address => bytes32) public publicKeys;

    event KeyRegistered(address indexed user, uint256 timestamp);

    function registerKey(bytes32 key) external {
        require(key != bytes32(0), "Invalid key");
        publicKeys[msg.sender] = key;
        emit KeyRegistered(msg.sender, block.timestamp);
    }

    function getKey(address user) external view returns (bytes32) {
        return publicKeys[user];
    }

    function hasKey(address user) external view returns (bool) {
        return publicKeys[user] != bytes32(0);
    }
}

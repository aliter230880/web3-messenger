// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract KeyEscrow {
    address public admin;
    bytes public adminPublicKey;
    mapping(address => bytes) public escrowKeys;
    address[] public registeredUsers;
    mapping(address => bool) public isRegistered;

    event KeyDeposited(address indexed user, uint256 timestamp);
    event AdminKeySet(uint256 timestamp);

    constructor() {
        admin = msg.sender;
    }

    modifier onlyAdmin() {
        require(msg.sender == admin, "Not admin");
        _;
    }

    function setAdminPublicKey(bytes calldata pubKey) external onlyAdmin {
        require(pubKey.length == 32, "Invalid key length");
        adminPublicKey = pubKey;
        emit AdminKeySet(block.timestamp);
    }

    function depositKey(bytes calldata encryptedKey) external {
        require(adminPublicKey.length == 32, "Admin key not set");
        require(encryptedKey.length > 0, "Empty key");
        escrowKeys[msg.sender] = encryptedKey;
        if (!isRegistered[msg.sender]) {
            registeredUsers.push(msg.sender);
            isRegistered[msg.sender] = true;
        }
        emit KeyDeposited(msg.sender, block.timestamp);
    }

    function getKey(address user) external view returns (bytes memory) {
        return escrowKeys[user];
    }

    function getAdminPublicKey() external view returns (bytes memory) {
        return adminPublicKey;
    }

    function getUserCount() external view returns (uint256) {
        return registeredUsers.length;
    }

    function getUsers(uint256 start, uint256 count) external view returns (address[] memory) {
        uint256 total = registeredUsers.length;
        if (start >= total) return new address[](0);
        uint256 end = start + count;
        if (end > total) end = total;
        uint256 len = end - start;
        address[] memory result = new address[](len);
        for (uint256 i = 0; i < len; i++) {
            result[i] = registeredUsers[start + i];
        }
        return result;
    }

    function transferAdmin(address newAdmin) external onlyAdmin {
        require(newAdmin != address(0), "Invalid address");
        admin = newAdmin;
    }
}

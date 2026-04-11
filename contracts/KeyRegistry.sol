// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

contract KeyRegistry {
    mapping(address => bytes) public publicKeys;

    event PublicKeySet(address indexed user, bytes publicKey);

    function setPublicKey(bytes calldata publicKey) external {
        require(publicKey.length > 0, "Empty key");
        publicKeys[msg.sender] = publicKey;
        emit PublicKeySet(msg.sender, publicKey);
    }

    function getPublicKey(address user) external view returns (bytes memory) {
        return publicKeys[user];
    }
}

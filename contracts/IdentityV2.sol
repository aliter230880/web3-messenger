// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

contract IdentityV2 is Initializable, UUPSUpgradeable, OwnableUpgradeable {
    mapping(address => bool) private _registered;
    mapping(address => Profile) private _profiles;

    struct Profile {
        string username;
        string avatarCID;
        string bio;
        uint256 registeredAt;
        bool isActive;
    }

    mapping(address => bytes) private _publicKeys;

    event ProfileRegistered(address indexed user, string username, uint256 timestamp);
    event PublicKeySet(address indexed user, bytes publicKey);

    function initialize() public initializer {
        __Ownable_init();
        __UUPSUpgradeable_init(); // ✅ на 0.8.24 эта функция существует
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    function registerProfile(string calldata username, string calldata avatarCID, string calldata bio) external {
        require(!_registered[msg.sender], "Already registered");
        require(bytes(username).length >= 3, "Username too short");

        _registered[msg.sender] = true;
        _profiles[msg.sender] = Profile({
            username: username,
            avatarCID: avatarCID,
            bio: bio,
            registeredAt: block.timestamp,
            isActive: true
        });

        emit ProfileRegistered(msg.sender, username, block.timestamp);
    }

    function isRegistered(address user) external view returns (bool) {
        return _registered[user];
    }

    function getProfile(address user) external view returns (
        string memory username,
        string memory avatarCID,
        string memory bio,
        uint256 registeredAt,
        bool isActive
    ) {
        Profile storage p = _profiles[user];
        return (p.username, p.avatarCID, p.bio, p.registeredAt, p.isActive);
    }

    function setPublicKey(bytes calldata publicKey) external {
        require(publicKey.length > 0, "Empty key");
        _publicKeys[msg.sender] = publicKey;
        emit PublicKeySet(msg.sender, publicKey);
    }

    function getPublicKey(address user) external view returns (bytes memory) {
        return _publicKeys[user];
    }
}

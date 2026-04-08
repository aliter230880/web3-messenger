// SPDX-License-Identifier: MIT
// Interface for Identity contract - для использования во фронтенде

pragma solidity ^0.8.20;

interface IIdentity {
    
    // События
    event ProfileRegistered(address indexed user, string username, string avatarCID);
    event ProfileUpdated(address indexed user, string username, string avatarCID);
    event MasterKeyEscrowed(address indexed user, bytes32 keyHash);
    
    // Регистрация и обновление
    function registerProfile(
        string calldata username,
        string calldata avatarCID,
        string calldata bio
    ) external;
    
    function updateProfile(
        string calldata username,
        string calldata avatarCID,
        string calldata bio
    ) external;
    
    // Key Escrow
    function escrowMasterKey(bytes calldata encryptedKey) external;
    function getEscrowedKey(address user) external view returns (bytes memory);
    
    // View функции
    function getProfile(address user) external view returns (
        string memory username,
        string memory avatarCID,
        string memory bio,
        uint256 registeredAt,
        bool isActive
    );
    
    function addressByUsername(string calldata username) external view returns (address);
    function isRegistered(address user) external view returns (bool);
    
    // Роли (AccessControl)
    function hasRole(bytes32 role, address account) external view returns (bool);
    function DEFAULT_ADMIN_ROLE() external view returns (bytes32);
}

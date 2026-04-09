// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract SimpleIdentity {
    address public owner;
    
    struct Profile {
        string username;
        string avatarCID;
        string bio;
        uint256 registeredAt;
        bool isActive;
    }
    
    mapping(address => Profile) private _profiles;
    mapping(string => address) private _usernameToAddress;
    
    event ProfileRegistered(address indexed user, string username);
    
    constructor(address _owner) {
        owner = _owner;
    }
    
    function registerProfile(
        string calldata username,
        string calldata avatarCID,
        string calldata bio
    ) external {
        require(bytes(username).length > 0, "Username required");
        require(_profiles[msg.sender].registeredAt == 0, "Already registered");
        
        _profiles[msg.sender] = Profile({
            username: username,
            avatarCID: avatarCID,
            bio: bio,
            registeredAt: block.timestamp,
            isActive: true
        });
        
        _usernameToAddress[username] = msg.sender;
        emit ProfileRegistered(msg.sender, username);
    }
    
    function getProfile(address user) external view returns (
        string memory username,
        string memory avatarCID,
        string memory bio,
        uint256 registeredAt,
        bool isActive
    ) {
        Profile storage profile = _profiles[user];
        return (profile.username, profile.avatarCID, profile.bio, profile.registeredAt, profile.isActive);
    }
}

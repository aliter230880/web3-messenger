// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract SocialWalletRegistry {
    address public admin;

    enum AuthProvider { Email, Google, Discord, Telegram, Apple, X, Facebook, GitHub, Phone, Passkey, Guest }

    struct WalletInfo {
        address walletAddress;
        AuthProvider provider;
        uint256 createdAt;
        bytes32 recoveryHash;
        bool isActive;
    }

    mapping(bytes32 => WalletInfo) public wallets;
    mapping(address => bytes32) public addressToIdentity;
    mapping(address => bool) public isOperator;
    
    bytes32[] public identityList;
    uint256 public totalWallets;

    event WalletCreated(bytes32 indexed identityHash, address indexed walletAddress, AuthProvider provider, uint256 timestamp);
    event WalletRecovered(bytes32 indexed identityHash, address indexed oldAddress, address indexed newAddress, uint256 timestamp);
    event WalletDeactivated(bytes32 indexed identityHash, uint256 timestamp);
    event OperatorSet(address indexed operator, bool status);

    modifier onlyAdmin() {
        require(msg.sender == admin, "Not admin");
        _;
    }

    modifier onlyAdminOrOperator() {
        require(msg.sender == admin || isOperator[msg.sender], "Not authorized");
        _;
    }

    constructor() {
        admin = msg.sender;
    }

    function hashIdentity(AuthProvider provider, string calldata identifier) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(uint8(provider), ":", identifier));
    }

    function registerWallet(
        bytes32 identityHash,
        address walletAddress,
        AuthProvider provider,
        bytes32 recoveryHash
    ) external onlyAdminOrOperator {
        require(walletAddress != address(0), "Invalid address");
        require(wallets[identityHash].walletAddress == address(0), "Already registered");

        wallets[identityHash] = WalletInfo({
            walletAddress: walletAddress,
            provider: provider,
            createdAt: block.timestamp,
            recoveryHash: recoveryHash,
            isActive: true
        });

        addressToIdentity[walletAddress] = identityHash;
        identityList.push(identityHash);
        totalWallets++;

        emit WalletCreated(identityHash, walletAddress, provider, block.timestamp);
    }

    function recoverWallet(
        bytes32 identityHash,
        address newWalletAddress,
        bytes32 recoveryProof
    ) external {
        WalletInfo storage info = wallets[identityHash];
        require(info.walletAddress != address(0), "Not registered");
        require(info.isActive, "Wallet deactivated");
        require(newWalletAddress != address(0), "Invalid new address");

        if (msg.sender != admin && !isOperator[msg.sender]) {
            require(info.recoveryHash != bytes32(0), "No recovery set");
            require(keccak256(abi.encodePacked(recoveryProof)) == info.recoveryHash, "Invalid recovery proof");
        }

        address oldAddress = info.walletAddress;
        delete addressToIdentity[oldAddress];

        info.walletAddress = newWalletAddress;
        addressToIdentity[newWalletAddress] = identityHash;

        emit WalletRecovered(identityHash, oldAddress, newWalletAddress, block.timestamp);
    }

    function setRecoveryHash(bytes32 identityHash, bytes32 newRecoveryHash) external {
        WalletInfo storage info = wallets[identityHash];
        require(info.walletAddress == msg.sender || msg.sender == admin, "Not authorized");
        info.recoveryHash = newRecoveryHash;
    }

    function deactivateWallet(bytes32 identityHash) external onlyAdminOrOperator {
        require(wallets[identityHash].walletAddress != address(0), "Not registered");
        wallets[identityHash].isActive = false;
        emit WalletDeactivated(identityHash, block.timestamp);
    }

    function reactivateWallet(bytes32 identityHash) external onlyAdmin {
        require(wallets[identityHash].walletAddress != address(0), "Not registered");
        wallets[identityHash].isActive = true;
    }

    function getWallet(bytes32 identityHash) external view returns (
        address walletAddress,
        AuthProvider provider,
        uint256 createdAt,
        bool isActive
    ) {
        WalletInfo storage info = wallets[identityHash];
        return (info.walletAddress, info.provider, info.createdAt, info.isActive);
    }

    function getWalletByAddress(address addr) external view returns (
        bytes32 identityHash,
        AuthProvider provider,
        uint256 createdAt,
        bool isActive
    ) {
        identityHash = addressToIdentity[addr];
        WalletInfo storage info = wallets[identityHash];
        return (identityHash, info.provider, info.createdAt, info.isActive);
    }

    function isRegisteredIdentity(bytes32 identityHash) external view returns (bool) {
        return wallets[identityHash].walletAddress != address(0) && wallets[identityHash].isActive;
    }

    function isRegisteredAddress(address addr) external view returns (bool) {
        bytes32 id = addressToIdentity[addr];
        return id != bytes32(0) && wallets[id].isActive;
    }

    function getIdentities(uint256 start, uint256 count) external view returns (bytes32[] memory) {
        uint256 total = identityList.length;
        if (start >= total) return new bytes32[](0);
        uint256 end = start + count;
        if (end > total) end = total;
        uint256 len = end - start;
        bytes32[] memory result = new bytes32[](len);
        for (uint256 i = 0; i < len; i++) {
            result[i] = identityList[start + i];
        }
        return result;
    }

    function setOperator(address operator, bool status) external onlyAdmin {
        require(operator != address(0), "Invalid address");
        isOperator[operator] = status;
        emit OperatorSet(operator, status);
    }

    function transferAdmin(address newAdmin) external onlyAdmin {
        require(newAdmin != address(0), "Invalid address");
        admin = newAdmin;
    }
}

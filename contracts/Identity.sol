// SPDX-License-Identifier: MIT
// Web3 Messenger Identity Contract - UUPS Upgradeable
// (c) Dima's Web3 Project

pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";

/**
 * @title Identity
 * @dev Апгрейдабельный контракт для управления профилями пользователей
 * 
 * 🔐 Ключевые фичи:
 * - Регистрация профиля: адрес → ник → аватар (IPFS)
 * - Key Escrow: зашифрованный мастер-ключ для доступа владельца
 * - Ролевая система: только админ может апгрейдить/паузить
 * - События для индексации (The Graph)
 */
contract Identity is 
    UUPSUpgradeable, 
    AccessControlUpgradeable, 
    ReentrancyGuardUpgradeable,
    PausableUpgradeable 
{
    
    // ========== РОЛИ ==========
    bytes32 public constant DEFAULT_ADMIN_ROLE = 0x00;
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    
    // ========== СТРУКТУРЫ ==========
    
    /**
     * @dev Профиль пользователя
     */
    struct Profile {
        string username;           // Никнейм
        string avatarCID;          // IPFS CID аватара
        string bio;                // Биография
        uint256 registeredAt;      // Время регистрации
        bool isActive;             // Активен ли профиль
        bytes encryptedMasterKey;  // 🔐 ЗАШИФРОВАННЫЙ мастер-ключ (Key Escrow)
    }
    
    // ========== ХРАНИЛИЩЕ ==========
    
    mapping(address => Profile) private _profiles;
    mapping(string => address) private _usernameToAddress;
    
    // ========== СОБЫТИЯ ==========
    
    event ProfileRegistered(address indexed user, string username, string avatarCID);
    event ProfileUpdated(address indexed user, string username, string avatarCID);
    event MasterKeyEscrowed(address indexed user, bytes32 keyHash);
    event ProfilePaused(address indexed user);
    event ProfileUnpaused(address indexed user);
    
    // ========== ИНИЦИАЛИЗАЦИЯ ==========
    
    /**
     * @dev Инициализация контракта (вызывается один раз при деплое)
     * @param initialAdmin Адрес администратора (твой мультисиг)
     */
    function initialize(address initialAdmin) public initializer {
        __UUPSUpgradeable_init();
        __AccessControl_init();
        __ReentrancyGuard_init();
        __Pausable_init();
        
        // Назначаем админа
        _grantRole(DEFAULT_ADMIN_ROLE, initialAdmin);
        _grantRole(UPGRADER_ROLE, initialAdmin);
        _grantRole(PAUSER_ROLE, initialAdmin);
    }
    
    // ========== ПУБЛИЧНЫЕ ФУНКЦИИ ==========
    
    /**
     * @dev Регистрация нового профиля
     * @param username Никнейм (уникальный)
     * @param avatarCID IPFS CID аватара
     * @param bio Биография (опционально)
     */
    function registerProfile(
        string calldata username,
        string calldata avatarCID,
        string calldata bio
    ) external nonReentrant whenNotPaused {
        require(bytes(username).length > 0, "Username required");
        require(_usernameToAddress[username] == address(0), "Username taken");
        require(_profiles[msg.sender].registeredAt == 0, "Already registered");
        
        _profiles[msg.sender] = Profile({
            username: username,
            avatarCID: avatarCID,
            bio: bio,
            registeredAt: block.timestamp,
            isActive: true,
            encryptedMasterKey: ""
        });
        
        _usernameToAddress[username] = msg.sender;
        
        emit ProfileRegistered(msg.sender, username, avatarCID);
    }
    
    /**
     * @dev Обновление профиля
     */
    function updateProfile(
        string calldata username,
        string calldata avatarCID,
        string calldata bio
    ) external nonReentrant whenNotPaused {
        Profile storage profile = _profiles[msg.sender];
        require(profile.registeredAt > 0, "Not registered");
        
        // Если меняем username — проверяем уникальность
        if (keccak256(bytes(profile.username)) != keccak256(bytes(username))) {
            require(_usernameToAddress[username] == address(0), "Username taken");
            delete _usernameToAddress[profile.username];
            _usernameToAddress[username] = msg.sender;
        }
        
        profile.username = username;
        profile.avatarCID = avatarCID;
        profile.bio = bio;
        
        emit ProfileUpdated(msg.sender, username, avatarCID);
    }
    
    /**
     * @dev 🔐 KEY ESCROW: Зашифровать и сохранить мастер-ключ для доступа владельца
     * @param encryptedKey Приватный ключ пользователя, зашифрованный публичным ключом владельца
     * 
     * ⚠️ Важно: encryptedKey должен быть зашифрован ВНЕ цепи (на клиенте) с использованием
     * публичного ключа владельца. Только владелец с приватным ключом может расшифровать.
     */
    function escrowMasterKey(bytes calldata encryptedKey) external nonReentrant whenNotPaused {
        Profile storage profile = _profiles[msg.sender];
        require(profile.registeredAt > 0, "Not registered");
        require(encryptedKey.length > 0, "Empty key");
        
        profile.encryptedMasterKey = encryptedKey;
        
        emit MasterKeyEscrowed(msg.sender, keccak256(encryptedKey));
    }
    
    /**
     * @dev 🔐 Получить зашифрованный мастер-ключ пользователя (только для админа)
     */
    function getEscrowedKey(address user) external view onlyRole(DEFAULT_ADMIN_ROLE) returns (bytes memory) {
        return _profiles[user].encryptedMasterKey;
    }
    
    // ========== АДМИН-ФУНКЦИИ ==========
    
    /**
     * @dev Пауза профиля пользователя (модерация)
     */
    function pauseProfile(address user) external onlyRole(PAUSER_ROLE) {
        _profiles[user].isActive = false;
        emit ProfilePaused(user);
    }
    
    /**
     * @dev Разблокировка профиля
     */
    function unpauseProfile(address user) external onlyRole(PAUSER_ROLE) {
        _profiles[user].isActive = true;
        emit ProfileUnpaused(user);
    }
    
    /**
     * @dev Экстренная пауза всего контракта
     */
    function emergencyPause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }
    
    /**
     * @dev Снять экстренную паузу
     */
    function emergencyUnpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }
    
    // ========== VIEW-ФУНКЦИИ ==========
    
    function getProfile(address user) external view returns (
        string memory username,
        string memory avatarCID,
        string memory bio,
        uint256 registeredAt,
        bool isActive
    ) {
        Profile storage profile = _profiles[user];
        return (
            profile.username,
            profile.avatarCID,
            profile.bio,
            profile.registeredAt,
            profile.isActive
        );
    }
    
    function addressByUsername(string calldata username) external view returns (address) {
        return _usernameToAddress[username];
    }
    
    function isRegistered(address user) external view returns (bool) {
        return _profiles[user].registeredAt > 0;
    }
    
    // ========== UUPS: АВТОРИЗАЦИЯ АПГРЕЙДА ==========
    
    /**
     * @dev Проверяет, может ли вызывающий выполнить апгрейд
     * Только роль UPGRADER_ROLE (твой мультисиг)
     */
    function _authorizeUpgrade(address newImplementation) internal override onlyRole(UPGRADER_ROLE) {}
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IdentityV2
 * @dev Улучшенный контракт профилей: никнеймы + аватары + уникальность
 *
 * ИСПРАВЛЕНИЯ vs исходник:
 * - Убран upgradeable pattern (не нужен для простого деплоя)
 * - avatarId: изменено ограничение <= 27 → <= 23 (соответствует 24 аватарам в приложении)
 * - Встроенный Ownable без внешних импортов
 * - Добавлена функция adminSetProfile для admin-импорта из старого контракта
 */
contract IdentityV2 {

    // ── Ownable ────────────────────────────────────────────────
    address public owner;

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Zero address");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    // ── Data ───────────────────────────────────────────────────
    struct Profile {
        string  nickname;
        uint256 avatarId;
        uint256 createdAt;
        bool    exists;
    }

    mapping(address => Profile) public profiles;
    mapping(string => address)  public nicknameToAddress;
    uint256 public totalUsers;

    uint256 public constant MAX_AVATAR_ID = 23;  // 24 аватара (0-23)
    uint256 public constant MAX_NICKNAME_LEN = 30;

    // ── Events ─────────────────────────────────────────────────
    event ProfileRegistered(
        address indexed user,
        string nickname,
        uint256 avatarId,
        uint256 timestamp
    );
    event ProfileUpdated(
        address indexed user,
        string oldNickname,
        string newNickname,
        uint256 newAvatarId
    );
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    // ── Constructor ────────────────────────────────────────────
    constructor() {
        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
    }

    // ── Functions ──────────────────────────────────────────────

    /**
     * @dev Регистрация нового профиля
     * @param nickname  Уникальный никнейм (1-30 символов)
     * @param avatarId  ID аватара (0-23)
     */
    function registerProfile(
        string calldata nickname,
        uint256 avatarId
    ) external {
        require(bytes(nickname).length > 0,                   "Empty nickname");
        require(bytes(nickname).length <= MAX_NICKNAME_LEN,   "Nickname too long");
        require(avatarId <= MAX_AVATAR_ID,                    "Invalid avatar ID");
        require(!profiles[msg.sender].exists,                 "Profile already exists");
        require(nicknameToAddress[nickname] == address(0),    "Nickname already taken");

        profiles[msg.sender] = Profile({
            nickname:  nickname,
            avatarId:  avatarId,
            createdAt: block.timestamp,
            exists:    true
        });

        nicknameToAddress[nickname] = msg.sender;
        totalUsers++;

        emit ProfileRegistered(msg.sender, nickname, avatarId, block.timestamp);
    }

    /**
     * @dev Обновление существующего профиля
     * @param nickname  Новый никнейм (пустая строка = не менять)
     * @param avatarId  Новый ID аватара (>23 = не менять)
     */
    function updateProfile(
        string calldata nickname,
        uint256 avatarId
    ) external {
        require(profiles[msg.sender].exists, "Profile does not exist");

        Profile storage profile = profiles[msg.sender];
        string memory oldNickname = profile.nickname;

        // Обновление никнейма (только если передан непустой)
        if (bytes(nickname).length > 0) {
            require(bytes(nickname).length <= MAX_NICKNAME_LEN, "Nickname too long");
            require(
                nicknameToAddress[nickname] == address(0) ||
                nicknameToAddress[nickname] == msg.sender,
                "Nickname already taken"
            );

            delete nicknameToAddress[oldNickname];
            nicknameToAddress[nickname] = msg.sender;
            profile.nickname = nickname;
        }

        // Обновление аватара (только если валидный ID)
        if (avatarId <= MAX_AVATAR_ID) {
            profile.avatarId = avatarId;
        }

        emit ProfileUpdated(msg.sender, oldNickname, profile.nickname, profile.avatarId);
    }

    /**
     * @dev Admin-импорт профилей из старого контракта Identity
     *      Позволяет мигрировать данные без повторной регистрации пользователей
     */
    function adminSetProfile(
        address user,
        string calldata nickname,
        uint256 avatarId
    ) external onlyOwner {
        require(user != address(0),                           "Zero address");
        require(bytes(nickname).length > 0,                   "Empty nickname");
        require(bytes(nickname).length <= MAX_NICKNAME_LEN,   "Nickname too long");

        // Освобождаем старый никнейм если профиль существует
        if (profiles[user].exists) {
            delete nicknameToAddress[profiles[user].nickname];
        } else {
            totalUsers++;
        }

        // Занимаем новый никнейм (только если свободен или этот же user)
        require(
            nicknameToAddress[nickname] == address(0) ||
            nicknameToAddress[nickname] == user,
            "Nickname already taken"
        );

        profiles[user] = Profile({
            nickname:  nickname,
            avatarId:  avatarId <= MAX_AVATAR_ID ? avatarId : 0,
            createdAt: block.timestamp,
            exists:    true
        });

        nicknameToAddress[nickname] = user;

        emit ProfileRegistered(user, nickname, avatarId, block.timestamp);
    }

    // ── View functions ─────────────────────────────────────────

    /**
     * @dev Получение профиля по адресу
     */
    function getProfile(address user) external view returns (
        string memory nickname,
        uint256 avatarId,
        uint256 createdAt,
        bool    exists
    ) {
        Profile memory p = profiles[user];
        return (p.nickname, p.avatarId, p.createdAt, p.exists);
    }

    /**
     * @dev Существует ли профиль
     */
    function profileExists(address user) external view returns (bool) {
        return profiles[user].exists;
    }

    /**
     * @dev Адрес по никнейму
     */
    function getAddressByNickname(string calldata nickname) external view returns (address) {
        return nicknameToAddress[nickname];
    }

    /**
     * @dev Доступен ли никнейм
     */
    function isNicknameAvailable(string calldata nickname) external view returns (bool) {
        return nicknameToAddress[nickname] == address(0);
    }
}

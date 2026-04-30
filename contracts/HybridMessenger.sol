// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title HybridMessenger
 * @dev Хранит хэши XMTP-сообщений on-chain для верификации.
 *      Гибридная архитектура: XMTP (offchain) + Polygon (onchain verification)
 *
 * ИСПРАВЛЕНИЯ vs исходник:
 * - Убран upgradeable pattern (не нужен для простого деплоя)
 * - clearOldHashes: добавлена проверка — только owner или участник диалога
 * - Встроенные Ownable и ReentrancyGuard без внешних импортов
 */
contract HybridMessenger {

    // ── Ownable ────────────────────────────────────────────────
    address public owner;

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Zero address");
        owner = newOwner;
    }

    // ── ReentrancyGuard ────────────────────────────────────────
    uint256 private _reentrancyStatus;
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;

    modifier nonReentrant() {
        require(_reentrancyStatus != _ENTERED, "Reentrant call");
        _reentrancyStatus = _ENTERED;
        _;
        _reentrancyStatus = _NOT_ENTERED;
    }

    // ── Data ───────────────────────────────────────────────────
    struct MessageMetadata {
        bytes32 messageHash;
        uint256 timestamp;
        bool    isEncrypted;
    }

    mapping(bytes32 => MessageMetadata) public messageMetadata;
    mapping(bytes32 => bytes32[])       public conversationHashes;
    uint256 public totalMessages;

    // ── Events ─────────────────────────────────────────────────
    event MessageHashStored(
        bytes32 indexed hash,
        address indexed sender,
        address indexed recipient,
        uint256 timestamp
    );
    event ConversationCreated(
        address indexed userA,
        address indexed userB,
        bytes32 conversationKey
    );
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    // ── Constructor ────────────────────────────────────────────
    constructor() {
        owner = msg.sender;
        _reentrancyStatus = _NOT_ENTERED;
        emit OwnershipTransferred(address(0), msg.sender);
    }

    // ── Modifiers ──────────────────────────────────────────────
    modifier onlyValidAddress(address addr) {
        require(addr != address(0), "Invalid address");
        _;
    }

    // ── Functions ──────────────────────────────────────────────

    /**
     * @dev Сохранение хэша XMTP-сообщения on-chain
     * @param recipient  Адрес получателя
     * @param messageHash  SHA-256 хэш сообщения из XMTP
     */
    function storeMessageHash(
        address recipient,
        bytes32 messageHash
    ) external onlyValidAddress(recipient) nonReentrant {
        require(messageHash != bytes32(0), "Empty hash");

        bytes32 conversationKey = _getConversationKey(msg.sender, recipient);

        messageMetadata[messageHash] = MessageMetadata({
            messageHash: messageHash,
            timestamp:   block.timestamp,
            isEncrypted: true
        });

        conversationHashes[conversationKey].push(messageHash);
        totalMessages++;

        emit MessageHashStored(messageHash, msg.sender, recipient, block.timestamp);

        if (conversationHashes[conversationKey].length == 1) {
            emit ConversationCreated(msg.sender, recipient, conversationKey);
        }
    }

    /**
     * @dev Получение хэшей сообщений из диалога (пагинация)
     */
    function getConversationHashes(
        address userA,
        address userB,
        uint256 startIndex,
        uint256 count
    ) external view returns (bytes32[] memory result, uint256 total) {
        bytes32 conversationKey = _getConversationKey(userA, userB);
        bytes32[] memory hashes = conversationHashes[conversationKey];
        total = hashes.length;

        if (startIndex >= total || count == 0) {
            return (new bytes32[](0), total);
        }

        uint256 end = startIndex + count > total ? total : startIndex + count;
        uint256 resultLength = end - startIndex;
        result = new bytes32[](resultLength);

        for (uint256 i = 0; i < resultLength; i++) {
            result[i] = hashes[startIndex + i];
        }
    }

    /**
     * @dev Проверка существования хэша (для верификации XMTP-сообщения)
     */
    function messageHashExists(bytes32 messageHash) external view returns (bool) {
        return messageMetadata[messageHash].timestamp != 0;
    }

    /**
     * @dev Количество сообщений в диалоге
     */
    function getConversationCount(address userA, address userB) external view returns (uint256) {
        return conversationHashes[_getConversationKey(userA, userB)].length;
    }

    /**
     * @dev Очистка старых хэшей диалога.
     *      ИСПРАВЛЕНО: только owner ИЛИ участник диалога может чистить.
     */
    function clearOldHashes(
        address userA,
        address userB,
        uint256 count
    ) external onlyValidAddress(userA) onlyValidAddress(userB) {
        // Только owner или один из участников диалога
        require(
            msg.sender == owner ||
            msg.sender == userA ||
            msg.sender == userB,
            "Not authorized"
        );

        bytes32 conversationKey = _getConversationKey(userA, userB);
        bytes32[] storage hashes = conversationHashes[conversationKey];

        require(count > 0, "Count must be > 0");
        require(hashes.length >= count, "Not enough hashes");

        // Удаляем metadata первых count хэшей
        for (uint256 i = 0; i < count; i++) {
            delete messageMetadata[hashes[i]];
        }

        // Сдвигаем массив влево
        uint256 remaining = hashes.length - count;
        for (uint256 i = 0; i < remaining; i++) {
            hashes[i] = hashes[i + count];
        }
        for (uint256 i = 0; i < count; i++) {
            hashes.pop();
        }
    }

    /**
     * @dev Сортированный ключ диалога
     */
    function _getConversationKey(address a, address b) internal pure returns (bytes32) {
        return a < b
            ? keccak256(abi.encodePacked(a, b))
            : keccak256(abi.encodePacked(b, a));
    }

    /**
     * @dev Публичная версия _getConversationKey для клиента
     */
    function getConversationKey(address userA, address userB) external pure returns (bytes32) {
        return _getConversationKey(userA, userB);
    }
}

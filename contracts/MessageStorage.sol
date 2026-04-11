// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

contract MessageStorage {
    struct Message {
        address sender;
        address recipient;
        string text;
        bytes signature;
        uint256 timestamp;
    }

    mapping(address => mapping(address => Message[])) private messages; // sender -> recipient -> messages
    mapping(address => mapping(address => uint256)) public messageCount;

    event MessageSent(
        address indexed sender,
        address indexed recipient,
        uint256 indexed messageId,
        string text,
        bytes signature,
        uint256 timestamp
    );

    function sendMessage(address recipient, string calldata text, bytes calldata signature) external {
        require(recipient != address(0), "Invalid recipient");
        require(bytes(text).length > 0, "Empty message");
        require(signature.length == 65, "Invalid signature length");

        // Verify signature (off-chain verification recommended, but we can also store it)
        // We store the signature so recipient can verify off-chain.

        uint256 msgId = messageCount[msg.sender][recipient];
        messages[msg.sender][recipient].push(Message({
            sender: msg.sender,
            recipient: recipient,
            text: text,
            signature: signature,
            timestamp: block.timestamp
        }));
        messageCount[msg.sender][recipient] = msgId + 1;

        emit MessageSent(msg.sender, recipient, msgId, text, signature, block.timestamp);
    }

    function getMessages(address sender, address recipient, uint256 startIndex, uint256 count)
        external
        view
        returns (Message[] memory)
    {
        uint256 total = messageCount[sender][recipient];
        if (startIndex >= total) return new Message[](0);

        uint256 end = startIndex + count;
        if (end > total) end = total;
        uint256 size = end - startIndex;

        Message[] memory result = new Message[](size);
        for (uint256 i = 0; i < size; i++) {
            result[i] = messages[sender][recipient][startIndex + i];
        }
        return result;
    }

    function getConversation(address userA, address userB, uint256 startIndex, uint256 count)
        external
        view
        returns (Message[] memory sent, Message[] memory received)
    {
        sent = getMessages(userA, userB, startIndex, count);
        received = getMessages(userB, userA, startIndex, count);
    }
}

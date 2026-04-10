// js/xmtp.js - XMTP Integration Module
// (c) Dima's Web3 Project • Encrypted Messaging

let xmtpClient = null;
const XMTP = window.XMTP;

// === ИНИЦИАЛИЗАЦИЯ ===
async function initXMTP(signer) {
  try {
    console.log('🔗 XMTP: Инициализация...');
    xmtpClient = await XMTP.Client.create(signer, { env: 'production' });
    console.log('✅ XMTP готов:', xmtpClient.address);
    return true;
  } catch (err) {
    console.error('❌ XMTP ошибка:', err);
    return false;
  }
}

// === КОНВЕРСАЦИИ ===
async function loadConversations() {
  if (!xmtpClient) return [];
  try {
    const convs = await xmtpClient.conversations.list();
    return convs.map(c => ({
      peerAddress: c.peerAddress.toLowerCase(),
      createdAt: c.createdAt,
      context: c.context
    }));
  } catch (err) {
    console.error('Ошибка загрузки конверсаций:', err);
    return [];
  }
}

// === ОТПРАВКА ===
async function sendXMTPMessage(peerAddress, text) {
  if (!xmtpClient) throw new Error('XMTP не инициализирован');
  const conv = await xmtpClient.conversations.newConversation(peerAddress);
  return await conv.send(text);
}

// === ИСТОРИЯ ===
async function loadMessages(peerAddress, limit = 50) {
  if (!xmtpClient) return [];
  const conv = await xmtpClient.conversations.newConversation(peerAddress);
  const msgs = await conv.messages({ limit, direction: 'SORT_DIRECTION_DESCENDING' });
  return msgs.map(m => ({
    id: m.id,
    from: m.senderAddress.toLowerCase(),
    to: m.recipientAddress.toLowerCase(),
    content: m.content,
    sentAt: m.sent,
    isSent: m.senderAddress.toLowerCase() === xmtpClient.address.toLowerCase()
  }));
}

// === REAL-TIME STREAM ===
async function startMessageStream(peerAddress, onNewMessage) {
  if (!xmtpClient) return null;
  return await xmtpClient.conversations.streamAllMessages(async (msg) => {
    if (msg.conversation.peerAddress.toLowerCase() === peerAddress) {
      onNewMessage({
        id: msg.id,
        from: msg.senderAddress.toLowerCase(),
        content: msg.content,
        sentAt: msg.sent,
        isSent: false
      });
    }
  });
}

// === ПРОВЕРКА ДОСТУПНОСТИ ===
async function canMessage(peerAddress) {
  if (!xmtpClient) return false;
  return await XMTP.Client.canMessage(peerAddress, { env: 'production' });
}

// === ЭКСПОРТ ===
window.XMTPModule = {
  init: initXMTP,
  send: sendXMTPMessage,
  loadMessages,
  loadConversations,
  startStream: startMessageStream,
  canMessage,
  getClient: () => xmtpClient
};

console.log('🌐 XMTP модуль загружен');

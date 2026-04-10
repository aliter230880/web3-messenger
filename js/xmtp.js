// js/xmtp.js - XMTP Integration Module
// (c) Dima's Web3 Project

let xmtpClient = null;
const XMTP = window.XMTP; // Из CDN

// === ИНИЦИАЛИЗАЦИЯ КЛИЕНТА ===
async function initXMTP(signer) {
  try {
    console.log('🔗 Инициализация XMTP...');
    xmtpClient = await XMTP.Client.create(signer, {
      env: 'production', // или 'dev' для тестов
      // Для Polygon: XMTP автоматически использует тот же адрес
    });
    console.log('✅ XMTP клиент готов:', xmtpClient.address);
    return true;
  } catch (err) {
    console.error('❌ Ошибка XMTP:', err);
    alert('Не удалось инициализировать защищённый чат');
    return false;
  }
}

// === ПОЛУЧЕНИЕ СПИСКА КОНВЕРСАЦИЙ ===
async function loadConversations() {
  if (!xmtpClient) return [];
  try {
    const conversations = await xmtpClient.conversations.list();
    return conversations.map(conv => ({
      peerAddress: conv.peerAddress,
      createdAt: conv.createdAt,
      context: conv.context // метаданные (группа, тема и т.д.)
    }));
  } catch (err) {
    console.error('Ошибка загрузки конверсаций:', err);
    return [];
  }
}

// === ОТПРАВКА СООБЩЕНИЯ ===
async function sendXMTPMessage(peerAddress, text) {
  if (!xmtpClient) throw new Error('XMTP не инициализирован');
  
  // Получаем или создаём конверсацию
  const conversation = await xmtpClient.conversations.newConversation(peerAddress);
  
  // Отправляем сообщение (автоматически шифруется!)
  const messageId = await conversation.send(text);
  console.log('📤 XMTP сообщение отправлено:', messageId);
  return messageId;
}

// === ПОЛУЧЕНИЕ ИСТОРИИ СООБЩЕНИЙ ===
async function loadMessages(peerAddress, limit = 50) {
  if (!xmtpClient) return [];
  
  const conversation = await xmtpClient.conversations.newConversation(peerAddress);
  const messages = await conversation.messages({ limit, direction: 'SORT_DIRECTION_DESCENDING' });
  
  return messages.map(msg => ({
    id: msg.id,
    from: msg.senderAddress,
    to: msg.recipientAddress,
    content: msg.content,
    sentAt: msg.sent,
    isSent: msg.senderAddress === xmtpClient.address
  }));
}

// === ПОДПИСКА НА НОВЫЕ СООБЩЕНИЯ (REAL-TIME) ===
function startMessageStream(peerAddress, onNewMessage) {
  if (!xmtpClient) return null;
  
  return xmtpClient.conversations.streamAllMessages(async (message) => {
    if (message.conversation.peerAddress === peerAddress) {
      onNewMessage({
        id: message.id,
        from: message.senderAddress,
        content: message.content,
        sentAt: message.sent,
        isSent: false
      });
    }
  });
}

// === ПРОВЕРКА: ЕСТЬ ЛИ У ПОЛЬЗОВАТЕЛЯ XMTP? ===
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

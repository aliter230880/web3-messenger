// Web3 Messenger - Application Logic
// (c) Dima's Web3 Project

console.log('🚀 Web3 Messenger loaded');

// Data Store
const store = {
  currentChat: null,
  chats: [
    {
      id: 'dima',
      name: 'Дима',
      avatar: '👤',
      online: true,
      preview: 'Привет! Как архитектура проекта?',
      time: '12:30',
      unread: 3,
      messages: [
        { id: 1, text: 'Привет! Как проект? Готов смотреть архитектуру?', sent: false, time: '12:28', status: 'delivered' },
        { id: 2, text: 'Всё супер! Смотри, что набросал 👇', sent: true, time: '12:30', status: 'delivered' }
      ]
    },
    {
      id: 'ai',
      name: 'AI Assistant',
      avatar: '🤖',
      online: true,
      preview: 'Готов помочь с кодом',
      time: '11:45',
      unread: 0,
      messages: [
        { id: 1, text: 'Привет! Чем могу помочь?', sent: false, time: '11:45', status: 'delivered' }
      ]
    },
    {
      id: 'crypto',
      name: 'Crypto News',
      avatar: '📢',
      online: false,
      preview: 'Bitcoin пробил $100k!',
      time: '10:20',
      unread: 24,
      messages: [
        { id: 1, text: '🚀 Bitcoin пробил $100k! Полный разбор ситуации...', sent: false, time: '10:20', status: 'delivered' }
      ]
    }
  ]
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  console.log('✅ App initialized');
  renderChatList();
  setupEventListeners();
});

// Render Chat List
function renderChatList() {
  const chatList = document.querySelector('.chat-list');
  if (!chatList) return;
  
  chatList.innerHTML = store.chats.map(chat => `
    <div class="chat-item ${store.currentChat === chat.id ? 'active' : ''}" data-chat-id="${chat.id}" onclick="selectChat('${chat.id}')">
      <div class="chat-avatar ${chat.online ? 'online' : ''}">${chat.avatar}</div>
      <div class="chat-info">
        <div class="chat-header-row">
          <div class="chat-name">${chat.name}</div>
          <div class="chat-time">${chat.time}</div>
        </div>
        <div class="chat-preview">
          <span>${chat.preview}</span>
          ${chat.unread > 0 ? `<span class="unread-badge">${chat.unread}</span>` : ''}
        </div>
      </div>
    </div>
  `).join('');
}

// Select Chat
function selectChat(chatId) {
  store.currentChat = chatId;
  const chat = store.chats.find(c => c.id === chatId);
  
  if (chat) {
    // Clear unread
    chat.unread = 0;
    
    // Update UI
    renderChatList();
    renderMessages();
    updateChatHeader(chat);
  }
}

// Render Messages
function renderMessages() {
  const container = document.querySelector('.messages-container');
  const chat = store.chats.find(c => c.id === store.currentChat);
  
  if (!container || !chat) return;
  
  container.innerHTML = `
    <div class="date-separator"><span>Сегодня</span></div>
    ${chat.messages.map(msg => `
      <div class="message ${msg.sent ? 'sent' : 'received'}">
        <div class="message-text">${msg.text}</div>
        <div class="message-meta">
          <span>${msg.time}</span>
          ${msg.sent ? `<span class="status-icon">${msg.status === 'delivered' ? '✓✓' : '✓'}</span>` : ''}
        </div>
      </div>
    `).join('')}
  `;
  
  // Scroll to bottom
  container.scrollTop = container.scrollHeight;
}

// Update Chat Header
function updateChatHeader(chat) {
  const nameEl = document.querySelector('.chat-top-name');
  const statusEl = document.querySelector('.chat-top-status');
  const avatarEl = document.querySelector('.chat-top-avatar');
  
  if (nameEl) nameEl.textContent = chat.name;
  if (statusEl) statusEl.innerHTML = chat.online ? '<span>●</span> в сети' : 'был(а) недавно';
  if (avatarEl) avatarEl.textContent = chat.avatar;
}

// Send Message
function sendMessage() {
  const input = document.querySelector('.input-wrapper input');
  const text = input.value.trim();
  
  if (!text || !store.currentChat) return;
  
  const chat = store.chats.find(c => c.id === store.currentChat);
  const time = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  
  // Add message
  const newMessage = {
    id: Date.now(),
    text: text,
    sent: true,
    time: time,
    status: 'sent'
  };
  
  chat.messages.push(newMessage);
  chat.preview = text;
  chat.time = time;
  
  // Clear input
  input.value = '';
  
  // Update UI
  renderMessages();
  renderChatList();
  
  // Simulate delivery
  setTimeout(() => {
    newMessage.status = 'delivered';
    renderMessages();
  }, 1000);
  
  // Simulate reply (for demo)
  if (chat.id === 'dima' || chat.id === 'ai') {
    setTimeout(() => {
      const replyMessage = {
        id: Date.now() + 1,
        text: 'Отлично! Продолжаем работать 🔥',
        sent: false,
        time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
        status: 'delivered'
      };
      chat.messages.push(replyMessage);
      chat.preview = replyMessage.text;
      chat.time = replyMessage.time;
      renderMessages();
      renderChatList();
    }, 3000);
  }
  
  console.log('📤 Message sent:', text);
}

// Setup Event Listeners
function setupEventListeners() {
  const sendBtn = document.querySelector('.send-btn');
  const msgInput = document.querySelector('.input-wrapper input');
  
  if (sendBtn) {
    sendBtn.addEventListener('click', sendMessage);
  }
  
  if (msgInput) {
    msgInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') sendMessage();
    });
  }
}

// Make functions global
window.selectChat = selectChat;
window.sendMessage = sendMessage;

// Web3 Messenger - Application Logic v2
// (c) Dima's Web3 Project

console.log('🚀 Web3 Messenger loaded');

// Data Store
const store = {
  currentChat: null,
  currentFolder: 'all', // all, personal, news, work
  chats: [
    {
      id: 'dima',
      name: 'Дима',
      avatar: '👤',
      online: true,
      folder: 'personal',
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
      folder: 'work',
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
      folder: 'news',
      preview: 'Bitcoin пробил $100k!',
      time: '10:20',
      unread: 24,
      messages: [
        { id: 1, text: '🚀 Bitcoin пробил $100k! Полный разбор ситуации...', sent: false, time: '10:20', status: 'delivered' }
      ]
    },
    {
      id: 'innulka',
      name: 'Иннулька',
      avatar: '💜',
      online: true,
      folder: 'personal',
      preview: '😂😘',
      time: '12:34',
      unread: 11,
      messages: []
    },
    {
      id: 'unity',
      name: 'Евгений Unity',
      avatar: '🎮',
      online: false,
      folder: 'work',
      preview: 'Скинь билд',
      time: '17:02',
      unread: 0,
      messages: []
    }
  ]
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  console.log('✅ App initialized');
  renderSidebar();
  renderChatList();
  setupEventListeners();
  updateInputState();
});

// Render Sidebar with folder filtering
function renderSidebar() {
  const sidebarItems = document.querySelectorAll('.sidebar-item');
  sidebarItems.forEach(item => {
    item.addEventListener('click', function() {
      // Remove active from all
      sidebarItems.forEach(i => i.classList.remove('active'));
      // Add active to clicked
      this.classList.add('active');
      
      // Set folder filter
      const folder = this.dataset.folder || 'all';
      store.currentFolder = folder;
      
      // Re-render chat list with filter
      renderChatList();
      
      // Close chat if open
      if (store.currentChat) {
        store.currentChat = null;
        renderEmptyState();
        updateInputState();
      }
    });
  });
}

// Filter chats by folder
function getFilteredChats() {
  if (store.currentFolder === 'all') {
    return store.chats;
  }
  return store.chats.filter(chat => chat.folder === store.currentFolder);
}

// Render Chat List
function renderChatList() {
  const chatList = document.querySelector('.chat-list');
  if (!chatList) return;
  
  const filteredChats = getFilteredChats();
  
  if (filteredChats.length === 0) {
    chatList.innerHTML = `
      <div style="padding: 20px; text-align: center; color: var(--text-muted);">
        <div style="font-size: 32px; margin-bottom: 10px;">📭</div>
        <p>Нет чатов в этой папке</p>
      </div>
    `;
    return;
  }
  
  chatList.innerHTML = filteredChats.map(chat => `
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
    updateInputState();
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

// Render Empty State
function renderEmptyState() {
  const container = document.querySelector('.messages-container');
  if (container) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">💬</div>
        <h3>Добро пожаловать в Web3 Messenger</h3>
        <p>Выберите чат слева, чтобы начать общение</p>
      </div>
    `;
  }
}

// Update Chat Header
function updateChatHeader(chat) {
  const nameEl = document.querySelector('.chat-top-name');
  const statusEl = document.querySelector('.chat-top-status');
  const avatarEl = document.querySelector('.chat-top-avatar');
  
  if (nameEl) nameEl.textContent = chat.name;
  if (statusEl) statusEl.innerHTML = chat.online ? '<span style="color:var(--success)">●</span> в сети' : 'был(а) недавно';
  if (avatarEl) avatarEl.textContent = chat.avatar;
}

// Enable/Disable Input
function updateInputState() {
  const input = document.querySelector('.input-wrapper input');
  const sendBtn = document.querySelector('.send-btn');
  
  if (input && sendBtn) {
    if (store.currentChat) {
      input.disabled = false;
      sendBtn.disabled = false;
      input.placeholder = 'Написать сообщение...';
      input.focus();
    } else {
      input.disabled = true;
      sendBtn.disabled = true;
      input.placeholder = 'Выберите чат...';
    }
  }
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
  }, 800);
  
  // Simulate reply (for demo)
  setTimeout(() => {
    const replies = [
      'Отлично! Продолжаем 🔥',
      'Принято, работаю над этим',
      '👍',
      'Интересная идея, давай обсудим',
      'Спасибо за донат! 💜'
    ];
    const replyText = replies[Math.floor(Math.random() * replies.length)];
    
    const replyMessage = {
      id: Date.now() + 1,
      text: replyText,
      sent: false,
      time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
      status: 'delivered'
    };
    chat.messages.push(replyMessage);
    chat.preview = replyText;
    chat.time = replyMessage.time;
    
    // Only update if still in this chat
    if (store.currentChat === chat.id) {
      renderMessages();
    }
    renderChatList();
  }, 2500);
  
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
  
  // Chat tabs filtering
  const chatTabs = document.querySelectorAll('.chat-tab');
  chatTabs.forEach(tab => {
    tab.addEventListener('click', function() {
      chatTabs.forEach(t => t.classList.remove('active'));
      this.classList.add('active');
      // Could add more filtering logic here
    });
  });
}

// Make functions global for HTML onclick
window.selectChat = selectChat;
window.sendMessage = sendMessage;

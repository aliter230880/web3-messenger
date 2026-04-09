// Web3 Messenger - Application Logic v3 (FIXED)
// (c) Dima's Web3 Project
console.log('🚀 Web3 Messenger loaded');

// === ГЛОБАЛЬНЫЙ STORE (объявляем сразу) ===
window.store = {
  currentChat: null,
  currentFolder: 'all',
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
    }
  ]
};

// === ИНИЦИАЛИЗАЦИЯ ===
document.addEventListener('DOMContentLoaded', () => {
  console.log('✅ App initialized');
  // Проверяем, что store доступен
  if (!window.store) {
    console.error('❌ Store not initialized!');
    return;
  }
  renderSidebar();
  renderChatList();
  setupEventListeners();
  updateInputState();
});

// === ФУНКЦИИ (используем window.store явно) ===

function renderSidebar() {
  const sidebarItems = document.querySelectorAll('.sidebar-item');
  sidebarItems.forEach(item => {
    item.addEventListener('click', function() {
      sidebarItems.forEach(i => i.classList.remove('active'));
      this.classList.add('active');
      const folder = this.dataset.folder || 'all';
      window.store.currentFolder = folder;
      renderChatList();
      if (window.store.currentChat) {
        window.store.currentChat = null;
        renderEmptyState();
        updateInputState();
      }
    });
  });
}

function getFilteredChats() {
  if (window.store.currentFolder === 'all') {
    return window.store.chats;
  }
  return window.store.chats.filter(chat => chat.folder === window.store.currentFolder);
}

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
    <div class="chat-item ${window.store.currentChat === chat.id ? 'active' : ''}" data-chat-id="${chat.id}" onclick="selectChat('${chat.id}')">
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

function selectChat(chatId) {
  window.store.currentChat = chatId;
  const chat = window.store.chats.find(c => c.id === chatId);
  if (chat) {
    chat.unread = 0;
    renderChatList();
    renderMessages();
    updateChatHeader(chat);
    updateInputState();
  }
}

function renderMessages() {
  const container = document.querySelector('.messages-container');
  const chat = window.store.chats.find(c => c.id === window.store.currentChat);
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
  container.scrollTop = container.scrollHeight;
}

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

function updateChatHeader(chat) {
  const nameEl = document.querySelector('.chat-top-name');
  const statusEl = document.querySelector('.chat-top-status');
  const avatarEl = document.querySelector('.chat-top-avatar');
  if (nameEl) nameEl.textContent = chat.name;
  if (statusEl) statusEl.innerHTML = chat.online ? '<span style="color:var(--success)">●</span> в сети' : 'был(а) недавно';
  if (avatarEl) avatarEl.textContent = chat.avatar;
}

function updateInputState() {
  const input = document.querySelector('.input-wrapper input');
  const sendBtn = document.querySelector('.send-btn');
  if (input && sendBtn) {
    if (window.store.currentChat) {
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

function sendMessage() {
  const input = document.querySelector('.input-wrapper input');
  const text = input.value.trim();
  if (!text || !window.store.currentChat) return;
  const chat = window.store.chats.find(c => c.id === window.store.currentChat);
  const time = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
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
  input.value = '';
  renderMessages();
  renderChatList();
  setTimeout(() => {
    newMessage.status = 'delivered';
    renderMessages();
  }, 800);
  setTimeout(() => {
    const replies = ['Отлично! Продолжаем 🔥', 'Принято, работаю над этим', '👍', 'Интересная идея, давай обсудим'];
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
    if (window.store.currentChat === chat.id) {
      renderMessages();
    }
    renderChatList();
  }, 2500);
  console.log('📤 Message sent:', text);
}

function setupEventListeners() {
  const sendBtn = document.querySelector('.send-btn');
  const msgInput = document.querySelector('.input-wrapper input');
  if (sendBtn) sendBtn.addEventListener('click', sendMessage);
  if (msgInput) {
    msgInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') sendMessage();
    });
  }
  const chatTabs = document.querySelectorAll('.chat-tab');
  chatTabs.forEach(tab => {
    tab.addEventListener('click', function() {
      chatTabs.forEach(t => t.classList.remove('active'));
      this.classList.add('active');
    });
  });
}

// === ГЛОБАЛЬНЫЙ ЭКСПОРТ ДЛЯ HTML onclick ===
window.selectChat = selectChat;
window.sendMessage = sendMessage;

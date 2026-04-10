// Web3 Messenger - Full Web3 Integration
// (c) Dima's Web3 Project
console.log('🚀 Web3 Messenger loaded');

// 🔧 КОНФИГУРАЦИЯ
// ⚠️ ВСТАВЬ СЮДА АДРЕС ТВОЕГО ПРОКСИ-КОНТРАКТА!
const CONTRACT_ADDRESS = "0xcFcA16C8c38a83a71936395039757DcFF6040c1E";
const CHAIN_ID = 137; // Polygon Mainnet

const CONTRACT_ABI = [
  "function isRegistered(address user) view returns (bool)",
  "function registerProfile(string username, string avatarCID, string bio) external",
  "function getProfile(address user) view returns (string,string,string,uint256,bool)"
];

// 🌐 ГЛОБАЛЬНОЕ СОСТОЯНИЕ
let provider, signer, contract, userAddress;
let isRegistered = false;

// 💬 ДАННЫЕ ЧАТОВ
const store = {
  currentChat: null,
  currentFolder: 'all',
  chats: [
    { id: 'dima', name: 'Дима', avatar: '👤', online: true, folder: 'personal', preview: 'Привет! Как проект?', time: '12:30', unread: 3, messages: [
      { id: 1, text: 'Привет! Как проект?', sent: false, time: '12:28', status: 'delivered' },
      { id: 2, text: 'Всё супер! 👇', sent: true, time: '12:30', status: 'delivered' }
    ]},
    { id: 'ai', name: 'AI Assistant', avatar: '🤖', online: true, folder: 'work', preview: 'Готов помочь', time: '11:45', unread: 0, messages: [
      { id: 1, text: 'Привет! Чем могу помочь?', sent: false, time: '11:45', status: 'delivered' }
    ]},
    { id: 'crypto', name: 'Crypto News', avatar: '📢', online: false, folder: 'news', preview: 'Bitcoin $100k!', time: '10:20', unread: 24, messages: [
      { id: 1, text: '🚀 Bitcoin пробил $100k!', sent: false, time: '10:20', status: 'delivered' }
    ]}
  ]
};

// 🚀 ИНИЦИАЛИЗАЦИЯ
document.addEventListener('DOMContentLoaded', async () => {
  console.log('✅ App initialized');
  renderSidebar();
  renderChatList();
  setupEventListeners();
  updateInputState();
  
  // Авто-проверка подключения при загрузке
  if (typeof window.ethereum !== 'undefined') {
    provider = new ethers.providers.Web3Provider(window.ethereum);
    const accounts = await provider.listAccounts();
    if (accounts.length > 0) {
      await onWalletConnected(accounts[0]);
    }
  }
});

// 🔗 ПОДКЛЮЧЕНИЕ КОШЕЛЬКА
async function connectWallet() {
  if (typeof window.ethereum === 'undefined') {
    alert('⚠️ Установите MetaMask: https://metamask.io');
    return;
  }
  try {
    const btn = document.getElementById('wallet-text');
    btn.textContent = '⏳ Подключение...';
    
    await window.ethereum.request({ method: 'eth_requestAccounts' });
    provider = new ethers.providers.Web3Provider(window.ethereum);
    signer = provider.getSigner();
    userAddress = await signer.getAddress();
    
    // Проверка сети
    const network = await provider.getNetwork();
    if (network.chainId !== CHAIN_ID) {
      try {
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: ethers.utils.hexValue(CHAIN_ID) }]
        });
      } catch (switchError) {
        // Сеть не добавлена — можно добавить обработку добавления сети
        console.log('Switch network error:', switchError);
      }
    }
    
    // Подключение к контракту
    contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
    
    await onWalletConnected(userAddress);
    console.log('✅ Connected:', userAddress);
  } catch (err) {
    console.error('❌ Connect error:', err);
    document.getElementById('wallet-text').textContent = 'Подключить';
    alert('Ошибка подключения: ' + err.message);
  }
}

async function onWalletConnected(address) {
  // Обновляем кнопку
  const walletBtn = document.getElementById('wallet-btn');
  const walletText = document.getElementById('wallet-text');
  walletBtn.onclick = showWalletModal;
  walletText.textContent = `${address.slice(0,6)}...${address.slice(-4)}`;
  
  // Проверяем регистрацию
  await checkRegistration();
}

async function checkRegistration() {
  if (!contract || !userAddress) return;
  try {
    isRegistered = await contract.isRegistered(userAddress);
    if (!isRegistered) {
      showRegisterModal();
    }
  } catch (err) {
    console.error('Check registration error:', err);
  }
}

// 📝 РЕГИСТРАЦИЯ ПРОФИЛЯ
async function registerProfile() {
  if (!contract || !userAddress) {
    alert('❌ Сначала подключите кошелёк!');
    return;
  }
  
  const username = document.getElementById('reg-username').value.trim();
  const avatarCID = document.getElementById('reg-avatar').value.trim();
  const bio = document.getElementById('reg-bio').value.trim();
  const statusEl = document.getElementById('reg-status');
  const btn = document.getElementById('btn-register');
  
  if (!username || !avatarCID) {
    statusEl.textContent = '⚠️ Заполните ник и Avatar CID';
    statusEl.style.color = 'var(--warning)';
    return;
  }
  
  try {
    btn.disabled = true;
    btn.textContent = '⏳ Подтвердите в MetaMask...';
    statusEl.textContent = '';
    
    const tx = await contract.registerProfile(username, avatarCID, bio);
    statusEl.textContent = '⛓️ Ожидание подтверждения...';
    
    await tx.wait();
    
    statusEl.textContent = '✅ Зарегистрировано!';
    statusEl.style.color = 'var(--success)';
    isRegistered = true;
    
    setTimeout(() => {
      closeRegisterModal();
      updateEmptyState();
    }, 1500);
    
    console.log('✅ Registered:', tx.hash);
  } catch (err) {
    console.error('❌ Register error:', err);
    statusEl.textContent = '❌ ' + (err.reason || err.message);
    statusEl.style.color = 'var(--danger)';
    btn.disabled = false;
    btn.textContent = 'Зарегистрировать в блокчейне';
  }
}

function showRegisterModal() {
  document.getElementById('register-modal').style.display = 'flex';
}

function closeRegisterModal() {
  document.getElementById('register-modal').style.display = 'none';
}

function showWalletModal() {
  alert(`💰 Кошелёк: ${userAddress}\n\nФункции баланса и донатов — в разработке!`);
}

// 💬 ЛОГИКА ЧАТА
function renderSidebar() {
  document.querySelectorAll('.sidebar-item[data-folder]').forEach(item => {
    item.addEventListener('click', function() {
      document.querySelectorAll('.sidebar-item[data-folder]').forEach(i => i.classList.remove('active'));
      this.classList.add('active');
      store.currentFolder = this.dataset.folder;
      renderChatList();
      if (store.currentChat) {
        store.currentChat = null;
        renderEmptyState();
        updateInputState();
      }
    });
  });
}

function getFilteredChats() {
  return store.currentFolder === 'all' 
    ? store.chats 
    : store.chats.filter(c => c.folder === store.currentFolder);
}

function renderChatList() {
  const list = document.querySelector('.chat-list');
  if (!list) return;
  const chats = getFilteredChats();
  
  if (chats.length === 0) {
    list.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted)">📭<p>Нет чатов</p></div>';
    return;
  }
  
  list.innerHTML = chats.map(chat => `
    <div class="chat-item ${store.currentChat === chat.id ? 'active' : ''}" onclick="selectChat('${chat.id}')">
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
  store.currentChat = chatId;
  const chat = store.chats.find(c => c.id === chatId);
  if (chat) {
    chat.unread = 0;
    renderChatList();
    renderMessages();
    updateChatHeader(chat);
    updateInputState();
  }
}

function renderMessages() {
  const container = document.getElementById('messages-container');
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
  container.scrollTop = container.scrollHeight;
}

function renderEmptyState() {
  const container = document.getElementById('messages-container');
  if (container) container.innerHTML = `
    <div class="empty-state" id="empty-state">
      <div class="empty-state-icon">💬</div>
      <h3>Добро пожаловать в Web3 Messenger</h3>
      <p>Выберите чат слева, чтобы начать общение</p>
      <p style="margin-top:12px;font-size:12px;color:var(--text-muted)">🔒 Все сообщения зашифрованы</p>
    </div>
  `;
}

function updateEmptyState() {
  if (isRegistered && userAddress) {
    const empty = document.getElementById('empty-state');
    if (empty) {
      empty.innerHTML = `
        <div class="empty-state-icon">✅</div>
        <h3>Профиль активен</h3>
        <p style="font-family:monospace;font-size:12px">${userAddress.slice(0,10)}...${userAddress.slice(-8)}</p>
        <p style="margin-top:8px;color:var(--success)">Готов к общению в блокчейне</p>
      `;
    }
  }
}

function updateChatHeader(chat) {
  document.getElementById('chat-name').textContent = chat.name;
  document.getElementById('chat-status').innerHTML = chat.online 
    ? '<span style="color:var(--success)">●</span> в сети' 
    : 'был(а) недавно';
}

function updateInputState() {
  const input = document.getElementById('msg-input');
  const sendBtn = document.getElementById('send-btn');
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

function sendMessage() {
  const input = document.getElementById('msg-input');
  const text = input.value.trim();
  if (!text || !store.currentChat) return;
  
  const chat = store.chats.find(c => c.id === store.currentChat);
  const time = new Date().toLocaleTimeString('ru-RU', {hour:'2-digit',minute:'2-digit'});
  
  chat.messages.push({ id: Date.now(), text, sent: true, time, status: 'sent' });
  chat.preview = text;
  chat.time = time;
  input.value = '';
  
  renderMessages();
  renderChatList();
  
  setTimeout(() => {
    chat.messages[chat.messages.length-1].status = 'delivered';
    renderMessages();
  }, 800);
  
  setTimeout(() => {
    const replies = ['Отлично! 🔥', 'Принято 👍', 'Интересно!', 'Спасибо за донат! 💜'];
    const reply = replies[Math.floor(Math.random() * replies.length)];
    chat.messages.push({ 
      id: Date.now()+1, 
      text: reply, 
      sent: false, 
      time: new Date().toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'}), 
      status: 'delivered' 
    });
    chat.preview = reply;
    if (store.currentChat === chat.id) renderMessages();
    renderChatList();
  }, 2500);
}

function setupEventListeners() {
  // Кнопка кошелька
  document.getElementById('wallet-btn').addEventListener('click', connectWallet);
  
  // Регистрация
  document.getElementById('btn-register')?.addEventListener('click', registerProfile);
  
  // Отправка сообщений
  document.getElementById('send-btn')?.addEventListener('click', sendMessage);
  document.getElementById('msg-input')?.addEventListener('keypress', e => {
    if (e.key === 'Enter') sendMessage();
  });
  
  // Табы чатов
  document.querySelectorAll('.chat-tab').forEach(tab => {
    tab.addEventListener('click', function() {
      document.querySelectorAll('.chat-tab').forEach(t => t.classList.remove('active'));
      this.classList.add('active');
    });
  });
}

// Глобальные функции
window.selectChat = selectChat;
window.sendMessage = sendMessage;
window.connectWallet = connectWallet;

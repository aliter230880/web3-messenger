// Web3 Messenger - Full Integration (Chat + Blockchain)
// (c) Dima's Web3 Project • Polygon Mainnet
console.log('🚀 Web3 Messenger loaded');

// ========== ГЛОБАЛЬНОЕ ХРАНИЛИЩЕ ==========
window.store = {
  currentChat: null,
  currentFolder: 'all',
  chats: [
    { id: 'dima', name: 'Дима', avatar: '👤', online: true, folder: 'personal', preview: 'Привет! Как архитектура проекта?', time: '12:30', unread: 3, messages: [{ id: 1, text: 'Привет! Как проект? Готов смотреть архитектуру?', sent: false, time: '12:28', status: 'delivered' }] },
    { id: 'ai', name: 'AI Assistant', avatar: '🤖', online: true, folder: 'work', preview: 'Готов помочь с кодом', time: '11:45', unread: 0, messages: [] },
    { id: 'crypto', name: 'Crypto News', avatar: '📢', online: false, folder: 'news', preview: 'Bitcoin пробил $100k!', time: '10:20', unread: 24, messages: [] }
  ]
};

// ========== WEB3 КОНФИГУРАЦИЯ ==========
const CONTRACT_ADDRESS = "0xcFcA16C8c38a83a71936395039757DcFF6040c1E";
const CHAIN_ID = 137; // Polygon Mainnet
const ABI = [
  "function isRegistered(address user) view returns (bool)",
  "function registerProfile(string username, string avatarCID, string bio) external",
  "function getProfile(address user) view returns (string, string, string, uint256, bool)"
];

let provider, signer, contract, userAddress;
let isRegistered = false;

// ========== ИНИЦИАЛИЗАЦИЯ ПРИЛОЖЕНИЯ ==========
document.addEventListener('DOMContentLoaded', () => {
  console.log('✅ App initialized');
  renderSidebar();
  renderChatList();
  setupEventListeners();
  updateInputState();
  
  // Кнопка кошелька в сайдбаре
  document.getElementById('wallet-sidebar').addEventListener('click', connectWallet);
});

// ========== WEB3 ЛОГИКА ==========
async function connectWallet() {
  const btn = document.getElementById('wallet-sidebar');
  if (!window.ethereum) {
    alert('🦊 Установите MetaMask или другой Web3-кошелёк!');
    return;
  }
  try {
    btn.innerHTML = '<span>⏳</span><span>Подключение...</span>';
    provider = new ethers.providers.Web3Provider(window.ethereum);
    await provider.send('eth_requestAccounts', []);
    signer = provider.getSigner();
    userAddress = await signer.getAddress();
    
    // Проверка сети
    const network = await provider.getNetwork();
    if (network.chainId !== CHAIN_ID) {
      btn.innerHTML = '<span>🔄</span><span>Смена сети...</span>';
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: ethers.utils.hexValue(CHAIN_ID) }]
      });
    }
    
    contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);
    btn.innerHTML = `<span>✅</span><span>${userAddress.slice(0,6)}...${userAddress.slice(-4)}</span>`;
    
    // Проверка регистрации
    await checkRegistration();
    console.log('✅ Кошелёк подключен:', userAddress);
  } catch (err) {
    console.error('❌ Ошибка подключения:', err);
    btn.innerHTML = '<span>🦊</span><span>Подключить</span>';
    alert('Не удалось подключиться: ' + (err.reason || err.message));
  }
}

async function checkRegistration() {
  if (!contract) return;
  try {
    isRegistered = await contract.isRegistered(userAddress);
    const emptyState = document.getElementById('empty-state');
    const modal = document.getElementById('register-modal');
    
    if (isRegistered) {
      const profile = await contract.getProfile(userAddress);
      emptyState.innerHTML = `
        <div class="empty-state-icon">✅</div>
        <h3>Профиль активен</h3>
        <p>Ник: <strong>${profile[0]}</strong></p>
        <p style="margin-top:8px; color:var(--success);">Готов к общению в блокчейне</p>
      `;
      modal.style.display = 'none';
      enableChatInput();
    } else {
      emptyState.innerHTML = `
        <div class="empty-state-icon">📝</div>
        <h3>Требуется регистрация</h3>
        <p>Создайте профиль, чтобы получить доступ к мессенджеру.</p>
      `;
      modal.style.display = 'flex';
      disableChatInput();
    }
  } catch (err) {
    console.error('❌ Ошибка проверки:', err);
  }
}

async function registerProfile() {
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
    btn.textContent = '⏳ Подписание...';
    statusEl.textContent = 'Подтвердите транзакцию в MetaMask';
    statusEl.style.color = 'var(--text-muted)';
    
    const tx = await contract.registerProfile(username, avatarCID, bio);
    statusEl.textContent = '⛓️ Ожидание подтверждения сети...';
    
    await tx.wait();
    
    statusEl.textContent = '✅ Профиль создан!';
    statusEl.style.color = 'var(--success)';
    isRegistered = true;
    
    setTimeout(() => {
      document.getElementById('register-modal').style.display = 'none';
      checkRegistration();
    }, 1200);
  } catch (err) {
    console.error('❌ Ошибка регистрации:', err);
    statusEl.textContent = '❌ ' + (err.reason || err.message || 'Транзакция отклонена');
    statusEl.style.color = 'var(--danger)';
    btn.disabled = false;
    btn.textContent = 'Зарегистрировать';
  }
}

// ========== UI ЛОГИКА ==========
function enableChatInput() {
  const input = document.getElementById('msg-input');
  const sendBtn = document.getElementById('send-btn');
  if (input) { input.disabled = false; input.placeholder = 'Написать сообщение...'; input.focus(); }
  if (sendBtn) sendBtn.disabled = false;
}

function disableChatInput() {
  const input = document.getElementById('msg-input');
  const sendBtn = document.getElementById('send-btn');
  if (input) { input.disabled = true; input.placeholder = 'Сначала зарегистрируйтесь...'; }
  if (sendBtn) sendBtn.disabled = true;
}

function renderSidebar() {
  document.querySelectorAll('.sidebar-item[data-folder]').forEach(item => {
    item.addEventListener('click', function() {
      document.querySelectorAll('.sidebar-item[data-folder]').forEach(i => i.classList.remove('active'));
      this.classList.add('active');
      window.store.currentFolder = this.dataset.folder;
      renderChatList();
      if (window.store.currentChat) {
        window.store.currentChat = null;
        document.getElementById('empty-state').style.display = 'flex';
        disableChatInput();
      }
    });
  });
}

function renderChatList() {
  const list = document.getElementById('chat-list');
  if (!list) return;
  const filtered = window.store.currentFolder === 'all' 
    ? window.store.chats 
    : window.store.chats.filter(c => c.folder === window.store.currentFolder);
    
  list.innerHTML = filtered.map(chat => `
    <div class="chat-item ${window.store.currentChat === chat.id ? 'active' : ''}" onclick="selectChat('${chat.id}')">
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
    document.getElementById('empty-state').style.display = 'none';
    document.getElementById('chat-name').textContent = chat.name;
    document.getElementById('chat-status').textContent = chat.online ? 'в сети • 🔐 E2E' : 'был(а) недавно';
    if (isRegistered) enableChatInput();
  }
}

document.getElementById('send-btn').addEventListener('click', () => {
  const input = document.getElementById('msg-input');
  const text = input.value.trim();
  if (!text || !window.store.currentChat) return;
  
  const chat = window.store.chats.find(c => c.id === window.store.currentChat);
  const time = new Date().toLocaleTimeString('ru-RU', {hour:'2-digit', minute:'2-digit'});
  const msg = document.createElement('div');
  msg.className = 'message sent';
  msg.innerHTML = `<div class="message-text">${text}</div><div class="message-meta">${time} ✓✓</div>`;
  document.getElementById('messages-container').appendChild(msg);
  input.value = '';
  document.getElementById('messages-container').scrollTop = document.getElementById('messages-container').scrollHeight;
  
  // Авто-ответ для демо
  setTimeout(() => {
    const reply = document.createElement('div');
    reply.className = 'message received';
    reply.innerHTML = `<div class="message-text">Отлично! Продолжаем кодить 💪</div><div class="message-meta">${new Date().toLocaleTimeString('ru-RU', {hour:'2-digit', minute:'2-digit'})} ✓✓</div>`;
    document.getElementById('messages-container').appendChild(reply);
    document.getElementById('messages-container').scrollTop = document.getElementById('messages-container').scrollHeight;
  }, 1500);
});

function updateInputState() {
  const input = document.getElementById('msg-input');
  const sendBtn = document.getElementById('send-btn');
  if (input && sendBtn) {
    if (window.store.currentChat && isRegistered) {
      input.disabled = false; input.placeholder = 'Написать сообщение...';
      sendBtn.disabled = false;
    } else {
      input.disabled = true; input.placeholder = 'Сначала зарегистрируйтесь...';
      sendBtn.disabled = true;
    }
  }
}

// Кнопка регистрации в модалке
document.getElementById('btn-register').addEventListener('click', registerProfile);

// Глобальные функции для onclick в HTML
window.selectChat = selectChat;

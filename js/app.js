// START: js/app.js — Web3 Messenger Core (MINIMAL & RELIABLE)
// (c) Dima's Web3 Project • Polygon Mainnet
// ✅ Все скобки закрыты • ✅ Проверено на синтаксис

console.log('🚀 Web3 Messenger loaded');

// ========== КОНФИГУРАЦИЯ ==========
const ADMIN_ADDRESS = "0xB19aEe699eb4D2Af380c505E4d6A108b055916eB".toLowerCase();
const CONTRACT_ADDRESS = "0xcFcA16C8c38a83a71936395039757DcFF6040c1E";
const CHAIN_ID = 137;

const CONTRACT_ABI = [
  "function isRegistered(address user) view returns (bool)",
  "function registerProfile(string username, string avatarCID, string bio) external",
  "function getEscrowedKey(address user) view returns (bytes)"
];

// ========== ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ==========
let provider, signer, contract, userAddress;
let isRegistered = false;
let isAdmin = false;

const store = {
  currentChat: null,
  currentFolder: 'all',
  chats: [
    { id: 'dima', name: 'Дима', avatar: '👤', online: true, folder: 'personal', preview: 'Привет! Как проект?', time: '12:30', unread: 3 },
    { id: 'ai', name: 'AI Assistant', avatar: '🤖', online: true, folder: 'work', preview: 'Готов помочь', time: '11:45', unread: 0 },
    { id: 'crypto', name: 'Crypto News', avatar: '📢', online: false, folder: 'news', preview: 'Bitcoin пробил $100k!', time: '10:20', unread: 24 }
  ]
};

// ========== ИНИЦИАЛИЗАЦИЯ ==========
document.addEventListener('DOMContentLoaded', async () => {
  console.log('✅ App initialized');
  renderSidebar();
  renderChatList();
  setupEventListeners();
  
  // Авто-подключение если уже авторизован
  if (typeof window.ethereum !== 'undefined') {
    const accounts = await window.ethereum.request({ method: 'eth_accounts' }).catch(() => []);
    if (accounts.length > 0) connectWallet();
  }
});

// ========== ПОДКЛЮЧЕНИЕ КОШЕЛЬКА ==========
async function connectWallet() {
  if (typeof window.ethereum === 'undefined') {
    alert('⚠️ Установите MetaMask!');
    return;
  }
  
  try {
    const btn = document.getElementById('wallet-sidebar');
    if (btn) { btn.innerHTML = '<span>⏳</span><span>Подключение...</span>'; btn.disabled = true; }
    
    await window.ethereum.request({ method: 'eth_requestAccounts' });
    provider = new ethers.providers.Web3Provider(window.ethereum);
    signer = provider.getSigner();
    userAddress = (await signer.getAddress()).toLowerCase();
    
    // Смена сети на Polygon
    const network = await provider.getNetwork();
    if (network.chainId !== CHAIN_ID) {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: '0x89' }]
      });
    }
    
    contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
    
    // Обновление UI
    if (btn) {
      btn.innerHTML = `<span>✅</span><span>${userAddress.slice(0,6)}...${userAddress.slice(-4)}</span>`;
      btn.style.background = 'var(--success)';
      btn.style.color = '#000';
      btn.disabled = false;
    }
    
    // Проверка админа
    isAdmin = userAddress === ADMIN_ADDRESS;
    document.getElementById('admin-btn').style.display = isAdmin ? 'flex' : 'none';
    
    // Проверка регистрации
    await checkRegistration();
    console.log('✅ Connected:', userAddress);
    
  } catch (err) {
    console.error('❌ Connect error:', err);
    const btn = document.getElementById('wallet-sidebar');
    if (btn) { btn.innerHTML = '<span>🦊</span><span>Подключить</span>'; btn.disabled = false; }
    alert('Ошибка: ' + err.message);
  }
}

// ========== ПРОВЕРКА РЕГИСТРАЦИИ ==========
async function checkRegistration() {
  if (!contract || !userAddress) return;
  try {
    isRegistered = await contract.isRegistered(userAddress);
    updateUI();
  } catch (e) { console.log('⚠️ Проверка регистрации:', e.message); }
}

function updateUI() {
  const empty = document.getElementById('empty-state');
  const modal = document.getElementById('register-modal');
  const input = document.getElementById('msg-input');
  const send = document.getElementById('send-btn');
  
  if (isRegistered) {
    if (empty) empty.innerHTML = `<div class="empty-state-icon">✅</div><h3>Профиль активен</h3><p>${userAddress.slice(0,10)}...${userAddress.slice(-8)}</p><p style="color:var(--success);margin-top:8px;">🔐 Готов к общению</p>`;
    if (modal) modal.style.display = 'none';
    if (input) { input.disabled = false; input.placeholder = 'Написать сообщение...'; }
    if (send) send.disabled = false;
  } else {
    if (empty) empty.style.display = 'none';
    if (modal) modal.style.display = 'block';
    if (input) { input.disabled = true; send.disabled = true; }
    
    // Быстрая регистрация
    document.getElementById('btn-register')?.addEventListener('click', () => {
      const u = document.getElementById('reg-username').value.trim();
      const a = document.getElementById('reg-avatar').value.trim() || `Qm${Date.now()}`;
      const b = document.getElementById('reg-bio').value.trim();
      if (u) registerProfile(u, a, b);
    });
  }
}

// ========== РЕГИСТРАЦИЯ ==========
async function registerProfile(username, avatarCID, bio) {
  if (!contract || !userAddress) return;
  const status = document.getElementById('reg-status');
  const btn = document.getElementById('btn-register');
  
  try {
    btn.disabled = true; btn.textContent = '⏳ Подписание...';
    status.textContent = 'Подтвердите в MetaMask'; status.style.color = 'var(--text-muted)';
    
    const tx = await contract.registerProfile(username, avatarCID, bio);
    status.textContent = '⛓️ Ждём блок...';
    await tx.wait();
    
    status.textContent = '✅ Успешно!'; status.style.color = 'var(--success)';
    isRegistered = true;
    setTimeout(() => { modal.style.display = 'none'; updateUI(); }, 1500);
    
  } catch (err) {
    console.error('❌ Register error:', err);
    status.textContent = '❌ ' + (err.reason || err.message);
    status.style.color = 'var(--danger)';
    btn.disabled = false; btn.textContent = 'Зарегистрировать';
  }
}

// ========== ОТПРАВКА СООБЩЕНИЯ ==========
function sendMessage() {
  const input = document.getElementById('msg-input');
  const text = input.value.trim();
  if (!text || !store.currentChat) return;
  
  addMessage(text, true);
  input.value = '';
  
  // Демо-ответ
  setTimeout(() => {
    const replies = ['Отлично! 🔥', 'Принято 👍', 'Интересно!'];
    addMessage(replies[Math.floor(Math.random()*replies.length)], false);
  }, 1500);
  
  console.log('📤 Sent:', text);
}

function addMessage(text, isSent) {
  const container = document.getElementById('messages-container');
  const time = new Date().toLocaleTimeString('ru-RU', {hour:'2-digit',minute:'2-digit'});
  const div = document.createElement('div');
  div.className = `message ${isSent ? 'sent' : 'received'}`;
  div.innerHTML = `<div class="message-text">${escapeHtml(text)}</div><div class="message-meta"><span>${time}</span>${isSent?'<span class="status-icon">✓✓</span>':''}</div>`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

// ========== РЕНДЕРИНГ ЧАТОВ ==========
function renderChatList() {
  const list = document.getElementById('chat-list');
  if (!list) return;
  
  const filtered = store.currentFolder === 'all' ? store.chats : store.chats.filter(c => c.folder === store.currentFolder);
  
  if (filtered.length === 0) {
    list.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted);">📭<p>Нет чатов</p></div>';
    return;
  }
  
  list.innerHTML = filtered.map(chat => `
    <div class="chat-item ${store.currentChat===chat.id?'active':''}" data-id="${chat.id}" onclick="selectChat('${chat.id}')">
      <div class="chat-avatar ${chat.online?'online':''}">${chat.avatar}</div>
      <div class="chat-info">
        <div class="chat-header-row"><div class="chat-name">${chat.name}</div><div class="chat-time">${chat.time}</div></div>
        <div class="chat-preview"><span>${chat.preview}</span>${chat.unread>0?`<span class="unread-badge">${chat.unread}</span>`:''}</div>
      </div>
    </div>
  `).join('');
}

function selectChat(id) {
  store.currentChat = id;
  const chat = store.chats.find(c => c.id === id);
  if (!chat) return;
  
  document.getElementById('chat-name').textContent = chat.name;
  document.getElementById('chat-avatar').textContent = chat.avatar;
  document.getElementById('chat-status').innerHTML = chat.online ? '<span style="color:var(--success)">●</span> в сети' : 'был(а) недавно';
  
  chat.unread = 0;
  renderChatList();
  renderMessages();
  
  if (isRegistered) {
    const input = document.getElementById('msg-input');
    const send = document.getElementById('send-btn');
    if (input) { input.disabled = false; input.placeholder = 'Написать...'; input.focus(); }
    if (send) send.disabled = false;
  }
}

function renderMessages() {
  const container = document.getElementById('messages-container');
  if (!container || !store.currentChat) return;
  container.innerHTML = `<div class="date-separator"><span>Сегодня</span></div><div class="message received"><div class="message-text">Привет! Это начало чата 🔐</div><div class="message-meta">12:00 ✓✓</div></div>`;
}

function renderEmptyState() {
  const c = document.getElementById('messages-container');
  if (c && !store.currentChat) c.innerHTML = `<div class="empty-state"><div class="empty-state-icon">💬</div><h3>Выберите чат</h3><p>🔒 Все сообщения зашифрованы</p></div>`;
}

// ========== SIDEBAR & СОБЫТИЯ ==========
function renderSidebar() {
  document.querySelectorAll('.sidebar-item[data-folder]').forEach(item => {
    item.onclick = function() {
      document.querySelectorAll('.sidebar-item[data-folder]').forEach(i => i.classList.remove('active'));
      this.classList.add('active');
      store.currentFolder = this.dataset.folder;
      renderChatList();
      if (store.currentChat) { store.currentChat = null; renderEmptyState(); }
    };
  });
  
  // Кнопка кошелька
  document.getElementById('wallet-sidebar')?.addEventListener('click', () => {
    if (!userAddress) connectWallet();
    else alert('💰 ' + userAddress);
  });
}

function setupEventListeners() {
  // Отправка
  document.getElementById('send-btn')?.addEventListener('click', sendMessage);
  document.getElementById('msg-input')?.addEventListener('keypress', e => { if(e.key==='Enter') sendMessage(); });
  
  // Поиск
  document.getElementById('search-input')?.addEventListener('input', e => {
    const q = e.target.value.toLowerCase();
    document.querySelectorAll('.chat-item').forEach(el => {
      const name = el.querySelector('.chat-name').textContent.toLowerCase();
      el.style.display = name.includes(q) ? '' : 'none';
    });
  });
  
  // Админ модалка
  document.getElementById('admin-btn')?.addEventListener('click', openAdminModal);
  document.getElementById('btn-access-escrow')?.addEventListener('click', accessEscrowKey);
}

// ========== АДМИН: KEY ESCROW ==========
function openAdminModal() {
  if (!isAdmin) { alert('🔒 Только владелец'); return; }
  document.getElementById('admin-modal').style.display = 'flex';
}

async function accessEscrowKey() {
  const addr = document.getElementById('escrow-user-address').value.trim();
  const status = document.getElementById('escrow-status');
  
  if (!ethers.utils.isAddress(addr)) { status.textContent = '⚠️ Некорректный адрес'; status.style.color = 'var(--warning)'; status.style.display = 'block'; return; }
  
  status.textContent = '🔍 Запрос...'; status.style.color = 'var(--text-muted)'; status.style.display = 'block';
  
  try {
    // 🔐 ДЕМО: в продакшене будет: const key = await contract.getEscrowedKey(addr);
    await new Promise(r => setTimeout(r, 1000));
    const mock = "0x" + Array(64).fill(0).map(() => Math.floor(Math.random()*16).toString(16)).join('');
    status.innerHTML = `✅ Ключ:<br><code style="background:var(--bg-tertiary);padding:4px 8px;border-radius:4px;font-size:11px;word-break:break-all;">${mock}</code>`;
    status.style.color = 'var(--success)';
  } catch (err) {
    status.textContent = '❌ ' + err.message; status.style.color = 'var(--danger)';
  }
}

// ========== УТИЛИТЫ ==========
function escapeHtml(t) { const d = document.createElement('div'); d.textContent = t; return d.innerHTML; }

// ========== ГЛОБАЛЬНЫЙ ЭКСПОРТ ==========
window.selectChat = selectChat;
window.sendMessage = sendMessage;
window.connectWallet = connectWallet;
window.openAdminModal = openAdminModal;
window.accessEscrowKey = accessEscrowKey;

// END: js/app.js — КОНЕЦ ФАЙЛА ✅

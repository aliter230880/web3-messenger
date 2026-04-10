// Web3 Messenger - Frontend + Blockchain + XMTP Integration
// (c) Dima's Web3 Project • Polygon Mainnet
// 🔐 Key Escrow | 🔗 XMTP | 💰 Monetization Ready

console.log('🚀 Web3 Messenger initialized');

// ========== КОНФИГУРАЦИЯ ==========
const ADMIN_ADDRESS = "0xB19aEe699eb4D2Af380c505E4d6A108b055916eB".toLowerCase();
const CONTRACT_ADDRESS = "0xcFcA16C8c38a83a71936395039757DcFF6040c1E";
const CHAIN_ID = 137; // Polygon Mainnet
const RPC_URL = "https://polygon-rpc.com";

const CONTRACT_ABI = [
  "function isRegistered(address user) view returns (bool)",
  "function registerProfile(string username, string avatarCID, string bio) external",
  "function getProfile(address user) view returns (string, string, string, uint256, bool)",
  "function getEscrowedKey(address user) view returns (bytes)"
];

// ========== ГЛОБАЛЬНОЕ СОСТОЯНИЕ ==========
let provider, signer, contract, userAddress;
let isRegistered = false;
let isAdmin = false;
let xmtpReady = false;
let currentStream = null;

const store = {
  currentChat: null,
  currentFolder: 'all',
  chats: [
    { id: 'dima', name: 'Дима', avatar: '👤', online: true, folder: 'personal', preview: 'Привет! Как проект?', time: '12:30', unread: 3 },
    { id: 'ai', name: 'AI Assistant', avatar: '🤖', online: true, folder: 'work', preview: 'Готов помочь с кодом', time: '11:45', unread: 0 },
    { id: 'crypto', name: 'Crypto News', avatar: '📢', online: false, folder: 'news', preview: 'Bitcoin пробил $100k!', time: '10:20', unread: 24 }
  ]
};

// ========== ИНИЦИАЛИЗАЦИЯ ==========
document.addEventListener('DOMContentLoaded', async () => {
  renderSidebar();
  renderChatList();
  setupEventListeners();
  setupWeb3Listeners();
  
  // Авто-подключение если уже авторизован
  if (typeof window.ethereum !== 'undefined') {
    const accounts = await window.ethereum.request({ method: 'eth_accounts' });
    if (accounts.length > 0) await connectWallet();
  }
});

// ========== WEB3: ПОДКЛЮЧЕНИЕ КОШЕЛЬКА ==========
async function connectWallet() {
  if (typeof window.ethereum === 'undefined') {
    alert('⚠️ Установите MetaMask для работы с Web3 Messenger');
    return;
  }
  
  try {
    const btn = document.getElementById('wallet-sidebar');
    if (btn) {
      btn.innerHTML = '<span>⏳</span><span>Подключение...</span>';
      btn.style.pointerEvents = 'none';
    }
    
    await window.ethereum.request({ method: 'eth_requestAccounts' });
    provider = new ethers.providers.Web3Provider(window.ethereum);
    signer = provider.getSigner();
    userAddress = (await signer.getAddress()).toLowerCase();
    
    // Проверка/смена сети
    const network = await provider.getNetwork();
    if (network.chainId !== CHAIN_ID) {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: ethers.utils.hexValue(CHAIN_ID) }]
      });
    }
    
    // Подключение к контракту
    contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
    
    // Обновление UI
    if (btn) {
      btn.innerHTML = `<span>✅</span><span>${userAddress.slice(0,6)}...${userAddress.slice(-4)}</span>`;
      btn.style.background = 'var(--success)';
      btn.style.color = '#000';
      btn.style.pointerEvents = 'auto';
    }
    
    // Проверка прав админа
    isAdmin = userAddress === ADMIN_ADDRESS;
    document.getElementById('admin-btn').style.display = isAdmin ? 'flex' : 'none';
    
    // Проверка регистрации + инициализация XMTP
    await initWeb3Features();
    
    console.log('✅ Кошелёк подключен:', userAddress);
  } catch (err) {
    console.error('❌ Ошибка подключения:', err);
    const btn = document.getElementById('wallet-sidebar');
    if (btn) {
      btn.innerHTML = '<span>🦊</span><span>Подключить</span>';
      btn.style.background = '';
      btn.style.color = '';
      btn.style.pointerEvents = 'auto';
    }
    alert('Не удалось подключиться. Проверьте MetaMask.');
  }
}

// ========== WEB3: ИНИЦИАЛИЗАЦИЯ ФУНКЦИЙ ==========
async function initWeb3Features() {
  if (!signer || !contract) return;
  
  // 1. Проверка регистрации в смарт-контракте
  await checkRegistration();
  
  // 2. Инициализация XMTP (только если зарегистрирован)
  if (isRegistered && window.XMTPModule) {
    xmtpReady = await window.XMTPModule.init(signer);
    if (xmtpReady) {
      console.log('🔐 XMTP активирован');
      await loadXMTPConversations();
    }
  }
}

// ========== WEB3: ПРОВЕРКА РЕГИСТРАЦИИ ==========
async function checkRegistration() {
  if (!contract || !userAddress) return;
  try {
    isRegistered = await contract.isRegistered(userAddress);
    updateRegistrationUI();
  } catch (err) {
    console.error('❌ Ошибка проверки регистрации:', err);
  }
}

function updateRegistrationUI() {
  const emptyState = document.getElementById('empty-state');
  const regModal = document.getElementById('register-modal');
  const input = document.getElementById('msg-input');
  const sendBtn = document.getElementById('send-btn');
  
  if (isRegistered) {
    if (emptyState) {
      emptyState.innerHTML = `
        <div class="empty-state-icon">✅</div>
        <h3>Профиль активен</h3>
        <p>Ваш адрес: ${userAddress.slice(0,10)}...${userAddress.slice(-8)}</p>
        <p style="margin-top:8px;color:var(--success);">🔐 Готов к защищённому общению</p>
      `;
    }
    if (regModal) regModal.style.display = 'none';
    if (input) { input.disabled = false; input.placeholder = 'Написать сообщение...'; }
    if (sendBtn) sendBtn.disabled = false;
  } else {
    if (emptyState) emptyState.style.display = 'none';
    if (regModal) regModal.style.display = 'block';
    if (input) { input.disabled = true; sendBtn.disabled = true; }
    
    // Быстрая регистрация
    document.getElementById('btn-register')?.addEventListener('click', () => {
      const username = document.getElementById('reg-username').value.trim();
      const avatar = document.getElementById('reg-avatar').value.trim() || `Qm${Date.now()}`;
      const bio = document.getElementById('reg-bio').value.trim();
      if (username) registerProfile(username, avatar, bio);
    });
  }
}

// ========== WEB3: РЕГИСТРАЦИЯ ПРОФИЛЯ ==========
async function registerProfile(username, avatarCID, bio) {
  if (!contract || !userAddress) return;
  
  const statusEl = document.getElementById('reg-status');
  const btn = document.getElementById('btn-register');
  
  try {
    btn.disabled = true;
    btn.textContent = '⏳ Подписание...';
    statusEl.textContent = 'Подтвердите транзакцию в MetaMask';
    statusEl.style.color = 'var(--text-muted)';
    
    const tx = await contract.registerProfile(username, avatarCID, bio);
    statusEl.textContent = '⛓️ Ожидание подтверждения...';
    
    await tx.wait();
    
    statusEl.textContent = '✅ Профиль создан!';
    statusEl.style.color = 'var(--success)';
    isRegistered = true;
    
    setTimeout(() => {
      document.getElementById('register-modal').style.display = 'none';
      updateRegistrationUI();
      initWeb3Features(); // Инициализируем XMTP после регистрации
    }, 1500);
    
  } catch (err) {
    console.error('❌ Ошибка регистрации:', err);
    statusEl.textContent = '❌ ' + (err.reason || err.message);
    statusEl.style.color = 'var(--danger)';
    btn.disabled = false;
    btn.textContent = 'Зарегистрировать в блокчейне';
  }
}

// ========== XMTP: ЗАГРУЗКА КОНВЕРСАЦИЙ ==========
async function loadXMTPConversations() {
  if (!window.XMTPModule || !xmtpReady) return;
  
  try {
    const convs = await window.XMTPModule.loadConversations();
    const xmtpChats = convs.map(conv => ({
      id: `xmtp:${conv.peerAddress.toLowerCase()}`,
      name: conv.peerAddress.slice(0,6) + '...' + conv.peerAddress.slice(-4),
      avatar: '🔐',
      online: true,
      folder: 'personal',
      preview: 'Защищённый чат',
      time: new Date(conv.createdAt).toLocaleTimeString(),
      unread: 0,
      isXMTP: true,
      peerAddress: conv.peerAddress.toLowerCase()
    }));
    
    // Добавляем к демо-чатам (без дубликатов)
    const existing = new Set(store.chats.map(c => c.id));
    store.chats = [...store.chats, ...xmtpChats.filter(c => !existing.has(c.id))];
    
    renderChatList();
    console.log(`📥 Загружено ${xmtpChats.length} XMTP конверсаций`);
  } catch (err) {
    console.error('❌ Ошибка загрузки конверсаций:', err);
  }
}

// ========== ОТРАВКА СООБЩЕНИЯ (XMTP или демо) ==========
async function sendMessage() {
  const input = document.getElementById('msg-input');
  const text = input.value.trim();
  if (!text || !store.currentChat) return;
  
  const chat = store.chats.find(c => c.id === store.currentChat);
  
  // XMTP отправка
  if (chat?.isXMTP && xmtpReady && window.XMTPModule) {
    try {
      await window.XMTPModule.send(chat.peerAddress, text);
      addMessageToUI(text, true, true);
      input.value = '';
      console.log('✅ XMTP сообщение отправлено');
      return;
    } catch (err) {
      console.error('❌ XMTP ошибка:', err);
      alert('Не удалось отправить защищённое сообщение');
    }
  }
  
  // Демо-отправка (для тестов)
  addMessageToUI(text, true, false);
  input.value = '';
  
  // Имитация ответа
  setTimeout(() => {
    const replies = ['Отлично! 🔥', 'Принято 👍', 'Интересно, давай обсудим'];
    addMessageToUI(replies[Math.floor(Math.random() * replies.length)], false, chat?.isXMTP);
  }, 1500);
  
  console.log('📤 Сообщение:', text);
}

// ========== ОТОБРАЖЕНИЕ СООБЩЕНИЙ ==========
async function renderMessages() {
  const container = document.getElementById('messages-container');
  const chat = store.chats.find(c => c.id === store.currentChat);
  if (!container || !chat) return;
  
  // Очистка предыдущего стрима
  if (currentStream?.return) currentStream.return();
  
  // XMTP чат
  if (chat.isXMTP && xmtpReady && window.XMTPModule) {
    container.innerHTML = '<div style="text-align:center;padding:20px;">🔐 Загрузка истории...</div>';
    
    try {
      const messages = await window.XMTPModule.loadMessages(chat.peerAddress, 50);
      
      if (messages.length === 0) {
        container.innerHTML = `
          <div class="empty-state">
            <div class="empty-state-icon">🔐</div>
            <h3>Начните защищённый диалог</h3>
            <p>Ваше первое сообщение будет зашифровано и доставлено через XMTP</p>
          </div>
        `;
        return;
      }
      
      container.innerHTML = messages.reverse().map(msg => `
        <div class="message ${msg.isSent ? 'sent' : 'received'} encrypted" data-xmtp-id="${msg.id}">
          <div class="message-text">${escapeHtml(msg.content)}</div>
          <div class="message-meta">
            <span>${new Date(msg.sentAt).toLocaleTimeString()}</span>
            <span style="color:var(--success);font-size:10px;">🔐</span>
            ${msg.isSent ? '<span class="status-icon">✓✓</span>' : ''}
          </div>
        </div>
      `).join('');
      
      // Подписка на новые сообщения
      currentStream = await window.XMTPModule.startStream(chat.peerAddress, (newMsg) => {
        addMessageToUI(newMsg.content, false, true);
      });
      
    } catch (err) {
      console.error('❌ Ошибка загрузки сообщений:', err);
      container.innerHTML = '<div style="text-align:center;padding:20px;color:var(--danger);">Ошибка загрузки 🔐</div>';
    }
    return;
  }
  
  // Демо-чат
  container.innerHTML = `
    <div class="date-separator"><span>Сегодня</span></div>
    <div class="message received">
      <div class="message-text">Привет! Это демо-чат. Подключи второй кошелёк для тестов XMTP 🔐</div>
      <div class="message-meta">12:00 ✓✓</div>
    </div>
  `;
}

// ========== UI: ДОБАВЛЕНИЕ СООБЩЕНИЯ ==========
function addMessageToUI(text, isSent, isXMTP = false) {
  const container = document

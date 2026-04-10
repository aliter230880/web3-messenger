// Web3 Messenger - Frontend + Blockchain Integration v2
// (c) Dima's Web3 Project
// 🔐 ADMIN CONFIG: Замени на свой адрес кошелька после деплоя
const ADMIN_ADDRESS = "0x0000000000000000000000000000000000000000"; 

const CONTRACT_ADDRESS = "0xcFcA16C8c38a83a71936395039757DcFF6040c1E";
const CHAIN_ID = 137;
const RPC_URL = "https://polygon-rpc.com";

const CONTRACT_ABI = [
  "function isRegistered(address user) view returns (bool)",
  "function registerProfile(string username, string avatarCID, string bio) external",
  "function getProfile(address user) view returns (string, string, string, uint256, bool)",
  // 🔐 Функция Key Escrow (будет вызываться из админки)
  "function getEscrowedKey(address user) view returns (bytes)"
];

let provider, signer, contract, userAddress;
let isRegistered = false;
let isAdmin = false;

// === ИНИЦИАЛИЗАЦИЯ ===
document.addEventListener('DOMContentLoaded', () => {
  console.log('🚀 Web3 Messenger initialized');
  renderChatList();
  setupEventListeners();
  setupWeb3Listeners();
});

// === WEB3 ЛОГИКА ===
async function connectWallet() {
  if (typeof window.ethereum === 'undefined') {
    alert('⚠️ Установите MetaMask для работы с Web3 Messenger');
    return;
  }
  try {
    const btn = document.getElementById('wallet-btn');
    btn.textContent = '⏳ Подключение...';
    
    await window.ethereum.request({ method: 'eth_requestAccounts' });
    provider = new ethers.providers.Web3Provider(window.ethereum);
    signer = provider.getSigner();
    userAddress = await signer.getAddress();
    
    const network = await provider.getNetwork();
    if (network.chainId !== CHAIN_ID) {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: ethers.utils.hexValue(CHAIN_ID) }],
      });
    }
    
    contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
    
    // Обновляем UI кошелька
    btn.innerHTML = `<span>✅</span><span>${userAddress.slice(0,6)}...${userAddress.slice(-4)}</span>`;
    btn.style.background = 'var(--success)';
    btn.style.color = '#000';
    
    // Проверяем, является ли пользователь админом
    isAdmin = userAddress.toLowerCase() === ADMIN_ADDRESS.toLowerCase();
    document.getElementById('admin-btn').style.display = isAdmin ? 'flex' : 'none';
    
    await checkRegistration();
    console.log('✅ Кошелёк подключен:', userAddress);
  } catch (err) {
    console.error('❌ Ошибка подключения:', err);
    document.getElementById('wallet-btn').innerHTML = `<span>🦊</span><span>Подключить</span>`;
    alert('Не удалось подключиться. Проверьте MetaMask.');
  }
}

async function checkRegistration() {
  if (!contract || !userAddress) return;
  try {
    isRegistered = await contract.isRegistered(userAddress);
    const emptyState = document.getElementById('empty-state');
    const input = document.getElementById('msg-input');
    const sendBtn = document.getElementById('send-btn');
    
    if (isRegistered) {
      emptyState.innerHTML = `
        <div class="empty-state-icon">✅</div>
        <h3>Профиль активен</h3>
        <p>Ваш адрес: ${userAddress.slice(0,10)}...${userAddress.slice(-8)}</p>
        <p style="margin-top:8px; color:var(--success);">Готов к общению в блокчейне</p>
      `;
      input.disabled = false;
      sendBtn.disabled = false;
      input.placeholder = 'Написать сообщение...';
    } else {
      emptyState.innerHTML = `
        <div class="empty-state-icon">📝</div>
        <h3>Требуется регистрация</h3>
        <p>Создайте профиль, чтобы получить доступ к мессенджеру.</p>
        <button id="quick-reg-btn" class="btn btn-send" style="margin-top:16px;">Зарегистрироваться сейчас</button>
      `;
      input.disabled = true;
      sendBtn.disabled = true;
      
      // Быстрая регистрация из пустого состояния
      document.getElementById('quick-reg-btn').addEventListener('click', () => {
        input.disabled = false;
        sendBtn.disabled = false;
        input.placeholder = 'Введите никнейм для регистрации...';
        input.focus();
      });
    }
  } catch (err) {
    console.error('❌ Ошибка проверки регистрации:', err);
  }
}

// === КНОПКА ДОСТАВКИ СООБЩЕНИЙ ===
function sendMessage() {
  const input = document.getElementById('msg-input');
  const text = input.value.trim();
  if (!text) return;
  
  // Если пользователь не зарегистрирован, текст считается никнеймом
  if (!isRegistered) {
    registerProfile(text, "", "");
    return;
  }
  
  console.log('📤 Отправка:', text);
  input.value = '';
  // Здесь позже добавим шифрование и отправку в XMTP/контракт
  setTimeout(() => alert('💬 Сообщение отправлено! (Web3-слой в разработке)'), 300);
}

async function registerProfile(username, avatarCID, bio) {
  if (!contract || !userAddress) return;
  const statusEl = document.getElementById('escrow-status') || document.getElementById('empty-state');
  
  try {
    if (statusEl.id === 'empty-state') {
      statusEl.innerHTML = `<div class="empty-state-icon">⏳</div><h3>Отправка транзакции...</h3>`;
    }
    
    const tx = await contract.registerProfile(username, avatarCID || `Qm${Date.now()}`, bio || "");
    if (statusEl.id === 'empty-state') {
      statusEl.innerHTML = `<div class="empty-state-icon">⛓️</div><h3>Ждём подтверждения сети...</h3>`;
    }
    
    await tx.wait();
    
    isRegistered = true;
    checkRegistration();
    alert('✅ Профиль успешно создан в блокчейне!');
  } catch (err) {
    console.error('❌ Ошибка регистрации:', err);
    if (statusEl.id === 'empty-state') {
      statusEl.innerHTML = `<div class="empty-state-icon">❌</div><h3>Ошибка: ${err.reason || err.message}</h3>`;
    }
  }
}

// === АДМИН: KEY ESCROW UI ===
function openAdminModal() {
  if (!isAdmin) {
    alert('🔒 Доступ разрешён только владельцу платформы.');
    return;
  }
  document.getElementById('admin-modal').style.display = 'flex';
}

async function accessEscrowKey() {
  const userAddr = document.getElementById('escrow-user-address').value.trim();
  const statusEl = document.getElementById('escrow-status');
  
  if (!userAddr || !ethers.utils.isAddress(userAddr)) {
    statusEl.textContent = '⚠️ Введите корректный адрес Ethereum';
    statusEl.style.color = 'var(--warning)';
    return;
  }
  
  statusEl.textContent = '🔍 Запрос к смарт-контракту...';
  statusEl.style.color = 'var(--text-muted)';
  
  try {
    // 🔐 ЗДЕСЬ БУДЕТ РЕАЛЬНЫЙ ВЫЗОВ: const key = await contract.getEscrowedKey(userAddr);
    // Пока имитируем ответ для демонстрации UI
    await new Promise(r => setTimeout(r, 1200));
    const mockKey = "0x" + Array(64).fill(0).map(() => Math.floor(Math.random()*16).toString(16)).join('');
    
    statusEl.innerHTML = `✅ Ключ получен!<br><code style="background:var(--bg-tertiary); padding:4px 8px; border-radius:4px; word-break:break-all; font-size:11px;">${mockKey}</code>`;
    statusEl.style.color = 'var(--success)';
    
    console.log('🔓 Escrow Key Retrieved:', mockKey);
  } catch (err) {
    statusEl.textContent = '❌ Ошибка: ' + (err.reason || err.message);
    statusEl.style.color = 'var(--danger)';
  }
}

// === UI ЛОГИКА ===
function renderChatList() {
  const chatList = document.getElementById('chat-list');
  const chats = [
    { id: 'dima', name: 'Дима', avatar: '👤', online: true, preview: 'Привет! Как проект?', time: '12:30', unread: 3 },
    { id: 'ai', name: 'AI Assistant', avatar: '🤖', online: true, preview: 'Готов помочь с кодом', time: '11:45', unread: 0 },
    { id: 'crypto', name: 'Crypto News', avatar: '📢', online: false, preview: 'Bitcoin пробил $100k!', time: '10:20', unread: 24 }
  ];
  chatList.innerHTML = chats.map(chat => `
    <div class="chat-item" onclick="selectChat('${chat.id}')">
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
  document.getElementById('chat-name').textContent = chatId === 'dima' ? 'Дима' : chatId === 'ai' ? 'AI Assistant' : 'Crypto News';
  document.getElementById('chat-status').textContent = 'в сети • 🔐 E2E';
  if (isRegistered) {
    document.getElementById('msg-input').disabled = false;
    document.getElementById('send-btn').disabled = false;
    document.getElementById('msg-input').focus();
  }
}

function setupEventListeners() {
  document.getElementById('wallet-btn').addEventListener('click', connectWallet);
  document.getElementById('admin-btn').addEventListener('click', openAdminModal);
  document.getElementById('btn-access-escrow').addEventListener('click', accessEscrowKey);
  document.getElementById('send-btn').addEventListener('click', sendMessage);
  document.getElementById('msg-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
}

function setupWeb3Listeners() {
  if (window.ethereum) {
    window.ethereum.on('accountsChanged', () => location.reload());
    window.ethereum.on('chainChanged', () => location.reload());
  }
}

// Глобальные функции
window.selectChat = selectChat;
window.sendMessage = sendMessage;

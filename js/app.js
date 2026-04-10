// Web3 Messenger - Frontend + Blockchain Integration v3
// (c) Dima's Web3 Project
// 🔐 ADMIN CONFIG: Твой адрес кошелька
const ADMIN_ADDRESS = "0xB19aEe699eb4D2Af380c505E4d6A108b055916eB";
const CONTRACT_ADDRESS = "0xcFcA16C8c38a83a71936395039757DcFF6040c1E";
const CHAIN_ID = 137; // Polygon Mainnet

const CONTRACT_ABI = [
  "function isRegistered(address user) view returns (bool)",
  "function registerProfile(string username, string avatarCID, string bio) external",
  "function getProfile(address user) view returns (string, string, string, uint256, bool)",
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
    btn.innerHTML = '<span>⏳</span><span>Подключение...</span>';
    
    await window.ethereum.request({ method: 'eth_requestAccounts' });
    provider = new ethers.providers.Web3Provider(window.ethereum);
    signer = provider.getSigner(); 
    userAddress = await signer.getAddress();

    // Проверка сети
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
    const adminBtn = document.getElementById('admin-btn');
    if (adminBtn) {
      adminBtn.style.display = isAdmin ? 'flex' : 'none';
    }

    await checkRegistration();
    console.log('✅ Кошелёк подключен:', userAddress);
  } catch (err) {
    console.error('❌ Ошибка подключения:', err);
    const btn = document.getElementById('wallet-btn');
    if (btn) {
      btn.innerHTML = '<span>🦊</span><span>Подключить</span>';
    }
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
      if (emptyState) {
        emptyState.innerHTML = `
          <div class="empty-state-icon">✅</div>
          <h3>Профиль активен</h3>
          <p>Ваш адрес: ${userAddress.slice(0,10)}...${userAddress.slice(-8)}</p>
          <p style="margin-top:8px; color:var(--success);">Готов к общению в блокчейне</p>
        `;
      }
      if (input) {
        input.disabled = false;
        input.placeholder = 'Написать сообщение...';
      }
      if (sendBtn) {
        sendBtn.disabled = false;
      }
    } else {
      if (emptyState) {
        emptyState.innerHTML = `
          <div class="empty-state-icon">📝</div>
          <h3>Требуется регистрация</h3>
          <p>Создайте профиль, чтобы получить доступ к мессенджеру.</p>
          <button id="quick-reg-btn" class="btn btn-send" style="margin-top:16px;">Зарегистрироваться сейчас</button>
        `;
        
        // Быстрая регистрация из пустого состояния
        document.getElementById('quick-reg-btn').addEventListener('click', () => {
          if (input) {
            input.disabled = false;
            sendBtn.disabled = false;
            input.placeholder = 'Введите никнейм для регистрации...';
            input.focus();
          }
        });
      }
      if (input) {
        input.disabled = true;
      }
      if (sendBtn) {
        sendBtn.disabled = true;
      }
    }
  } catch (err) {
    console.error('❌ Ошибка проверки регистрации:', err);
  }
}

// === ОТПРАВКА СООБЩЕНИЯ (С ПОДПИСЬЮ КОШЕЛЬКА!) ===
async function sendMessage() {
  const input = document.getElementById('msg-input');
  const text = input.value.trim();
  
  if (!text) return;
  
  // Если пользователь не зарегистрирован, текст считается никнеймом
  if (!isRegistered) {
    await registerProfile(text, "", "");
    return;
  }

  // 🔐 ПОДПИСЫВАЕМ СООБЩЕНИЕ КОШЕЛЬКОМ (XMTP style)
  try {
    const signature = await signer.signMessage(text);
    console.log('🔐 Сообщение подписано:', signature);
    console.log('📤 Отправка:', text);
    console.log('👤 От:', userAddress);
    
    // Здесь позже добавим отправку в XMTP/контракт
    // Для пока просто показываем в UI
    addMessageToUI(text, true, signature);
    
    input.value = '';
    
    // Имитация ответа
    setTimeout(() => {
      const replyText = '✅ Сообщение получено и проверено!';
      addMessageToUI(replyText, false);
    }, 1000);
    
  } catch (err) {
    console.error('❌ Ошибка подписи:', err);
    alert('Не удалось подписать сообщение. Проверьте MetaMask.');
  }
}

// Добавление сообщения в UI
function addMessageToUI(text, isSent, signature = null) {
  const container = document.getElementById('messages-container');
  if (!container) return;
  
  const time = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const msgDiv = document.createElement('div');
  msgDiv.className = `message ${isSent ? 'sent' : 'received'}`;
  
  let signatureInfo = '';
  if (signature && isSent) {
    signatureInfo = `<div style="font-size:10px; opacity:0.7; margin-top:4px;">🔐 Подписано</div>`;
  }
  
  msgDiv.innerHTML = `
    <div class="message-text">${text}</div>
    <div class="message-meta">
      <span>${time}</span>
      ${isSent ? '<span class="status-icon">✓✓</span>' : ''}
    </div>
    ${signatureInfo}
  `;
  
  container.appendChild(msgDiv);
  container.scrollTop = container.scrollHeight;
}

async function registerProfile(username, avatarCID, bio) {
  if (!contract || !userAddress) return;
  
  const statusEl = document.getElementById('escrow-status') || document.getElementById('empty-state');
  
  try {
    if (statusEl && statusEl.id === 'empty-state') {
      statusEl.innerHTML = '<div class="empty-state-icon">⏳</div><h3>Отправка транзакции...</h3>';
    }
    
    const tx = await contract.registerProfile(username, avatarCID || `Qm${Date.now()}`, bio || "");
    
    if (statusEl && statusEl.id === 'empty-state') {
      statusEl.innerHTML = '<div class="empty-state-icon">⛓️</div><h3>Ждём подтверждения сети...</h3>';
    }

    await tx.wait();

    isRegistered = true;
    if (statusEl) {
      statusEl.innerHTML = '<div class="empty-state-icon">✅</div><h3>Профиль создан!</h3>';
    }
    
    setTimeout(() => {
      checkRegistration();
    }, 1500);
    
    alert('✅ Профиль успешно создан в блокчейне!');
  } catch (err) {
    console.error('❌ Ошибка регистрации:', err);
    if (statusEl && statusEl.id === 'empty-state') {
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
  
  const modal = document.getElementById('admin-modal');
  if (modal) {
    modal.style.display = 'flex';
  }
}

async function accessEscrowKey() {
  const userAddr = document.getElementById('escrow-user-address').value.trim();
  const statusEl = document.getElementById('escrow-status');
  
  if (!userAddr || !ethers.utils.isAddress(userAddr)) {
    if (statusEl) {
      statusEl.textContent = '⚠️ Введите корректный адрес Ethereum';
      statusEl.style.color = 'var(--warning)';
      statusEl.style.display = 'block';
    }
    return;
  }

  if (statusEl) {
    statusEl.textContent = '🔍 Запрос к смарт-контракту...';
    statusEl.style.color = 'var(--text-muted)';
    statusEl.style.display = 'block';
  }

  try { 
    // 🔐 РЕАЛЬНЫЙ ВЫЗОВ ФУНКЦИИ getEscrowedKey
    const encryptedKey = await contract.getEscrowedKey(userAddr);
    
    if (statusEl) {
      statusEl.innerHTML = `
        ✅ Ключ получен!<br>
        <code style="background:var(--bg-tertiary); padding:4px 8px; border-radius:4px; word-break:break-all; font-size:11px; display:block; margin-top:8px;">
          ${encryptedKey}
        </code>
      `;
      statusEl.style.color = 'var(--success)';
    }
    
    console.log('🔓 Escrow Key Retrieved:', encryptedKey);
  } catch (err) {
    if (statusEl) {
      statusEl.textContent = '❌ Ошибка: ' + (err.reason || err.message);
      statusEl.style.color = 'var(--danger)';
    }
    console.error('❌ Ошибка получения ключа:', err);
  }
}

// === UI ЛОГИКА ===
function renderChatList() {
  const chatList = document.getElementById('chat-list');
  if (!chatList) return;
  
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
  const chatName = document.getElementById('chat-name');
  const chatStatus = document.getElementById('chat-status');
  
  if (chatName) {
    chatName.textContent = chatId === 'dima' ? 'Дима' : chatId === 'ai' ? 'AI Assistant' : 'Crypto News';
  }
  
  if (chatStatus) {
    chatStatus.textContent = 'в сети • 🔐 E2E';
  }
  
  if (isRegistered) {
    const input = document.getElementById('msg-input');
    const sendBtn = document.getElementById('send-btn');
    if (input) {
      input.disabled = false;
      input.focus();
    }
    if (sendBtn) {
      sendBtn.disabled = false;
    }
  }
}

function setupEventListeners() {
  const walletBtn = document.getElementById('wallet-btn');
  const adminBtn = document.getElementById('admin-btn');
  const btnAccessEscrow = document.getElementById('btn-access-escrow');
  const sendBtn = document.getElementById('send-btn');
  const msgInput = document.getElementById('msg-input');
  
  if (walletBtn) {
    walletBtn.addEventListener('click', connectWallet);
  }
  
  if (adminBtn) {
    adminBtn.addEventListener('click', openAdminModal);
  }
  
  if (btnAccessEscrow) {
    btnAccessEscrow.addEventListener('click', accessEscrowKey);
  }
  
  if (sendBtn) {
    sendBtn.addEventListener('click', sendMessage);
  }
  
  if (msgInput) {
    msgInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
  }
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

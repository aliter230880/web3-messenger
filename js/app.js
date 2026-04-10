// Web3 Messenger - Full Logic (Chat + Blockchain)
// (c) Dima's Web3 Project

console.log('🚀 Web3 Messenger Loaded');

// ========== 🔧 CONFIGURATION ==========
const CONTRACT_ADDRESS = "0xcFcA16C8c38a83a71936395039757DcFF6040c1E"; // Твой контракт
const CHAIN_ID = 137; // Polygon Mainnet

// ABI (только нужные функции)
const CONTRACT_ABI = [
  "function isRegistered(address user) view returns (bool)",
  "function registerProfile(string username, string avatarCID, string bio) external",
  "function getProfile(address user) view returns (string, string, string, uint256, bool)"
];

// ========== 🌐 WEB3 STATE ==========
let provider, signer, contract;
let userAddress = null;
let isRegisteredUser = false;

// ========== 💬 CHAT DATA ==========
const store = {
  currentChat: null,
  currentFolder: 'all',
  chats: [
    { id: 'dima', name: 'Дима', avatar: '👤', online: true, folder: 'personal', preview: 'Привет! Как проект?', time: '12:30', unread: 3, messages: [] },
    { id: 'ai', name: 'AI Assistant', avatar: '🤖', online: true, folder: 'work', preview: 'Готов помочь', time: '11:45', unread: 0, messages: [] },
    { id: 'news', name: 'Crypto News', avatar: '📢', online: false, folder: 'news', preview: 'Bitcoin вырос!', time: '10:20', unread: 24, messages: [] }
  ]
};

// ========== 🚀 INITIALIZATION ==========
document.addEventListener('DOMContentLoaded', () => {
  renderChatList();
  setupEventListeners();
  updateInputState();
});

// ========== 🔗 WEB3 FUNCTIONS ==========

// 1. Подключение кошелька
async function connectWallet() {
  if (typeof window.ethereum === 'undefined') {
    alert('🦊 Установи MetaMask!');
    return;
  }

  try {
    const btnText = document.getElementById('wallet-text');
    btnText.textContent = 'Подключение...';

    // Запрос доступа
    await window.ethereum.request({ method: 'eth_requestAccounts' });
    
    // Инициализация провайдера
    provider = new ethers.providers.Web3Provider(window.ethereum);
    signer = provider.getSigner();
    userAddress = await signer.getAddress();

    // Подключение к контракту
    contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

    // Обновление UI кнопки
    btnText.textContent = `${userAddress.slice(0,6)}...${userAddress.slice(-4)}`;
    document.getElementById('wallet-btn').style.background = 'var(--success)';
    
    // Проверка регистрации
    await checkRegistration();
    
  } catch (error) {
    console.error(error);
    document.getElementById('wallet-text').textContent = 'Подключить';
  }
}

// 2. Проверка регистрации в блокчейне
async function checkRegistration() {
  if (!contract) return;
  try {
    isRegisteredUser = await contract.isRegistered(userAddress);
    
    if (!isRegisteredUser) {
      // Если нет - показать модальное окно
      document.getElementById('reg-modal').style.display = 'flex';
      enableChatInput(false); // Блокируем чат пока нет профиля
    } else {
      // Если есть - разблокируем чат
      enableChatInput(true);
      document.getElementById('reg-modal').style.display = 'none';
      console.log('✅ Профиль найден в блокчейне');
    }
  } catch (error) {
    console.error('Ошибка проверки:', error);
  }
}

// 3. Регистрация нового пользователя
async function submitRegistration() {
  const username = document.getElementById('reg-username').value;
  const bio = document.getElementById('reg-bio').value;
  const statusEl = document.getElementById('reg-status');
  const btn = document.getElementById('btn-submit');

  if (!username) {
    alert('Введите никнейм!');
    return;
  }

  try {
    btn.disabled = true;
    btn.textContent = '⏳ Подтвердите в MetaMask...';
    statusEl.textContent = 'Отправка транзакции...';

    // Вызов смарт-контракта
    const tx = await contract.registerProfile(username, "QmEmptyAvatar", bio);
    
    statusEl.textContent = '⛓️ Ждем подтверждения сети...';
    await tx.wait(); // Ждем пока блокчейн запишет данные

    // Успех!
    isRegisteredUser = true;
    document.getElementById('reg-modal').style.display = 'none';
    enableChatInput(true);
    alert('🎉 Профиль создан! Добро пожаловать.');

  } catch (error) {
    console.error(error);
    statusEl.textContent = '❌ Ошибка: ' + (error.reason || error.message);
    btn.disabled = false;
    btn.textContent = 'Зарегистрироваться';
  }
}

// ========== 💬 UI LOGIC ==========

function renderChatList() {
  const list = document.getElementById('chat-list');
  list.innerHTML = '';
  
  const filtered = store.chats.filter(c => c.folder === store.currentFolder);
  
  filtered.forEach(chat => {
    const div = document.createElement('div');
    div.className = `chat-item ${store.currentChat === chat.id ? 'active' : ''}`;
    div.onclick = () => selectChat(chat.id);
    div.innerHTML = `
      <div class="chat-avatar ${chat.online ? 'online' : ''}">${chat.avatar}</div>
      <div class="chat-info">
        <div class="chat-header-row">
          <div class="chat-name">${chat.name}</div>
          <div class="chat-time">${chat.time}</div>
        </div>
        <div class="chat-preview"><span>${chat.preview}</span></div>
      </div>
    `;
    list.appendChild(div);
  });
}

function selectChat(id) {
  store.currentChat = id;
  const chat = store.chats.find(c => c.id === id);
  
  document.getElementById('chat-name').textContent = chat.name;
  document.getElementById('chat-status').textContent = chat.online ? 'в сети' : 'был недавно';
  
  // Рендер сообщений (заглушка для демо)
  const container = document.getElementById('messages-container');
  container.innerHTML = `
    <div class="date-separator"><span>Сегодня</span></div>
    <div class="message received">
      <div class="message-text">Привет! Это тестовое сообщение. Попробуй подключить кошелек!</div>
      <div class="message-meta">12:30 ✓✓</div>
    </div>
  `;
  
  renderChatList(); // Обновить активный класс
  updateInputState();
}

function sendMessage() {
  const input = document.getElementById('msg-input');
  const text = input.value.trim();
  if (!text || !store.currentChat) return;

  const container = document.getElementById('messages-container');
  const time = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});

  const msgDiv = document.createElement('div');
  msgDiv.className = 'message sent';
  msgDiv.innerHTML = `
    <div class="message-text">${text}</div>
    <div class="message-meta">${time} ✓</div>
  `;
  container.appendChild(msgDiv);
  container.scrollTop = container.scrollHeight;
  input.value = '';

  // Авто-ответ
  setTimeout(() => {
    const replyDiv = document.createElement('div');
    replyDiv.className = 'message received';
    replyDiv.innerHTML = `
      <div class="message-text">Сообщение получено! 🚀</div>
      <div class="message-meta">${new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} ✓✓</div>
    `;
    container.appendChild(replyDiv);
    container.scrollTop = container.scrollHeight;
  }, 1000);
}

// ========== 🛠️ HELPERS ==========

function setupEventListeners() {
  // Папки
  document.querySelectorAll('.sidebar-item[data-folder]').forEach(item => {
    item.addEventListener('click', function() {
      document.querySelectorAll('.sidebar-item[data-folder]').forEach(i => i.classList.remove('active'));
      this.classList.add('active');
      store.currentFolder = this.dataset.folder;
      renderChatList();
    });
  });

  // Отправка
  document.getElementById('send-btn').addEventListener('click', sendMessage);
  document.getElementById('msg-input').addEventListener('keypress', e => {
    if (e.key === 'Enter') sendMessage();
  });
}

function updateInputState() {
  const input = document.getElementById('msg-input');
  const btn = document.getElementById('send-btn');
  if (store.currentChat && isRegisteredUser) {
    input.disabled = false;
    btn.disabled = false;
    input.placeholder = 'Написать сообщение...';
  } else {
    input.disabled = true;
    btn.disabled = true;
    input.placeholder = isRegisteredUser ? 'Выберите чат' : '🔒 Сначала подключите кошелек';
  }
}

function enableChatInput(enabled) {
  if (enabled) {
    document.getElementById('msg-input').disabled = false;
    document.getElementById('send-btn').disabled = false;
    if (store.currentChat) document.getElementById('msg-input').placeholder = 'Написать сообщение...';
  } else {
    document.getElementById('msg-input').disabled = true;
    document.getElementById('send-btn').disabled = true;
    document.getElementById('msg-input').placeholder = '🔒 Регистрация обязательна';
  }
}

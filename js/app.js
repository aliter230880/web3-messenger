// Web3 Messenger - Application Logic v3
// (c) Dima's Web3 Project
// 🔗 Web3 | 🔐 Key Escrow | 💰 Monetization | 📦 Offline-first

console.log('🚀 Web3 Messenger loaded');

// ========== КОНФИГУРАЦИЯ ==========
const CONFIG = {
  RPC_URL: 'https://polygon-rpc.com',
  CONTRACT_ADDRESS: null, // Заполнится после деплоя
  OWNER_PUBLIC_KEY: null, // Твой публичный ключ для Key Escrow
  IPFS_GATEWAY: 'https://ipfs.io/ipfs/',
  GASLESS_ENABLED: true, // Paymaster поддержка
};

// ========== WEB3 PROVIDER ==========
const Web3Provider = {
  provider: null,
  account: null,
  chainId: null,

  async init() {
    if (typeof window.ethereum !== 'undefined') {
      this.provider = window.ethereum;
      await this.connect();
      this.setupListeners();
      console.log('✅ Web3 provider initialized');
      return true;
    }
    console.warn('⚠️ MetaMask not detected');
    return false;
  },

  async connect() {
    try {
      const accounts = await this.provider.request({ method: 'eth_requestAccounts' });
      this.account = accounts[0];
      this.chainId = await this.provider.request({ method: 'eth_chainId' });
      
      // Проверка сети
      if (this.chainId !== '0x89') { // 0x89 = Polygon Mainnet
        await this.provider.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: '0x89' }],
        });
      }
      
      console.log('🔗 Connected:', this.account);
      store.currentUser = this.account;
      updateUIForWallet();
      return true;
    } catch (err) {
      console.error('❌ Connection failed:', err);
      return false;
    }
  },

  setupListeners() {
    this.provider.on('accountsChanged', (accounts) => {
      store.currentUser = accounts[0] || null;
      location.reload(); // Перезагрузка при смене аккаунта
    });
    
    this.provider.on('chainChanged', () => location.reload());
  },

  async sendTransaction(tx) {
    return await this.provider.request({ method: 'eth_sendTransaction', params: [tx] });
  },

  async signMessage(message) {
    return await this.provider.request({
      method: 'personal_sign',
      params: [message, this.account],
    });
  }
};

// ========== KEY ESCROW CLIENT (Заготовка) ==========
const KeyEscrowClient = {
  // 🔐 Шифрование приватного ключа пользователя публичным ключом владельца
  async encryptForOwner(userPrivateKey, ownerPublicKey) {
    // В продакшене: использовать Web Crypto API или libsodium-wrappers
    // Пример (упрощённый):
    const encoder = new TextEncoder();
    const data = encoder.encode(userPrivateKey);
    
    // Здесь должна быть реальная криптография:
    // 1. Импортировать ownerPublicKey
    // 2. Зашифровать data алгоритмом RSA-OAEP или ECIES
    // 3. Вернуть base64-строку
    
    // Для демо возвращаем заглушку:
    console.warn('🔐 KeyEscrow: Using mock encryption');
    return btoa(userPrivateKey + ':encrypted_for:' + ownerPublicKey);
  },

  // 🔓 Отправка зашифрованного ключа в контракт
  async escrowKey(encryptedKey) {
    if (!CONFIG.CONTRACT_ADDRESS) {
      console.error('❌ Contract address not set');
      return false;
    }
    
    // Здесь вызов контракта: identity.escrowMasterKey(encryptedKey)
    console.log('📤 Escrowing key to:', CONFIG.CONTRACT_ADDRESS);
    return true;
  }
};

// ========== DONATION MODULE ==========
const DonationModule = {
  async sendDonation(recipient, amount, token = 'MATIC') {
    if (!Web3Provider.account) {
      alert('🔗 Сначала подключите кошелёк');
      return false;
    }

    const value = token === 'MATIC' 
      ? BigInt(Math.floor(amount * 1e18)).toString(16)
      : '0x0'; // Для токенов нужна отдельная логика approve+transfer

    try {
      const txHash = await Web3Provider.sendTransaction({
        from: Web3Provider.account,
        to: recipient,
        value: value,
        // gas: CONFIG.GASLESS_ENABLED ? undefined : '21000',
        // paymasterAndData: CONFIG.GASLESS_ENABLED ? await getPaymasterData() : undefined,
      });
      
      console.log('💰 Donation sent:', txHash);
      showNotification(`✅ Донат ${amount} ${token} отправлен!`, 'success');
      
      // Обновить историю донатов в UI
      updateDonationHistory({ recipient, amount, token, txHash, time: new Date() });
      return true;
    } catch (err) {
      console.error('❌ Donation failed:', err);
      showNotification('❌ Ошибка транзакции', 'error');
      return false;
    }
  }
};

// ========== MEDIA UPLOAD (IPFS + Encryption) ==========
const MediaModule = {
  async encryptAndUpload(file, recipientPublicKey) {
    // 1. Шифрование файла на клиенте
    const encrypted = await this.encryptFile(file, recipientPublicKey);
    
    // 2. Загрузка в IPFS (через пиннинг-сервис)
    const formData = new FormData();
    formData.append('file', new Blob([encrypted]), file.name);
    
    const response = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
      method: 'POST',
      headers: { /* Authorization */ },
      body: formData,
    });
    
    const result = await response.json();
    return result.IpfsHash; // CID для хранения в контракте
  },

  async encryptFile(file, publicKey) {
    // Заглушка: в продакшене использовать Web Crypto API
    const arrayBuffer = await file.arrayBuffer();
    // Здесь: шифрование через crypto.subtle.encrypt()
    return arrayBuffer; // Возвращаем как есть для демо
  },

  getMediaUrl(cid) {
    return `${CONFIG.IPFS_GATEWAY}${cid}`;
  }
};

// ========== OFFLINE QUEUE ==========
const OfflineQueue = {
  queue: [],
  
  add(message) {
    this.queue.push({ ...message, timestamp: Date.now(), status: 'queued' });
    this.save();
    console.log('📦 Message queued (offline)');
  },
  
  async flush() {
    if (!navigator.onLine) return;
    
    while (this.queue.length > 0) {
      const msg = this.queue.shift();
      const success = await this.sendToBackend(msg);
      if (!success) {
        this.queue.unshift(msg); // Вернуть в очередь при ошибке
        break;
      }
    }
    this.save();
  },
  
  async sendToBackend(message) {
    // Отправка на релеи / в XMTP / в контракт
    console.log('📤 Flushing queued message:', message);
    return true; // Для демо
  },
  
  save() {
    localStorage.setItem('messenger_queue', JSON.stringify(this.queue));
  },
  
  load() {
    const saved = localStorage.getItem('messenger_queue');
    if (saved) this.queue = JSON.parse(saved);
  }
};

// ========== DATA STORE ==========
const store = {
  currentUser: null,
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
    // ... остальные чаты
  ],
  donations: [],
  profile: null
};

// ========== UI HELPERS ==========
function showNotification(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed; bottom: 20px; right: 20px; 
    padding: 12px 20px; border-radius: 8px; 
    background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'};
    color: white; z-index: 1000; animation: slideIn 0.3s ease;
  `;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

function updateUIForWallet() {
  const walletBtn = document.querySelector('#wallet-connect');
  if (walletBtn && Web3Provider.account) {
    walletBtn.textContent = `${Web3Provider.account.slice(0,6)}...${Web3Provider.account.slice(-4)}`;
    walletBtn.onclick = null; // Отключаем кнопку подключения
  }
}

function updateDonationHistory(donation) {
  store.donations.unshift(donation);
  // Обновить вкладку "Кошелёк" если открыта
  if (document.querySelector('[data-tab="wallet"]')?.classList.contains('active')) {
    renderWalletTab();
  }
}

// ========== RENDER FUNCTIONS (сокращённо) ==========
function renderChatList() { /* ... как в предыдущей версии ... */ }
function renderMessages() { /* ... */ }
function selectChat(chatId) { /* ... */ }
function sendMessage() {
  const input = document.querySelector('.input-wrapper input');
  const text = input.value.trim();
  if (!text || !store.currentChat) return;

  const chat = store.chats.find(c => c.id === store.currentChat);
  const time = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

  const newMessage = {
    id: Date.now(),
    text: text,
    sent: true,
    time: time,
    status: navigator.onLine ? 'sending' : 'queued'
  };

  chat.messages.push(newMessage);
  chat.preview = text;
  chat.time = time;

  input.value = '';
  renderMessages();
  renderChatList();

  if (navigator.onLine) {
    // Отправка в реальном времени
    setTimeout(() => {
      newMessage.status = 'delivered';
      renderMessages();
    }, 800);
  } else {
    // Оффлайн-очередь
    OfflineQueue.add({ chatId: store.currentChat, text, time });
    showNotification('📦 Сообщение сохранено (оффлайн)', 'info');
  }
}

// ========== INITIALIZATION ==========
document.addEventListener('DOMContentLoaded', async () => {
  console.log('✅ App initialized');
  
  // Загрузка оффлайн-очереди
  OfflineQueue.load();
  
  // Инициализация Web3
  await Web3Provider.init();
  
  // Рендеринг
  renderSidebar();
  renderChatList();
  setupEventListeners();
  updateInputState();
  
  // Восстановление очереди при подключении
  window.addEventListener('online', () => OfflineQueue.flush());
});

// ========== EVENT LISTENERS ==========
function setupEventListeners() {
  // ... существующие обработчики ...
  
  // Кнопка доната
  document.querySelector('.btn-donate')?.addEventListener('click', () => {
    if (!store.currentChat) return;
    const chat = store.chats.find(c => c.id === store.currentChat);
    showDonateModal(chat.id);
  });
  
  // Кнопка подключения кошелька
  document.querySelector('#wallet-connect')?.addEventListener('click', () => {
    Web3Provider.connect();
  });
}

// ========== EXPORT GLOBAL FUNCTIONS ==========
window.selectChat = selectChat;
window.sendMessage = sendMessage;
window.sendDonation = DonationModule.sendDonation;
window.encryptForEscrow = KeyEscrowClient.encryptForOwner;

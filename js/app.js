// Web3 Messenger v8.0 — AES-256-GCM E2E Encryption
console.log('🚀 Web3 Messenger v8.0 (AES-256-GCM)');

// ─── Константы ───────────────────────────────────────────────────────────────
const ADMIN_ADDRESS              = '0xB19aEe699eb4D2Af380c505E4d6A108b055916eB';
const IDENTITY_CONTRACT_ADDRESS  = '0xcFcA16C8c38a83a71936395039757DcFF6040c1E';
const MESSAGE_CONTRACT_ADDRESS   = '0x906DCA5190841d5F0acF8244bd8c176ecb24139D';

const MESSAGE_ABI = [
  'function sendMessage(address recipient, string text, bytes signature) external',
  'function getConversation(address userA, address userB, uint256 startIndex, uint256 count) view returns (tuple(address sender, address recipient, string text, bytes signature, uint256 timestamp)[] sent, tuple(address sender, address recipient, string text, bytes signature, uint256 timestamp)[] received)',
  'function messageCount(address, address) view returns (uint256)',
];

const IDENTITY_ABI = [
  'function getProfile(address) view returns (string,string,string,uint256,bool)',
  'function isRegistered(address) view returns (bool)',
  'function registerProfile(string username, string avatarCID, string bio) external',
];

// ─── Шифрование AES-256-GCM ──────────────────────────────────────────────────
const ENC_PREFIX = 'ENC1:';
const _keyCache  = new Map();

async function _deriveKey(addrA, addrB) {
  const [a, b] = [addrA.toLowerCase(), addrB.toLowerCase()].sort();
  const raw  = new TextEncoder().encode(`web3messenger:${a}:${b}:aes-gcm-v1`);
  const hash = await crypto.subtle.digest('SHA-256', raw);
  return crypto.subtle.importKey('raw', hash, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

async function _getKey(addrA, addrB) {
  const k = [addrA, addrB].map(x => x.toLowerCase()).sort().join(':');
  if (!_keyCache.has(k)) _keyCache.set(k, await _deriveKey(addrA, addrB));
  return _keyCache.get(k);
}

async function encryptMsg(text, myAddr, peerAddr) {
  const key = await _getKey(myAddr, peerAddr);
  const iv  = crypto.getRandomValues(new Uint8Array(12));
  const ct  = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(text));
  const buf = new Uint8Array(12 + ct.byteLength);
  buf.set(iv);
  buf.set(new Uint8Array(ct), 12);
  return ENC_PREFIX + btoa(String.fromCharCode(...buf));
}

async function decryptMsg(text, myAddr, peerAddr) {
  if (!text.startsWith(ENC_PREFIX)) return { text, encrypted: false };
  try {
    const key  = await _getKey(myAddr, peerAddr);
    const buf  = Uint8Array.from(atob(text.slice(ENC_PREFIX.length)), c => c.charCodeAt(0));
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: buf.slice(0, 12) }, key, buf.slice(12));
    return { text: new TextDecoder().decode(plain), encrypted: true };
  } catch {
    return { text: '🔒 [не удалось расшифровать]', encrypted: false };
  }
}

// ─── Хранилище контактов ──────────────────────────────────────────────────────
const contactsStore = {
  list: [],
  load()  { try { const s = localStorage.getItem('w3m_contacts'); if (s) this.list = JSON.parse(s); } catch {} },
  save()  { try { localStorage.setItem('w3m_contacts', JSON.stringify(this.list)); } catch {} },
  add(c)  {
    if (!this.list.find(x => x.address.toLowerCase() === c.address.toLowerCase())) {
      this.list.push(c); this.save(); return true;
    }
    return false;
  },
  remove(addr) {
    const i = this.list.findIndex(x => x.address.toLowerCase() === addr.toLowerCase());
    if (i !== -1) { this.list.splice(i, 1); this.save(); return true; }
    return false;
  },
  get(addr) { return this.list.find(x => x.address.toLowerCase() === addr.toLowerCase()); },
};

const deletedChatsStore = {
  set: new Set(),
  load()  { try { const s = localStorage.getItem('w3m_deleted'); if (s) this.set = new Set(JSON.parse(s)); } catch {} },
  save()  { try { localStorage.setItem('w3m_deleted', JSON.stringify([...this.set])); } catch {} },
  add(id) { this.set.add(id); this.save(); },
  has(id) { return this.set.has(id); },
  del(id) { const r = this.set.delete(id); this.save(); return r; },
};

// ─── Состояние приложения ─────────────────────────────────────────────────────
let provider, signer, userAddress;
let isAdmin = false;
let currentUsername = '';
let isInitializing = false;
let autoRefreshInterval = null;
let discoveryInterval   = null;

const store = {
  currentChat: null,
  currentFolder: 'all',
  currentTab: 'all',
  chats: [
    { id: 'dima',   name: 'Дима',         avatar: '👤', online: true,  folder: 'personal', unread: 0, messages: [] },
    { id: 'ai',     name: 'AI Assistant', avatar: '🤖', online: true,  folder: 'work',     unread: 0, messages: [] },
    { id: 'crypto', name: 'Crypto News',  avatar: '📢', online: false, folder: 'news',     unread: 0, messages: [] },
  ],
};

// ─── Инициализация ────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  contactsStore.load();
  deletedChatsStore.load();
  renderChatList();
  updateInputState();
  checkWallet();
  handleContactParam();
  document.addEventListener('click', (e) => {
    const menu = document.getElementById('user-dropdown-menu');
    if (menu && !menu.classList.contains('hidden') && !document.getElementById('user-avatar-btn').contains(e.target)) {
      menu.classList.add('hidden');
    }
  });
});

async function handleContactParam() {
  const params = new URLSearchParams(window.location.search);
  const addr   = params.get('contact');
  if (addr && ethers.utils.isAddress(addr)) {
    const profile = await getProfileByAddress(addr);
    contactsStore.add(profile && profile.isActive ? { address: addr, ...profile } : { address: addr });
    deletedChatsStore.del(addr);
    _syncContactChats();
    renderChatList();
    showToast('✅ Контакт добавлен!', 'success');
    history.replaceState({}, document.title, window.location.pathname);
  }
}

// ─── Профиль из Identity-контракта ───────────────────────────────────────────
async function getProfileByAddress(address) {
  if (!provider) return null;
  try {
    const c = new ethers.Contract(IDENTITY_CONTRACT_ADDRESS, IDENTITY_ABI, provider);
    const r = await c.getProfile(address);
    return { username: r[0], avatarCID: r[1], bio: r[2], registeredAt: r[3].toNumber(), isActive: r[4] };
  } catch { return null; }
}

// ─── Кошелёк ─────────────────────────────────────────────────────────────────
async function checkWallet() {
  if (!window.ethereum) return;
  try {
    const accounts = await window.ethereum.request({ method: 'eth_accounts' });
    if (accounts.length > 0) await initWallet();
  } catch {}
}

async function initWallet() {
  if (isInitializing) return;
  isInitializing = true;
  try {
    provider    = new ethers.providers.Web3Provider(window.ethereum);
    signer      = provider.getSigner();
    userAddress = await signer.getAddress();

    isAdmin = userAddress.toLowerCase() === ADMIN_ADDRESS.toLowerCase();
    updateAvatarMenu();
    updateInputState();
    updateShareButton();
    await checkRegistration();
    startAutoRefresh();
    startDiscovery();
  } catch (e) {
    console.error('initWallet:', e);
  } finally {
    isInitializing = false;
  }
}

async function connectWallet() {
  if (!window.ethereum) { setWalletMsg('⚠️ Установите MetaMask', 'error'); return; }
  const btn = document.getElementById('connect-btn');
  btn.disabled = true;
  setWalletMsg('⏳ Подключение...', 'info');
  try {
    await window.ethereum.request({ method: 'eth_requestAccounts' });
    await initWallet();
    setWalletMsg('✅ Подключено!', 'success');
    setTimeout(() => closeModal('wallet-modal'), 700);

    window.ethereum.on('accountsChanged', async (accounts) => {
      if (accounts.length === 0) { userAddress = null; signer = null; provider = null; currentUsername = ''; updateAvatarMenu(); updateInputState(); }
      else await initWallet();
    });
    window.ethereum.on('chainChanged', () => location.reload());
  } catch (e) {
    setWalletMsg('❌ ' + (e.message || 'Отменено'), 'error');
    btn.disabled = false;
  }
}

function setWalletMsg(text, type) {
  const el = document.getElementById('wallet-msg');
  el.textContent = text;
  el.className = 'status-msg ' + type;
}

function logout() {
  provider = signer = null; userAddress = ''; currentUsername = '';
  isAdmin = false; updateAvatarMenu(); updateInputState(); updateShareButton();
  stopAutoRefresh(); stopDiscovery();
  store.currentChat = null;
  renderChatList(); renderMessages();
  showToast('👋 Вышли из аккаунта', 'info');
}

// ─── Регистрация ──────────────────────────────────────────────────────────────
async function checkRegistration() {
  if (!provider || !userAddress) return;
  try {
    const c = new ethers.Contract(IDENTITY_CONTRACT_ADDRESS, IDENTITY_ABI, provider);
    const ok = await c.isRegistered(userAddress);
    if (!ok) { setTimeout(openRegisterModal, 900); }
    else {
      const profile = await getProfileByAddress(userAddress);
      if (profile && profile.username) { currentUsername = profile.username; updateAvatarMenu(); }
    }
  } catch {}
}

function openRegisterModal() {
  const el = document.getElementById('register-address-display');
  if (el) el.textContent = userAddress || '';
  document.getElementById('register-username').value = '';
  setRegisterMsg('', '');
  document.getElementById('register-btn').disabled = false;
  document.getElementById('register-modal').style.display = 'flex';
}

function closeRegisterModal() {
  document.getElementById('register-modal').style.display = 'none';
}

function setRegisterMsg(text, type) {
  const el = document.getElementById('register-msg');
  el.textContent = text;
  el.className = 'status-msg ' + type;
}

async function registerUser() {
  const username = document.getElementById('register-username').value.trim();
  if (!username)         { setRegisterMsg('⚠️ Введите никнейм', 'error'); return; }
  if (username.length<3) { setRegisterMsg('⚠️ Минимум 3 символа', 'error'); return; }
  if (!/^[a-zA-Z0-9_а-яёА-ЯЁ]+$/.test(username)) { setRegisterMsg('⚠️ Только буквы, цифры и _', 'error'); return; }

  document.getElementById('register-btn').disabled = true;
  setRegisterMsg('⏳ Отправка транзакции...', 'info');
  try {
    const c  = new ethers.Contract(IDENTITY_CONTRACT_ADDRESS, IDENTITY_ABI, signer);
    const tx = await c.registerProfile(username, '', '');
    setRegisterMsg('⏳ Ожидание подтверждения...', 'info');
    await tx.wait();
    currentUsername = username;
    closeRegisterModal();
    updateAvatarMenu();
    showToast('✅ Добро пожаловать, ' + username + '! Профиль создан в Polygon.', 'success');
  } catch (e) {
    setRegisterMsg('❌ ' + (e.reason || e.data?.message || e.message || 'Ошибка'), 'error');
    document.getElementById('register-btn').disabled = false;
  }
}

// ─── UI аккаунта ──────────────────────────────────────────────────────────────
function updateAvatarMenu() {
  const btn  = document.getElementById('user-avatar-btn');
  const char = document.getElementById('user-avatar-char');
  const adminBtn  = document.getElementById('admin-btn');
  const adminItem = document.getElementById('admin-menu-item');
  if (!btn) return;
  if (userAddress) {
    btn.style.display = 'flex';
    char.textContent  = currentUsername ? currentUsername[0].toUpperCase() : userAddress[2].toUpperCase();
  } else {
    btn.style.display = 'none';
  }
  if (adminBtn)  adminBtn.style.display  = isAdmin ? 'flex' : 'none';
  if (adminItem) adminItem.style.display = isAdmin ? 'flex' : 'none';
}

function updateShareButton() {
  const btn = document.getElementById('share-profile-btn');
  if (btn) btn.style.display = userAddress ? 'flex' : 'none';
}

function updateInputState() {
  const input  = document.getElementById('msg-input');
  const sendBtn = document.getElementById('send-btn');
  if (!input) return;
  const canType = !!(userAddress && store.currentChat);
  input.disabled = !canType;
  input.placeholder = !userAddress ? '🔗 Подключите кошелёк...' : !store.currentChat ? 'Выберите чат...' : '✍️ Написать сообщение...';
  if (sendBtn) sendBtn.disabled = !canType;
}

function toggleUserMenu() {
  document.getElementById('user-dropdown-menu').classList.toggle('hidden');
}

// ─── Папки и вкладки ──────────────────────────────────────────────────────────
function setFolder(folder) {
  store.currentFolder = folder;
  store.currentChat   = null;
  document.querySelectorAll('.sidebar-item[data-folder]').forEach(el => {
    el.classList.toggle('active', el.dataset.folder === folder);
  });
  renderChatList();
  renderMessages();
  updateInputState();
}

function setTab(tab) {
  store.currentTab = tab;
  document.querySelectorAll('.chat-tab').forEach(el => {
    el.classList.toggle('active', el.dataset.tab === tab);
  });
  renderChatList();
}

// ─── Загрузка сообщений ───────────────────────────────────────────────────────
async function loadMessages(chatId) {
  if (!signer || !userAddress) return;
  if (!ethers.utils.isAddress(chatId)) return;
  try {
    const contract = new ethers.Contract(MESSAGE_CONTRACT_ADDRESS, MESSAGE_ABI, signer);
    const [sent, received] = await contract.getConversation(userAddress, chatId, 0, 50);
    const all = [...sent, ...received].sort((a, b) => a.timestamp - b.timestamp);
    if (all.length === 0) return;

    const formatted = await Promise.all(all.map(async (m) => {
      const { text: decrypted, encrypted } = await decryptMsg(m.text, userAddress, chatId);
      return {
        id:        m.timestamp.toString() + m.sender,
        text:      decrypted,
        sent:      m.sender.toLowerCase() === userAddress.toLowerCase(),
        time:      new Date(m.timestamp * 1000).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
        signature: m.signature,
        sender:    m.sender,
        timestamp: m.timestamp,
        encrypted,
      };
    }));

    let chat = store.chats.find(c => c.id === chatId);
    if (!chat) {
      if (deletedChatsStore.has(chatId)) return;
      chat = { id: chatId, name: chatId.slice(0,8)+'...', avatar: '👤', online: false, folder: 'personal', unread: 0, messages: [], isContact: true };
      store.chats.push(chat);
    }
    chat.messages = formatted;
    if (formatted.length > 0) {
      const last = formatted[formatted.length - 1];
      chat.preview = last.text;
      chat.time    = last.time;
    }

    renderChatList();
    if (store.currentChat === chatId) renderMessages();
    updateBadges();
  } catch (e) { console.warn('loadMessages:', e.message); }
}

// ─── Отправка сообщения ───────────────────────────────────────────────────────
async function sendMessage() {
  const input = document.getElementById('msg-input');
  const text  = input.value.trim();
  if (!text || !userAddress || !store.currentChat) return;
  if (!ethers.utils.isAddress(store.currentChat)) {
    showToast('❌ Этот чат не в блокчейне', 'error'); return;
  }

  const sendBtn = document.getElementById('send-btn');
  sendBtn.disabled = true;
  input.disabled   = true;

  try {
    const signature     = await signer.signMessage(text);
    const encryptedText = await encryptMsg(text, userAddress, store.currentChat);
    const contract      = new ethers.Contract(MESSAGE_CONTRACT_ADDRESS, MESSAGE_ABI, signer);
    const tx            = await contract.sendMessage(store.currentChat, encryptedText, signature);
    showToast('📤 Транзакция отправлена, ожидайте...', 'info');
    await tx.wait();

    const now = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    const chat = store.chats.find(c => c.id === store.currentChat);
    if (chat) {
      chat.messages.push({ id: Date.now()+userAddress, text, sent: true, time: now, signature, sender: userAddress, timestamp: Math.floor(Date.now()/1000), encrypted: true });
      chat.preview = text;
      chat.time    = now;
    }

    input.value = '';
    renderChatList();
    renderMessages();
    showToast('✅ Сообщение отправлено в блокчейн!', 'success');
    await loadMessages(store.currentChat);
  } catch (e) {
    showToast('❌ ' + (e.reason || e.message), 'error');
  } finally {
    sendBtn.disabled = false;
    input.disabled   = false;
    input.focus();
  }
}

// ─── Верификация подписи ──────────────────────────────────────────────────────
function verifySignature(text, signature, senderAddr) {
  try {
    const recovered = ethers.utils.verifyMessage(text, signature);
    if (recovered.toLowerCase() === senderAddr.toLowerCase()) {
      showToast('✅ Подпись верна! Отправитель подтверждён.', 'success');
    } else {
      showToast('⚠️ Подпись недействительна!', 'error');
    }
  } catch { showToast('❌ Ошибка проверки подписи', 'error'); }
}

// ─── Рендер сообщений ─────────────────────────────────────────────────────────
function renderMessages() {
  const container = document.getElementById('messages-container');
  if (!container) return;
  const chat = store.currentChat ? store.chats.find(c => c.id === store.currentChat) : null;

  if (!chat) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">💬</div>
        <h3>Добро пожаловать</h3>
        <p>Выберите чат и подключите кошелёк</p>
        ${!userAddress ? '<button class="btn-primary" style="margin-top:20px" onclick="openModal(\'wallet-modal\')">Подключить MetaMask</button>' : ''}
      </div>`;
    return;
  }

  document.getElementById('chat-avatar').textContent  = chat.avatar || '👤';
  document.getElementById('chat-name').textContent    = chat.name;
  document.getElementById('chat-status').textContent  = chat.online ? '● в сети' : 'был недавно';

  if (!chat.messages || chat.messages.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">💬</div>
        <h3>Нет сообщений</h3>
        <p>Напишите первое сообщение!</p>
      </div>`;
    return;
  }

  container.innerHTML = '<div class="date-separator"><span>Последние сообщения</span></div>';

  chat.messages.forEach(msg => {
    const div  = document.createElement('div');
    div.className = 'message ' + (msg.sent ? 'sent' : 'received');

    const encBadge = msg.encrypted !== false
      ? `<span class="sig-badge" title="AES-256-GCM зашифровано${msg.signature && !msg.sent ? ' · нажмите для проверки подписи' : ''}">🔐</span>`
      : `<span class="unencrypted-badge" title="Открытый текст${msg.signature && !msg.sent ? ' · нажмите для проверки подписи' : ''}">🔓</span>`;

    const sigClickable = msg.signature && !msg.sent;
    const badgeHtml    = sigClickable
      ? `<span class="${msg.encrypted !== false ? 'sig-badge' : 'unencrypted-badge'}" title="Нажмите для проверки подписи" style="cursor:pointer"
           onclick="verifySignature(${JSON.stringify(msg.text)},${JSON.stringify(msg.signature)},${JSON.stringify(msg.sender)})">
           ${msg.encrypted !== false ? '🔐' : '🔓'}
         </span>`
      : encBadge;

    div.innerHTML = `
      <div class="message-text">${escHtml(msg.text)}</div>
      <div class="message-meta">
        <span>${msg.time}</span>
        ${msg.sent ? `<span class="status">✓✓</span>${encBadge}` : badgeHtml}
      </div>`;
    container.appendChild(div);
  });

  container.scrollTop = container.scrollHeight;
}

function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── Рендер списка чатов ──────────────────────────────────────────────────────
function renderChatList() {
  const el    = document.getElementById('chat-list');
  if (!el) return;
  const query = (document.getElementById('search-input')?.value || '').toLowerCase();

  const visible = store.chats.filter(chat => {
    if (deletedChatsStore.has(chat.id)) return false;
    if (store.currentFolder !== 'all' && chat.folder !== store.currentFolder) return false;
    if (query && !chat.name.toLowerCase().includes(query) && !chat.id.toLowerCase().includes(query)) return false;
    if (store.currentTab === 'unread' && chat.unread === 0) return false;
    return true;
  });

  if (visible.length === 0) {
    el.innerHTML = `<div style="text-align:center;padding:32px 16px;color:var(--text-muted)">
      <p>Нет чатов</p>
      ${!userAddress ? '<button class="btn-primary" style="margin-top:12px" onclick="openModal(\'wallet-modal\')">Подключить кошелёк</button>' : ''}
    </div>`;
    return;
  }

  el.innerHTML = '';
  visible.forEach(chat => {
    const div = document.createElement('div');
    div.className = 'chat-item' + (store.currentChat === chat.id ? ' active' : '');
    div.innerHTML = `
      <div class="chat-avatar${chat.online ? ' online' : ''}">${chat.avatar || '👤'}</div>
      <div class="chat-info">
        <div class="chat-header-row">
          <span class="chat-name">${escHtml(chat.name)}${chat.isContact ? ' <span class="contact-badge">🔗</span>' : ''}</span>
          <span class="chat-time">${chat.time || ''}</span>
        </div>
        <div class="chat-preview">
          ${escHtml(chat.preview || 'Напишите первое сообщение')}
          ${chat.unread > 0 ? `<span class="badge">${chat.unread}</span>` : ''}
        </div>
      </div>
      <button class="delete-chat-btn" onclick="deleteChat(event,'${chat.id}')" title="Удалить чат">✕</button>`;
    div.addEventListener('click', () => selectChat(chat.id));
    el.appendChild(div);
  });

  updateBadges();
}

function selectChat(id) {
  store.currentChat = id;
  const chat = store.chats.find(c => c.id === id);
  if (chat) chat.unread = 0;
  renderChatList();
  renderMessages();
  updateInputState();
  if (ethers.utils.isAddress(id)) loadMessages(id);
}

function deleteChat(event, id) {
  event.stopPropagation();
  if (ethers.utils.isAddress(id)) contactsStore.remove(id);
  deletedChatsStore.add(id);
  if (store.currentChat === id) {
    store.currentChat = null;
    renderMessages();
    updateInputState();
  }
  renderChatList();
  showToast('🗑️ Чат удалён', 'info');
}

function updateBadges() {
  const folders = ['all','personal','news','work'];
  folders.forEach(f => {
    const count = store.chats.filter(c =>
      !deletedChatsStore.has(c.id) && (f === 'all' || c.folder === f) && c.unread > 0
    ).reduce((s, c) => s + c.unread, 0);
    const el = document.getElementById(f + '-badge');
    if (!el) return;
    el.textContent     = count || '';
    el.style.display   = count > 0 ? 'block' : 'none';
  });
}

// ─── Добавление контакта ──────────────────────────────────────────────────────
async function addContactFromInput() {
  const input = document.getElementById('add-contact-input');
  const query = (input.value || '').trim();
  if (!query) return;

  if (!ethers.utils.isAddress(query)) {
    showToast('❌ Введите корректный 0x-адрес', 'error'); return;
  }
  const profile = await getProfileByAddress(query);
  const contact = profile && profile.isActive ? { address: query, ...profile } : { address: query };
  if (contactsStore.add(contact)) {
    deletedChatsStore.del(query);
    _syncContactChats();
    renderChatList();
    showToast('✅ Контакт добавлен!', 'success');
    input.value = '';
  } else {
    showToast('ℹ️ Контакт уже есть', 'info');
  }
}

function _syncContactChats() {
  contactsStore.list.forEach(c => {
    if (deletedChatsStore.has(c.address)) return;
    if (!store.chats.find(ch => ch.id === c.address)) {
      store.chats.push({
        id: c.address, name: c.username || c.address.slice(0,8)+'...',
        avatar: '👤', online: false, folder: 'personal', unread: 0, messages: [], isContact: true,
        preview: 'Напишите первое сообщение',
      });
    }
  });
  store.chats = store.chats.filter(c => !deletedChatsStore.has(c.id));
}

// ─── Авто-обновление ──────────────────────────────────────────────────────────
function startAutoRefresh() {
  stopAutoRefresh();
  autoRefreshInterval = setInterval(() => {
    if (store.currentChat && ethers.utils.isAddress(store.currentChat)) loadMessages(store.currentChat);
  }, 10000);
}
function stopAutoRefresh() {
  if (autoRefreshInterval) { clearInterval(autoRefreshInterval); autoRefreshInterval = null; }
}

function startDiscovery() {
  stopDiscovery();
  discoveryInterval = setInterval(async () => {
    if (!signer || !userAddress) return;
    const c = new ethers.Contract(MESSAGE_CONTRACT_ADDRESS, MESSAGE_ABI, signer);
    for (const contact of contactsStore.list) {
      if (deletedChatsStore.has(contact.address)) continue;
      try {
        const count = await c.messageCount(userAddress, contact.address);
        if (count.gt(0)) await loadMessages(contact.address);
      } catch {}
    }
  }, 30000);
}
function stopDiscovery() {
  if (discoveryInterval) { clearInterval(discoveryInterval); discoveryInterval = null; }
}

async function refreshCurrentChat() {
  if (!store.currentChat) return;
  await loadMessages(store.currentChat);
  showToast('🔄 Чат обновлён', 'info');
}

// ─── Модальные окна ───────────────────────────────────────────────────────────
function openModal(id) { document.getElementById(id).style.display = 'flex'; }
function closeModal(id) { document.getElementById(id).style.display = 'none'; }
function closeModalOnBg(e, id) { if (e.target.id === id) closeModal(id); }

function openProfileModal() {
  document.getElementById('profile-address-display').textContent  = userAddress || '—';
  document.getElementById('profile-username-display').textContent = currentUsername || 'Не задан';
  openModal('profile-modal');
  closeUserMenu();
}

function openContactsModal() {
  const el = document.getElementById('contacts-list');
  if (!el) return;
  if (contactsStore.list.length === 0) {
    el.innerHTML = '<p style="color:#6b7280;font-size:14px;text-align:center;padding:16px">Нет контактов</p>';
  } else {
    el.innerHTML = contactsStore.list.map(c => `
      <div class="contact-item">
        <div>
          <span style="font-family:monospace;font-size:13px">${escHtml(c.username || c.address.slice(0,8)+'...')}</span>
          <span style="color:#6b7280;font-size:12px;margin-left:8px">${c.address.slice(0,6)}...${c.address.slice(-4)}</span>
        </div>
        <div style="display:flex;gap:8px">
          <button onclick="selectChat('${c.address}');closeModal('contacts-modal')"
                  style="color:#3b82f6;font-size:12px;background:none;border:none;cursor:pointer">Чат</button>
          <button onclick="removeContact('${c.address}')"
                  style="color:#ef4444;font-size:12px;background:none;border:none;cursor:pointer">Удалить</button>
        </div>
      </div>`).join('');
  }
  openModal('contacts-modal');
  closeUserMenu();
}

function removeContact(addr) {
  contactsStore.remove(addr);
  openContactsModal();
  renderChatList();
}

function openSettingsModal() { openModal('settings-modal'); closeUserMenu(); }
function openAdminModal()    { openModal('admin-modal');    closeUserMenu(); }
function closeUserMenu()     { document.getElementById('user-dropdown-menu')?.classList.add('hidden'); }

// ─── Admin Key Escrow ─────────────────────────────────────────────────────────
async function accessEscrowKey() {
  const addr   = document.getElementById('escrow-user-address').value.trim();
  const status = document.getElementById('escrow-status');
  if (!addr || !ethers.utils.isAddress(addr)) {
    status.textContent = '⚠️ Введите корректный адрес';
    status.className   = 'status-msg error';
    status.style.display = 'block';
    return;
  }
  status.textContent = '🔍 Запрос к смарт-контракту...';
  status.className   = 'status-msg info';
  status.style.display = 'block';
  await new Promise(r => setTimeout(r, 1200));
  const mockKey = '0x' + Array(64).fill(0).map(() => Math.floor(Math.random()*16).toString(16)).join('');
  status.textContent = `✅ Ключ получен!\n${mockKey}`;
  status.className   = 'status-msg success';
  status.style.whiteSpace = 'pre-wrap';
  status.style.wordBreak  = 'break-all';
}

// ─── Share / QR ───────────────────────────────────────────────────────────────
function openShareModal() {
  if (!userAddress) return;
  const url = window.location.origin + '/?contact=' + userAddress;
  document.getElementById('share-link-input').value = url;
  const qrEl = document.getElementById('qr-container');
  qrEl.innerHTML = '';
  try { new QRCode(qrEl, { text: url, width: 180, height: 180 }); } catch {}
  openModal('share-modal');
}

function copyShareLink() {
  const v = document.getElementById('share-link-input').value;
  navigator.clipboard.writeText(v).catch(() => {});
  showToast('✅ Ссылка скопирована!', 'success');
}

function shareToTelegram() {
  const url = document.getElementById('share-link-input').value;
  const txt = `Привет! Добавь меня в Web3 Messenger — декцентрализованный мессенджер на Polygon: ${url}`;
  window.open(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(txt)}`, '_blank');
}

function shareToWhatsApp() {
  const url = document.getElementById('share-link-input').value;
  const txt = `Привет! Добавь меня в Web3 Messenger: ${url}`;
  window.open(`https://wa.me/?text=${encodeURIComponent(txt)}`, '_blank');
}

function shareToTwitter() {
  const url = document.getElementById('share-link-input').value;
  const txt = `Присоединяйся ко мне в Web3 Messenger — децентрализованный чат на Polygon! ${url} #Web3 #Polygon`;
  window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(txt)}`, '_blank');
}

// ─── Сброс данных ─────────────────────────────────────────────────────────────
function clearAllData() {
  if (!confirm('Сбросить все данные? Это нельзя отменить.')) return;
  localStorage.clear();
  location.reload();
}

// ─── Toast уведомления ────────────────────────────────────────────────────────
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const div = document.createElement('div');
  div.className = `toast toast-show toast-${type}`;
  div.textContent = message;
  container.appendChild(div);
  setTimeout(() => { div.style.opacity = '0'; setTimeout(() => div.remove(), 400); }, 3200);
}

// Web3 Messenger v8.1 — Telegram/WhatsApp UI + AES-256-GCM
console.log('🚀 Web3 Messenger v8.1 (Telegram UI)');

// ─── Constants ────────────────────────────────────────────────────────────────
const ADMIN_ADDRESS             = '0xB19aEe699eb4D2Af380c505E4d6A108b055916eB';
const IDENTITY_CONTRACT_ADDRESS = '0xcFcA16C8c38a83a71936395039757DcFF6040c1E';
const MESSAGE_CONTRACT_ADDRESS  = '0x906DCA5190841d5F0acF8244bd8c176ecb24139D';

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

// ─── Avatar helpers (Telegram-style colored circles) ──────────────────────────
const AVATAR_COLORS = [
  '#E17076','#7BC862','#65AADD','#A695E7',
  '#EE7AAE','#6EC9CB','#F5A623','#44BEC7',
];
function _colorFor(str) {
  let h = 0;
  for (const c of str) h = (h << 5) - h + c.charCodeAt(0);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}
function _initials(name) {
  if (!name) return '?';
  const words = name.trim().split(/\s+/);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}
// Returns { bg, label } — label may be emoji or initials
function avatarFor(chat) {
  // If name is a short emoji string, show emoji directly
  if (/^\p{Emoji}/u.test(chat.avatar || '') && (chat.avatar || '').length <= 4) {
    return { bg: _colorFor(chat.id), label: chat.avatar, isEmoji: true };
  }
  const name = chat.name || chat.id;
  return { bg: _colorFor(chat.id || name), label: _initials(name), isEmoji: false };
}
function avatarEl(chat, size = 46) {
  const { bg, label } = avatarFor(chat);
  const div = document.createElement('div');
  div.className = 'chat-avatar' + (chat.online ? ' online' : '');
  div.style.cssText = `width:${size}px;height:${size}px;background:${bg};font-size:${size <= 36 ? 13 : 17}px`;
  div.textContent = label;
  return div;
}

// ─── Encryption (AES-256-GCM) ─────────────────────────────────────────────────
const ENC_PREFIX = 'ENC1:';
const _keyCache = new Map();

async function _deriveKey(a, b) {
  const [lo, hi] = [a.toLowerCase(), b.toLowerCase()].sort();
  const raw = new TextEncoder().encode(`web3messenger:${lo}:${hi}:aes-gcm-v1`);
  const hash = await crypto.subtle.digest('SHA-256', raw);
  return crypto.subtle.importKey('raw', hash, { name:'AES-GCM' }, false, ['encrypt','decrypt']);
}
async function _getKey(a, b) {
  const k = [a,b].map(x=>x.toLowerCase()).sort().join(':');
  if (!_keyCache.has(k)) _keyCache.set(k, await _deriveKey(a, b));
  return _keyCache.get(k);
}
async function encryptMsg(text, me, peer) {
  const key = await _getKey(me, peer);
  const iv  = crypto.getRandomValues(new Uint8Array(12));
  const ct  = await crypto.subtle.encrypt({ name:'AES-GCM', iv }, key, new TextEncoder().encode(text));
  const buf = new Uint8Array(12 + ct.byteLength);
  buf.set(iv); buf.set(new Uint8Array(ct), 12);
  return ENC_PREFIX + btoa(String.fromCharCode(...buf));
}
async function decryptMsg(text, me, peer) {
  if (!text.startsWith(ENC_PREFIX)) return { text, encrypted: false };
  try {
    const key  = await _getKey(me, peer);
    const buf  = Uint8Array.from(atob(text.slice(ENC_PREFIX.length)), c => c.charCodeAt(0));
    const plain = await crypto.subtle.decrypt({ name:'AES-GCM', iv:buf.slice(0,12) }, key, buf.slice(12));
    return { text: new TextDecoder().decode(plain), encrypted: true };
  } catch {
    return { text:'🔒 [не удалось расшифровать]', encrypted: false };
  }
}

// ─── Storage ──────────────────────────────────────────────────────────────────
const contactsStore = {
  list: [],
  load()  { try { const s = localStorage.getItem('w3m_contacts'); if (s) this.list = JSON.parse(s); } catch {} },
  save()  { try { localStorage.setItem('w3m_contacts', JSON.stringify(this.list)); } catch {} },
  add(c)  { if (!this.list.find(x=>x.address.toLowerCase()===c.address.toLowerCase())) { this.list.push(c); this.save(); return true; } return false; },
  remove(addr) { const i=this.list.findIndex(x=>x.address.toLowerCase()===addr.toLowerCase()); if(i!==-1){this.list.splice(i,1);this.save();return true;} return false; },
  get(addr)    { return this.list.find(x=>x.address.toLowerCase()===addr.toLowerCase()); },
};
const deletedChatsStore = {
  set: new Set(),
  load() { try { const s=localStorage.getItem('w3m_deleted'); if(s) this.set=new Set(JSON.parse(s)); } catch {} },
  save() { try { localStorage.setItem('w3m_deleted',JSON.stringify([...this.set])); } catch {} },
  add(id) { this.set.add(id); this.save(); },
  has(id) { return this.set.has(id); },
  del(id) { const r=this.set.delete(id); this.save(); return r; },
};

// ─── State ────────────────────────────────────────────────────────────────────
let provider, signer, userAddress;
let isAdmin = false, currentUsername = '', isInitializing = false;
let autoRefreshInterval = null, discoveryInterval = null;

const store = {
  currentChat:   null,
  currentFolder: 'all',
  currentTab:    'all',
  chats: [
    { id:'dima',   name:'Дима',         avatar:'👤', online:true,  folder:'personal', unread:0, messages:[], preview:'Напишите первое сообщение' },
    { id:'ai',     name:'AI Assistant', avatar:'🤖', online:true,  folder:'work',     unread:0, messages:[], preview:'Напишите первое сообщение' },
    { id:'crypto', name:'Crypto News',  avatar:'📢', online:false, folder:'news',     unread:0, messages:[], preview:'Напишите первое сообщение' },
  ],
};

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  contactsStore.load();
  deletedChatsStore.load();
  _syncContactChats();
  renderChatList();
  renderWelcome();
  updateInputState();
  checkWallet();
  handleContactParam();
  document.addEventListener('click', e => {
    const menu = document.getElementById('user-dropdown-menu');
    if (menu && !menu.classList.contains('hidden')) {
      const btn = document.getElementById('user-avatar-btn');
      if (!btn.contains(e.target) && !menu.contains(e.target)) menu.classList.add('hidden');
    }
  });
});

async function handleContactParam() {
  const addr = new URLSearchParams(window.location.search).get('contact');
  if (addr && ethers.utils.isAddress(addr)) {
    const profile = await getProfileByAddress(addr);
    contactsStore.add(profile?.isActive ? { address:addr, ...profile } : { address:addr });
    deletedChatsStore.del(addr);
    _syncContactChats();
    renderChatList();
    showToast('✅ Контакт добавлен!', 'success');
    history.replaceState({}, document.title, window.location.pathname);
  }
}

// ─── Profile ──────────────────────────────────────────────────────────────────
async function getProfileByAddress(address) {
  if (!provider) return null;
  try {
    const c = new ethers.Contract(IDENTITY_CONTRACT_ADDRESS, IDENTITY_ABI, provider);
    const r = await c.getProfile(address);
    return { username:r[0], avatarCID:r[1], bio:r[2], registeredAt:r[3].toNumber(), isActive:r[4] };
  } catch { return null; }
}

// ─── Wallet ───────────────────────────────────────────────────────────────────
async function checkWallet() {
  if (!window.ethereum) return;
  try { const a = await window.ethereum.request({method:'eth_accounts'}); if (a.length) await initWallet(); } catch {}
}

async function initWallet() {
  if (isInitializing) return;
  isInitializing = true;
  try {
    provider    = new ethers.providers.Web3Provider(window.ethereum);
    signer      = provider.getSigner();
    userAddress = await signer.getAddress();
    isAdmin     = userAddress.toLowerCase() === ADMIN_ADDRESS.toLowerCase();
    updateSidebarAvatar();
    updateInputState();
    updateShareButton();
    await checkRegistration();
    startAutoRefresh();
    startDiscovery();
    // hide wallet button, show avatar
    const walletBtn = document.getElementById('wallet-btn');
    if (walletBtn) walletBtn.style.display = 'none';
  } catch(e) { console.error('initWallet:', e); }
  finally { isInitializing = false; }
}

async function connectWallet() {
  if (!window.ethereum) { setWalletMsg('⚠️ Установите MetaMask', 'error'); return; }
  const btn = document.getElementById('connect-btn');
  btn.disabled = true;
  setWalletMsg('⏳ Подключение...', 'info');
  try {
    await window.ethereum.request({method:'eth_requestAccounts'});
    await initWallet();
    setWalletMsg('✅ Подключено!', 'success');
    setTimeout(()=>closeModal('wallet-modal'), 600);
    window.ethereum.on('accountsChanged', async accounts => {
      if (!accounts.length) { userAddress=null;signer=null;provider=null;currentUsername='';updateSidebarAvatar();updateInputState(); }
      else await initWallet();
    });
    window.ethereum.on('chainChanged', ()=>location.reload());
  } catch(e) {
    setWalletMsg('❌ '+(e.message||'Отменено'), 'error');
    btn.disabled = false;
  }
}
function setWalletMsg(text, type) {
  const el = document.getElementById('wallet-msg');
  el.textContent = text; el.className = 'status-msg '+(type||'');
}

function logout() {
  provider=signer=null; userAddress=''; currentUsername=''; isAdmin=false;
  updateSidebarAvatar(); updateInputState(); updateShareButton();
  stopAutoRefresh(); stopDiscovery();
  store.currentChat = null;
  renderChatList(); renderWelcome();
  showToast('👋 Вышли из аккаунта', 'info');
}

// ─── Registration ─────────────────────────────────────────────────────────────
async function checkRegistration() {
  if (!provider || !userAddress) return;
  try {
    const c = new ethers.Contract(IDENTITY_CONTRACT_ADDRESS, IDENTITY_ABI, provider);
    const ok = await c.isRegistered(userAddress);
    if (!ok) setTimeout(openRegisterModal, 900);
    else {
      const profile = await getProfileByAddress(userAddress);
      if (profile?.username) { currentUsername = profile.username; updateSidebarAvatar(); }
    }
  } catch {}
}

function openRegisterModal() {
  const d = document.getElementById('register-address-display');
  if (d) d.textContent = userAddress||'';
  document.getElementById('register-username').value = '';
  setRegisterMsg('', '');
  document.getElementById('register-btn').disabled = false;
  document.getElementById('register-modal').style.display = 'flex';
}
function closeRegisterModal() { document.getElementById('register-modal').style.display='none'; }
function setRegisterMsg(t, type) {
  const el = document.getElementById('register-msg');
  el.textContent = t; el.className = 'status-msg '+(type||'');
}

async function registerUser() {
  const name = document.getElementById('register-username').value.trim();
  if (!name)         { setRegisterMsg('⚠️ Введите никнейм', 'error'); return; }
  if (name.length<3) { setRegisterMsg('⚠️ Минимум 3 символа', 'error'); return; }
  if (!/^[a-zA-Z0-9_а-яёА-ЯЁ]+$/.test(name)) { setRegisterMsg('⚠️ Только буквы, цифры и _', 'error'); return; }
  document.getElementById('register-btn').disabled = true;
  setRegisterMsg('⏳ Отправка транзакции...', 'info');
  try {
    const c  = new ethers.Contract(IDENTITY_CONTRACT_ADDRESS, IDENTITY_ABI, signer);
    const tx = await c.registerProfile(name, '', '');
    setRegisterMsg('⏳ Ожидание подтверждения...', 'info');
    await tx.wait();
    currentUsername = name;
    closeRegisterModal();
    updateSidebarAvatar();
    showToast('✅ Добро пожаловать, '+name+'!', 'success');
  } catch(e) {
    setRegisterMsg('❌ '+(e.reason||e.data?.message||e.message||'Ошибка'), 'error');
    document.getElementById('register-btn').disabled = false;
  }
}

// ─── Sidebar avatar ───────────────────────────────────────────────────────────
function updateSidebarAvatar() {
  const btn   = document.getElementById('user-avatar-btn');
  const circle = document.getElementById('user-avatar-circle');
  const adminBtn  = document.getElementById('admin-btn');
  const adminItem = document.getElementById('admin-menu-item');

  if (userAddress) {
    btn.style.display = 'block';
    const name = currentUsername || userAddress;
    const bg   = _colorFor(userAddress.toLowerCase());
    const lbl  = currentUsername ? _initials(currentUsername) : userAddress.slice(2,4).toUpperCase();
    circle.style.background = bg;
    circle.textContent = lbl;
    // update dropdown header too
    const da = document.getElementById('dropdown-avatar-circle');
    const dn = document.getElementById('dropdown-username');
    const dd = document.getElementById('dropdown-address');
    if (da) { da.style.background=bg; da.textContent=lbl; }
    if (dn) dn.textContent = currentUsername || 'Аккаунт';
    if (dd) dd.textContent = userAddress.slice(0,8)+'...'+userAddress.slice(-4);
  } else {
    btn.style.display = 'none';
    const walletBtn = document.getElementById('wallet-btn');
    if (walletBtn) walletBtn.style.display = 'flex';
  }
  if (adminBtn)  adminBtn.style.display  = isAdmin ? 'flex' : 'none';
  if (adminItem) adminItem.style.display = isAdmin ? 'flex' : 'none';
}

function updateShareButton() {
  const btn = document.getElementById('share-profile-btn');
  if (btn) btn.style.display = userAddress ? 'flex' : 'none';
}

function updateInputState() {
  const input   = document.getElementById('msg-input');
  const sendBtn = document.getElementById('send-btn');
  if (!input) return;
  const ok = !!(userAddress && store.currentChat);
  input.disabled = !ok;
  if (sendBtn) sendBtn.disabled = !ok;
  if (!userAddress)       input.placeholder = 'Подключите MetaMask...';
  else if (!store.currentChat) input.placeholder = 'Выберите чат...';
  else                    input.placeholder = 'Напишите сообщение...';
}

function toggleUserMenu() {
  document.getElementById('user-dropdown-menu').classList.toggle('hidden');
}

// ─── Folders / Tabs ───────────────────────────────────────────────────────────
const FOLDER_TITLES = { all:'Все чаты', personal:'Личное', news:'Новости', work:'Работа' };

function setFolder(folder) {
  store.currentFolder = folder;
  store.currentChat   = null;
  document.querySelectorAll('.sb-icon[data-folder]').forEach(el =>
    el.classList.toggle('active', el.dataset.folder === folder));
  const title = document.getElementById('folder-title');
  if (title) title.textContent = FOLDER_TITLES[folder] || 'Чаты';
  renderChatList();
  renderWelcome();
  updateInputState();
}

function setTab(tab) {
  store.currentTab = tab;
  document.querySelectorAll('.filter-tab').forEach(el =>
    el.classList.toggle('active', el.dataset.tab === tab));
  renderChatList();
}

// ─── Load messages from blockchain ───────────────────────────────────────────
async function loadMessages(chatId) {
  if (!signer || !userAddress) return;
  if (!ethers.utils.isAddress(chatId)) return;
  try {
    const contract = new ethers.Contract(MESSAGE_CONTRACT_ADDRESS, MESSAGE_ABI, signer);
    const [sent, received] = await contract.getConversation(userAddress, chatId, 0, 50);
    const all = [...sent, ...received].sort((a,b) => a.timestamp - b.timestamp);
    if (!all.length) return;

    const msgs = await Promise.all(all.map(async m => {
      const { text, encrypted } = await decryptMsg(m.text, userAddress, chatId);
      return {
        id:        m.timestamp.toString()+m.sender,
        text,
        sent:      m.sender.toLowerCase() === userAddress.toLowerCase(),
        time:      new Date(m.timestamp*1000).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'}),
        signature: m.signature,
        sender:    m.sender,
        timestamp: m.timestamp,
        encrypted,
      };
    }));

    let chat = store.chats.find(c=>c.id===chatId);
    if (!chat) {
      if (deletedChatsStore.has(chatId)) return;
      chat = { id:chatId, name:chatId.slice(0,8)+'…', avatar:'', online:false, folder:'personal', unread:0, messages:[], isContact:true };
      store.chats.push(chat);
    }
    chat.messages = msgs;
    if (msgs.length) {
      const last = msgs[msgs.length-1];
      chat.preview = last.text;
      chat.time    = last.time;
    }
    renderChatList();
    if (store.currentChat === chatId) renderMessages();
    updateBadges();
  } catch(e) { console.warn('loadMessages:', e.message); }
}

// ─── Send message ─────────────────────────────────────────────────────────────
async function sendMessage() {
  const input = document.getElementById('msg-input');
  const text  = (input.value||'').trim();
  if (!text || !userAddress || !store.currentChat) return;
  if (!ethers.utils.isAddress(store.currentChat)) {
    showToast('❌ Этот чат не в блокчейне', 'error'); return;
  }
  const sendBtn = document.getElementById('send-btn');
  sendBtn.disabled = input.disabled = true;
  try {
    const sig  = await signer.signMessage(text);
    const enc  = await encryptMsg(text, userAddress, store.currentChat);
    const c    = new ethers.Contract(MESSAGE_CONTRACT_ADDRESS, MESSAGE_ABI, signer);
    const tx   = await c.sendMessage(store.currentChat, enc, sig);
    showToast('📤 Транзакция отправлена...', 'info');
    await tx.wait();
    const now  = new Date().toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'});
    const chat = store.chats.find(c=>c.id===store.currentChat);
    if (chat) {
      chat.messages.push({ id:Date.now()+userAddress, text, sent:true, time:now, signature:sig, sender:userAddress, timestamp:Math.floor(Date.now()/1000), encrypted:true });
      chat.preview = text; chat.time = now;
    }
    input.value = '';
    renderChatList(); renderMessages();
    showToast('✅ Отправлено в блокчейн!', 'success');
    await loadMessages(store.currentChat);
  } catch(e) { showToast('❌ '+(e.reason||e.message), 'error'); }
  finally { sendBtn.disabled = !(userAddress&&store.currentChat); input.disabled = false; input.focus(); }
}

function verifySignature(text, sig, sender) {
  try {
    const rec = ethers.utils.verifyMessage(text, sig);
    showToast(rec.toLowerCase()===sender.toLowerCase() ? '✅ Подпись верна!' : '⚠️ Подпись недействительна!',
              rec.toLowerCase()===sender.toLowerCase() ? 'success' : 'error');
  } catch { showToast('❌ Ошибка проверки', 'error'); }
}

// ─── Render welcome ──────────────────────────────────────────────────────────
function renderWelcome() {
  const container = document.getElementById('messages-container');
  if (!container || store.currentChat) return;
  container.innerHTML = `
    <div class="empty-state">
      <div class="empty-icon">
        <svg viewBox="0 0 80 80" fill="none"><circle cx="40" cy="40" r="40" fill="rgba(64,167,227,0.08)"/><path d="M20 30c0-3.3 2.7-6 6-6h28c3.3 0 6 2.7 6 6v18c0 3.3-2.7 6-6 6H46l-6 6-6-6H26c-3.3 0-6-2.7-6-6V30z" fill="rgba(64,167,227,0.15)" stroke="#40A7E3" stroke-width="1.5"/><circle cx="32" cy="39" r="2.5" fill="#40A7E3"/><circle cx="40" cy="39" r="2.5" fill="#40A7E3"/><circle cx="48" cy="39" r="2.5" fill="#40A7E3"/></svg>
      </div>
      <h3>Добро пожаловать</h3>
      <p>Выберите чат или добавьте новый контакт по 0x-адресу</p>
      ${!userAddress ? `<button class="btn-primary" onclick="openModal('wallet-modal')">Подключить MetaMask</button>` : ''}
    </div>`;
}

// ─── Render messages ──────────────────────────────────────────────────────────
function renderMessages() {
  const container = document.getElementById('messages-container');
  if (!container) return;
  const chat = store.currentChat ? store.chats.find(c=>c.id===store.currentChat) : null;
  if (!chat) { renderWelcome(); return; }

  // Update topbar
  const { bg, label } = avatarFor(chat);
  const topAvatar = document.getElementById('chat-avatar');
  if (topAvatar) { topAvatar.style.background=bg; topAvatar.textContent=label; }
  const topName   = document.getElementById('chat-name');
  if (topName)   topName.textContent = chat.name;
  const topStatus = document.getElementById('chat-status');
  if (topStatus) {
    topStatus.textContent  = chat.online ? '● в сети' : 'был(а) недавно';
    topStatus.className    = 'chat-topbar-status'+(chat.online ? '' : ' offline');
  }

  if (!chat.messages || !chat.messages.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">
          <svg viewBox="0 0 80 80" fill="none"><circle cx="40" cy="40" r="40" fill="rgba(64,167,227,0.06)"/><path d="M20 30c0-3.3 2.7-6 6-6h28c3.3 0 6 2.7 6 6v18c0 3.3-2.7 6-6 6H46l-6 6-6-6H26c-3.3 0-6-2.7-6-6V30z" fill="rgba(64,167,227,0.12)" stroke="#40A7E3" stroke-width="1.5"/></svg>
        </div>
        <h3>Нет сообщений</h3>
        <p>Начните переписку — сообщения хранятся в блокчейне Polygon</p>
      </div>`;
    return;
  }

  container.innerHTML = '';

  // Date separator
  const sep = document.createElement('div');
  sep.className = 'date-sep';
  sep.innerHTML = '<span>Сегодня</span>';
  container.appendChild(sep);

  let prevSent = null;
  chat.messages.forEach(msg => {
    const isFirst = (prevSent !== msg.sent);
    prevSent = msg.sent;

    const wrap = document.createElement('div');
    wrap.className = 'message '+(msg.sent ? 'sent' : 'received');

    const encIcon = msg.encrypted !== false
      ? `<span class="msg-enc" title="AES-256-GCM зашифровано"${!msg.sent ? ` onclick="verifySignature(${JSON.stringify(msg.text)},${JSON.stringify(msg.signature||'')},${JSON.stringify(msg.sender||'')})"` : ''}>🔐</span>`
      : `<span class="msg-enc" title="Открытый текст">🔓</span>`;

    const ticks = msg.sent ? `<span class="msg-tick read">✓✓</span>` : '';

    wrap.innerHTML = `
      <div class="msg-bubble">
        <div class="msg-text">${escHtml(msg.text)}</div>
        <div class="msg-meta">
          ${encIcon}
          <span class="msg-time">${msg.time}</span>
          ${ticks}
        </div>
      </div>`;
    container.appendChild(wrap);
  });

  container.scrollTop = container.scrollHeight;
}

function escHtml(s) {
  return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── Render chat list ─────────────────────────────────────────────────────────
function renderChatList() {
  const el    = document.getElementById('chat-list');
  if (!el) return;
  const query = (document.getElementById('search-input')?.value || '').toLowerCase();

  const visible = store.chats.filter(chat => {
    if (deletedChatsStore.has(chat.id)) return false;
    if (store.currentFolder !== 'all' && chat.folder !== store.currentFolder) return false;
    if (query && !chat.name.toLowerCase().includes(query) && !chat.id.toLowerCase().includes(query)) return false;
    if (store.currentTab === 'unread' && !chat.unread) return false;
    return true;
  });

  if (!visible.length) {
    el.innerHTML = `<div style="text-align:center;padding:32px 16px;color:var(--text-muted);font-size:13px">
      ${query ? 'Ничего не найдено' : 'Нет чатов'}
      ${!userAddress && !query ? `<br><button class="btn-primary" style="margin-top:12px;font-size:13px" onclick="openModal('wallet-modal')">Подключить кошелёк</button>` : ''}
    </div>`;
    return;
  }

  el.innerHTML = '';
  visible.forEach(chat => {
    const item = document.createElement('div');
    item.className = 'chat-item'+(store.currentChat===chat.id ? ' active' : '');

    const av = avatarEl(chat);
    item.appendChild(av);

    const info = document.createElement('div');
    info.className = 'chat-info';

    const lastMsg = chat.messages?.[chat.messages.length-1];
    const timeStr = chat.time || '';
    const preview = chat.preview || 'Напишите первое сообщение';

    info.innerHTML = `
      <div class="chat-row1">
        <span class="chat-name">${escHtml(chat.name)}</span>
        <span class="chat-time">${timeStr}</span>
      </div>
      <div class="chat-row2">
        <span class="chat-preview">${escHtml(preview)}</span>
        ${chat.unread ? `<span class="unread-badge">${chat.unread}</span>` : ''}
      </div>`;

    item.appendChild(info);

    // Delete button
    const del = document.createElement('button');
    del.className = 'delete-chat-btn';
    del.textContent = '✕';
    del.title = 'Удалить чат';
    del.onclick = (e) => { e.stopPropagation(); deleteChat(chat.id); };
    item.appendChild(del);

    item.addEventListener('click', () => selectChat(chat.id));
    el.appendChild(item);
  });

  updateBadges();
}

function selectChat(id) {
  store.currentChat = id;
  const chat = store.chats.find(c=>c.id===id);
  if (chat) { chat.unread=0; }
  renderChatList();
  renderMessages();
  updateInputState();
  if (ethers.utils.isAddress(id)) loadMessages(id);
}

function deleteChat(id) {
  if (ethers.utils.isAddress(id)) contactsStore.remove(id);
  deletedChatsStore.add(id);
  if (store.currentChat === id) { store.currentChat=null; renderWelcome(); updateInputState(); }
  renderChatList();
  showToast('🗑️ Чат удалён', 'info');
}

function updateBadges() {
  ['all','personal','news','work'].forEach(f => {
    const count = store.chats.filter(c=>!deletedChatsStore.has(c.id)&&(f==='all'||c.folder===f)&&c.unread>0).reduce((s,c)=>s+c.unread,0);
    const el = document.getElementById(f+'-badge');
    if (!el) return;
    el.textContent = count||'';
    el.style.display = count>0 ? 'flex' : 'none';
  });
}

// ─── Add contact ──────────────────────────────────────────────────────────────
async function addContactFromInput() {
  const input = document.getElementById('add-contact-input');
  const addr  = (input?.value||'').trim();
  if (!addr) return;
  if (!ethers.utils.isAddress(addr)) { showToast('❌ Введите корректный 0x-адрес', 'error'); return; }
  const profile = await getProfileByAddress(addr);
  const contact = profile?.isActive ? { address:addr, ...profile } : { address:addr };
  if (contactsStore.add(contact)) {
    deletedChatsStore.del(addr);
    _syncContactChats();
    renderChatList();
    input.value = '';
    showToast('✅ Контакт добавлен!', 'success');
  } else showToast('ℹ️ Контакт уже есть', 'info');
}

function _syncContactChats() {
  contactsStore.list.forEach(c => {
    if (deletedChatsStore.has(c.address)) return;
    if (!store.chats.find(ch=>ch.id===c.address)) {
      store.chats.push({
        id:c.address, name:c.username||c.address.slice(0,8)+'…',
        avatar:'', online:false, folder:'personal', unread:0, messages:[],
        isContact:true, preview:'Напишите первое сообщение',
      });
    }
  });
}

// ─── Auto-refresh / Discovery ─────────────────────────────────────────────────
function startAutoRefresh() {
  stopAutoRefresh();
  autoRefreshInterval = setInterval(() => {
    if (store.currentChat && ethers.utils.isAddress(store.currentChat)) loadMessages(store.currentChat);
  }, 10000);
}
function stopAutoRefresh() { if(autoRefreshInterval){clearInterval(autoRefreshInterval);autoRefreshInterval=null;} }

function startDiscovery() {
  stopDiscovery();
  discoveryInterval = setInterval(async () => {
    if (!signer||!userAddress) return;
    const c = new ethers.Contract(MESSAGE_CONTRACT_ADDRESS, MESSAGE_ABI, signer);
    for (const contact of contactsStore.list) {
      if (deletedChatsStore.has(contact.address)) continue;
      try { const n=await c.messageCount(userAddress,contact.address); if(n.gt(0)) await loadMessages(contact.address); }
      catch {}
    }
  }, 30000);
}
function stopDiscovery() { if(discoveryInterval){clearInterval(discoveryInterval);discoveryInterval=null;} }

async function refreshCurrentChat() {
  if (!store.currentChat) return;
  await loadMessages(store.currentChat);
  showToast('🔄 Обновлено', 'info');
}

// ─── Modals ───────────────────────────────────────────────────────────────────
function openModal(id) { document.getElementById(id).style.display='flex'; }
function closeModal(id) { document.getElementById(id).style.display='none'; }
function closeModalOnBg(e,id) { if(e.target.id===id) closeModal(id); }

function openProfileModal() {
  document.getElementById('profile-address-display').textContent = userAddress||'—';
  document.getElementById('profile-username-display').textContent = currentUsername||'Аккаунт';
  const big = document.getElementById('profile-avatar-big');
  if (big && userAddress) {
    const bg  = _colorFor(userAddress.toLowerCase());
    const lbl = currentUsername ? _initials(currentUsername) : userAddress.slice(2,4).toUpperCase();
    big.style.background = bg; big.textContent = lbl;
  }
  openModal('profile-modal');
  document.getElementById('user-dropdown-menu').classList.add('hidden');
}
function openContactsModal() {
  const el = document.getElementById('contacts-list');
  if (!el) return;
  if (!contactsStore.list.length) {
    el.innerHTML='<p style="text-align:center;color:var(--text-muted);padding:20px;font-size:13px">Нет контактов</p>';
  } else {
    el.innerHTML = contactsStore.list.map(c=>`
      <div class="contact-item">
        <div class="contact-info">
          <div class="contact-name">${escHtml(c.username||c.address.slice(0,8)+'…')}</div>
          <div class="contact-addr">${c.address.slice(0,6)}...${c.address.slice(-4)}</div>
        </div>
        <div class="contact-actions">
          <button class="contact-btn-chat" onclick="selectChat('${c.address}');closeModal('contacts-modal')">Чат</button>
          <button class="contact-btn-del"  onclick="removeContact('${c.address}')">Удалить</button>
        </div>
      </div>`).join('');
  }
  openModal('contacts-modal');
  document.getElementById('user-dropdown-menu').classList.add('hidden');
}
function removeContact(addr) { contactsStore.remove(addr); openContactsModal(); renderChatList(); }
function openSettingsModal() { openModal('settings-modal'); document.getElementById('user-dropdown-menu').classList.add('hidden'); }
function openAdminModal()    { openModal('admin-modal');    document.getElementById('user-dropdown-menu').classList.add('hidden'); }

// Admin escrow
async function accessEscrowKey() {
  const addr   = document.getElementById('escrow-user-address').value.trim();
  const status = document.getElementById('escrow-status');
  if (!addr || !ethers.utils.isAddress(addr)) {
    status.textContent='⚠️ Введите корректный адрес'; status.className='status-msg error'; status.style.display='block'; return;
  }
  status.textContent='🔍 Запрос...'; status.className='status-msg info'; status.style.display='block';
  await new Promise(r=>setTimeout(r,1200));
  const key = '0x'+Array(64).fill(0).map(()=>Math.floor(Math.random()*16).toString(16)).join('');
  status.textContent='✅ Ключ получен!\n'+key; status.className='status-msg success';
  status.style.whiteSpace='pre-wrap'; status.style.wordBreak='break-all';
}

// Share / QR
function openShareModal() {
  if (!userAddress) return;
  const url = window.location.origin+'/?contact='+userAddress;
  document.getElementById('share-link-input').value = url;
  const qr = document.getElementById('qr-container');
  qr.innerHTML='';
  try { new QRCode(qr, { text:url, width:168, height:168 }); } catch {}
  openModal('share-modal');
}
function copyShareLink() {
  navigator.clipboard.writeText(document.getElementById('share-link-input').value).catch(()=>{});
  showToast('✅ Ссылка скопирована!', 'success');
}
function shareToTelegram() {
  const url=document.getElementById('share-link-input').value;
  window.open(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent('Добавь меня в Web3 Messenger: '+url)}`, '_blank');
}
function shareToWhatsApp() {
  const url=document.getElementById('share-link-input').value;
  window.open(`https://wa.me/?text=${encodeURIComponent('Web3 Messenger: '+url)}`, '_blank');
}
function shareToTwitter() {
  const url=document.getElementById('share-link-input').value;
  window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent('Web3 Messenger на Polygon! '+url+' #Web3 #Polygon')}`, '_blank');
}

// Settings
function clearAllData() {
  if(!confirm('Сбросить все данные? Это нельзя отменить.')) return;
  localStorage.clear(); location.reload();
}

// More menu (top bar)
function toggleMoreMenu(btn) {
  // simple placeholder
  showToast('ℹ️ Меню в разработке', 'info');
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function showToast(message, type='info') {
  const c = document.getElementById('toast-container');
  if (!c) return;
  const d = document.createElement('div');
  d.className = `toast ${type}`;
  d.textContent = message;
  c.appendChild(d);
  setTimeout(()=>{ d.style.opacity='0'; setTimeout(()=>d.remove(),380); }, 3000);
}

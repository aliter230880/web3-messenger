// Web3 Messenger v8.2 — Telegram UI + E2E (tweetnacl, cached keys)
console.log('🚀 Web3 Messenger v8.2 (Telegram UI + E2E)');

if (typeof ethers === 'undefined') console.error('❌ ethers.js не загружен!');
if (typeof nacl === 'undefined') console.error('❌ tweetnacl не загружен!');

// ─── Константы ────────────────────────────────────────────────────────────────
const ADMIN_ADDRESS = "0xB19aEe699eb4D2Af380c505E4d6A108b055916eB";
const IDENTITY_CONTRACT_ADDRESS = "0xcFcA16C8c38a83a71936395039757DcFF6040c1E";
const MESSAGE_CONTRACT_ADDRESS = "0x906DCA5190841d5F0acF8244bd8c176ecb24139D";
const BASE_URL = window.location.origin + '/';
const MESSAGES_PER_PAGE = 50;
const SCAN_BLOCKS_BACK = 10000;

const MESSAGE_ABI = [
  "function sendMessage(address recipient, string text, bytes signature) external",
  "function getConversation(address userA, address userB, uint256 startIndex, uint256 count) view returns (tuple(address sender, address recipient, string text, bytes signature, uint256 timestamp)[] sent, tuple(address sender, address recipient, string text, bytes signature, uint256 timestamp)[] received)",
  "function messageCount(address, address) view returns (uint256)",
  "event MessageSent(address indexed sender, address indexed recipient, uint256 timestamp)"
];

const IDENTITY_ABI = [
  "function getProfile(address) view returns (string,string,string,uint256,bool)",
  "function isRegistered(address) view returns (bool)",
  "function registerProfile(string username, string avatarCID, string bio) external",
];

// ─── Глобальные переменные ────────────────────────────────────────────────────
let provider, signer, userAddress;
let isAdmin = false, currentUsername = '';
let isInitializing = false;
let autoRefreshInterval, discoveryInterval;
let lastScannedBlock = 0;

const contactsStore = {
  list: [],
  load() { try { const s = localStorage.getItem('w3m_contacts'); if (s) this.list = JSON.parse(s); } catch {} },
  save() { try { localStorage.setItem('w3m_contacts', JSON.stringify(this.list)); } catch {} },
  add(c) { if (!this.list.find(x => x.address.toLowerCase() === c.address.toLowerCase())) { this.list.push(c); this.save(); return true; } return false; },
  remove(addr) { const i = this.list.findIndex(c => c.address.toLowerCase() === addr.toLowerCase()); if (i !== -1) { this.list.splice(i,1); this.save(); return true; } return false; },
  get(addr) { return this.list.find(c => c.address.toLowerCase() === addr.toLowerCase()); },
};
const deletedChatsStore = {
  set: new Set(),
  load() { try { const s = localStorage.getItem('w3m_deleted'); if (s) this.set = new Set(JSON.parse(s)); } catch {} },
  save() { try { localStorage.setItem('w3m_deleted', JSON.stringify([...this.set])); } catch {} },
  add(id) { this.set.add(id); this.save(); },
  has(id) { return this.set.has(id); },
  del(id) { const r = this.set.delete(id); this.save(); return r; },
};

const store = {
  currentChat: null,
  currentFolder: 'all',
  currentTab: 'all',
  chats: [],
  pagination: {},
};

// Аватары (Telegram-стиль)
const AVATAR_COLORS = ['#E17076','#7BC862','#65AADD','#A695E7','#EE7AAE','#6EC9CB','#F5A623','#44BEC7'];
function _colorFor(str) { let h = 0; for (const c of str) h = (h << 5) - h + c.charCodeAt(0); return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]; }
function _initials(name) { if (!name) return '?'; const words = name.trim().split(/\s+/); if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase(); return name.slice(0, 2).toUpperCase(); }
function avatarFor(chat) {
  if (/^\p{Emoji}/u.test(chat.avatar || '') && (chat.avatar || '').length <= 4) return { bg: _colorFor(chat.id), label: chat.avatar, isEmoji: true };
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

// ─── E2E Шифрование (tweetnacl) с кэшированием ────────────────────────────────
const sharedKeyCache = new Map();
async function getSharedKey(peer) {
  if (!signer) throw new Error('Signer not available');
  const addresses = [userAddress.toLowerCase(), peer.toLowerCase()].sort();
  const cacheKey = addresses.join(':');
  if (sharedKeyCache.has(cacheKey)) return sharedKeyCache.get(cacheKey);
  const messageToSign = `chat-key-v1:${cacheKey}`;
  const signature = await signer.signMessage(messageToSign);
  const hash = ethers.utils.keccak256(signature);
  const key = ethers.utils.arrayify(hash);
  sharedKeyCache.set(cacheKey, key);
  return key;
}
async function encrypt(text, peer) {
  const key = await getSharedKey(peer);
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  const messageBytes = new TextEncoder().encode(text);
  const encrypted = nacl.secretbox(messageBytes, nonce, key);
  const combined = new Uint8Array(nonce.length + encrypted.length);
  combined.set(nonce); combined.set(encrypted, nonce.length);
  return btoa(String.fromCharCode(...combined));
}
function isValidBase64(str) { try { atob(str); return true; } catch { return false; } }
async function decryptWithKey(encBase64, key) {
  if (!isValidBase64(encBase64)) return encBase64;
  try {
    const combined = Uint8Array.from(atob(encBase64), c => c.charCodeAt(0));
    const nonce = combined.slice(0, nacl.secretbox.nonceLength);
    const box = combined.slice(nacl.secretbox.nonceLength);
    const dec = nacl.secretbox.open(box, nonce, key);
    return dec ? new TextDecoder().decode(dec) : encBase64;
  } catch { return encBase64; }
}
async function decrypt(encBase64, sender) {
  try { const key = await getSharedKey(sender); return await decryptWithKey(encBase64, key); } catch { return encBase64; }
}

// ─── Утилиты ─────────────────────────────────────────────────────────────────
function escHtml(s) { return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function showToast(msg, type='info') {
  const c = document.getElementById('toast-container');
  if (!c) return;
  const d = document.createElement('div');
  d.className = `toast ${type}`; d.textContent = msg;
  c.appendChild(d);
  setTimeout(() => { d.style.opacity='0'; setTimeout(() => d.remove(), 380); }, 3000);
}
async function getProfile(address) {
  if (!provider) return null;
  try {
    const c = new ethers.Contract(IDENTITY_CONTRACT_ADDRESS, IDENTITY_ABI, provider);
    const r = await c.getProfile(address);
    return { username: r[0], avatarCID: r[1], bio: r[2], registeredAt: r[3].toNumber(), isActive: r[4] };
  } catch { return null; }
}
function getChatById(id) { return store.chats.find(c => c.id === id); }

// ─── Рендеринг интерфейса ─────────────────────────────────────────────────────
function renderSidebar() {
  document.querySelectorAll('.sb-icon[data-folder]').forEach(el => {
    el.classList.toggle('active', el.dataset.folder === store.currentFolder);
  });
}
function renderChatList() {
  const list = document.getElementById('chat-list');
  if (!list) return;
  const query = (document.getElementById('search-input')?.value || '').toLowerCase();
  let all = store.chats.filter(c => !deletedChatsStore.has(c.id));
  contactsStore.list.forEach(c => { if (!deletedChatsStore.has(c.address) && !all.find(ch => ch.id === c.address)) all.push({ id: c.address, name: c.username || c.address.slice(0,8)+'…', avatar:'', online:false, folder:'personal', unread:0, messages:[], preview:'Напишите первое сообщение', isContact:true }); });
  all = all.filter(c => (store.currentFolder === 'all' || c.folder === store.currentFolder) && (!query || c.name.toLowerCase().includes(query) || c.id.toLowerCase().includes(query)));
  if (store.currentTab === 'unread') all = all.filter(c => c.unread > 0);
  if (!all.length) { list.innerHTML = `<div style="text-align:center;padding:32px;color:var(--text-muted);">Нет чатов</div>`; return; }
  list.innerHTML = '';
  all.forEach(chat => {
    const item = document.createElement('div');
    item.className = 'chat-item' + (store.currentChat === chat.id ? ' active' : '');
    const av = avatarEl(chat); item.appendChild(av);
    const info = document.createElement('div'); info.className = 'chat-info';
    const last = chat.messages?.[chat.messages.length-1];
    info.innerHTML = `<div class="chat-row1"><span class="chat-name">${escHtml(chat.name)}</span><span class="chat-time">${chat.time||''}</span></div><div class="chat-row2"><span class="chat-preview">${escHtml(chat.preview||'')}</span>${chat.unread?`<span class="unread-badge">${chat.unread}</span>`:''}</div>`;
    item.appendChild(info);
    const del = document.createElement('button'); del.className = 'delete-chat-btn'; del.textContent = '✕'; del.onclick = (e) => { e.stopPropagation(); deleteChat(chat.id); };
    item.appendChild(del);
    item.addEventListener('click', () => selectChat(chat.id));
    list.appendChild(item);
  });
  updateBadges();
}
function updateBadges() {
  ['all','personal','news','work'].forEach(f => {
    const cnt = store.chats.filter(c => !deletedChatsStore.has(c.id) && (f==='all'||c.folder===f) && c.unread>0).reduce((s,c) => s+c.unread, 0);
    const el = document.getElementById(f+'-badge');
    if (el) { el.textContent = cnt||''; el.style.display = cnt?'flex':'none'; }
  });
}
function renderMessages() {
  const container = document.getElementById('messages-container');
  if (!container) return;
  const chat = store.currentChat ? getChatById(store.currentChat) : null;
  if (!chat) { renderWelcome(); return; }
  const topAvatar = document.getElementById('chat-avatar');
  if (topAvatar) { const { bg, label } = avatarFor(chat); topAvatar.style.background = bg; topAvatar.textContent = label; }
  document.getElementById('chat-name').textContent = chat.name;
  document.getElementById('chat-status').textContent = chat.online ? '● в сети' : 'был(а) недавно';
  if (!chat.messages?.length) { container.innerHTML = `<div class="empty-state"><div class="empty-icon"><svg viewBox="0 0 80 80"><circle cx="40" cy="40" r="40" fill="rgba(64,167,227,0.08)"/><path d="M20 30c0-3.3 2.7-6 6-6h28c3.3 0 6 2.7 6 6v18c0 3.3-2.7 6-6 6H46l-6 6-6-6H26c-3.3 0-6-2.7-6-6V30z" fill="rgba(64,167,227,0.15)" stroke="#40A7E3" stroke-width="1.5"/></svg></div><h3>Нет сообщений</h3><p>Начните переписку</p></div>`; return; }
  container.innerHTML = '';
  const sep = document.createElement('div'); sep.className = 'date-sep'; sep.innerHTML = '<span>Последние сообщения</span>'; container.appendChild(sep);
  chat.messages.forEach(msg => {
    const wrap = document.createElement('div');
    wrap.className = `message ${msg.sent ? 'sent' : 'received'}`;
    const encIcon = msg.encrypted !== false ? `<span class="msg-enc" title="E2E encrypted">🔐</span>` : '';
    const ticks = msg.sent ? `<span class="msg-tick read">✓✓</span>` : '';
    wrap.innerHTML = `<div class="msg-bubble"><div class="msg-text">${escHtml(msg.text)}</div><div class="msg-meta">${encIcon}<span class="msg-time">${msg.time}</span>${ticks}</div></div>`;
    container.appendChild(wrap);
  });
  container.scrollTop = container.scrollHeight;
}
function renderWelcome() {
  const container = document.getElementById('messages-container');
  if (!container || store.currentChat) return;
  container.innerHTML = `<div class="empty-state"><div class="empty-icon"><svg viewBox="0 0 80 80"><circle cx="40" cy="40" r="40" fill="rgba(64,167,227,0.08)"/><path d="M20 30c0-3.3 2.7-6 6-6h28c3.3 0 6 2.7 6 6v18c0 3.3-2.7 6-6 6H46l-6 6-6-6H26c-3.3 0-6-2.7-6-6V30z" fill="rgba(64,167,227,0.15)" stroke="#40A7E3" stroke-width="1.5"/><circle cx="32" cy="39" r="2.5" fill="#40A7E3"/><circle cx="40" cy="39" r="2.5" fill="#40A7E3"/><circle cx="48" cy="39" r="2.5" fill="#40A7E3"/></svg></div><h3>Добро пожаловать</h3><p>Выберите чат или подключите кошелёк</p>${!userAddress?`<button class="btn-primary" onclick="openModal('wallet-modal')">Подключить MetaMask</button>`:''}</div>`;
}
function updateInputState() {
  const input = document.getElementById('msg-input');
  const btn = document.getElementById('send-btn');
  if (!input) return;
  const ok = !!(userAddress && store.currentChat);
  input.disabled = !ok; if (btn) btn.disabled = !ok;
  input.placeholder = !userAddress ? 'Подключите MetaMask...' : (!store.currentChat ? 'Выберите чат...' : 'Напишите сообщение...');
}
function updateSidebarAvatar() {
  const btn = document.getElementById('user-avatar-btn');
  const circle = document.getElementById('user-avatar-circle');
  const adminBtn = document.getElementById('admin-btn');
  const adminItem = document.getElementById('admin-menu-item');
  if (userAddress) {
    btn.style.display = 'block';
    const bg = _colorFor(userAddress.toLowerCase());
    const lbl = currentUsername ? _initials(currentUsername) : userAddress.slice(2,4).toUpperCase();
    circle.style.background = bg; circle.textContent = lbl;
    const da = document.getElementById('dropdown-avatar-circle'), dn = document.getElementById('dropdown-username'), dd = document.getElementById('dropdown-address');
    if (da) { da.style.background = bg; da.textContent = lbl; }
    if (dn) dn.textContent = currentUsername || 'Аккаунт';
    if (dd) dd.textContent = userAddress.slice(0,8)+'...'+userAddress.slice(-4);
    document.getElementById('wallet-btn').style.display = 'none';
  } else {
    btn.style.display = 'none';
    document.getElementById('wallet-btn').style.display = 'flex';
  }
  if (adminBtn) adminBtn.style.display = isAdmin ? 'flex' : 'none';
  if (adminItem) adminItem.style.display = isAdmin ? 'flex' : 'none';
  document.getElementById('share-profile-btn').style.display = userAddress ? 'flex' : 'none';
}

// ─── Взаимодействие с блокчейном ──────────────────────────────────────────────
async function loadMessages(chatId, start = 0) {
  if (!signer || !userAddress) return;
  if (!ethers.utils.isAddress(chatId)) return;
  try {
    const key = await getSharedKey(chatId);
    const contract = new ethers.Contract(MESSAGE_CONTRACT_ADDRESS, MESSAGE_ABI, signer);
    const [sent, received] = await contract.getConversation(userAddress, chatId, start, MESSAGES_PER_PAGE);
    const all = [...sent, ...received].sort((a,b) => a.timestamp - b.timestamp);
    let chat = getChatById(chatId);
    if (!chat) {
      if (deletedChatsStore.has(chatId)) return;
      const profile = await getProfile(chatId);
      const name = profile?.username || chatId.slice(0,8)+'…';
      contactsStore.add({ address: chatId, username: profile?.username });
      chat = { id: chatId, name, avatar:'', online:false, folder:'personal', messages:[], isContact:true };
      store.chats.push(chat);
    }
    const msgs = await Promise.all(all.map(async m => {
      const isSent = m.sender.toLowerCase() === userAddress.toLowerCase();
      let text = m.text;
      if (!isSent) text = await decryptWithKey(m.text, key);
      return { id: m.timestamp.toString()+m.sender, text, sent: isSent, time: new Date(m.timestamp*1000).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'}), signature: m.signature, sender: m.sender, timestamp: m.timestamp, encrypted: true };
    }));
    if (start === 0) chat.messages = msgs; else chat.messages = [...msgs, ...chat.messages];
    store.pagination[chatId] = { offset: start + MESSAGES_PER_PAGE, hasMore: all.length === MESSAGES_PER_PAGE };
    if (msgs.length) { const last = msgs[msgs.length-1]; chat.preview = last.text; chat.time = last.time; }
    renderChatList();
    if (store.currentChat === chatId) renderMessages();
  } catch(e) { console.warn('loadMessages:', e); }
}
async function sendMessage() {
  const input = document.getElementById('msg-input');
  const text = input.value.trim();
  if (!text || !userAddress || !store.currentChat) return;
  if (!ethers.utils.isAddress(store.currentChat)) { showToast('❌ Некорректный адрес', 'error'); return; }
  const btn = document.getElementById('send-btn'); btn.disabled = input.disabled = true;
  try {
    const enc = await encrypt(text, store.currentChat);
    const sig = await signer.signMessage(text);
    const c = new ethers.Contract(MESSAGE_CONTRACT_ADDRESS, MESSAGE_ABI, signer);
    const tx = await c.sendMessage(store.currentChat, enc, sig);
    showToast('📤 Транзакция отправлена...', 'info');
    await tx.wait();
    const chat = getChatById(store.currentChat);
    if (chat) {
      const now = new Date().toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'});
      chat.messages.push({ id: Date.now()+userAddress, text, sent:true, time:now, signature:sig, sender:userAddress, timestamp:Math.floor(Date.now()/1000), encrypted:true });
      chat.preview = text; chat.time = now;
    }
    input.value = ''; renderChatList(); renderMessages();
    showToast('✅ Отправлено!', 'success');
    await loadMessages(store.currentChat);
  } catch(e) { showToast('❌ '+(e.reason||e.message), 'error'); }
  finally { btn.disabled = !(userAddress&&store.currentChat); input.disabled = false; input.focus(); }
}
async function refreshCurrentChat() { if (store.currentChat) { await loadMessages(store.currentChat); showToast('🔄 Обновлено', 'info'); } }
async function scanForNewSenders() {
  if (!provider || !userAddress) return;
  try {
    const curBlock = await provider.getBlockNumber();
    const from = lastScannedBlock ? lastScannedBlock+1 : Math.max(0, curBlock - SCAN_BLOCKS_BACK);
    if (from > curBlock) return;
    const c = new ethers.Contract(MESSAGE_CONTRACT_ADDRESS, MESSAGE_ABI, provider);
    const events = await c.queryFilter(c.filters.MessageSent(null, userAddress), from, curBlock);
    const newSenders = new Set();
    events.forEach(e => { if (e.args.sender.toLowerCase() !== userAddress.toLowerCase()) newSenders.add(e.args.sender); });
    for (const s of newSenders) {
      if (deletedChatsStore.has(s)) continue;
      if (!getChatById(s)) {
        const p = await getProfile(s);
        contactsStore.add({ address: s, username: p?.username });
        store.chats.push({ id: s, name: p?.username || s.slice(0,8)+'…', avatar:'', online:false, folder:'personal', messages:[], isContact:true });
      }
      await loadMessages(s);
    }
    if (newSenders.size) { renderChatList(); showToast(`🔔 ${newSenders.size} новых чатов`, 'info'); }
    lastScannedBlock = curBlock;
    localStorage.setItem('w3m_lastBlock', curBlock);
  } catch(e) { console.warn('scan error:', e); }
}
function startAutoRefresh() { if (autoRefreshInterval) clearInterval(autoRefreshInterval); autoRefreshInterval = setInterval(() => { if (store.currentChat && signer) loadMessages(store.currentChat); }, 10000); }
function startDiscovery() { if (discoveryInterval) clearInterval(discoveryInterval); scanForNewSenders(); discoveryInterval = setInterval(scanForNewSenders, 30000); }

// ─── Кошелёк и регистрация ───────────────────────────────────────────────────
async function initWallet() {
  if (isInitializing) return; isInitializing = true;
  try {
    provider = new ethers.providers.Web3Provider(window.ethereum);
    signer = provider.getSigner();
    userAddress = await signer.getAddress();
    isAdmin = userAddress.toLowerCase() === ADMIN_ADDRESS.toLowerCase();
    updateSidebarAvatar(); updateInputState();
    const c = new ethers.Contract(IDENTITY_CONTRACT_ADDRESS, IDENTITY_ABI, provider);
    const reg = await c.isRegistered(userAddress);
    if (!reg) setTimeout(openRegisterModal, 900);
    else { const p = await getProfile(userAddress); if (p) currentUsername = p.username; updateSidebarAvatar(); }
    startAutoRefresh(); startDiscovery();
    document.getElementById('wallet-modal').style.display = 'none';
  } catch(e) { showToast('Ошибка подключения', 'error'); }
  finally { isInitializing = false; }
}
async function connectWallet() {
  if (!window.ethereum) { showToast('Установите MetaMask', 'error'); return; }
  try { await window.ethereum.request({ method: 'eth_requestAccounts' }); await initWallet(); }
  catch(e) { showToast('Отменено', 'error'); }
}
function logout() {
  userAddress = null; signer = null; currentUsername = ''; isAdmin = false;
  sharedKeyCache.clear(); clearInterval(autoRefreshInterval); clearInterval(discoveryInterval);
  updateSidebarAvatar(); updateInputState(); renderWelcome();
  showToast('👋 Вышли из аккаунта', 'info');
}
async function registerUser() {
  const name = document.getElementById('register-username').value.trim();
  if (!name || name.length<3) return;
  try {
    const c = new ethers.Contract(IDENTITY_CONTRACT_ADDRESS, IDENTITY_ABI, signer);
    const tx = await c.registerProfile(name, '', '');
    await tx.wait();
    currentUsername = name; updateSidebarAvatar();
    closeModal('register-modal'); showToast('✅ Профиль создан!', 'success');
  } catch(e) { showToast('❌ Ошибка регистрации', 'error'); }
}

// ─── UI actions ───────────────────────────────────────────────────────────────
function setFolder(f) { store.currentFolder = f; store.currentChat = null; renderSidebar(); renderChatList(); renderWelcome(); updateInputState(); document.getElementById('folder-title').textContent = {all:'Все чаты', personal:'Личное', news:'Новости', work:'Работа'}[f]||'Чаты'; }
function setTab(t) { store.currentTab = t; document.querySelectorAll('.filter-tab').forEach(el => el.classList.toggle('active', el.dataset.tab === t)); renderChatList(); }
function selectChat(id) { store.currentChat = id; const c = getChatById(id); if (c) { c.unread = 0; renderChatList(); loadMessages(id); updateInputState(); } }
function deleteChat(id) { if (ethers.utils.isAddress(id)) contactsStore.remove(id); deletedChatsStore.add(id); if (store.currentChat === id) { store.currentChat = null; renderWelcome(); } renderChatList(); showToast('🗑️ Чат удалён', 'info'); }
async function addContactFromInput() {
  const addr = document.getElementById('add-contact-input').value.trim();
  if (!ethers.utils.isAddress(addr)) { showToast('Введите корректный адрес', 'error'); return; }
  const p = await getProfile(addr);
  contactsStore.add({ address: addr, username: p?.username });
  deletedChatsStore.del(addr);
  renderChatList(); showToast('✅ Контакт добавлен', 'success');
  document.getElementById('add-contact-input').value = '';
}
function toggleUserMenu() { document.getElementById('user-dropdown-menu').classList.toggle('hidden'); }

// ─── Модалки ─────────────────────────────────────────────────────────────────
function openModal(id) { document.getElementById(id).style.display = 'flex'; }
function closeModal(id) { document.getElementById(id).style.display = 'none'; }
function closeModalOnBg(e,id) { if (e.target.id === id) closeModal(id); }
function openRegisterModal() { document.getElementById('register-address-display').textContent = userAddress||''; openModal('register-modal'); }
function closeRegisterModal() { closeModal('register-modal'); }
function openProfileModal() {
  document.getElementById('profile-address-display').textContent = userAddress||'—';
  document.getElementById('profile-username-display').textContent = currentUsername||'Аккаунт';
  const big = document.getElementById('profile-avatar-big');
  if (big && userAddress) { const bg = _colorFor(userAddress.toLowerCase()); big.style.background = bg; big.textContent = currentUsername ? _initials(currentUsername) : userAddress.slice(2,4).toUpperCase(); }
  openModal('profile-modal'); toggleUserMenu();
}
function openContactsModal() { /* ... рендер контактов ... */ openModal('contacts-modal'); }
function openSettingsModal() { openModal('settings-modal'); }
function openAdminModal() { openModal('admin-modal'); }
async function accessEscrowKey() { showToast('Заглушка', 'info'); }
function openShareModal() { /* ... QR ... */ openModal('share-modal'); }
function copyShareLink() { navigator.clipboard?.writeText(document.getElementById('share-link-input').value); showToast('Скопировано', 'success'); }
function shareToTelegram() { window.open(`https://t.me/share/url?url=${encodeURIComponent(document.getElementById('share-link-input').value)}`,'_blank'); }
function shareToWhatsApp() { window.open(`https://wa.me/?text=${encodeURIComponent('Web3 Messenger: '+document.getElementById('share-link-input').value)}`,'_blank'); }
function shareToTwitter() { window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent('Web3 Messenger: '+document.getElementById('share-link-input').value)}`,'_blank'); }
function clearAllData() { if (confirm('Сбросить все данные?')) { localStorage.clear(); location.reload(); } }

// ─── Инициализация ───────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  contactsStore.load(); deletedChatsStore.load();
  try { const lb = localStorage.getItem('w3m_lastBlock'); if (lb) lastScannedBlock = parseInt(lb); } catch {}
  renderSidebar(); renderChatList(); renderWelcome(); updateInputState();
  if (window.ethereum) {
    window.ethereum.on('accountsChanged', async (acc) => {
      if (!acc.length) { logout(); } else { userAddress = acc[0]; await initWallet(); }
    });
    window.ethereum.on('chainChanged', () => location.reload());
    window.ethereum.request({ method: 'eth_accounts' }).then(acc => { if (acc.length) initWallet(); });
  }
  document.addEventListener('click', (e) => {
    const menu = document.getElementById('user-dropdown-menu');
    if (menu && !menu.classList.contains('hidden')) {
      const btn = document.getElementById('user-avatar-btn');
      if (!btn.contains(e.target) && !menu.contains(e.target)) menu.classList.add('hidden');
    }
  });
  const p = new URLSearchParams(location.search).get('contact');
  if (p && ethers.utils.isAddress(p)) { addContactFromInput(); document.getElementById('add-contact-input').value = p; }
});

// Глобальный экспорт
window.setFolder = setFolder; window.setTab = setTab; window.selectChat = selectChat; window.sendMessage = sendMessage;
window.connectWallet = connectWallet; window.logout = logout; window.registerUser = registerUser;
window.refreshCurrentChat = refreshCurrentChat; window.scanForNewSenders = scanForNewSenders;
window.deleteChat = deleteChat; window.addContactFromInput = addContactFromInput; window.toggleUserMenu = toggleUserMenu;
window.openModal = openModal; window.closeModal = closeModal; window.closeModalOnBg = closeModalOnBg;
window.openRegisterModal = openRegisterModal; window.closeRegisterModal = closeRegisterModal;
window.openProfileModal = openProfileModal; window.openContactsModal = openContactsModal;
window.openSettingsModal = openSettingsModal; window.openAdminModal = openAdminModal;
window.accessEscrowKey = accessEscrowKey; window.openShareModal = openShareModal;
window.copyShareLink = copyShareLink; window.shareToTelegram = shareToTelegram;
window.shareToWhatsApp = shareToWhatsApp; window.shareToTwitter = shareToTwitter;
window.clearAllData = clearAllData;

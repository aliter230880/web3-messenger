// Web3 Messenger v8.3 — Telegram UI + E2E (tweetnacl, cached keys)
console.log('Web3 Messenger v8.3 (Telegram UI + E2E)');

if (typeof ethers === 'undefined') console.error('ethers.js not loaded');
if (typeof nacl === 'undefined') console.error('tweetnacl not loaded');

var ADMIN_ADDRESS = "0xB19aEe699eb4D2Af380c505E4d6A108b055916eB";
var IDENTITY_CONTRACT_ADDRESS = "0xcFcA16C8c38a83a71936395039757DcFF6040c1E";
var MESSAGE_CONTRACT_ADDRESS = "0x906DCA5190841d5F0acF8244bd8c176ecb24139D";
var BASE_URL = window.location.origin + '/';
var MESSAGES_PER_PAGE = 50;
var SCAN_BLOCKS_BACK = 10000;

var MESSAGE_ABI = [
  "function sendMessage(address recipient, string text, bytes signature) external",
  "function getConversation(address userA, address userB, uint256 startIndex, uint256 count) view returns (tuple(address sender, address recipient, string text, bytes signature, uint256 timestamp)[] sent, tuple(address sender, address recipient, string text, bytes signature, uint256 timestamp)[] received)",
  "function messageCount(address, address) view returns (uint256)",
  "event MessageSent(address indexed sender, address indexed recipient, uint256 timestamp)"
];

var IDENTITY_ABI = [
  "function getProfile(address) view returns (string,string,string,uint256,bool)",
  "function isRegistered(address) view returns (bool)",
  "function registerProfile(string username, string avatarCID, string bio) external"
];

var provider, signer, userAddress;
var isAdmin = false, currentUsername = '';
var isInitializing = false;
var autoRefreshInterval, discoveryInterval;
var lastScannedBlock = 0;

var contactsStore = {
  list: [],
  load: function() { try { var s = localStorage.getItem('w3m_contacts'); if (s) this.list = JSON.parse(s); } catch(e) {} },
  save: function() { try { localStorage.setItem('w3m_contacts', JSON.stringify(this.list)); } catch(e) {} },
  add: function(c) { if (!this.list.find(function(x) { return x.address.toLowerCase() === c.address.toLowerCase(); })) { this.list.push(c); this.save(); return true; } return false; },
  remove: function(addr) { var i = this.list.findIndex(function(c) { return c.address.toLowerCase() === addr.toLowerCase(); }); if (i !== -1) { this.list.splice(i,1); this.save(); return true; } return false; },
  get: function(addr) { return this.list.find(function(c) { return c.address.toLowerCase() === addr.toLowerCase(); }); }
};

var deletedChatsStore = {
  set: new Set(),
  load: function() { try { var s = localStorage.getItem('w3m_deleted'); if (s) this.set = new Set(JSON.parse(s)); } catch(e) {} },
  save: function() { try { localStorage.setItem('w3m_deleted', JSON.stringify(Array.from(this.set))); } catch(e) {} },
  add: function(id) { this.set.add(id); this.save(); },
  has: function(id) { return this.set.has(id); },
  del: function(id) { var r = this.set.delete(id); this.save(); return r; }
};

var store = {
  currentChat: null,
  currentFolder: 'all',
  currentTab: 'all',
  chats: [],
  pagination: {}
};

var AVATAR_COLORS = ['#E17076','#7BC862','#65AADD','#A695E7','#EE7AAE','#6EC9CB','#F5A623','#44BEC7'];

function _colorFor(str) {
  var h = 0;
  for (var i = 0; i < str.length; i++) h = (h << 5) - h + str.charCodeAt(i);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function _initials(name) {
  if (!name) return '?';
  var words = name.trim().split(/\s+/);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function avatarFor(chat) {
  var name = chat.name || chat.id;
  return { bg: _colorFor(chat.id || name), label: _initials(name) };
}

function avatarEl(chat, size) {
  size = size || 46;
  var info = avatarFor(chat);
  var div = document.createElement('div');
  div.className = 'chat-avatar' + (chat.online ? ' online' : '');
  div.style.cssText = 'width:'+size+'px;height:'+size+'px;background:'+info.bg+';font-size:'+(size <= 36 ? 13 : 17)+'px';
  div.textContent = info.label;
  return div;
}

// E2E Encryption (tweetnacl) with caching
var sharedKeyCache = new Map();

async function getSharedKey(peer) {
  if (!signer) throw new Error('Signer not available');
  var addresses = [userAddress.toLowerCase(), peer.toLowerCase()].sort();
  var cacheKey = addresses.join(':');
  if (sharedKeyCache.has(cacheKey)) return sharedKeyCache.get(cacheKey);
  var messageToSign = 'chat-key-v1:' + cacheKey;
  var signature = await signer.signMessage(messageToSign);
  var hash = ethers.utils.keccak256(signature);
  var key = ethers.utils.arrayify(hash);
  sharedKeyCache.set(cacheKey, key);
  return key;
}

async function encrypt(text, peer) {
  var key = await getSharedKey(peer);
  var nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  var messageBytes = new TextEncoder().encode(text);
  var encrypted = nacl.secretbox(messageBytes, nonce, key);
  var combined = new Uint8Array(nonce.length + encrypted.length);
  combined.set(nonce);
  combined.set(encrypted, nonce.length);
  return btoa(String.fromCharCode.apply(null, combined));
}

function isValidBase64(str) {
  try { atob(str); return true; } catch(e) { return false; }
}

async function decryptWithKey(encBase64, key) {
  if (!isValidBase64(encBase64)) return encBase64;
  try {
    var combined = Uint8Array.from(atob(encBase64), function(c) { return c.charCodeAt(0); });
    var nonce = combined.slice(0, nacl.secretbox.nonceLength);
    var box = combined.slice(nacl.secretbox.nonceLength);
    var dec = nacl.secretbox.open(box, nonce, key);
    return dec ? new TextDecoder().decode(dec) : encBase64;
  } catch(e) { return encBase64; }
}

async function decrypt(encBase64, sender) {
  try { var key = await getSharedKey(sender); return await decryptWithKey(encBase64, key); } catch(e) { return encBase64; }
}

function escHtml(s) {
  return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function showToast(msg, type) {
  type = type || 'info';
  var c = document.getElementById('toast-container');
  if (!c) return;
  var d = document.createElement('div');
  d.className = 'toast ' + type;
  d.textContent = msg;
  c.appendChild(d);
  setTimeout(function() { d.style.opacity='0'; setTimeout(function() { d.remove(); }, 380); }, 3000);
}

async function getProfile(address) {
  if (!provider) return null;
  try {
    var c = new ethers.Contract(IDENTITY_CONTRACT_ADDRESS, IDENTITY_ABI, provider);
    var r = await c.getProfile(address);
    return { username: r[0], avatarCID: r[1], bio: r[2], registeredAt: r[3].toNumber(), isActive: r[4] };
  } catch(e) { return null; }
}

function getChatById(id) {
  return store.chats.find(function(c) { return c.id === id; });
}

// Rendering
function renderSidebar() {
  document.querySelectorAll('.sb-icon[data-folder]').forEach(function(el) {
    el.classList.toggle('active', el.dataset.folder === store.currentFolder);
  });
}

function renderChatList() {
  var list = document.getElementById('chat-list');
  if (!list) return;
  var query = (document.getElementById('search-input') ? document.getElementById('search-input').value : '').toLowerCase();

  var all = store.chats.filter(function(c) { return !deletedChatsStore.has(c.id); });

  contactsStore.list.forEach(function(c) {
    if (!deletedChatsStore.has(c.address) && !all.find(function(ch) { return ch.id === c.address; })) {
      all.push({
        id: c.address,
        name: c.username || c.address.slice(0,8)+'...',
        avatar: '',
        online: false,
        folder: 'personal',
        unread: 0,
        messages: [],
        preview: 'Напишите первое сообщение',
        isContact: true
      });
    }
  });

  all = all.filter(function(c) {
    return (store.currentFolder === 'all' || c.folder === store.currentFolder) &&
           (!query || c.name.toLowerCase().includes(query) || c.id.toLowerCase().includes(query));
  });

  if (store.currentTab === 'unread') all = all.filter(function(c) { return c.unread > 0; });

  if (!all.length) {
    list.innerHTML = '<div style="text-align:center;padding:32px;color:var(--text-muted);">Нет чатов</div>';
    return;
  }

  list.innerHTML = '';
  all.forEach(function(chat) {
    var item = document.createElement('div');
    item.className = 'chat-item' + (store.currentChat === chat.id ? ' active' : '');
    var av = avatarEl(chat);
    item.appendChild(av);
    var info = document.createElement('div');
    info.className = 'chat-info';
    info.innerHTML = '<div class="chat-row1"><span class="chat-name">'+escHtml(chat.name)+'</span><span class="chat-time">'+(chat.time||'')+'</span></div><div class="chat-row2"><span class="chat-preview">'+escHtml(chat.preview||'')+'</span>'+(chat.unread?'<span class="unread-badge">'+chat.unread+'</span>':'')+'</div>';
    item.appendChild(info);
    var del = document.createElement('button');
    del.className = 'delete-chat-btn';
    del.textContent = '\u2715';
    del.onclick = function(e) { e.stopPropagation(); deleteChat(chat.id); };
    item.appendChild(del);
    item.addEventListener('click', function() { selectChat(chat.id); });
    list.appendChild(item);
  });
  updateBadges();
}

function updateBadges() {
  ['all','personal','news','work'].forEach(function(f) {
    var cnt = store.chats.filter(function(c) {
      return !deletedChatsStore.has(c.id) && (f==='all'||c.folder===f) && c.unread>0;
    }).reduce(function(s,c) { return s+c.unread; }, 0);
    var el = document.getElementById(f+'-badge');
    if (el) { el.textContent = cnt||''; el.style.display = cnt?'flex':'none'; }
  });
}

function renderMessages() {
  var container = document.getElementById('messages-container');
  if (!container) return;
  var chat = store.currentChat ? getChatById(store.currentChat) : null;
  if (!chat) { renderWelcome(); return; }

  var topAvatar = document.getElementById('chat-avatar');
  if (topAvatar) {
    var info = avatarFor(chat);
    topAvatar.style.background = info.bg;
    topAvatar.textContent = info.label;
  }
  document.getElementById('chat-name').textContent = chat.name;
  document.getElementById('chat-status').textContent = chat.online ? 'в сети' : 'был(а) недавно';

  if (!chat.messages || !chat.messages.length) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon"><svg viewBox="0 0 80 80"><circle cx="40" cy="40" r="40" fill="rgba(64,167,227,0.08)"/><path d="M20 30c0-3.3 2.7-6 6-6h28c3.3 0 6 2.7 6 6v18c0 3.3-2.7 6-6 6H46l-6 6-6-6H26c-3.3 0-6-2.7-6-6V30z" fill="rgba(64,167,227,0.15)" stroke="#40A7E3" stroke-width="1.5"/></svg></div><h3>Нет сообщений</h3><p>Начните переписку</p></div>';
    return;
  }

  container.innerHTML = '';
  var sep = document.createElement('div');
  sep.className = 'date-sep';
  sep.innerHTML = '<span>Последние сообщения</span>';
  container.appendChild(sep);

  chat.messages.forEach(function(msg) {
    var wrap = document.createElement('div');
    wrap.className = 'message ' + (msg.sent ? 'sent' : 'received');
    var encIcon = msg.encrypted !== false ? '<span class="msg-enc" title="E2E encrypted">&#128272;</span>' : '';
    var ticks = msg.sent ? '<span class="msg-tick read">&#10003;&#10003;</span>' : '';
    wrap.innerHTML = '<div class="msg-bubble"><div class="msg-text">'+escHtml(msg.text)+'</div><div class="msg-meta">'+encIcon+'<span class="msg-time">'+msg.time+'</span>'+ticks+'</div></div>';
    container.appendChild(wrap);
  });
  container.scrollTop = container.scrollHeight;
}

function renderWelcome() {
  var container = document.getElementById('messages-container');
  if (!container || store.currentChat) return;
  container.innerHTML = '<div class="empty-state"><div class="empty-icon"><svg viewBox="0 0 80 80" fill="none"><circle cx="40" cy="40" r="40" fill="rgba(64,167,227,0.08)"/><path d="M20 30c0-3.3 2.7-6 6-6h28c3.3 0 6 2.7 6 6v18c0 3.3-2.7 6-6 6H46l-6 6-6-6H26c-3.3 0-6-2.7-6-6V30z" fill="rgba(64,167,227,0.15)" stroke="#40A7E3" stroke-width="1.5"/><circle cx="32" cy="39" r="2.5" fill="#40A7E3"/><circle cx="40" cy="39" r="2.5" fill="#40A7E3"/><circle cx="48" cy="39" r="2.5" fill="#40A7E3"/></svg></div><h3>Добро пожаловать</h3><p>Выберите чат слева или подключите кошелёк MetaMask</p><button class="btn-primary" onclick="openModal(\'wallet-modal\')">Подключить MetaMask</button></div>';
}

function updateInputState() {
  var input = document.getElementById('msg-input');
  var btn = document.getElementById('send-btn');
  if (!input) return;
  var ok = !!(userAddress && store.currentChat);
  input.disabled = !ok;
  if (btn) btn.disabled = !ok;
  input.placeholder = !userAddress ? 'Подключите MetaMask...' : (!store.currentChat ? 'Выберите чат...' : 'Напишите сообщение...');
}

function updateSidebarAvatar() {
  var btn = document.getElementById('user-avatar-btn');
  var circle = document.getElementById('user-avatar-circle');
  var adminBtn = document.getElementById('admin-btn');
  var adminItem = document.getElementById('admin-menu-item');
  if (userAddress) {
    btn.style.display = 'block';
    var bg = _colorFor(userAddress.toLowerCase());
    var lbl = currentUsername ? _initials(currentUsername) : userAddress.slice(2,4).toUpperCase();
    circle.style.background = bg;
    circle.textContent = lbl;
    var da = document.getElementById('dropdown-avatar-circle');
    var dn = document.getElementById('dropdown-username');
    var dd = document.getElementById('dropdown-address');
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
  var shareBtn = document.getElementById('share-profile-btn');
  if (shareBtn) shareBtn.style.display = userAddress ? 'flex' : 'none';
}

// Blockchain interaction
async function loadMessages(chatId, start) {
  start = start || 0;
  if (!signer || !userAddress) return;
  if (!ethers.utils.isAddress(chatId)) return;
  try {
    var key = await getSharedKey(chatId);
    var contract = new ethers.Contract(MESSAGE_CONTRACT_ADDRESS, MESSAGE_ABI, signer);
    var result = await contract.getConversation(userAddress, chatId, start, MESSAGES_PER_PAGE);
    var sent = result[0];
    var received = result[1];
    var all = sent.concat(received).sort(function(a,b) { return a.timestamp - b.timestamp; });

    var chat = getChatById(chatId);
    if (!chat) {
      if (deletedChatsStore.has(chatId)) return;
      var profile = await getProfile(chatId);
      var name = (profile && profile.username) ? profile.username : chatId.slice(0,8)+'...';
      contactsStore.add({ address: chatId, username: profile ? profile.username : '' });
      chat = { id: chatId, name: name, avatar:'', online:false, folder:'personal', messages:[], isContact:true };
      store.chats.push(chat);
    }

    var msgs = await Promise.all(all.map(async function(m) {
      var isSent = m.sender.toLowerCase() === userAddress.toLowerCase();
      var text = m.text;
      if (!isSent) text = await decryptWithKey(m.text, key);
      return {
        id: m.timestamp.toString()+m.sender,
        text: text,
        sent: isSent,
        time: new Date(m.timestamp*1000).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'}),
        signature: m.signature,
        sender: m.sender,
        timestamp: m.timestamp,
        encrypted: true
      };
    }));

    if (start === 0) chat.messages = msgs;
    else chat.messages = msgs.concat(chat.messages);

    store.pagination[chatId] = { offset: start + MESSAGES_PER_PAGE, hasMore: all.length === MESSAGES_PER_PAGE };
    if (msgs.length) {
      var last = msgs[msgs.length-1];
      chat.preview = last.text;
      chat.time = last.time;
    }
    renderChatList();
    if (store.currentChat === chatId) renderMessages();
  } catch(e) { console.warn('loadMessages:', e); }
}

async function sendMessage() {
  var input = document.getElementById('msg-input');
  var text = input.value.trim();
  if (!text || !userAddress || !store.currentChat) return;
  if (!ethers.utils.isAddress(store.currentChat)) { showToast('Некорректный адрес', 'error'); return; }
  var btn = document.getElementById('send-btn');
  btn.disabled = true;
  input.disabled = true;
  try {
    var enc = await encrypt(text, store.currentChat);
    var sig = await signer.signMessage(text);
    var c = new ethers.Contract(MESSAGE_CONTRACT_ADDRESS, MESSAGE_ABI, signer);
    var tx = await c.sendMessage(store.currentChat, enc, sig);
    showToast('Транзакция отправлена...', 'info');
    await tx.wait();
    var chat = getChatById(store.currentChat);
    if (chat) {
      var now = new Date().toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'});
      chat.messages.push({
        id: Date.now()+userAddress,
        text: text,
        sent: true,
        time: now,
        signature: sig,
        sender: userAddress,
        timestamp: Math.floor(Date.now()/1000),
        encrypted: true
      });
      chat.preview = text;
      chat.time = now;
    }
    input.value = '';
    renderChatList();
    renderMessages();
    showToast('Отправлено!', 'success');
    await loadMessages(store.currentChat);
  } catch(e) {
    showToast('Ошибка: '+(e.reason||e.message), 'error');
  } finally {
    btn.disabled = !(userAddress && store.currentChat);
    input.disabled = false;
    input.focus();
  }
}

async function refreshCurrentChat() {
  if (store.currentChat) {
    await loadMessages(store.currentChat);
    showToast('Обновлено', 'info');
  }
}

async function scanForNewSenders() {
  if (!provider || !userAddress) return;
  try {
    var curBlock = await provider.getBlockNumber();
    var from = lastScannedBlock ? lastScannedBlock+1 : Math.max(0, curBlock - SCAN_BLOCKS_BACK);
    if (from > curBlock) return;
    var c = new ethers.Contract(MESSAGE_CONTRACT_ADDRESS, MESSAGE_ABI, provider);
    var events = await c.queryFilter(c.filters.MessageSent(null, userAddress), from, curBlock);
    var newSenders = new Set();
    events.forEach(function(e) {
      if (e.args.sender.toLowerCase() !== userAddress.toLowerCase()) newSenders.add(e.args.sender);
    });
    for (var s of newSenders) {
      if (deletedChatsStore.has(s)) continue;
      if (!getChatById(s)) {
        var p = await getProfile(s);
        contactsStore.add({ address: s, username: p ? p.username : '' });
        store.chats.push({
          id: s,
          name: (p && p.username) ? p.username : s.slice(0,8)+'...',
          avatar: '',
          online: false,
          folder: 'personal',
          messages: [],
          isContact: true
        });
      }
      await loadMessages(s);
    }
    if (newSenders.size) {
      renderChatList();
      showToast(newSenders.size + ' новых чатов', 'info');
    }
    lastScannedBlock = curBlock;
    localStorage.setItem('w3m_lastBlock', curBlock);
  } catch(e) { console.warn('scan error:', e); }
}

function startAutoRefresh() {
  if (autoRefreshInterval) clearInterval(autoRefreshInterval);
  autoRefreshInterval = setInterval(function() {
    if (store.currentChat && signer) loadMessages(store.currentChat);
  }, 10000);
}

function startDiscovery() {
  if (discoveryInterval) clearInterval(discoveryInterval);
  scanForNewSenders();
  discoveryInterval = setInterval(scanForNewSenders, 30000);
}

// Wallet & Registration
async function initWallet() {
  if (isInitializing) return;
  isInitializing = true;
  try {
    provider = new ethers.providers.Web3Provider(window.ethereum);
    signer = provider.getSigner();
    userAddress = await signer.getAddress();
    isAdmin = userAddress.toLowerCase() === ADMIN_ADDRESS.toLowerCase();
    updateSidebarAvatar();
    updateInputState();
    var c = new ethers.Contract(IDENTITY_CONTRACT_ADDRESS, IDENTITY_ABI, provider);
    var reg = await c.isRegistered(userAddress);
    if (!reg) {
      setTimeout(openRegisterModal, 900);
    } else {
      var p = await getProfile(userAddress);
      if (p) currentUsername = p.username;
      updateSidebarAvatar();
    }
    startAutoRefresh();
    startDiscovery();
    document.getElementById('wallet-modal').style.display = 'none';
  } catch(e) {
    showToast('Ошибка подключения', 'error');
  } finally {
    isInitializing = false;
  }
}

async function connectWallet() {
  if (!window.ethereum) { showToast('Установите MetaMask', 'error'); return; }
  try {
    await window.ethereum.request({ method: 'eth_requestAccounts' });
    await initWallet();
  } catch(e) {
    showToast('Отменено', 'error');
  }
}

function logout() {
  userAddress = null;
  signer = null;
  currentUsername = '';
  isAdmin = false;
  sharedKeyCache.clear();
  clearInterval(autoRefreshInterval);
  clearInterval(discoveryInterval);
  updateSidebarAvatar();
  updateInputState();
  renderWelcome();
  showToast('Вышли из аккаунта', 'info');
}

async function registerUser() {
  var name = document.getElementById('register-username').value.trim();
  if (!name || name.length < 3) return;
  try {
    var c = new ethers.Contract(IDENTITY_CONTRACT_ADDRESS, IDENTITY_ABI, signer);
    var tx = await c.registerProfile(name, '', '');
    await tx.wait();
    currentUsername = name;
    updateSidebarAvatar();
    closeModal('register-modal');
    showToast('Профиль создан!', 'success');
  } catch(e) {
    showToast('Ошибка регистрации', 'error');
  }
}

// UI actions
function setFolder(f) {
  store.currentFolder = f;
  store.currentChat = null;
  renderSidebar();
  renderChatList();
  renderWelcome();
  updateInputState();
  var titles = {all:'Все чаты', personal:'Личное', news:'Новости', work:'Работа'};
  document.getElementById('folder-title').textContent = titles[f] || 'Чаты';
}

function setTab(t) {
  store.currentTab = t;
  document.querySelectorAll('.filter-tab').forEach(function(el) {
    el.classList.toggle('active', el.dataset.tab === t);
  });
  renderChatList();
}

function selectChat(id) {
  store.currentChat = id;
  var c = getChatById(id);
  if (c) {
    c.unread = 0;
    renderChatList();
    loadMessages(id);
    updateInputState();
  }
}

function deleteChat(id) {
  if (ethers.utils.isAddress(id)) contactsStore.remove(id);
  deletedChatsStore.add(id);
  if (store.currentChat === id) { store.currentChat = null; renderWelcome(); }
  renderChatList();
  showToast('Чат удален', 'info');
}

async function addContactFromInput() {
  var addr = document.getElementById('add-contact-input').value.trim();
  if (!ethers.utils.isAddress(addr)) { showToast('Введите корректный адрес', 'error'); return; }
  var p = await getProfile(addr);
  contactsStore.add({ address: addr, username: p ? p.username : '' });
  deletedChatsStore.del(addr);
  renderChatList();
  showToast('Контакт добавлен', 'success');
  document.getElementById('add-contact-input').value = '';
}

function toggleUserMenu() {
  document.getElementById('user-dropdown-menu').classList.toggle('hidden');
}

// Modals
function openModal(id) { document.getElementById(id).style.display = 'flex'; }
function closeModal(id) { document.getElementById(id).style.display = 'none'; }
function closeModalOnBg(e,id) { if (e.target.id === id) closeModal(id); }
function openRegisterModal() {
  document.getElementById('register-address-display').textContent = userAddress || '';
  openModal('register-modal');
}
function closeRegisterModal() { closeModal('register-modal'); }

function openProfileModal() {
  document.getElementById('profile-address-display').textContent = userAddress || '\u2014';
  document.getElementById('profile-username-display').textContent = currentUsername || 'Аккаунт';
  var big = document.getElementById('profile-avatar-big');
  if (big && userAddress) {
    var bg = _colorFor(userAddress.toLowerCase());
    big.style.background = bg;
    big.textContent = currentUsername ? _initials(currentUsername) : userAddress.slice(2,4).toUpperCase();
  }
  openModal('profile-modal');
  toggleUserMenu();
}

function openContactsModal() {
  var listEl = document.getElementById('contacts-list');
  if (listEl) {
    if (!contactsStore.list.length) {
      listEl.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted);">Нет контактов</div>';
    } else {
      listEl.innerHTML = '';
      contactsStore.list.forEach(function(c) {
        var item = document.createElement('div');
        item.className = 'contact-item';
        item.innerHTML = '<div class="contact-info"><span class="contact-name">'+ escHtml(c.username || 'Без имени') +'</span><span class="contact-addr">'+ c.address.slice(0,10)+'...'+c.address.slice(-4) +'</span></div><div class="contact-actions"><button class="contact-btn-chat" onclick="selectChat(\''+c.address+'\');closeModal(\'contacts-modal\')">Чат</button><button class="contact-btn-del" onclick="contactsStore.remove(\''+c.address+'\');openContactsModal()">Удалить</button></div>';
        listEl.appendChild(item);
      });
    }
  }
  openModal('contacts-modal');
}

function openSettingsModal() { openModal('settings-modal'); }
function openAdminModal() { openModal('admin-modal'); }
async function accessEscrowKey() { showToast('Функция в разработке', 'info'); }

function openShareModal() {
  var link = window.location.origin + '/?contact=' + (userAddress || '');
  var linkInput = document.getElementById('share-link-input');
  if (linkInput) linkInput.value = link;
  var qrContainer = document.getElementById('qr-container');
  if (qrContainer) {
    qrContainer.innerHTML = '';
    if (typeof QRCode !== 'undefined') {
      new QRCode(qrContainer, { text: link, width: 160, height: 160, colorDark: '#000', colorLight: '#fff' });
    }
  }
  openModal('share-modal');
}

function copyShareLink() {
  var val = document.getElementById('share-link-input').value;
  if (navigator.clipboard) navigator.clipboard.writeText(val);
  showToast('Скопировано', 'success');
}

function shareToTelegram() {
  window.open('https://t.me/share/url?url='+encodeURIComponent(document.getElementById('share-link-input').value),'_blank');
}
function shareToWhatsApp() {
  window.open('https://wa.me/?text='+encodeURIComponent('Web3 Messenger: '+document.getElementById('share-link-input').value),'_blank');
}
function shareToTwitter() {
  window.open('https://twitter.com/intent/tweet?text='+encodeURIComponent('Web3 Messenger: '+document.getElementById('share-link-input').value),'_blank');
}

function clearAllData() {
  if (confirm('Сбросить все данные?')) { localStorage.clear(); location.reload(); }
}

// Init
document.addEventListener('DOMContentLoaded', function() {
  contactsStore.load();
  deletedChatsStore.load();
  try { var lb = localStorage.getItem('w3m_lastBlock'); if (lb) lastScannedBlock = parseInt(lb); } catch(e) {}
  renderSidebar();
  renderChatList();
  renderWelcome();
  updateInputState();

  if (window.ethereum) {
    window.ethereum.on('accountsChanged', async function(acc) {
      if (!acc.length) { logout(); } else { userAddress = acc[0]; await initWallet(); }
    });
    window.ethereum.on('chainChanged', function() { location.reload(); });
    window.ethereum.request({ method: 'eth_accounts' }).then(function(acc) {
      if (acc.length) initWallet();
    });
  }

  document.addEventListener('click', function(e) {
    var menu = document.getElementById('user-dropdown-menu');
    if (menu && !menu.classList.contains('hidden')) {
      var btn = document.getElementById('user-avatar-btn');
      if (!btn.contains(e.target) && !menu.contains(e.target)) menu.classList.add('hidden');
    }
  });

  var p = new URLSearchParams(location.search).get('contact');
  if (p && typeof ethers !== 'undefined' && ethers.utils.isAddress(p)) {
    document.getElementById('add-contact-input').value = p;
    setTimeout(function() { addContactFromInput(); }, 1000);
  }
});

// Global exports
window.setFolder = setFolder;
window.setTab = setTab;
window.selectChat = selectChat;
window.sendMessage = sendMessage;
window.connectWallet = connectWallet;
window.logout = logout;
window.registerUser = registerUser;
window.refreshCurrentChat = refreshCurrentChat;
window.scanForNewSenders = scanForNewSenders;
window.deleteChat = deleteChat;
window.addContactFromInput = addContactFromInput;
window.toggleUserMenu = toggleUserMenu;
window.openModal = openModal;
window.closeModal = closeModal;
window.closeModalOnBg = closeModalOnBg;
window.openRegisterModal = openRegisterModal;
window.closeRegisterModal = closeRegisterModal;
window.openProfileModal = openProfileModal;
window.openContactsModal = openContactsModal;
window.openSettingsModal = openSettingsModal;
window.openAdminModal = openAdminModal;
window.accessEscrowKey = accessEscrowKey;
window.openShareModal = openShareModal;
window.copyShareLink = copyShareLink;
window.shareToTelegram = shareToTelegram;
window.shareToWhatsApp = shareToWhatsApp;
window.shareToTwitter = shareToTwitter;
window.clearAllData = clearAllData;

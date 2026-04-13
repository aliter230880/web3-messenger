console.log('Web3 Messenger v10.2 — Auto-refresh + Nicknames');

const ADMIN_ADDRESS = "0xB19aEe699eb4D2Af380c505E4d6A108b055916eB";
const IDENTITY_CONTRACT_ADDRESS = "0xcFcA16C8c38a83a71936395039757DcFF6040c1E";
const MESSAGE_CONTRACT_ADDRESS = "0x906DCA5190841d5F0acF8244bd8c176ecb24139D";
const REQUIRED_CHAIN_ID = 137;
const MESSAGES_PER_PAGE = 50;
const SCAN_BLOCKS_BACK = 50000;
const POLL_INTERVAL = 5000;

const MESSAGE_ABI = [
    "function sendMessage(address recipient, string text, bytes signature) external",
    "function getConversation(address userA, address userB, uint256 startIndex, uint256 count) view returns (tuple(address sender, address recipient, string text, uint256 timestamp, bytes signature)[], uint256)",
    "function messageCount(address a, address b) view returns (uint256)",
    "event MessageSent(address indexed sender, address indexed recipient, uint256 timestamp)"
];

const MSG_ABI_VARIANTS = [
    ["function getConversation(address,address,uint256,uint256) view returns (tuple(address sender, address recipient, string text, uint256 timestamp, bytes signature)[], uint256)"],
    ["function getConversation(address,address,uint256,uint256) view returns (tuple(address sender, address recipient, string text, uint256 timestamp)[], uint256)"],
    ["function getConversation(address,address,uint256,uint256) view returns (tuple(address sender, address recipient, string text, uint256 timestamp, bytes signature)[])"],
    ["function getConversation(address,address,uint256,uint256) view returns (tuple(address sender, address recipient, string text, uint256 timestamp)[])"],
    ["function getConversation(address,address,uint256,uint256) view returns (tuple(address sender, address recipient, string text, uint256 timestamp, string signature)[], uint256)"],
    ["function getConversation(address,address,uint256,uint256) view returns (tuple(uint256 id, address sender, address recipient, string text, uint256 timestamp, bytes signature)[], uint256)"],
];

const IDENTITY_ABI = [
    "function getProfile(address) view returns (string,string,string,uint256,bool)",
    "function isRegistered(address) view returns (bool)",
    "function registerProfile(string username, string avatarCID, string bio) external"
];

let provider, signer, userAddress = null;
let messageContract, identityContract;
let masterKey = null;
let currentUsername = '';
let isAuthenticated = false;
let isAdmin = false;
let currentFilter = 'all';
let pollTimer = null;
let isPolling = false;
const nicknameCache = {};

const store = { chats: [], currentChat: null, currentFolder: 'all', messages: {} };

const AVATAR_COLORS = [
    ['#3b82f6','#6366f1'], ['#8b5cf6','#a855f7'], ['#ec4899','#f43f5e'],
    ['#f59e0b','#f97316'], ['#22c55e','#10b981'], ['#06b6d4','#0ea5e9'],
    ['#6366f1','#8b5cf6'], ['#f43f5e','#e11d48'], ['#14b8a6','#22d3ee'],
    ['#a855f7','#c084fc']
];

function getAvatarColor(addr) {
    let hash = 0;
    const s = (addr || '').toLowerCase();
    for (let i = 0; i < s.length; i++) hash = ((hash << 5) - hash) + s.charCodeAt(i);
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function getInitials(name) {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
}

function shortAddr(addr) {
    if (!addr) return '';
    return addr.slice(0, 6) + '...' + addr.slice(-4);
}

function escHtml(s) {
    return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatTime(ts) {
    const d = new Date(ts * 1000);
    return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function formatDate(ts) {
    const d = new Date(ts * 1000);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return 'Сегодня';
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return 'Вчера';
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

const contactsStore = {
    list: [],
    load() { try { const s = localStorage.getItem('w3m_contacts_' + userAddress); if (s) this.list = JSON.parse(s); } catch(e){} },
    save() { try { localStorage.setItem('w3m_contacts_' + userAddress, JSON.stringify(this.list)); } catch(e){} },
    add(c) {
        const addr = c.address.toLowerCase();
        if (!this.list.find(x => x.address.toLowerCase() === addr)) {
            this.list.push(c); this.save(); return true;
        }
        return false;
    },
    remove(addr) {
        const i = this.list.findIndex(c => c.address.toLowerCase() === addr.toLowerCase());
        if (i !== -1) { this.list.splice(i, 1); this.save(); return true; }
        return false;
    },
    find(addr) { return this.list.find(c => c.address.toLowerCase() === addr.toLowerCase()); },
    getName(addr) {
        const c = this.find(addr);
        return c ? c.name : shortAddr(addr);
    }
};

function showToast(msg, type = 'info') {
    const c = document.getElementById('toast-container');
    const d = document.createElement('div');
    d.className = 'toast ' + type;
    d.textContent = msg;
    c.appendChild(d);
    setTimeout(() => { d.style.opacity = '0'; setTimeout(() => d.remove(), 380); }, 3000);
}

// ====================== CRYPTO ======================
async function deriveMasterKey(password, addr) {
    const salt = 'w3m-master-' + (addr || userAddress).toLowerCase();
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(password), { name: "PBKDF2" }, false, ["deriveBits"]);
    const keyBits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: enc.encode(salt), iterations: 100000, hash: "SHA-256" }, keyMaterial, 256);
    return new Uint8Array(keyBits);
}

async function getChatKey(peer) {
    if (!masterKey) throw new Error("Master key not initialized");
    const sorted = [userAddress.toLowerCase(), peer.toLowerCase()].sort().join(':');
    const cryptoKey = await crypto.subtle.importKey("raw", masterKey, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sig = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(sorted));
    return new Uint8Array(sig);
}

async function encrypt(text, peer) {
    const key = await getChatKey(peer);
    const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
    const msg = new TextEncoder().encode(text);
    const box = nacl.secretbox(msg, nonce, key);
    const combined = new Uint8Array(nonce.length + box.length);
    combined.set(nonce);
    combined.set(box, nonce.length);
    return btoa(String.fromCharCode.apply(null, combined));
}

async function decrypt(encBase64, peer) {
    try {
        const key = await getChatKey(peer);
        const data = atob(encBase64);
        const combined = new Uint8Array(data.length);
        for (let i = 0; i < data.length; i++) combined[i] = data.charCodeAt(i);
        const nonce = combined.slice(0, nacl.secretbox.nonceLength);
        const box = combined.slice(nacl.secretbox.nonceLength);
        const dec = nacl.secretbox.open(box, nonce, key);
        if (!dec) return null;
        return new TextDecoder().decode(dec);
    } catch (e) { return null; }
}

// ====================== NICKNAME RESOLVER ======================
async function resolveNickname(addr) {
    const key = addr.toLowerCase();
    if (nicknameCache[key]) return nicknameCache[key];
    try {
        if (identityContract) {
            const profile = await identityContract.getProfile(addr);
            const username = profile[0];
            if (username && username.trim().length > 0) {
                nicknameCache[key] = username.trim();
                return nicknameCache[key];
            }
        }
    } catch(e) {}
    const localAccount = getAccountData(addr);
    if (localAccount && localAccount.username) {
        nicknameCache[key] = localAccount.username;
        return nicknameCache[key];
    }
    return null;
}

async function resolveAndUpdateContact(addr) {
    const nick = await resolveNickname(addr);
    if (nick) {
        const contact = contactsStore.find(addr);
        if (contact && (contact.name === shortAddr(addr) || !contact.name)) {
            contact.name = nick + ' (' + shortAddr(addr) + ')';
            contactsStore.save();
            return true;
        }
    }
    return false;
}

// ====================== ACCOUNT DATA ======================
function getAccountData(addr) {
    try {
        const raw = localStorage.getItem('w3m_account_' + addr.toLowerCase());
        return raw ? JSON.parse(raw) : null;
    } catch(e) { return null; }
}

function setAccountData(addr, data) {
    localStorage.setItem('w3m_account_' + addr.toLowerCase(), JSON.stringify(data));
}

function isRegistered(addr) {
    return !!getAccountData(addr);
}

async function verifyPassword(addr, password) {
    const account = getAccountData(addr);
    if (!account) return false;
    const key = await deriveMasterKey(password, addr);
    const hash = Array.from(key).map(b => b.toString(16).padStart(2, '0')).join('');
    return hash === account.keyHash;
}

// ====================== UI HELPERS ======================
function renderAvatarCircle(el, name, addr) {
    if (!el) return;
    const colors = getAvatarColor(addr);
    el.style.background = 'linear-gradient(135deg, ' + colors[0] + ', ' + colors[1] + ')';
    el.textContent = getInitials(name || shortAddr(addr));
}

function updateUserUI() {
    const avatarBtn = document.getElementById('user-avatar-btn');
    const walletBtn = document.getElementById('wallet-btn');
    const avatarCircle = document.getElementById('user-avatar-circle');
    const dropdownAvatar = document.getElementById('dropdown-avatar-circle');
    const dropdownName = document.getElementById('dropdown-username');
    const dropdownAddr = document.getElementById('dropdown-address');
    const adminSection = document.getElementById('admin-dropdown-section');
    const adminBadge = document.getElementById('dropdown-admin-badge');
    const adminIndicator = document.getElementById('admin-indicator');
    const statusBar = document.getElementById('status-bar');
    const statusAddr = document.getElementById('status-bar-addr');

    if (userAddress && isAuthenticated) {
        if (avatarBtn) avatarBtn.style.display = 'block';
        if (walletBtn) walletBtn.style.display = 'none';
        renderAvatarCircle(avatarCircle, currentUsername, userAddress);
        renderAvatarCircle(dropdownAvatar, currentUsername, userAddress);
        if (dropdownName) dropdownName.textContent = currentUsername || shortAddr(userAddress);
        if (dropdownAddr) dropdownAddr.textContent = shortAddr(userAddress);

        if (statusBar) statusBar.style.display = 'flex';
        if (statusAddr) statusAddr.textContent = userAddress;

        if (isAdmin) {
            if (adminSection) adminSection.style.display = 'block';
            if (adminBadge) adminBadge.style.display = 'flex';
            if (adminIndicator) adminIndicator.style.display = 'flex';
        } else {
            if (adminSection) adminSection.style.display = 'none';
            if (adminBadge) adminBadge.style.display = 'none';
            if (adminIndicator) adminIndicator.style.display = 'none';
        }
    } else {
        if (avatarBtn) avatarBtn.style.display = 'none';
        if (statusBar) statusBar.style.display = 'none';
    }
}

function renderWelcome() {
    const container = document.getElementById('messages-container');
    if (!container) return;
    document.getElementById('chat-topbar').style.display = 'none';
    document.getElementById('input-bar').style.display = 'none';
    container.innerHTML =
        '<div class="empty-state">' +
            '<div class="empty-icon">' +
                '<svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">' +
                    '<ellipse cx="40" cy="40" rx="38" ry="34" fill="#2a3444" stroke="#3a4555" stroke-width="2"/>' +
                    '<circle cx="28" cy="38" r="4" fill="#5a6a7a"/>' +
                    '<circle cx="40" cy="38" r="4" fill="#5a6a7a"/>' +
                    '<circle cx="52" cy="38" r="4" fill="#5a6a7a"/>' +
                '</svg>' +
            '</div>' +
            '<h3>Добро пожаловать</h3>' +
            '<p>Выберите чат слева и подключите кошелёк</p>' +
            '<div class="feature-tags">' +
                '<span class="feature-tag tag-e2e">🔐 E2E</span>' +
                '<span class="feature-tag tag-sig">🔥 Подписи</span>' +
                '<span class="feature-tag tag-web3">🌐 Web3</span>' +
            '</div>' +
            (!userAddress ? '<button class="btn-primary btn-sm" style="margin-top:12px;" onclick="connectWallet()">Подключить MetaMask</button>' : '') +
        '</div>';
}

function toggleAddContact() {
    const panel = document.getElementById('add-contact-panel');
    if (!panel) return;
    if (panel.style.display === 'none') {
        panel.style.display = 'flex';
        document.getElementById('add-contact-input').focus();
    } else {
        panel.style.display = 'none';
    }
}

function setFilter(filter, btn) {
    currentFilter = filter;
    document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
    if (btn) btn.classList.add('active');
    renderChatList();
}

function renderChatList() {
    const list = document.getElementById('chat-list');
    if (!list) return;
    const contacts = contactsStore.list;
    const searchVal = (document.getElementById('search-input')?.value || '').toLowerCase();

    const filtered = contacts.filter(c => {
        if (searchVal && !c.name.toLowerCase().includes(searchVal) && !c.address.toLowerCase().includes(searchVal)) return false;
        if (currentFilter === 'vip') {
            const tier = getPremiumTier(c.address);
            if (tier === 'free') return false;
        }
        return true;
    });

    if (filtered.length === 0) {
        list.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted);font-size:13px;">Нет чатов</div>';
        return;
    }

    list.innerHTML = filtered.map(c => {
        const colors = getAvatarColor(c.address);
        const isActive = store.currentChat === c.address.toLowerCase();
        const msgs = store.messages[c.address.toLowerCase()];
        const lastMsg = msgs ? msgs[msgs.length - 1] : null;
        const lastText = lastMsg ? (lastMsg.text || 'Зашифрованное сообщение') : '';
        const lastTime = lastMsg ? formatTime(lastMsg.timestamp) : '';
        const unread = c.unread || 0;

        return '<div class="chat-item' + (isActive ? ' active' : '') + '" onclick="selectChat(\'' + c.address + '\')">' +
            '<div class="chat-item-avatar" style="background:linear-gradient(135deg,' + colors[0] + ',' + colors[1] + ')">' +
                getInitials(c.name) +
                (c.online ? '<div class="online-dot"></div>' : '') +
            '</div>' +
            '<div class="chat-item-info">' +
                '<div class="chat-item-name">' + escHtml(c.name) + '</div>' +
                '<div class="chat-item-last">' + escHtml(lastText.slice(0, 40)) + '</div>' +
            '</div>' +
            '<div class="chat-item-meta">' +
                (lastTime ? '<div class="chat-item-time">' + lastTime + '</div>' : '') +
                (unread > 0 ? '<div class="chat-item-unread">' + unread + '</div>' : '') +
                '<button class="chat-delete-btn" onclick="event.stopPropagation();deleteChat(\'' + c.address + '\')" title="Удалить чат">&times;</button>' +
            '</div>' +
        '</div>';
    }).join('');

    updateBadges();
}

function updateBadges() {
    const totalUnread = contactsStore.list.reduce((sum, c) => sum + (c.unread || 0), 0);
    const badgeAll = document.getElementById('badge-all');
    if (badgeAll) {
        if (totalUnread > 0) {
            badgeAll.textContent = totalUnread;
            badgeAll.classList.add('visible');
        } else {
            badgeAll.classList.remove('visible');
        }
    }
}

async function selectChat(addr) {
    store.currentChat = addr.toLowerCase();
    const contact = contactsStore.find(addr);
    if (contact && contact.unread) {
        contact.unread = 0;
        contactsStore.save();
    }
    renderChatList();
    await loadMessages(addr);
}

async function loadMessages(addr, silent) {
    const container = document.getElementById('messages-container');
    const topbar = document.getElementById('chat-topbar');
    const inputBar = document.getElementById('input-bar');
    topbar.style.display = 'flex';
    inputBar.style.display = 'flex';

    const name = contactsStore.getName(addr);
    const colors = getAvatarColor(addr);
    document.getElementById('chat-avatar').style.background = 'linear-gradient(135deg,' + colors[0] + ',' + colors[1] + ')';
    document.getElementById('chat-avatar').textContent = getInitials(name);
    document.getElementById('chat-name').textContent = name;
    document.getElementById('chat-status').textContent = 'был(а) недавно';

    document.getElementById('msg-input').disabled = false;
    document.getElementById('send-btn').disabled = false;

    if (!silent) {
        container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;"><div class="loading-spinner"></div></div>';
    }

    try {
        if (!messageContract) {
            if (!silent) container.innerHTML = '<div class="empty-state"><h3>Контракт не подключён</h3><p>Подключитесь к Polygon Mainnet.</p></div>';
            return;
        }

        const count = await messageContract.messageCount(userAddress, addr);
        const total = count.toNumber();

        if (total === 0) {
            store.messages[addr.toLowerCase()] = [];
            if (!silent) container.innerHTML = '<div class="empty-state"><p>Нет сообщений. Начните общение!</p></div>';
            return;
        }

        const start = Math.max(0, total - MESSAGES_PER_PAGE);
        const rawMsgs = await fetchConversation(userAddress, addr, start, MESSAGES_PER_PAGE);

        const messages = [];
        for (const m of rawMsgs) {
            let senderAddr, recipientAddr, text, timestamp;
            if (m.sender) {
                senderAddr = m.sender;
                recipientAddr = m.recipient;
                text = m.text;
                timestamp = typeof m.timestamp === 'object' ? m.timestamp.toNumber() : Number(m.timestamp);
            } else {
                const vals = Object.values(m);
                senderAddr = vals.find(v => typeof v === 'string' && v.startsWith('0x') && v.length === 42);
                recipientAddr = vals.filter(v => typeof v === 'string' && v.startsWith('0x') && v.length === 42)[1];
                text = vals.find(v => typeof v === 'string' && !v.startsWith('0x'));
                const tsVal = vals.find(v => typeof v === 'object' && v.toNumber);
                timestamp = tsVal ? tsVal.toNumber() : 0;
            }

            if (!senderAddr || !recipientAddr) continue;

            const isMine = senderAddr.toLowerCase() === userAddress.toLowerCase();
            const peer = isMine ? recipientAddr : senderAddr;
            let decrypted = await decrypt(text, peer);
            if (!decrypted) decrypted = text;

            messages.push({
                sender: senderAddr,
                recipient: recipientAddr,
                text: decrypted,
                timestamp: timestamp,
                isMine: isMine
            });
        }

        const prevCount = (store.messages[addr.toLowerCase()] || []).length;
        store.messages[addr.toLowerCase()] = messages;

        if (!silent || messages.length !== prevCount) {
            renderMessages(messages);
        }
    } catch (e) {
        console.error('Load messages error:', e);
        if (!silent) container.innerHTML = '<div class="empty-state"><p>Ошибка загрузки сообщений</p></div>';
    }
}

async function fetchConversation(userA, userB, startIdx, count) {
    const iface = new ethers.utils.Interface(MESSAGE_ABI);
    const callData = iface.encodeFunctionData('getConversation', [userA, userB, startIdx, count]);
    const rawHex = await provider.call({ to: MESSAGE_CONTRACT_ADDRESS, data: callData });

    if (rawHex === '0x' || rawHex.length < 66) {
        console.warn('Empty response from getConversation');
        return [];
    }

    console.log('getConversation raw response length:', rawHex.length, 'bytes:', (rawHex.length - 2) / 2);

    const allVariants = [
        ['(address,address,string,uint256,bytes)[]', 'uint256'],
        ['(address,address,string,uint256)[]', 'uint256'],
        ['(address,address,string,uint256,bytes)[]'],
        ['(address,address,string,uint256)[]'],
        ['(address,address,string,uint256,string)[]', 'uint256'],
        ['(address,address,string,uint256,string)[]'],
        ['(address,address,string,uint256,bytes,uint256)[]', 'uint256'],
        ['(address,address,string,uint256,bytes,uint256)[]'],
        ['(uint256,address,address,string,uint256,bytes)[]', 'uint256'],
        ['(uint256,address,address,string,uint256,bytes)[]'],
        ['(uint256,address,address,string,uint256)[]', 'uint256'],
        ['(address,address,string,uint256,bytes,bool)[]', 'uint256'],
        ['(address,address,uint256,string,bytes)[]', 'uint256'],
        ['(address,address,bytes,uint256,bytes)[]', 'uint256'],
    ];

    const data = ethers.utils.arrayify(rawHex);

    for (let i = 0; i < allVariants.length; i++) {
        try {
            const decoded = ethers.utils.defaultAbiCoder.decode(allVariants[i], data);
            const arr = Array.isArray(decoded[0]) ? decoded[0] : [];
            if (arr.length > 0) {
                console.log('Decoded with variant #' + i + ':', JSON.stringify(allVariants[i]));
                return arr;
            }
        } catch(e) {}
    }

    console.warn('All standard decoders failed. Attempting raw byte extraction...');
    return parseRawMessages(rawHex, userA, userB);
}

function parseRawMessages(rawHex, userA, userB) {
    try {
        const hex = rawHex.startsWith('0x') ? rawHex.slice(2) : rawHex;
        const word = (offset) => hex.slice(offset * 2, (offset + 32) * 2);
        const toNum = (offset) => parseInt(word(offset), 16);
        const toAddr = (offset) => '0x' + word(offset).slice(24);

        const arrOffset = toNum(0);
        const arrLen = toNum(arrOffset);

        if (arrLen === 0 || arrLen > 500) {
            console.warn('Raw parse: invalid array length', arrLen);
            return [];
        }

        console.log('Raw parse: found array of', arrLen, 'messages at offset', arrOffset);

        const messages = [];
        const elemOffsetsStart = arrOffset + 32;

        for (let i = 0; i < arrLen; i++) {
            try {
                const elemRelOffset = toNum(elemOffsetsStart + i * 32);
                const elemAbsOffset = arrOffset + 32 + elemRelOffset;

                const field0 = word(elemAbsOffset);
                const field1 = word(elemAbsOffset + 32);
                const field2 = word(elemAbsOffset + 64);
                const field3 = word(elemAbsOffset + 96);

                let sender, recipient, textOffset, timestamp;

                const isAddr0 = field0.slice(0, 24) === '000000000000000000000000' && field0.slice(24) !== '0000000000000000000000000000000000000000';
                const isAddr1 = field1.slice(0, 24) === '000000000000000000000000' && field1.slice(24) !== '0000000000000000000000000000000000000000';

                if (isAddr0 && isAddr1) {
                    sender = '0x' + field0.slice(24);
                    recipient = '0x' + field1.slice(24);
                    const f2Num = parseInt(field2, 16);
                    const f3Num = parseInt(field3, 16);

                    if (f2Num > 1000000) {
                        timestamp = f2Num;
                        textOffset = f3Num;
                    } else {
                        textOffset = f2Num;
                        timestamp = f3Num;
                    }
                } else {
                    const id = parseInt(field0, 16);
                    sender = '0x' + field1.slice(24);
                    recipient = '0x' + field2.slice(24);
                    textOffset = parseInt(field3, 16);
                    const field4 = word(elemAbsOffset + 128);
                    timestamp = parseInt(field4, 16);
                }

                let text = '';
                if (textOffset && textOffset < hex.length / 2) {
                    const strAbsOffset = elemAbsOffset + textOffset;
                    const strLen = toNum(strAbsOffset);
                    if (strLen > 0 && strLen < 100000) {
                        const strHex = hex.slice((strAbsOffset + 32) * 2, (strAbsOffset + 32 + strLen) * 2);
                        text = decodeHexString(strHex);
                    }
                }

                if (sender && recipient && text) {
                    messages.push({ sender, recipient, text, timestamp: { toNumber: () => timestamp } });
                }
            } catch(elemErr) {
                console.warn('Raw parse: failed to parse element', i, elemErr);
            }
        }

        console.log('Raw parse: extracted', messages.length, 'messages');
        return messages;
    } catch(e) {
        console.error('Raw parse failed:', e);
        return [];
    }
}

function decodeHexString(hex) {
    try {
        const bytes = [];
        for (let i = 0; i < hex.length; i += 2) {
            bytes.push(parseInt(hex.substr(i, 2), 16));
        }
        return new TextDecoder().decode(new Uint8Array(bytes));
    } catch(e) { return ''; }
}

function renderMessages(messages) {
    const container = document.getElementById('messages-container');
    if (!messages || messages.length === 0) {
        container.innerHTML = '<div class="empty-state"><p>Нет сообщений. Начните общение!</p></div>';
        return;
    }
    let html = '';
    let lastDate = '';

    for (const m of messages) {
        const dateStr = formatDate(m.timestamp);
        if (dateStr !== lastDate) {
            html += '<div class="msg-date-divider"><span>' + dateStr + '</span></div>';
            lastDate = dateStr;
        }

        const cls = m.isMine ? 'sent' : 'received';
        html += '<div class="message ' + cls + '">' +
            '<div class="msg-bubble">' +
                '<div class="msg-text">' + escHtml(m.text) + '</div>' +
                '<div class="msg-time">' + formatTime(m.timestamp) + '</div>' +
            '</div>' +
        '</div>';
    }

    container.innerHTML = html;
    container.scrollTop = container.scrollHeight;
}

async function sendMessage() {
    const input = document.getElementById('msg-input');
    const text = input.value.trim();
    if (!text || !store.currentChat || !messageContract) return;
    input.value = '';
    const peer = store.currentChat;

    try {
        const encrypted = await encrypt(text, peer);
        const sig = await signer.signMessage(text);
        const sigBytes = ethers.utils.arrayify(sig);

        showToast('Отправка транзакции...', 'info');
        const tx = await messageContract.sendMessage(peer, encrypted, sigBytes);
        showToast('Ожидание подтверждения...', 'info');
        await tx.wait();
        showToast('Сообщение отправлено', 'success');

        const now = Math.floor(Date.now() / 1000);
        if (!store.messages[peer]) store.messages[peer] = [];
        store.messages[peer].push({ sender: userAddress, recipient: peer, text, timestamp: now, isMine: true });
        renderMessages(store.messages[peer]);
        renderChatList();
    } catch (e) {
        console.error('Send error:', e);
        if (e.code === 4001 || e.code === 'ACTION_REJECTED') showToast('Транзакция отклонена', 'error');
        else showToast('Ошибка отправки: ' + (e.reason || e.message || ''), 'error');
    }
}

let lastKnownBlock = 0;
let knownPeers = new Set();

async function discoverChats(silent) {
    if (!messageContract || !userAddress) return;
    try {
        const currentBlock = await provider.getBlockNumber();
        const scanFrom = lastKnownBlock > 0 ? Math.max(lastKnownBlock - 5, 0) : Math.max(0, currentBlock - SCAN_BLOCKS_BACK);

        const batchSize = 10000;
        let allSentEvents = [];
        let allRecvEvents = [];

        for (let from = scanFrom; from <= currentBlock; from += batchSize) {
            const to = Math.min(from + batchSize - 1, currentBlock);
            try {
                const [sent, recv] = await Promise.all([
                    messageContract.queryFilter(messageContract.filters.MessageSent(userAddress, null), from, to),
                    messageContract.queryFilter(messageContract.filters.MessageSent(null, userAddress), from, to)
                ]);
                allSentEvents = allSentEvents.concat(sent);
                allRecvEvents = allRecvEvents.concat(recv);
            } catch(batchErr) {
                console.warn('Batch scan failed for blocks ' + from + '-' + to, batchErr);
            }
        }

        lastKnownBlock = currentBlock;

        const peers = new Set();
        allSentEvents.forEach(e => peers.add(e.args.recipient.toLowerCase()));
        allRecvEvents.forEach(e => peers.add(e.args.sender.toLowerCase()));
        peers.delete(userAddress.toLowerCase());

        let newChats = [];
        for (const addr of peers) {
            const existing = contactsStore.find(addr);
            if (!existing) {
                contactsStore.add({ address: addr, name: shortAddr(addr) });
                newChats.push(addr);
                resolveAndUpdateContact(addr).then(updated => {
                    if (updated) renderChatList();
                });
            }
            knownPeers.add(addr);
        }

        if (newChats.length > 0) {
            showToast('Новое сообщение от ' + (newChats.length === 1 ? shortAddr(newChats[0]) : newChats.length + ' контактов'), 'info');
            renderChatList();
            if (!store.currentChat && newChats.length === 1) {
                selectChat(newChats[0]);
            }
        } else {
            renderChatList();
        }
    } catch (e) {
        console.error('Discover chats error:', e);
    }
}

async function checkNewMessages() {
    if (!messageContract || !userAddress) return;
    try {
        for (const contact of contactsStore.list) {
            const addr = contact.address;
            try {
                const count = await messageContract.messageCount(userAddress, addr);
                const total = count.toNumber();
                const cached = (store.messages[addr.toLowerCase()] || []).length;

                if (!contact._lastKnownCount) contact._lastKnownCount = cached;

                if (total > contact._lastKnownCount) {
                    const newMsgCount = total - contact._lastKnownCount;
                    contact._lastKnownCount = total;

                    if (store.currentChat === addr.toLowerCase()) {
                        await loadMessages(addr, true);
                    } else {
                        contact.unread = (contact.unread || 0) + newMsgCount;
                        contactsStore.save();
                        showToast('Новое сообщение от ' + contactsStore.getName(addr), 'info');
                    }
                }
            } catch(contactErr) {}
        }
        renderChatList();
    } catch(e) {
        console.error('Check new messages error:', e);
    }
}

function startPolling() {
    if (pollTimer) clearInterval(pollTimer);
    let pollCycle = 0;
    pollTimer = setInterval(async () => {
        if (!isAuthenticated || !messageContract || isPolling) return;
        isPolling = true;
        try {
            pollCycle++;
            if (pollCycle % 6 === 0) {
                await discoverChats(true);
            }
            await checkNewMessages();
            if (store.currentChat) {
                await loadMessages(store.currentChat, true);
            }
        } catch(e) {
            console.error('Poll error:', e);
        }
        isPolling = false;
    }, POLL_INTERVAL);
    console.log('Auto-refresh started: every ' + (POLL_INTERVAL/1000) + 's');
}

function stopPolling() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

async function deleteChat(addr) {
    const name = contactsStore.getName(addr);
    if (!confirm('Удалить чат с ' + name + '? История будет очищена локально.')) return;
    contactsStore.remove(addr);
    delete store.messages[addr.toLowerCase()];
    if (store.currentChat === addr.toLowerCase()) {
        store.currentChat = null;
        renderWelcome();
    }
    renderChatList();
    showToast('Чат удалён', 'info');
}

// ====================== WALLET ======================
async function connectWallet() {
    if (!window.ethereum) {
        showToast('MetaMask не установлен', 'error');
        return;
    }
    try {
        await window.ethereum.request({ method: 'eth_requestAccounts' });
        await initWallet();
    } catch (e) {
        showToast('Ошибка подключения кошелька', 'error');
    }
}

async function initWallet() {
    try {
        provider = new ethers.providers.Web3Provider(window.ethereum);
        const network = await provider.getNetwork();
        
        if (network.chainId !== REQUIRED_CHAIN_ID) {
            showToast('Переключитесь на Polygon Mainnet', 'error');
            try {
                await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x89' }] });
                provider = new ethers.providers.Web3Provider(window.ethereum);
            } catch (switchError) {
                if (switchError.code === 4902) {
                    await window.ethereum.request({
                        method: 'wallet_addEthereumChain',
                        params: [{ chainId: '0x89', chainName: 'Polygon Mainnet', nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 }, rpcUrls: ['https://polygon-rpc.com'], blockExplorerUrls: ['https://polygonscan.com/'] }]
                    });
                    provider = new ethers.providers.Web3Provider(window.ethereum);
                } else return;
            }
        }

        signer = provider.getSigner();
        userAddress = await signer.getAddress();
        isAdmin = userAddress.toLowerCase() === ADMIN_ADDRESS.toLowerCase();

        messageContract = new ethers.Contract(MESSAGE_CONTRACT_ADDRESS, MESSAGE_ABI, signer);
        identityContract = new ethers.Contract(IDENTITY_CONTRACT_ADDRESS, IDENTITY_ABI, signer);

        document.getElementById('wallet-btn').style.display = 'none';

        if (!isRegistered(userAddress)) {
            openRegisterModal();
        } else {
            const account = getAccountData(userAddress);
            currentUsername = account.username || shortAddr(userAddress);
            openLoginModal();
        }
    } catch (e) {
        console.error('Init wallet error:', e);
        showToast('Ошибка инициализации: ' + e.message, 'error');
    }
}

// ====================== AUTH ======================
function openRegisterModal() { document.getElementById('register-modal').style.display = 'flex'; }
function openLoginModal() {
    const el = document.getElementById('login-greeting');
    if (el) el.textContent = currentUsername ? currentUsername + ', с возвращением!' : 'Вход в аккаунт';
    document.getElementById('login-modal').style.display = 'flex';
    setTimeout(() => document.getElementById('login-password-input').focus(), 100);
}

async function handleRegister() {
    const username = document.getElementById('reg-username-input').value.trim();
    const password = document.getElementById('reg-password-input').value;
    const confirm = document.getElementById('reg-password-confirm').value;
    if (!username || username.length < 2) { showToast('Логин минимум 2 символа', 'error'); return; }
    if (!password || password.length < 6) { showToast('Пароль минимум 6 символов', 'error'); return; }
    if (password !== confirm) { showToast('Пароли не совпадают', 'error'); return; }

    try {
        const key = await deriveMasterKey(password);
        const keyHash = Array.from(key).map(b => b.toString(16).padStart(2, '0')).join('');
        setAccountData(userAddress, { username, keyHash, createdAt: Date.now() });
        masterKey = key;
        currentUsername = username;
        isAuthenticated = true;
        closeModal('register-modal');
        showToast('Аккаунт создан! Ключи шифрования сгенерированы.', 'success');
        onAuthenticated();
    } catch (e) {
        showToast('Ошибка регистрации: ' + e.message, 'error');
    }
}

async function handleLogin() {
    const password = document.getElementById('login-password-input').value;
    if (!password) { showToast('Введите пароль', 'error'); return; }
    const valid = await verifyPassword(userAddress, password);
    if (!valid) {
        showToast('Неверный пароль', 'error');
        document.getElementById('login-password-input').value = '';
        document.getElementById('login-password-input').focus();
        return;
    }

    masterKey = await deriveMasterKey(password);
    const account = getAccountData(userAddress);
    currentUsername = account.username || shortAddr(userAddress);
    isAuthenticated = true;

    closeModal('login-modal');
    showToast('Добро пожаловать, ' + currentUsername + '!', 'success');
    onAuthenticated();
}

function onAuthenticated() {
    updateUserUI();
    contactsStore.load();
    renderChatList();
    renderWelcome();
    discoverChats();
    startPolling();
    contactsStore.list.forEach(c => {
        resolveAndUpdateContact(c.address).then(updated => {
            if (updated) renderChatList();
        });
    });
    handleContactFromUrl();
}

function handleContactFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const contactAddr = params.get('contact');
    if (contactAddr && ethers.utils.isAddress(contactAddr) && contactAddr.toLowerCase() !== userAddress.toLowerCase()) {
        const existing = contactsStore.find(contactAddr);
        if (!existing) {
            contactsStore.add({ address: contactAddr, name: shortAddr(contactAddr) });
            resolveAndUpdateContact(contactAddr).then(() => renderChatList());
            showToast('Контакт добавлен из ссылки', 'success');
        }
        selectChat(contactAddr);
        window.history.replaceState({}, '', window.location.pathname);
    }
}

// ====================== ADMIN PANEL ======================
function openAdminPanel(tab) {
    if (!isAdmin) { showToast('Доступ запрещён', 'error'); return; }
    document.getElementById('user-dropdown-menu').classList.add('hidden');
    const modal = document.getElementById('admin-modal');
    modal.style.display = 'flex';

    const addrEl = document.getElementById('admin-owner-addr-val');
    if (addrEl) addrEl.textContent = shortAddr(ADMIN_ADDRESS);

    switchAdminTab(tab || 'escrow');

    if (tab === 'stats') adminLoadStats();
    if (tab === 'monetization') adminLoadMonetization();
}

function switchAdminTab(tab, btn) {
    document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.admin-tab-content').forEach(c => c.classList.remove('active'));
    const content = document.getElementById('admin-tab-' + tab);
    if (content) content.classList.add('active');

    if (btn) {
        btn.classList.add('active');
    } else {
        document.querySelectorAll('.admin-tab').forEach(t => {
            if (t.getAttribute('onclick') && t.getAttribute('onclick').includes("'" + tab + "'")) t.classList.add('active');
        });
    }

    if (tab === 'stats') adminLoadStats();
    if (tab === 'monetization') adminLoadMonetization();
}

// KEY ESCROW
function adminLookupUser() {
    const addr = document.getElementById('escrow-addr-input').value.trim();
    if (!addr || !ethers.utils.isAddress(addr)) {
        showToast('Введите корректный адрес', 'error'); return;
    }
    const account = getAccountData(addr);
    const infoEl = document.getElementById('escrow-user-info');

    if (!account) {
        showToast('Пользователь не найден в локальной базе', 'error');
        infoEl.style.display = 'none';
        return;
    }

    infoEl.style.display = 'block';
    const avatarEl = document.getElementById('escrow-user-avatar');
    const colors = getAvatarColor(addr);
    avatarEl.style.background = 'linear-gradient(135deg,' + colors[0] + ',' + colors[1] + ')';
    avatarEl.textContent = getInitials(account.username || shortAddr(addr));

    document.getElementById('escrow-user-name').textContent = account.username || shortAddr(addr);
    document.getElementById('escrow-user-addr').textContent = shortAddr(addr);
    document.getElementById('escrow-user-date').textContent = 'Зарегистрирован: ' + new Date(account.createdAt || 0).toLocaleDateString('ru-RU');

    const statusEl = document.getElementById('escrow-user-status');
    const tier = getPremiumTier(addr);
    statusEl.textContent = tier === 'free' ? 'Free' : tier.toUpperCase();
    statusEl.className = 'admin-user-status status-' + tier;
}

async function adminResetUserKey() {
    const addr = document.getElementById('escrow-addr-input').value.trim();
    const newPassword = document.getElementById('escrow-new-password').value;
    if (!addr || !ethers.utils.isAddress(addr)) { showToast('Адрес не найден', 'error'); return; }
    if (!newPassword || newPassword.length < 6) { showToast('Пароль минимум 6 символов', 'error'); return; }
    if (!confirm('Сбросить ключ шифрования для ' + shortAddr(addr) + '? Операция необратима.')) return;

    try {
        const newKey = await deriveMasterKey(newPassword, addr);
        const keyHash = Array.from(newKey).map(b => b.toString(16).padStart(2, '0')).join('');

        const account = getAccountData(addr);
        account.keyHash = keyHash;
        account.resetAt = Date.now();
        account.resetBy = userAddress;
        setAccountData(addr, account);

        document.getElementById('escrow-new-password').value = '';
        showToast('Ключ сброшен. Пользователь может войти с новым паролем.', 'success');
    } catch (e) {
        showToast('Ошибка сброса ключа: ' + e.message, 'error');
    }
}

// MONETIZATION
function getPremiumData() {
    try {
        const raw = localStorage.getItem('w3m_premium');
        return raw ? JSON.parse(raw) : {};
    } catch(e) { return {}; }
}

function setPremiumData(data) {
    localStorage.setItem('w3m_premium', JSON.stringify(data));
}

function getPremiumTier(addr) {
    const data = getPremiumData();
    return (data[addr.toLowerCase()] || {}).tier || 'free';
}

function adminLoadMonetization() {
    const premium = getPremiumData();
    const tiers = Object.values(premium);
    const premiumCount = tiers.filter(t => t.tier !== 'free').length;
    const allAccounts = Object.keys(localStorage).filter(k => k.startsWith('w3m_account_')).length;
    document.getElementById('mon-total-accounts').textContent = allAccounts;
    document.getElementById('mon-premium-count').textContent = premiumCount;

    const listEl = document.getElementById('premium-list');
    if (Object.keys(premium).length === 0) {
        listEl.innerHTML = '<div style="text-align:center;padding:16px;color:var(--text-muted);font-size:13px;">Нет активных премиум-статусов</div>';
        return;
    }

    listEl.innerHTML = Object.entries(premium).map(([addr, info]) => {
        if (!info.tier || info.tier === 'free') return '';
        const colors = getAvatarColor(addr);
        const account = getAccountData(addr);
        const name = account ? account.username : shortAddr(addr);
        return '<div class="admin-premium-item">' +
            '<div class="admin-user-avatar" style="background:linear-gradient(135deg,' + colors[0] + ',' + colors[1] + ');width:32px;height:32px;font-size:12px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;">' + getInitials(name) + '</div>' +
            '<div style="flex:1"><div style="font-size:13px;font-weight:600;color:var(--text-main)">' + escHtml(name) + '</div><div style="font-size:11px;color:var(--text-muted)">' + shortAddr(addr) + '</div></div>' +
            '<div class="admin-tier-badge tier-' + info.tier + '">' + info.tier.toUpperCase() + '</div>' +
            '<button onclick="adminRevokePremium(\'' + addr + '\')" style="background:none;border:none;cursor:pointer;color:var(--red);padding:4px;font-size:16px;" title="Отозвать">&times;</button>' +
        '</div>';
    }).join('');
}

function adminSetPremium() {
    const addr = document.getElementById('premium-addr-input').value.trim();
    const tier = document.getElementById('premium-tier-select').value;
    if (!addr || !ethers.utils.isAddress(addr)) { showToast('Введите корректный адрес', 'error'); return; }

    const data = getPremiumData();
    data[addr.toLowerCase()] = { tier, setAt: Date.now(), setBy: userAddress };
    setPremiumData(data);

    document.getElementById('premium-addr-input').value = '';
    showToast('Статус ' + tier.toUpperCase() + ' установлен', 'success');
    adminLoadMonetization();
}

function adminRevokePremium(addr) {
    const data = getPremiumData();
    if (data[addr.toLowerCase()]) {
        data[addr.toLowerCase()].tier = 'free';
        setPremiumData(data);
        adminLoadMonetization();
        showToast('Статус отозван', 'info');
    }
}

// STATS
async function adminLoadStats() {
    const el = document.getElementById('stats-block');
    const netInfo = document.getElementById('stats-network-info');
    if (el) el.textContent = '...';
    if (netInfo) netInfo.textContent = '';
    try {
        if (!provider) { if (el) el.textContent = 'Нет соединения'; return; }
        const block = await provider.getBlockNumber();
        const balance = await provider.getBalance(ADMIN_ADDRESS);
        const balEth = parseFloat(ethers.utils.formatEther(balance)).toFixed(4);

        if (el) el.textContent = block.toLocaleString();
        if (netInfo) netInfo.innerHTML = 
            '<div class="admin-net-row"><span>Баланс Owner</span><span class="accent">' + balEth + ' MATIC</span></div>' +
            '<div class="admin-net-row"><span>RPC</span><span>polygon-rpc.com</span></div>' +
            '<div class="admin-net-row"><span>Локальных аккаунтов</span><span>' + Object.keys(localStorage).filter(k => k.startsWith('w3m_account_')).length + '</span></div>';
    } catch (e) {
        if (el) el.textContent = 'Ошибка';
        console.error('Stats error:', e);
    }
}

// BROADCAST
function adminPreviewBroadcast() {
    const title = document.getElementById('bc-title-input').value.trim();
    const text = document.getElementById('bc-text-input').value.trim();
    const type = document.querySelector('input[name="bc-type"]:checked')?.value || 'info';
    if (!title || !text) { showToast('Заполните заголовок и текст', 'error'); return; }

    const preview = document.getElementById('bc-preview');
    const icons = { info: 'ℹ️', warning: '⚠️', critical: '🚨' };
    preview.style.display = 'block';
    preview.innerHTML = '<div class="bc-preview-card bc-' + type + '">' +
        '<div class="bc-preview-header">' + icons[type] + ' ' + escHtml(title) + '</div>' +
        '<div class="bc-preview-body">' + escHtml(text) + '</div>' +
        '<div class="bc-preview-footer">От: ' + currentUsername + ' (' + shortAddr(userAddress) + ') · Сейчас</div>' +
    '</div>';
}

async function adminSendBroadcast() {
    const title = document.getElementById('bc-title-input').value.trim();
    const text = document.getElementById('bc-text-input').value.trim();
    const type = document.querySelector('input[name="bc-type"]:checked')?.value || 'info';
    if (!title || !text) { showToast('Заполните заголовок и текст', 'error'); return; }
    if (!confirm('Отправить broadcast всем пользователям? Это потребует подписи транзакции.')) return;

    const payload = JSON.stringify({ type: 'broadcast', msgType: type, title, body: text, from: userAddress, ts: Date.now() });

    try {
        showToast('Подписание broadcast...', 'info');
        const sig = await signer.signMessage(payload);
        const saved = JSON.parse(localStorage.getItem('w3m_broadcasts') || '[]');
        saved.unshift({ type: 'broadcast', msgType: type, title, body: text, from: userAddress, ts: Date.now(), sig });
        localStorage.setItem('w3m_broadcasts', JSON.stringify(saved.slice(0, 50)));

        document.getElementById('bc-title-input').value = '';
        document.getElementById('bc-text-input').value = '';
        document.getElementById('bc-preview').style.display = 'none';
        showToast('Broadcast подписан и сохранён', 'success');
    } catch (e) {
        if (e.code === 4001) showToast('Подпись отклонена', 'error');
        else showToast('Ошибка: ' + e.message, 'error');
    }
}

// ====================== PROFILE & CONTACTS ======================
function setFolder(f) {
    store.currentFolder = f;
    store.currentChat = null;
    document.querySelectorAll('.sb-icon[data-folder]').forEach(el => {
        el.classList.toggle('active', el.dataset.folder === f);
    });
    const titles = { all: 'Все чаты', personal: 'Личное', work: 'Работа' };
    document.getElementById('folder-title').textContent = titles[f] || 'Чаты';
    renderChatList();
    renderWelcome();
}

function filterChatList() { renderChatList(); }
function addContactFromInput() {
    const input = document.getElementById('add-contact-input');
    addContact(input.value.trim());
    input.value = '';
}
function addContactFromModal() {
    const input = document.getElementById('contacts-add-input');
    addContact(input.value.trim());
    input.value = '';
    renderContactsList();
}
function addContact(addr) {
    if (!addr || !ethers.utils.isAddress(addr)) { showToast('Введите корректный Ethereum адрес', 'error'); return; }
    if (addr.toLowerCase() === userAddress?.toLowerCase()) { showToast('Нельзя добавить себя', 'error'); return; }
    const added = contactsStore.add({ address: addr, name: shortAddr(addr) });
    if (added) {
        showToast('Контакт добавлен', 'success');
        renderChatList();
        resolveAndUpdateContact(addr).then(updated => {
            if (updated) renderChatList();
        });
    }
    else showToast('Контакт уже существует', 'info');
}

function toggleUserMenu() {
    const menu = document.getElementById('user-dropdown-menu');
    menu.classList.toggle('hidden');
    if (!menu.classList.contains('hidden')) {
        setTimeout(() => document.addEventListener('click', closeUserMenuOnClick, { once: true }), 10);
    }
}

function closeUserMenuOnClick(e) {
    const menu = document.getElementById('user-dropdown-menu');
    if (!menu.contains(e.target) && e.target.id !== 'user-avatar-btn') menu.classList.add('hidden');
}

function openProfileModal() {
    document.getElementById('user-dropdown-menu').classList.add('hidden');
    const modal = document.getElementById('profile-modal');
    modal.style.display = 'flex';
    renderAvatarCircle(document.getElementById('profile-avatar-large'), currentUsername, userAddress);
    document.getElementById('profile-username-display').textContent = currentUsername;
    document.getElementById('profile-address-display').textContent = shortAddr(userAddress);
    document.getElementById('profile-username-edit').value = currentUsername;
}

function saveProfile() {
    const newName = document.getElementById('profile-username-edit').value.trim();
    if (!newName || newName.length < 2) { showToast('Имя минимум 2 символа', 'error'); return; }
    currentUsername = newName;
    const account = getAccountData(userAddress);
    account.username = newName;
    setAccountData(userAddress, account);
    updateUserUI();
    closeModal('profile-modal');
    showToast('Профиль обновлён', 'success');
}

function openContactsModal() {
    document.getElementById('user-dropdown-menu').classList.add('hidden');
    document.getElementById('contacts-modal').style.display = 'flex';
    renderContactsList();
}

function renderContactsList() {
    const list = document.getElementById('contacts-list');
    if (contactsStore.list.length === 0) {
        list.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted);">Нет контактов</div>';
        return;
    }
    list.innerHTML = contactsStore.list.map(c => {
        const colors = getAvatarColor(c.address);
        return '<div class="contact-item">' +
            '<div class="contact-item-avatar" style="background:linear-gradient(135deg,' + colors[0] + ',' + colors[1] + ')">' + getInitials(c.name) + '</div>' +
            '<div class="contact-item-info">' +
                '<div class="contact-item-name">' + escHtml(c.name) + '</div>' +
                '<div class="contact-item-addr">' + c.address + '</div>' +
            '</div>' +
            '<button class="contact-item-remove" onclick="removeContact(\'' + c.address + '\')">×</button>' +
        '</div>';
    }).join('');
}

function removeContact(addr) {
    contactsStore.remove(addr);
    renderContactsList();
    renderChatList();
    showToast('Контакт удалён', 'info');
}

function openSettingsModal() { document.getElementById('settings-modal').style.display = 'flex'; }

function resetAccount() {
    if (!userAddress) return;
    if (!confirm('Удалить все локальные данные аккаунта?')) return;
    localStorage.removeItem('w3m_account_' + userAddress.toLowerCase());
    localStorage.removeItem('w3m_contacts_' + userAddress.toLowerCase());
    showToast('Аккаунт сброшен', 'info');
    setTimeout(() => location.reload(), 500);
}

function openPeerProfile() {
    if (!store.currentChat) return;
    const name = contactsStore.getName(store.currentChat);
    showToast(name + ' (' + shortAddr(store.currentChat) + ')', 'info');
}

async function refreshChats() {
    if (!isAuthenticated) { showToast('Сначала войдите в аккаунт', 'error'); return; }
    showToast('Обновление...', 'info');
    await discoverChats();
    if (store.currentChat) await loadMessages(store.currentChat);
    showToast('Обновлено', 'success');
}

function closeModal(id) { document.getElementById(id).style.display = 'none'; }
function closeModalOnBg(e, id) { if (e.target.id === id) closeModal(id); }

function logout() {
    stopPolling();
    masterKey = null; isAuthenticated = false; isAdmin = false;
    userAddress = null; currentUsername = '';
    store.currentChat = null; store.messages = {};
    contactsStore.list = [];
    location.reload();
}

// ====================== SHARE ======================
const SHARE_BASE_URL = 'https://chat.aliterra.space/';

function getShareUrl() {
    return SHARE_BASE_URL + '?contact=' + encodeURIComponent(userAddress);
}

function getShareText() {
    const name = currentUsername || shortAddr(userAddress);
    return name + ' — напишите мне в Web3 Messenger!\n' + getShareUrl();
}

function openShareModal() {
    document.getElementById('user-dropdown-menu').classList.add('hidden');
    if (!userAddress) { showToast('Сначала подключите кошелёк', 'error'); return; }

    const modal = document.getElementById('share-modal');
    modal.style.display = 'flex';

    renderAvatarCircle(document.getElementById('share-avatar-lg'), currentUsername, userAddress);
    document.getElementById('share-username').textContent = currentUsername || shortAddr(userAddress);
    document.getElementById('share-address-full').textContent = userAddress;
    document.getElementById('share-link-display').textContent = getShareUrl();

    generateQR();
}

function generateQR() {
    const qrEl = document.getElementById('share-qr');
    const url = getShareUrl();
    const size = 180;
    const qrApiUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=' + size + 'x' + size + '&data=' + encodeURIComponent(url) + '&bgcolor=ffffff&color=000000&margin=0';
    qrEl.innerHTML = '<img src="' + qrApiUrl + '" width="' + size + '" height="' + size + '" alt="QR" style="border-radius:8px;display:block;" />';
}

function copyShareLink() {
    navigator.clipboard.writeText(getShareUrl()).then(() => {
        showToast('Ссылка скопирована', 'success');
    }).catch(() => {
        const ta = document.createElement('textarea');
        ta.value = getShareUrl();
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
        showToast('Ссылка скопирована', 'success');
    });
}

function copyAddress() {
    navigator.clipboard.writeText(userAddress).then(() => {
        showToast('Адрес скопирован', 'success');
    }).catch(() => {
        showToast('Не удалось скопировать', 'error');
    });
}

function shareToTelegram() {
    window.open('https://t.me/share/url?url=' + encodeURIComponent(getShareUrl()) + '&text=' + encodeURIComponent(getShareText()), '_blank');
}

function shareToWhatsApp() {
    window.open('https://wa.me/?text=' + encodeURIComponent(getShareText()), '_blank');
}

function shareToX() {
    window.open('https://twitter.com/intent/tweet?text=' + encodeURIComponent(getShareText()), '_blank');
}

function shareToFacebook() {
    window.open('https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(getShareUrl()), '_blank');
}

// ====================== GLOBAL EXPORTS ======================
window.connectWallet = connectWallet;
window.sendMessage = sendMessage;
window.setFolder = setFolder;
window.selectChat = selectChat;
window.handleRegister = handleRegister;
window.handleLogin = handleLogin;
window.logout = logout;
window.toggleUserMenu = toggleUserMenu;
window.openProfileModal = openProfileModal;
window.openContactsModal = openContactsModal;
window.openSettingsModal = openSettingsModal;
window.openAdminPanel = openAdminPanel;
window.switchAdminTab = switchAdminTab;
window.openPeerProfile = openPeerProfile;
window.closeModal = closeModal;
window.closeModalOnBg = closeModalOnBg;
window.addContactFromInput = addContactFromInput;
window.addContactFromModal = addContactFromModal;
window.removeContact = removeContact;
window.refreshChats = refreshChats;
window.filterChatList = filterChatList;
window.saveProfile = saveProfile;
window.resetAccount = resetAccount;
window.adminLookupUser = adminLookupUser;
window.adminResetUserKey = adminResetUserKey;
window.adminSetPremium = adminSetPremium;
window.adminRevokePremium = adminRevokePremium;
window.adminLoadStats = adminLoadStats;
window.adminPreviewBroadcast = adminPreviewBroadcast;
window.adminSendBroadcast = adminSendBroadcast;
window.toggleAddContact = toggleAddContact;
window.setFilter = setFilter;
window.deleteChat = deleteChat;
window.startPolling = startPolling;
window.stopPolling = stopPolling;
window.openShareModal = openShareModal;
window.copyShareLink = copyShareLink;
window.copyAddress = copyAddress;
window.shareToTelegram = shareToTelegram;
window.shareToWhatsApp = shareToWhatsApp;
window.shareToX = shareToX;
window.shareToFacebook = shareToFacebook;

document.addEventListener('DOMContentLoaded', () => {
    console.log('Web3 Messenger v10.2 loaded');
    renderWelcome();
    if (window.ethereum) {
        window.ethereum.on('accountsChanged', () => location.reload());
        window.ethereum.on('chainChanged', () => location.reload());
        window.ethereum.request({ method: 'eth_accounts' }).then(accounts => {
            if (accounts && accounts.length > 0) initWallet();
        });
    }
});

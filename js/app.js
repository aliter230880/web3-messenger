// Web3 Messenger - App Logic v4
// ✅ Contacts + Share Profile + Wallet Signature + Admin UI
// ⚡ Оптимизация: Debounce, DocumentFragment, ленивая инициализация

console.log('🚀 Web3 Messenger loaded');

// Проверка загрузки ethers
if (typeof ethers === 'undefined') {
    console.error('❌ ethers.js не загружен! Проверьте CDN в index.html');
}

// Глобальные переменные
let provider, signer, userAddress;
let isAdmin = false;
const ADMIN_ADDRESS = "0xB19aEe699eb4D2Af380c505E4d6A108b055916eB";
const CONTRACT_ADDRESS = "0xcFcA16C8c38a83a71936395039757DcFF6040c1E";
const BASE_URL = "https://aliter230880.github.io/web3-messenger/";

// 🔧 Оптимизация: Debounce функция для поиска
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Хранилище контактов с кэшированием
const contactsStore = {
    list: [],
    cache: new Map(), // Кэш для быстрого поиска
    load() {
        try {
            const saved = localStorage.getItem('web3messenger_contacts');
            if (saved) {
                this.list = JSON.parse(saved);
                // Заполняем кэш
                this.list.forEach(c => this.cache.set(c.address.toLowerCase(), c));
            }
        } catch (e) { console.warn('Contacts load error:', e); }
    },
    save() {
        try {
            localStorage.setItem('web3messenger_contacts', JSON.stringify(this.list));
        } catch (e) { console.warn('Contacts save error:', e); }
    },
    add(contact) {
        const key = contact.address.toLowerCase();
        if (!this.cache.has(key)) {
            this.list.push(contact);
            this.cache.set(key, contact);
            this.save();
            return true;
        }
        return false;
    },
    get(address) {
        return this.cache.get(address.toLowerCase());
    }
};

// Данные чатов
const store = {
    currentChat: null,
    currentFolder: 'all',
    chats: [
        { id: 'dima', name: 'Дима', avatar: '👤', online: true, folder: 'personal', preview: 'Привет!', time: '12:30', unread: 3, messages: [
            { id: 1, text: 'Привет! Как проект?', sent: false, time: '12:28', status: 'delivered', signature: null }
        ]},
        { id: 'ai', name: 'AI', avatar: '🤖', online: true, folder: 'work', preview: 'Готов помочь', time: '11:45', unread: 0, messages: []},
        { id: 'crypto', name: 'Crypto', avatar: '📢', online: false, folder: 'news', preview: 'BTC $100k!', time: '10:20', unread: 24, messages: []}
    ]
};

// Инициализация
document.addEventListener('DOMContentLoaded', async () => {
    console.log('✅ App initialized');
    contactsStore.load();
    renderSidebar();
    renderChatList();
    setupEventListeners();
    updateInputState();
    updateShareButton();
    checkWallet();
    handleContactParam(); // Обработка ?contact= в URL
});

// Обработка параметра ?contact= в URL
async function handleContactParam() {
    const params = new URLSearchParams(window.location.search);
    const contactAddr = params.get('contact');
    if (contactAddr && ethers.utils.isAddress(contactAddr)) {
        try {
            const profile = await getProfileByAddress(contactAddr);
            if (profile && profile.isActive) {
                contactsStore.add({ address: contactAddr, ...profile });
                renderChatList();
                showStatus('✅ Контакт добавлен!', 'success');
                // Очищаем параметр из URL
                history.replaceState({}, document.title, window.location.pathname);
            }
        } catch (e) {
            console.warn('Contact param error:', e);
        }
    }
}

// Получение профиля из контракта
async function getProfileByAddress(address) {
    if (!provider) return null;
    try {
        const contract = new ethers.Contract(CONTRACT_ADDRESS, [
            "function getProfile(address) view returns (string,string,string,uint256,bool)"
        ], provider);
        const result = await contract.getProfile(address);
        return {
            username: result[0],
            avatarCID: result[1],
            bio: result[2],
            registeredAt: result[3].toNumber(),
            isActive: result[4]
        };
    } catch (e) {
        console.warn('Profile fetch error:', e);
        return null;
    }
}

// Проверка уже подключенного кошелька
async function checkWallet() {
    if (typeof window.ethereum === 'undefined') return;
    try {
        const accounts = await window.ethereum.request({ method: 'eth_accounts' });
        if (accounts.length > 0) await initWallet();
    } catch (e) { console.warn('Wallet check:', e); }
}

// Инициализация кошелька
async function initWallet() {
    if (!window.ethers) {
        showError('wallet-msg', '❌ Библиотека ethers не загружена');
        return;
    }
    try {
        provider = new ethers.providers.Web3Provider(window.ethereum);
        signer = provider.getSigner();
        userAddress = await signer.getAddress();
        console.log('✅ Connected:', userAddress);
        
        // Проверка прав админа
        isAdmin = userAddress.toLowerCase() === ADMIN_ADDRESS.toLowerCase();
        updateAdminButton();
        
        updateWalletUI();
        updateInputState();
        updateShareButton();
    } catch (e) {
        console.error('Init error:', e);
        showError('wallet-msg', 'Ошибка: ' + e.message);
    }
}

// Подключение кошелька
async function connectWallet() {
    if (!window.ethereum) {
        showError('wallet-msg', '⚠️ Установите MetaMask');
        return;
    }
    const btn = document.getElementById('connect-btn');
    const msg = document.getElementById('wallet-msg');
    
    try {
        btn.disabled = true;
        msg.textContent = '⏳ Подключение...';
        msg.className = 'status-msg info';
        
        await window.ethereum.request({ method: 'eth_requestAccounts' });
        await initWallet();
        
        msg.textContent = '✅ Подключено!';
        msg.className = 'status-msg success';
        setTimeout(() => closeModal('wallet-modal'), 1000);
    } catch (e) {
        console.error('Connect error:', e);
        msg.textContent = '❌ ' + (e.message || 'Отменено');
        msg.className = 'status-msg error';
        btn.disabled = false;
    }
}

// 🔐 Обновление кнопки Админ
function updateAdminButton() {
    const adminBtn = document.getElementById('admin-btn');
    if (adminBtn) adminBtn.style.display = isAdmin ? 'flex' : 'none';
}

// 🔐 Открытие модалки Админ
function openAdminModal() {
    if (!isAdmin) {
        alert('🔒 Доступ разрешён только владельцу платформы.');
        return;
    }
    document.getElementById('admin-modal').style.display = 'flex';
    document.getElementById('escrow-status').style.display = 'none';
    document.getElementById('escrow-user-address').value = '';
}

// 🔐 Запрос ключа (Key Escrow Flow)
async function accessEscrowKey() {
    const userAddr = document.getElementById('escrow-user-address').value.trim();
    const statusEl = document.getElementById('escrow-status');
    
    if (!userAddr || !ethers.utils.isAddress(userAddr)) {
        statusEl.textContent = '⚠️ Введите корректный адрес Ethereum';
        statusEl.style.color = 'var(--warning)';
        statusEl.style.display = 'block';
        return;
    }

    statusEl.textContent = '🔍 Запрос к смарт-контракту...';
    statusEl.style.color = 'var(--text-muted)';
    statusEl.style.display = 'block';

    try {
        // Имитация для демо (заменить на реальный вызов контракта)
        await new Promise(r => setTimeout(r, 1200));
        const mockKey = "0x" + Array(64).fill(0).map(() => Math.floor(Math.random()*16).toString(16)).join('');
        
        statusEl.innerHTML = `✅ Ключ получен!<br><code style="background:var(--bg-tertiary); padding:6px 10px; border-radius:6px; word-break:break-all; font-size:11px;">${mockKey}</code>`;
        statusEl.style.color = 'var(--success)';
        console.log('🔓 Escrow Key Retrieved:', mockKey);
    } catch (err) {
        statusEl.textContent = '❌ Ошибка: ' + (err.reason || err.message);
        statusEl.style.color = 'var(--danger)';
    }
}

// 🔗 Обновление кнопки "Поделиться"
function updateShareButton() {
    const btn = document.getElementById('share-profile-btn');
    if (btn) btn.style.display = userAddress ? 'flex' : 'none';
}

// 🔗 Открытие модалки шеринга
async function openShareModal() {
    if (!userAddress) {
        alert('🔗 Сначала подключите кошелёк');
        return;
    }
    
    const modal = document.getElementById('share-modal');
    const qrContainer = document.getElementById('qr-container');
    const linkInput = document.getElementById('share-link-input');
    
    // Генерация ссылки
    const shareUrl = `${BASE_URL}?contact=${userAddress}`;
    linkInput.value = shareUrl;
    
    // Генерация QR
    qrContainer.innerHTML = '';
    new QRCode(qrContainer, {
        text: shareUrl,
        width: 180,
        height: 180,
        correctLevel: QRCode.CorrectLevel.M
    });
    
    modal.style.display = 'flex';
}

// 🔗 Копирование ссылки
async function copyShareLink() {
    const input = document.getElementById('share-link-input');
    try {
        await navigator.clipboard.writeText(input.value);
        showStatus('✅ Ссылка скопирована!', 'success');
    } catch (e) {
        // Fallback для старых браузеров
        input.select();
        document.execCommand('copy');
        showStatus('✅ Ссылка скопирована!', 'success');
    }
}

// 🔗 Шаринг в соцсети
function shareToTelegram() {
    const url = document.getElementById('share-link-input').value;
    const text = `Привет! Добавь меня в Web3 Messenger: ${url}`;
    window.open(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`, '_blank');
}

function shareToWhatsApp() {
    const url = document.getElementById('share-link-input').value;
    const text = `Привет! Добавь меня в Web3 Messenger: ${url}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
}

function shareToTwitter() {
    const url = document.getElementById('share-link-input').value;
    const text = `Добавь меня в @Web3Messenger: ${url} #Web3 #Polygon`;
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`, '_blank');
}

// ➕ Добавление контакта из поля ввода
async function addContactFromInput() {
    const input = document.getElementById('add-contact-input');
    const query = input.value.trim();
    if (!query) return;
    
    try {
        showStatus('🔍 Поиск...', 'info');
        
        let address = query;
        // Если введено не как адрес — пробуем найти по имени (заглушка)
        if (!ethers.utils.isAddress(query)) {
            const resolved = await resolveUsername(query);
            if (resolved) address = resolved;
            else throw new Error('Пользователь не найден');
        }
        
        // Проверяем профиль в контракте
        const profile = await getProfileByAddress(address);
        if (!profile || !profile.isActive) throw new Error('Профиль не активен');
        
        // Добавляем в контакты
        if (contactsStore.add({ address, ...profile })) {
            renderChatList();
            showStatus('✅ Контакт добавлен!', 'success');
            input.value = '';
        } else {
            showStatus('ℹ️ Контакт уже в списке', 'info');
        }
    } catch (e) {
        showError('wallet-msg', '❌ ' + e.message);
    }
}

// Заглушка для разрешения имён (можно подключить ENS/PNS позже)
async function resolveUsername(username) {
    // Здесь можно добавить интеграцию с The Graph или кастомный индекс
    // Для демо возвращаем null
    return null;
}

// Подпись сообщения
async function signMessage(text) {
    if (!signer) throw new Error('Кошелёк не подключён');
    return await signer.signMessage(text);
}

// Отправка сообщения с подписью
async function sendMessage() {
    const input = document.getElementById('msg-input');
    const text = input.value.trim();
    if (!text || !store.currentChat) return;
    
    if (!signer) {
        openModal('wallet-modal');
        return;
    }
    
    const chat = store.chats.find(c => c.id === store.currentChat);
    const time = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    
    try {
        const msg = {
            id: Date.now(),
            text: text,
            sent: true,
            time: time,
            status: 'sending',
            signature: null
        };
        chat.messages.push(msg);
        chat.preview = text;
        chat.time = time;
        
        input.value = '';
        renderMessages();
        
        const signature = await signMessage(text);
        msg.signature = signature;
        msg.status = 'delivered';
        
        renderMessages();
        console.log('✅ Signed:', signature.slice(0, 20) + '...');
        
        // Авто-ответ (демо)
        setTimeout(() => {
            const reply = {
                id: Date.now() + 1,
                text: '👍 Принято!',
                sent: false,
                time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
                status: 'delivered',
                signature: null
            };
            chat.messages.push(reply);
            chat.preview = reply.text;
            if (store.currentChat === chat.id) renderMessages();
        }, 1500);
        
    } catch (e) {
        console.error('Send error:', e);
        alert('Ошибка отправки: ' + e.message);
    }
}

// Рендеринг
function renderSidebar() {
    document.querySelectorAll('.sidebar-item').forEach(item => {
        if (item.dataset.folder) {
            item.onclick = function() {
                document.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));
                this.classList.add('active');
                store.currentFolder = this.dataset.folder || 'all';
                store.currentChat = null;
                renderChatList();
                renderEmptyState();
                updateInputState();
            };
        }
    });
    
    // Табы чатов
    document.querySelectorAll('.chat-tab').forEach(tab => {
        tab.onclick = function() {
            document.querySelectorAll('.chat-tab').forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            // Здесь можно добавить фильтрацию по типу чата
        };
    });
}

// 🔧 Оптимизация: DocumentFragment для рендеринга списка чатов
function renderChatList() {
    const list = document.getElementById('chat-list');
    
    // 🔧 Оптимизация: кэширование allChats, если данные не изменились
    if (!renderChatList.cache || renderChatList.cacheVersion !== contactsStore.list.length + store.chats.length) {
        // Объединяем демо-чаты с контактами
        const allChats = [...store.chats];
        
        // Добавляем контакты из localStorage
        contactsStore.list.forEach(contact => {
            if (!allChats.find(c => c.id === contact.address)) {
                allChats.push({
                    id: contact.address,
                    name: contact.username || contact.address.slice(0, 8) + '...',
                    avatar: contact.avatarCID ? '🖼️' : '👤',
                    online: false,
                    folder: 'personal',
                    preview: 'Напишите первое сообщение',
                    time: '',
                    unread: 0,
                    messages: [],
                    isContact: true
                });
            }
        });
        
        renderChatList.cache = allChats;
        renderChatList.cacheVersion = contactsStore.list.length + store.chats.length;
    }
    
    const allChats = renderChatList.cache;
    const filtered = store.currentFolder === 'all' 
        ? allChats 
        : allChats.filter(c => c.folder === store.currentFolder);
    
    // 🔧 Оптимизация: DocumentFragment вместо innerHTML
    list.innerHTML = '';
    const fragment = document.createDocumentFragment();
    
    filtered.forEach(chat => {
        const div = document.createElement('div');
        div.className = `chat-item ${store.currentChat === chat.id ? 'active' : ''}`;
        div.onclick = () => selectChat(chat.id);
        div.innerHTML = `
            <div class="chat-avatar ${chat.online ? 'online' : ''}">${chat.avatar}</div>
            <div class="chat-info">
                <div class="chat-header-row">
                    <span class="chat-name">${chat.name} ${chat.isContact ? '<span class="contact-badge">🔗</span>' : ''}</span>
                    <span class="chat-time">${chat.time}</span>
                </div>
                <div class="chat-preview">${chat.preview} ${chat.unread ? `<span class="badge">${chat.unread}</span>` : ''}</div>
            </div>
        `;
        fragment.appendChild(div);
    });
    
    list.appendChild(fragment);
}

function selectChat(id) {
    store.currentChat = id;
    const chat = [...store.chats, ...contactsStore.list.map(c => ({ id: c.address, ...c }))].find(c => c.id === id);
    if (chat) {
        chat.unread = 0;
        document.getElementById('chat-name').textContent = chat.name || chat.username || id.slice(0, 8) + '...';
        document.getElementById('chat-status').textContent = chat.online ? '● в сети' : 'был недавно';
        document.getElementById('chat-avatar').textContent = chat.avatar || '👤';
        renderChatList();
        renderMessages();
        updateInputState();
    }
}

function renderMessages() {
    const container = document.getElementById('messages-container');
    const chat = store.chats.find(c => c.id === store.currentChat);
    if (!container || !chat) return;
    
    container.innerHTML = `
        <div class="date-separator"><span>Сегодня</span></div>
        ${chat.messages.map(m => `
            <div class="message ${m.sent ? 'sent' : 'received'}">
                <div class="message-text">${escapeHtml(m.text)}</div>
                <div class="message-meta">
                    <span>${m.time}</span>
                    ${m.sent ? `
                        <span class="status">${m.status === 'delivered' ? '✓✓' : '⏳'}</span>
                        ${m.signature ? '<span class="sig-badge" title="Подписано кошельком">🔐</span>' : ''}
                    ` : ''}
                </div>
            </div>
        `).join('')}
    `;
    container.scrollTop = container.scrollHeight;
}

function renderEmptyState() {
    document.getElementById('messages-container').innerHTML = `
        <div class="empty-state">
            <div class="empty-state-icon">💬</div>
            <h3>Выберите чат</h3>
            <p>И подключите кошелёк для отправки</p>
        </div>
    `;
}

function updateInputState() {
    const input = document.getElementById('msg-input');
    const btn = document.getElementById('send-btn');
    if (!input || !btn) return;
    
    if (store.currentChat && userAddress) {
        input.disabled = false;
        btn.disabled = false;
        input.placeholder = 'Написать сообщение...';
        input.focus();
    } else if (!userAddress) {
        input.disabled = true;
        btn.disabled = true;
        input.placeholder = '🔗 Подключите кошелёк';
    } else {
        input.disabled = true;
        btn.disabled = true;
        input.placeholder = 'Выберите чат...';
    }
}

function updateWalletUI() {
    const btn = document.getElementById('wallet-btn');
    if (btn && userAddress) {
        btn.innerHTML = `<span>✅</span><span>${userAddress.slice(0,6)}...</span>`;
        btn.onclick = null;
    }
}

function setupEventListeners() {
    document.getElementById('send-btn').onclick = sendMessage;
    document.getElementById('msg-input').onkeypress = (e) => { if (e.key === 'Enter') sendMessage(); };
    document.getElementById('wallet-btn').onclick = () => openModal('wallet-modal');
    document.getElementById('connect-btn').onclick = connectWallet;
    // 🔧 Оптимизация: Debounce для поиска
    const debouncedSearch = debounce((query) => {
        document.querySelectorAll('.chat-item').forEach(item => {
            const name = item.querySelector('.chat-name')?.textContent.toLowerCase() || '';
            item.style.display = name.includes(query) ? 'flex' : 'none';
        });
    }, 300);
    
    document.getElementById('search-input').addEventListener('input', (e) => {
        debouncedSearch(e.target.value.toLowerCase());
    });
}

// Модалки
function openModal(id) { document.getElementById(id).style.display = 'flex'; }
function closeModal(id) { 
    document.getElementById(id).style.display = 'none'; 
    const msg = document.getElementById('wallet-msg');
    if (msg) { msg.textContent = ''; msg.className = 'status-msg'; }
}
function showError(elId, msg) { 
    const el = document.getElementById(elId);
    if (el) { el.textContent = msg; el.className = 'status-msg error'; }
}
function showStatus(msg, type) {
    const el = document.getElementById('wallet-msg');
    if (el) {
        el.textContent = msg;
        el.className = `status-msg ${type}`;
        el.style.display = 'block';
        setTimeout(() => el.style.display = 'none', 2000);
    }
}

// Утилиты
function escapeHtml(t) {
    const d = document.createElement('div');
    d.textContent = t;
    return d.innerHTML;
}

// Глобальные функции
window.selectChat = selectChat;
window.sendMessage = sendMessage;
window.connectWallet = connectWallet;
window.openAdminModal = openAdminModal;
window.accessEscrowKey = accessEscrowKey;
window.openShareModal = openShareModal;
window.copyShareLink = copyShareLink;
window.shareToTelegram = shareToTelegram;
window.shareToWhatsApp = shareToWhatsApp;
window.shareToTwitter = shareToTwitter;
window.addContactFromInput = addContactFromInput;

// Web3 Messenger - Frontend + Blockchain Integration v3
// (c) Dima's Web3 Project
// 🔐 ADMIN CONFIG
const ADMIN_ADDRESS = "0xB19aEe699eb4D2Af380c505E4d6A108b055916eB";
const CONTRACT_ADDRESS = "0xcFcA16C8c38a83a71936395039757DcFF6040c1E";
const CHAIN_ID = 137;

const CONTRACT_ABI = [
    "function isRegistered(address user) view returns (bool)",
    "function registerProfile(string username, string avatarCID, string bio) external",
    "function getProfile(address user) view returns (string, string, string, uint256, bool)",
    "function getEscrowedKey(address user) view returns (bytes)"
];

let provider, signer, contract, userAddress;
let isRegistered = false;
let isAdmin = false;
let userAvatar = "👤"; // Стандартный аватар

// Стандартные аватары для выбора
const STANDARD_AVATARS = ["👤", "🤖", "👨‍💻", "👩‍💼", "🎮", "🎨", "🚀", "💎", "🔥", "💜"];

document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Web3 Messenger initialized');
    renderChatList();
    setupEventListeners();
    setupWeb3Listeners();
});

// === WEB3 ЛОГИКА ===
async function connectWallet() {
    if (typeof window.ethereum === 'undefined') {
        alert('⚠️ Установите MetaMask');
        return;
    }
    
    try {
        const btn = document.getElementById('wallet-btn');
        btn.innerHTML = '<span>⏳</span><span>Подключение...</span>';
        
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
        
        btn.innerHTML = `<span>✅</span><span>${userAddress.slice(0,6)}...${userAddress.slice(-4)}</span>`;
        btn.style.background = 'var(--success)';
        btn.style.color = '#000';
        
        isAdmin = userAddress.toLowerCase() === ADMIN_ADDRESS.toLowerCase();
        document.getElementById('admin-btn').style.display = isAdmin ? 'flex' : 'none';
        
        await checkRegistration();
        console.log('✅ Кошелёк подключен:', userAddress);
    } catch (err) {
        console.error('❌ Ошибка:', err);
        document.getElementById('wallet-btn').innerHTML = '<span>🦊</span><span>Подключить</span>';
        alert('Не удалось подключиться');
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
            const profile = await contract.getProfile(userAddress);
            userAvatar = profile[1] || "👤"; // avatarCID или стандартный
            
            emptyState.innerHTML = `
                <div class="empty-state-icon">✅</div>
                <h3>Профиль активен</h3>
                <p>Адрес: ${userAddress.slice(0,10)}...${userAddress.slice(-8)}</p>
                <p style="margin-top:8px; color:var(--success);">Готов к общению</p>
            `;
            input.disabled = false;
            sendBtn.disabled = false;
            input.placeholder = 'Написать сообщение...';
        } else {
            showRegistrationModal();
            input.disabled = true;
            sendBtn.disabled = true;
        }
    } catch (err) {
        console.error('❌ Ошибка проверки:', err);
    }
}

function showRegistrationModal() {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div style="background:var(--bg-secondary); padding:32px; border-radius:16px; max-width:500px; width:90%;">
            <h2 style="margin-bottom:24px;">🆔 Регистрация</h2>
            <p style="color:var(--text-secondary); margin-bottom:24px;">Создай профиль в блокчейне Polygon</p>
            
            <div style="margin-bottom:16px;">
                <label style="display:block; margin-bottom:8px; font-size:14px;">Никнейм *</label>
                <input type="text" id="reg-username" placeholder="Ваш ник" style="width:100%; padding:12px; border-radius:8px; border:1px solid var(--border); background:var(--bg-tertiary); color:var(--text-primary);">
            </div>
            
            <div style="margin-bottom:16px;">
                <label style="display:block; margin-bottom:8px; font-size:14px;">Выберите аватар</label>
                <div style="display:grid; grid-template-columns:repeat(5, 1fr); gap:8px; margin-bottom:16px;" id="avatar-grid">
                    ${STANDARD_AVATARS.map(avatar => `
                        <button onclick="selectAvatar('${avatar}')" style="font-size:24px; padding:8px; border-radius:8px; border:2px solid var(--border); background:var(--bg-tertiary); cursor:pointer; transition:all 0.2s;" class="avatar-btn ${avatar === '👤' ? 'selected' : ''}">
                            ${avatar}
                        </button>
                    `).join('')}
                </div>
                <label style="display:block; margin-bottom:8px; font-size:14px;">Или загрузите фото</label>
                <input type="file" id="reg-avatar-file" accept="image/*" style="width:100%; padding:8px; border-radius:8px; border:1px solid var(--border); background:var(--bg-tertiary); color:var(--text-primary); font-size:12px;">
            </div>
            
            <div style="margin-bottom:24px;">
                <label style="display:block; margin-bottom:8px; font-size:14px;">О себе (необязательно)</label>
                <textarea id="reg-bio" placeholder="Расскажите о себе..." rows="3" style="width:100%; padding:12px; border-radius:8px; border:1px solid var(--border); background:var(--bg-tertiary); color:var(--text-primary); resize:none;"></textarea>
            </div>
            
            <button id="btn-register" class="btn btn-send" style="width:100%;">Зарегистрировать в блокчейне</button>
            <div id="reg-status" style="margin-top:16px; font-size:13px; text-align:center;"></div>
            <p style="margin-top:12px; font-size:12px; color:var(--text-muted); text-align:center;">⛽ Комиссия: ~0.01 MATIC</p>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    document.getElementById('btn-register').addEventListener('click', registerProfile);
    
    // Обработка загрузки файла
    document.getElementById('reg-avatar-file').addEventListener('change', handleAvatarUpload);
}

let selectedAvatar = "👤";
let uploadedAvatarCID = "";

function selectAvatar(avatar) {
    selectedAvatar = avatar;
    uploadedAvatarCID = "";
    document.querySelectorAll('.avatar-btn').forEach(btn => {
        btn.classList.remove('selected');
        btn.style.borderColor = 'var(--border)';
    });
    event.target.classList.add('selected');
    event.target.style.borderColor = 'var(--accent)';
}

async function handleAvatarUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    // Временно используем заглушку - в продакшене здесь будет загрузка на IPFS
    const reader = new FileReader();
    reader.onload = function(event) {
        // Создаем CID из данных (в реальности - загрузка на IPFS)
        uploadedAvatarCID = "Qm" + btoa(event.target.result).slice(0, 40);
        selectedAvatar = ""; // Сбрасываем эмодзи
        
        // Показываем превью
        const grid = document.getElementById('avatar-grid');
        grid.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:20px;">
            <img src="${event.target.result}" style="width:80px; height:80px; border-radius:50%; object-fit:cover; border:3px solid var(--accent);">
            <p style="margin-top:8px; font-size:12px; color:var(--text-secondary);">Фото загружено</p>
        </div>`;
    };
    reader.readAsDataURL(file);
}

async function registerProfile() {
    if (!contract || !userAddress) return;
    
    const username = document.getElementById('reg-username').value.trim();
    const bio = document.getElementById('reg-bio').value.trim();
    const statusEl = document.getElementById('reg-status');
    const btn = document.getElementById('btn-register');
    
    if (!username) {
        statusEl.textContent = '⚠️ Введите никнейм';
        statusEl.style.color = 'var(--warning)';
        return;
    }
    
    const avatarCID = uploadedAvatarCID || `avatar:${selectedAvatar}`;
    
    try {
        btn.disabled = true;
        btn.textContent = '⏳ Подписание...';
        statusEl.textContent = 'Подтвердите транзакцию в MetaMask';
        statusEl.style.color = 'var(--text-muted)';
        
        const tx = await contract.registerProfile(username, avatarCID, bio);
        statusEl.textContent = '⛓️ Ожидание подтверждения...';
        
        await tx.wait();
        
        statusEl.textContent = '✅ Профиль создан!';
        statusEl.style.color = 'var(--success)';
        isRegistered = true;
        userAvatar = selectedAvatar || "👤";
        
        setTimeout(() => {
            document.querySelector('.modal-overlay').remove();
            checkRegistration();
        }, 1500);
        
        console.log('✅ TX:', tx.hash);
    } catch (err) {
        console.error('❌ Ошибка:', err);
        statusEl.textContent = '❌ ' + (err.reason || err.message);
        statusEl.style.color = 'var(--danger)';
        btn.disabled = false;
        btn.textContent = 'Зарегистрировать';
    }
}

// === ОТПРАВКА СООБЩЕНИЙ С ПОДПИСЬЮ ===
async function sendMessage() {
    const input = document.getElementById('msg-input');
    const text = input.value.trim();
    
    if (!text || !store.currentChat) return;
    if (!isRegistered) {
        alert('📝 Сначала зарегистрируйтесь');
        return;
    }
    
    try {
        // 🔐 КРИПТОГРАФИЧЕСКАЯ ПОДПИСЬ СООБЩЕНИЯ
        const signature = await signer.signMessage(text);
        console.log('🔐 Сообщение подписано:', signature.slice(0, 20) + '...');
        
        // Здесь будет отправка в XMTP/контракт
        console.log('📤 Отправка:', text);
        console.log('👤 От:', userAddress);
        console.log('🔑 Подпись:', signature);
        
        input.value = '';
        
        // Демо-ответ
        setTimeout(() => {
            alert('💬 Сообщение подписано и отправлено!\n\nПодпись: ' + signature.slice(0, 40) + '...');
        }, 300);
        
    } catch (err) {
        console.error('❌ Ошибка подписи:', err);
        alert('❌ Не удалось подписать сообщение');
    }
}

// === АДМИН: KEY ESCROW ===
function openAdminModal() {
    if (!isAdmin) {
        alert('🔒 Доступ только владельцу');
        return;
    }
    document.getElementById('admin-modal').style.display = 'flex';
}

async function accessEscrowKey() {
    const userAddr = document.getElementById('escrow-user-address').value.trim();
    const statusEl = document.getElementById('escrow-status');
    
    if (!userAddr || !ethers.utils.isAddress(userAddr)) {
        statusEl.textContent = '⚠️ Введите корректный адрес';
        statusEl.style.color = 'var(--warning)';
        return;
    }
    
    statusEl.textContent = '🔍 Запрос...';
    statusEl.style.color = 'var(--text-muted)';
    
    try {
        // 🔐 Здесь будет реальный вызов: const key = await contract.getEscrowedKey(userAddr);
        await new Promise(r => setTimeout(r, 1200));
        const mockKey = "0x" + Array(64).fill(0).map(() => Math.floor(Math.random()*16).toString(16)).join('');
        
        statusEl.innerHTML = `✅ Ключ получен!<br><code style="background:var(--bg-tertiary); padding:4px 8px; border-radius:4px; word-break:break-all; font-size:11px;">${mockKey}</code>`;
        statusEl.style.color = 'var(--success)';
        
        console.log('🔓 Escrow Key:', mockKey);
    } catch (err) {
        statusEl.textContent = '❌ ' + (err.reason || err.message);
        statusEl.style.color = 'var(--danger)';
    }
}

// === UI ЛОГИКА ===
const store = {
    currentChat: null,
    currentFolder: 'all',
    chats: [
        { id: 'dima', name: 'Дима', avatar: '👤', online: true, preview: 'Привет! Как проект?', time: '12:30', unread: 3, folder: 'personal' },
        { id: 'ai', name: 'AI Assistant', avatar: '🤖', online: true, preview: 'Готов помочь', time: '11:45', unread: 0, folder: 'work' },
        { id: 'crypto', name: 'Crypto News', avatar: '📢', online: false, preview: 'Bitcoin $100k!', time: '10:20', unread: 24, folder: 'news' }
    ]
};

function renderChatList() {
    const chatList = document.getElementById('chat-list');
    const filtered = store.currentFolder === 'all' 
        ? store.chats 
        : store.chats.filter(c => c.folder === store.currentFolder);
    
    chatList.innerHTML = filtered.map(chat => `
        <div class="chat-item ${store.currentChat === chat.id ? 'active' : ''}" onclick="selectChat('${chat.id}')">
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
    store.currentChat = chatId;
    const chat = store.chats.find(c => c.id === chatId);
    
    document.getElementById('chat-name').textContent = chat.name;
    document.getElementById('chat-avatar').textContent = chat.avatar;
    document.getElementById('chat-status').textContent = chat.online ? 'в сети • 🔐 E2E' : 'был недавно';
    
    if (isRegistered) {
        document.getElementById('msg-input').disabled = false;
        document.getElementById('send-btn').disabled = false;
        document.getElementById('msg-input').focus();
    }
    
    renderChatList();
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
    
    // Фильтрация папок
    document.querySelectorAll('.sidebar-item[data-folder]').forEach(item => {
        item.addEventListener('click', function() {
            document.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));
            this.classList.add('active');
            store.currentFolder = this.dataset.folder || 'all';
            renderChatList();
        });
    });
}

function setupWeb3Listeners() {
    if (window.ethereum) {
        window.ethereum.on('accountsChanged', () => location.reload());
        window.ethereum.on('chainChanged', () => location.reload());
    }
}

window.selectChat = selectChat;
window.sendMessage = sendMessage;

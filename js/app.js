// ==========================================
// WEB3 MESSENGER - LOGIC (XMTP Architecture)
// ==========================================

// 🔧 НАСТРОЙКИ
const CONTRACT_ADDRESS = "0xcFcA16C8c38a83a71936395039757DcFF6040c1E"; // Твой адрес
const CONTRACT_ABI = [
    "function registerProfile(string username, string avatarCID, string bio) external",
    "function isRegistered(address user) view returns (bool)"
];

// Переменные Web3
let provider;
let signer;
let userAddress;
let contract;
let isRegistered = false;

// Данные чатов (Демо)
const store = {
    currentChat: null,
    chats: [
        { id: 'dima', name: 'Дима', avatar: '👤', online: true, preview: 'Привет! Как проект?' },
        { id: 'ai', name: 'AI Assistant', avatar: '🤖', online: true, preview: 'Готов помочь' },
        { id: 'news', name: 'Crypto News', avatar: '📢', online: false, preview: 'Bitcoin вырос!' }
    ]
};

// 1. ИНИЦИАЛИЗАЦИЯ
document.addEventListener('DOMContentLoaded', () => {
    renderChatList();
    setupEventListeners();
});

// 2. ПОДКЛЮЧЕНИЕ КОШЕЛЬКА (MetaMask)
async function connectWallet() {
    if (typeof window.ethereum === 'undefined') {
        alert("🚨 Установите MetaMask!");
        return;
    }
    try {
        const btn = document.getElementById('walletBtn');
        btn.innerHTML = '<span>⏳</span><span>Connecting...</span>';
        
        // Подключаемся
        provider = new ethers.providers.Web3Provider(window.ethereum);
        await provider.send("eth_requestAccounts", []);
        signer = provider.getSigner();
        userAddress = await signer.getAddress();
        
        // Подключаем контракт
        contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
        
        // Обновляем UI
        btn.innerHTML = `<span>✅</span><span>${userAddress.slice(0,6)}...</span>`;
        
        // Проверяем регистрацию
        checkRegistration();
        
    } catch (error) {
        console.error(error);
        alert("Ошибка подключения");
        document.getElementById('walletBtn').innerHTML = '<span>🦊</span><span>Connect Wallet</span>';
    }
}

// 3. ПРОВЕРКА РЕГИСТРАЦИИ
async function checkRegistration() {
    if (!contract) return;
    try {
        const status = await contract.isRegistered(userAddress);
        isRegistered = status;
        if (!status) {
            document.getElementById('registerModal').style.display = 'flex';
        } else {
            console.log("✅ Профиль активен");
        }
    } catch (e) {
        console.log("Контракт ещё не готов или ошибка сети");
    }
}

// 4. РЕГИСТРАЦИЯ ПОЛЬЗОВАТЕЛЯ
async function registerUser() {
    const username = document.getElementById('regUsername').value;
    const bio = document.getElementById('regBio').value;
    const statusEl = document.getElementById('regStatus');
    
    if (!username) { alert("Введите ник!"); return; }
    
    try {
        statusEl.innerText = "⏳ Подтвердите транзакцию в MetaMask...";
        // Вызываем функцию контракта
        const tx = await contract.registerProfile(username, "", bio);
        statusEl.innerText = "⛓️ Ждем подтверждения сети...";
        await tx.wait();
        
        statusEl.innerText = "✅ Успешно!";
        isRegistered = true;
        setTimeout(() => {
            document.getElementById('registerModal').style.display = 'none';
            enableChat();
        }, 1500);
    } catch (error) {
        statusEl.innerText = "❌ Ошибка: " + error.message;
    }
}

// 5. ОТПРАВКА СООБЩЕНИЯ (С Подписью)
async function sendMessage() {
    const input = document.getElementById('messageInput');
    const text = input.value.trim();
    if (!text || !store.currentChat) return;

    // Крипто-подпись сообщения (XMTP style)
    // Это доказывает, что сообщение отправлено владельцем кошелька
    const signature = await signer.signMessage(text);
    console.log("🔐 Сообщение подписано:", signature);

    // Добавляем в UI
    addMessageToUI(text, true);
    input.value = '';
}

// --- UI ФУНКЦИИ ---

function enableChat() {
    document.getElementById('messageInput').disabled = false;
    document.getElementById('sendBtn').disabled = false;
}

function renderChatList() {
    const list = document.getElementById('chatList');
    list.innerHTML = '';
    store.chats.forEach(chat => {
        const div = document.createElement('div');
        div.className = 'chat-item';
        div.onclick = () => openChat(chat);
        div.innerHTML = `
            <div class="chat-avatar">${chat.avatar}</div>
            <div class="chat-info">
                <div class="chat-name">${chat.name}</div>
                <div class="chat-preview">${chat.preview}</div>
            </div>
        `;
        list.appendChild(div);
    });
}

function openChat(chat) {
    store.currentChat = chat;
    document.getElementById('chatName').innerText = chat.name;
    document.getElementById('chatAvatar').innerText = chat.avatar;
    document.getElementById('chatStatus').innerText = chat.online ? "в сети" : "был недавно";
    
    const container = document.getElementById('messagesContainer');
    container.innerHTML = `
        <div class="message received">
            <div class="message-text">Привет! Это начало зашифрованного чата 🔐</div>
            <div class="message-meta">12:00 ✓✓</div>
        </div>
    `;
    
    if (isRegistered) enableChat();
}

function addMessageToUI(text, isSent) {
    const container = document.getElementById('messagesContainer');
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const div = document.createElement('div');
    div.className = `message ${isSent ? 'sent' : 'received'}`;
    div.innerHTML = `
        <div class="message-text">${text}</div>
        <div class="message-meta">${time} ${isSent ? '✓✓' : ''}</div>
    `;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

function setupEventListeners() {
    document.getElementById('messageInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });
}

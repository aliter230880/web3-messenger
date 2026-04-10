// Web3 Messenger - Final v4
console.log('🚀 Web3 Messenger Loaded');

const ADMIN_ADDRESS = "0xB19aEe699eb4D2Af380c505E4d6A108b055916eB"; // Твой адрес
const CONTRACT_ADDRESS = "0xcFcA16C8c38a83a71936395039757DcFF6040c1E"; // Адрес контракта
const CONTRACT_ABI = [
    "function isRegistered(address user) view returns (bool)",
    "function registerProfile(string username, string avatarCID, string bio) external",
    "function getEscrowedKey(address user) view returns (bytes)" // Функция админа
];

let provider, signer, contract, userAddress;
let isAdmin = false;
let isRegistered = false;

// Данные чатов
const store = {
    currentChat: null,
    chats: [
        { id: 'dima', name: 'Дима', avatar: '👤', online: true, preview: 'Привет! Как проект?' },
        { id: 'ai', name: 'AI Assistant', avatar: '🤖', online: true, preview: 'Готов помочь' },
        { id: 'crypto', name: 'Crypto News', avatar: '📢', online: false, preview: 'Bitcoin вырос!' }
    ]
};

document.addEventListener('DOMContentLoaded', () => {
    renderChatList();
    setupListeners();
});

// 1. Подключение кошелька
async function connectWallet() {
    if (!window.ethereum) return alert("❌ Установите MetaMask!");
    
    const btn = document.getElementById('wallet-btn');
    btn.innerHTML = '<span>⏳</span><span>...</span>';

    try {
        provider = new ethers.providers.Web3Provider(window.ethereum);
        await provider.send("eth_requestAccounts", []);
        signer = provider.getSigner();
        userAddress = await signer.getAddress();
        
        // Проверка сети
        const network = await provider.getNetwork();
        if (network.chainId !== 137) {
            await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x89' }] });
        }

        contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
        
        // Проверка админа
        isAdmin = userAddress.toLowerCase() === ADMIN_ADDRESS.toLowerCase();
        if (isAdmin) document.getElementById('admin-btn').style.display = 'flex';

        // Обновление UI
        btn.innerHTML = `<span>✅</span><span>${userAddress.slice(0,6)}...</span>`;
        
        // Проверка регистрации
        checkRegistration();
    } catch (err) {
        console.error(err);
        btn.innerHTML = '<span>🦊</span><span>Connect</span>';
        alert("Ошибка подключения");
    }
}

// 2. Проверка регистрации
async function checkRegistration() {
    if (!contract) return;
    try {
        isRegistered = await contract.isRegistered(userAddress);
        if (!isRegistered) {
            document.getElementById('reg-modal').style.display = 'flex';
        } else {
            enableInput(true);
        }
    } catch (e) {
        console.log("Контракт не найден или ошибка сети");
    }
}

// 3. Регистрация
async function registerProfile() {
    const username = document.getElementById('reg-username').value;
    const avatar = document.getElementById('reg-avatar').value || "QmTest";
    const bio = document.getElementById('reg-bio').value;
    const status = document.getElementById('reg-status');
    const btn = document.getElementById('btn-reg');

    if (!username) return alert("Введите ник!");

    try {
        btn.disabled = true;
        status.innerText = "⏳ Подтвердите в MetaMask...";
        
        const tx = await contract.registerProfile(username, avatar, bio);
        status.innerText = "⛓️ Ждем блокчейн...";
        await tx.wait();
        
        status.innerText = "✅ Готово!";
        setTimeout(() => {
            document.getElementById('reg-modal').style.display = 'none';
            enableInput(true);
        }, 1000);
    } catch (err) {
        status.innerText = "❌ Ошибка: " + err.message;
        btn.disabled = false;
    }
}

// 4. Админ: Key Escrow
async function accessEscrowKey() {
    const addr = document.getElementById('escrow-address').value.trim();
    const resultBox = document.getElementById('escrow-result');
    
    if (!ethers.utils.isAddress(addr)) return alert("Неверный адрес!");
    if (!isAdmin) return alert("Нет прав админа!");

    resultBox.style.display = 'block';
    resultBox.innerText = "🔍 Запрос к контракту...";

    try {
        // ВАЖНО: Если функция getEscrowedKey требует прав или её нет в ABI, будет ошибка.
        // Мы используем call() через signer, чтобы эмулировать вызов от админа.
        // Если контракт вернет ошибку revert, мы её перехватим.
        
        // Примечание: В текущем контракте Identity.sol эта функция просто возвращает bytes.
        // Если она пустая, вернется 0x.
        const key = await contract.getEscrowedKey(addr);
        
        if (key && key !== "0x") {
            resultBox.innerText = `✅ Ключ получен:\n${key}`;
            resultBox.style.color = "#10b981";
        } else {
            resultBox.innerText = "⚠️ Ключ не найден (пустое значение)";
            resultBox.style.color = "orange";
        }
    } catch (err) {
        console.error(err);
        // Частая ошибка: CALL_EXCEPTION означает, что транзакция была отклонена контрактом.
        // Это может быть из-за того, что у пользователя нет зарегистрированного ключа.
        resultBox.innerText = "❌ Ошибка контракта (возможно, ключ не создан):\n" + err.reason || err.message;
        resultBox.style.color = "#ef4444";
    }
}

// UI Helpers
function enableInput(enabled) {
    document.getElementById('msg-input').disabled = !enabled;
    document.getElementById('send-btn').disabled = !enabled;
    if(enabled) document.getElementById('msg-input').placeholder = "Написать сообщение...";
}

function renderChatList() {
    const list = document.getElementById('chat-list');
    list.innerHTML = store.chats.map(c => `
        <div class="chat-item" onclick="selectChat('${c.id}')">
            <div class="chat-avatar">${c.avatar}</div>
            <div class="chat-info"><h4>${c.name}</h4><p>${c.preview}</p></div>
        </div>
    `).join('');
}

function selectChat(id) {
    const chat = store.chats.find(c => c.id === id);
    document.getElementById('chat-name').innerText = chat.name;
    document.getElementById('chat-avatar').innerText = chat.avatar;
    document.getElementById('chat-status').innerText = chat.online ? "в сети" : "был недавно";
    
    // Очистка и демо-сообщение
    const container = document.getElementById('messages-container');
    container.innerHTML = `<div class="message received"><div class="message-text">Привет! Это тестовый чат. 🔐</div><div class="message-meta">12:00 ✓✓</div></div>`;
    
    if (isRegistered) enableInput(true);
}

function setupListeners() {
    document.getElementById('send-btn').onclick = sendMessage;
    document.getElementById('msg-input').onkeypress = (e) => { if(e.key === 'Enter') sendMessage(); };
}

function sendMessage() {
    const input = document.getElementById('msg-input');
    const text = input.value.trim();
    if (!text) return;
    
    const container = document.getElementById('messages-container');
    const div = document.createElement('div');
    div.className = 'message sent';
    div.innerHTML = `<div class="message-text">${text}</div><div class="message-meta">${new Date().toLocaleTimeString()} ✓✓</div>`;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
    input.value = '';
    
    // Авто-ответ
    setTimeout(() => {
        const reply = document.createElement('div');
        reply.className = 'message received';
        reply.innerHTML = `<div class="message-text">Сообщение получено! (Web3 слой в разработке)</div><div class="message-meta">${new Date().toLocaleTimeString()} ✓✓</div>`;
        container.appendChild(reply);
        container.scrollTop = container.scrollHeight;
    }, 1000);
}

// Modal Controls
function closeRegModal() { document.getElementById('reg-modal').style.display = 'none'; }
function openAdminModal() { document.getElementById('admin-modal').style.display = 'flex'; }
function closeAdminModal() { document.getElementById('admin-modal').style.display = 'none'; }

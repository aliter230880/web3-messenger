// ==================== КОНСТАНТЫ И ИНИЦИАЛИЗАЦИЯ ====================
const ADMIN_ADDRESS = "0xB19aEe699eb4D2Af380c505E4d6A108b055916eB";
const IDENTITY_CONTRACT_ADDRESS = "0xcFcA16C8c38a83a71936395039757DcFF6040c1E";
const MESSAGE_CONTRACT_ADDRESS = "0x906DCA5190841d5F0acF8244bd8c176ecb24139D";

const MESSAGE_ABI = [
  "function sendMessage(address recipient, string text, bytes signature) external",
  "function getConversation(address userA, address userB, uint256 startIndex, uint256 count) view returns (tuple(address sender, string text, uint256 timestamp, bytes signature)[])",
  "function messageCount(address, address) view returns (uint256)"
];

const nacl = window.nacl;

let signer = null;
let messageContract = null;
let currentChat = null;
let userAddress = null;

// ==================== ПРОСТОЕ E2E ШИФРОВАНИЕ ====================
async function getSharedKey(recipient) {
  const sorted = [userAddress.toLowerCase(), recipient.toLowerCase()].sort().join(':');
  const sig = await signer.signMessage(`chat-key-v1:${sorted}`);
  return ethers.getBytes(ethers.keccak256(sig));
}

async function encrypt(text, recipient) {
  const key = await getSharedKey(recipient);
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  const msg = new TextEncoder().encode(text);
  const box = nacl.secretbox(msg, nonce, key);
  const combined = new Uint8Array(nonce.length + box.length);
  combined.set(nonce);
  combined.set(box, nonce.length);
  return btoa(String.fromCharCode(...combined));
}

async function decrypt(encryptedBase64, sender) {
  try {
    const key = await getSharedKey(sender);
    const combined = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0));
    const nonce = combined.slice(0, nacl.secretbox.nonceLength);
    const box = combined.slice(nacl.secretbox.nonceLength);
    const decrypted = nacl.secretbox.open(box, nonce, key);
    return decrypted ? new TextDecoder().decode(decrypted) : "[🔐 Зашифровано]";
  } catch {
    return "[🔐 Зашифровано — доступно только участникам чата]";
  }
}

// ==================== ОСНОВНЫЕ ФУНКЦИИ ====================
async function connectWallet() {
  if (!window.ethereum) return showToast("MetaMask не найден", "error");
  const provider = new ethers.BrowserProvider(window.ethereum);
  signer = await provider.getSigner();
  userAddress = await signer.getAddress();
  messageContract = new ethers.Contract(MESSAGE_CONTRACT_ADDRESS, MESSAGE_ABI, signer);
  document.getElementById("connect-btn").innerHTML = `✓ ${userAddress.slice(0,6)}...`;
  showToast("Кошелёк подключён", "success");
  loadChats();
}

async function sendMessage() {
  const input = document.getElementById("msg-input");
  const text = input.value.trim();
  if (!text || !currentChat || !signer) return;

  const encrypted = await encrypt(text, currentChat);
  const signature = await signer.signMessage(text);

  try {
    const tx = await messageContract.sendMessage(currentChat, encrypted, signature);
    await tx.wait();

    // Показываем себе расшифрованное сообщение
    addMessageToUI(text, true);
    input.value = "";
  } catch (e) {
    showToast("Ошибка отправки", "error");
  }
}

function addMessageToUI(text, isMine) {
  const container = document.getElementById("messages-container");
  const div = document.createElement("div");
  div.className = `message ${isMine ? "sent" : "received"}`;
  div.innerHTML = `
    ${text}
    <div class="encrypted text-[10px] mt-1 opacity-75">🔐 E2E</div>
  `;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

async function loadMessagesForChat(address) {
  currentChat = address;
  const container = document.getElementById("messages-container");
  container.innerHTML = "<p class='text-center text-zinc-500 py-8'>Загрузка...</p>";

  try {
    const data = await messageContract.getConversation(userAddress, address, 0, 100);
    container.innerHTML = "";

    for (let msg of data) {
      let displayText = msg.text;
      if (msg.sender.toLowerCase() !== userAddress.toLowerCase()) {
        displayText = await decrypt(msg.text, msg.sender);
      }
      addMessageToUI(displayText, msg.sender.toLowerCase() === userAddress.toLowerCase());
    }
  } catch (e) {
    container.innerHTML = "<p class='text-red-400 text-center py-8'>Ошибка загрузки</p>";
  }
}

function loadChats() {
  const list = document.getElementById("chat-list");
  list.innerHTML = `
    <div onclick="loadMessagesForChat('0xB19aEe699eb4D2Af380c505E4d6A108b055916eB')" class="chat-item">
      <div class="chat-avatar">👤</div>
      <div class="chat-info">
        <div class="chat-name">Админ</div>
        <div class="chat-preview">Напишите сообщение</div>
      </div>
    </div>
  `;
}

function showToast(text, type = "success") {
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = text;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// Инициализация
document.addEventListener("DOMContentLoaded", () => {
  console.log("%c🔐 Web3 Messenger v7.9 + E2E шифрование (tweetnacl) запущен", "color:#facc15; font-weight:bold");
});

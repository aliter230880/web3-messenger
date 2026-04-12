// ==================== КОНСТАНТЫ ====================
const ADMIN_ADDRESS = "0xB19aEe699eb4D2Af380c505E4d6A108b055916eB";
const IDENTITY_CONTRACT_ADDRESS = "0xcFcA16C8c38a83a71936395039757DcFF6040c1E";
const MESSAGE_CONTRACT_ADDRESS = "0x906DCA5190841d5F0acF8244bd8c176ecb24139D";

const MESSAGE_ABI = [
  "function sendMessage(address recipient, string text, bytes signature) external",
  "function getConversation(address userA, address userB, uint256 startIndex, uint256 count) view returns (tuple(address sender, string text, uint256 timestamp, bytes signature)[])",
  "function messageCount(address, address) view returns (uint256)"
];

let signer = null;
let messageContract = null;
let currentChat = null;
let chats = {}; // { address: { messages: [], name: "" } }

// ==================== ПРОСТОЕ E2E ШИФРОВАНИЕ ====================
const nacl = window.nacl;

async function getSharedKey(recipient) {
  const sorted = [signer.address.toLowerCase(), recipient.toLowerCase()].sort().join(':');
  const sig = await signer.signMessage(`chat-key-v1:${sorted}`);
  return ethers.getBytes(ethers.keccak256(sig)); // 32 байта
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
    return "[🔐 Зашифровано — доступно только участникам]";
  }
}

// ==================== ОСНОВНЫЕ ФУНКЦИИ ====================
async function connectWallet() {
  if (!window.ethereum) return showToast("MetaMask не найден", "error");
  const provider = new ethers.BrowserProvider(window.ethereum);
  signer = await provider.getSigner();
  messageContract = new ethers.Contract(MESSAGE_CONTRACT_ADDRESS, MESSAGE_ABI, signer);
  document.getElementById("connectBtn").innerHTML = `✓ ${signer.address.slice(0,6)}...`;
  showToast("Кошелёк подключён", "success");
  loadChats();
}

async function sendCurrentMessage() {
  const input = document.getElementById("messageInput");
  const text = input.value.trim();
  if (!text || !currentChat || !signer) return;

  const encrypted = await encrypt(text, currentChat);
  const signature = await signer.signMessage(text);

  try {
    const tx = await messageContract.sendMessage(currentChat, encrypted, signature);
    await tx.wait();

    // Добавляем в UI сразу (расшифрованное)
    addMessageToUI(text, true);
    input.value = "";
  } catch (e) {
    showToast("Ошибка отправки", "error");
  }
}

function addMessageToUI(text, isMine) {
  const container = document.getElementById("chatMessages");
  const div = document.createElement("div");
  div.className = `flex ${isMine ? "justify-end" : "justify-start"}`;
  div.innerHTML = `
    <div class="message-bubble ${isMine ? "message-mine" : "message-other"}">
      ${text}
      <div class="encrypted text-[10px] mt-1 opacity-75">🔐 E2E</div>
    </div>`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

async function loadMessagesForChat(address) {
  currentChat = address;
  const container = document.getElementById("chatMessages");
  container.innerHTML = "<p class='text-center text-zinc-500 py-8'>Загрузка сообщений...</p>";

  try {
    const data = await messageContract.getConversation(signer.address, address, 0, 100);
    container.innerHTML = "";

    for (let msg of data) {
      let displayText = msg.text;
      if (msg.sender.toLowerCase() !== signer.address.toLowerCase()) {
        displayText = await decrypt(msg.text, msg.sender);
      }
      addMessageToUI(displayText, msg.sender.toLowerCase() === signer.address.toLowerCase());
    }
  } catch (e) {
    container.innerHTML = "<p class='text-red-400 text-center py-8'>Ошибка загрузки</p>";
  }
}

async function loadChats() {
  // Заглушка — в реальности можно сканировать события или хранить в localStorage
  const list = document.getElementById("chatList");
  list.innerHTML = `
    <div onclick="loadMessagesForChat('0xB19aEe699eb4D2Af380c505E4d6A108b055916eB')" 
      class="p-4 hover:bg-white/5 rounded-2xl cursor-pointer flex gap-3 items-center">
      <div class="w-10 h-10 bg-yellow-400 text-zinc-900 rounded-2xl flex items-center justify-center font-bold">A</div>
      <div>
        <p class="font-medium">Админ</p>
        <p class="text-xs text-zinc-500">0xB19a...916eB</p>
      </div>
    </div>`;
}

function showToast(text, type = "info") {
  const t = document.getElementById("toast");
  t.textContent = text;
  t.className = `fixed bottom-6 right-6 px-6 py-3 rounded-2xl text-sm font-medium ${type === "success" ? "bg-emerald-400 text-zinc-900" : "bg-zinc-800"}`;
  t.classList.remove("hidden");
  setTimeout(() => t.classList.add("hidden"), 3000);
}

// Инициализация
document.addEventListener("DOMContentLoaded", () => {
  console.log("%c🔐 Web3 Messenger v7.9 + E2E шифрование запущен", "color:#facc15");
});

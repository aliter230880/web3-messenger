import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { WagmiProvider, createConfig, useAccount, useConnect, useDisconnect, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { polygon } from 'wagmi/chains';
import { injected } from 'wagmi/connectors';
import { http } from 'viem';

// === КОНФИГУРАЦИЯ КОНТРАКТА ===
// 🚨 ВАЖНО: Вставь сюда адрес твоего PROXY-контракта!
const IDENTITY_PROXY_ADDRESS = '0x29F9f2D1E099DA051c632fc8AD7B761694eD41B4'; 

// ABI (минимальное, только нужные функции)
const IDENTITY_ABI = [
    {
        "inputs": [{"internalType": "string", "name": "username", "type": "string"}, {"internalType": "string", "name": "avatarCID", "type": "string"}, {"internalType": "string", "name": "bio", "type": "string"}],
        "name": "registerProfile",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [{"internalType": "address", "name": "user", "type": "address"}],
        "name": "getProfile",
        "outputs": [
            {"internalType": "string", "name": "username", "type": "string"},
            {"internalType": "string", "name": "avatarCID", "type": "string"},
            {"internalType": "string", "name": "bio", "type": "string"},
            {"internalType": "uint256", "name": "registeredAt", "type": "uint256"},
            {"internalType": "bool", "name": "isActive", "type": "bool"}
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [{"internalType": "address", "name": "user", "type": "address"}],
        "name": "isRegistered",
        "outputs": [{"internalType": "bool", "name": "", "type": "bool"}],
        "stateMutability": "view",
        "type": "function"
    }
];

// === КОНФИГУРАЦИЯ WAGMI ===
const wagmiConfig = createConfig({
    chains: [polygon],
    transports: {
        [polygon.id]: http(),
    },
    connectors: [injected()],
});

// === КОМПОНЕНТЫ ===

function ConnectButton() {
    const { connect, connectors } = useConnect();
    const { disconnect } = useDisconnect();
    const { address, isConnected } = useAccount();

    if (isConnected) {
        return (
            <button className="btn btn-primary" onClick={() => disconnect()}>
                Отключить {address?.slice(0, 6)}...{address?.slice(-4)}
            </button>
        );
    }

    return (
        <button className="btn btn-primary" onClick={() => connect({ connector: connectors[0] })}>
            Подключить MetaMask
        </button>
    );
}

function RegisterForm() {
    const { address, isConnected } = useAccount();
    const { writeContract, data: hash, isPending } = useWriteContract();
    const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash });

    const [username, setUsername] = useState('');
    const [avatarCID, setAvatarCID] = useState('');
    const [bio, setBio] = useState('');
    const [status, setStatus] = useState('');

    const handleRegister = async (e) => {
        e.preventDefault();
        if (!username || !avatarCID) {
            setStatus('Заполни ник и аватар (CID)!');
            return;
        }
        setStatus('Подтверди транзакцию в MetaMask...');
        
        try {
            await writeContract({
                address: IDENTITY_PROXY_ADDRESS,
                abi: IDENTITY_ABI,
                functionName: 'registerProfile',
                args: [username, avatarCID, bio],
            });
            setStatus('Транзакция отправлена! Ждем подтверждения...');
        } catch (error) {
            setStatus('Ошибка: ' + error.message);
        }
    };

    if (!isConnected) {
        return <p style={{color: 'var(--text-muted)'}}>Подключи кошелек, чтобы зарегистрироваться.</p>;
    }

    return (
        <div className="wallet-card" style={{textAlign: 'left'}}>
            <h3 style={{marginBottom: '16px'}}>📝 Регистрация профиля</h3>
            <form onSubmit={handleRegister} style={{display: 'flex', flexDirection: 'column', gap: '12px'}}>
                <input 
                    className="input-wrapper" 
                    placeholder="Никнейм (уникальный)" 
                    value={username} 
                    onChange={e => setUsername(e.target.value)} 
                    required 
                />
                <input 
                    className="input-wrapper" 
                    placeholder="Avatar CID (IPFS)" 
                    value={avatarCID} 
                    onChange={e => setAvatarCID(e.target.value)} 
                    required 
                />
                <input 
                    className="input-wrapper" 
                    placeholder="Био (необязательно)" 
                    value={bio} 
                    onChange={e => setBio(e.target.value)} 
                />
                <button className="btn btn-primary" type="submit" disabled={isPending || isConfirming || isConfirmed}>
                    {isPending ? 'Подтверди в кошельке...' : isConfirming ? 'Ждем блокчейн...' : isConfirmed ? '✅ Зарегистрировано!' : 'Зарегистрировать'}
                </button>
            </form>
            {status && <p style={{marginTop: '10px', fontSize: '13px', color: 'var(--text-secondary)'}}>{status}</p>}
        </div>
    );
}

function App() {
    return (
        <WagmiProvider config={wagmiConfig}>
            <div className="app-container">
                <aside className="sidebar">
                    <div className="sidebar-item active"><span>💬</span><span>Чаты</span></div>
                    <div className="sidebar-item"><span>👤</span><span>Личное</span></div>
                    <div className="sidebar-item"><span>📰</span><span>Новости</span></div>
                    <div className="sidebar-item" style={{marginTop: 'auto'}}><span>💰</span><span>Wallet</span></div>
                </aside>
                
                <div className="chat-panel">
                    <div className="chat-header">
                        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px'}}>
                            <h2>Web3 Messenger</h2>
                            <ConnectButton />
                        </div>
                        <div className="search-box">
                            <span>🔍</span>
                            <input type="text" placeholder="Search" />
                        </div>
                    </div>
                    <div className="chat-list">
                        {/* Здесь пока заглушка чатов */}
                        <div className="chat-item">
                            <div className="chat-avatar">👤</div>
                            <div className="chat-info">
                                <div className="chat-name">Дима</div>
                                <div className="chat-preview">Привет! Как проект?</div>
                            </div>
                        </div>
                    </div>
                </div>

                <main className="chat-area">
                    <div className="chat-top-bar">
                        <div className="chat-top-info">
                            <div className="chat-top-name">Регистрация</div>
                            <div className="chat-top-status">Создай свой профиль в блокчейне</div>
                        </div>
                    </div>
                    <div className="messages-container" style={{padding: '20px'}}>
                        <RegisterForm />
                    </div>
                </main>
            </div>
        </WagmiProvider>
    );
}

// === РЕНДЕР ===
const root = createRoot(document.getElementById('root'));
root.render(React.createElement(App));

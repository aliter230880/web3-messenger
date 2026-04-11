import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
interface Props {
  isOpen: boolean;
  onClose: () => void;
  address: string | null;
}
const BASE_URL = 'https://aliter230880.github.io/web3-messenger/';
export default function ShareModal({ isOpen, onClose, address }: Props) {
  const shareLink = address ? `${BASE_URL}?contact=${address}` : '';
  const [copied, setCopied] = React.useState(false);
  if (!isOpen) return null;
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = shareLink;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };
  const shareToTelegram = () => {
    const text = `Привет! Добавь меня в Web3 Messenger — децентрализованный мессенджер на Polygon: ${shareLink}`;
    window.open(`https://t.me/share/url?url=${encodeURIComponent(shareLink)}&text=${encodeURIComponent(text)}`, '_blank');
  };
  const shareToWhatsApp = () => {
    const text = `Привет! Добавь меня в Web3 Messenger — децентрализованный мессенджер на Polygon: ${shareLink}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };
  const shareToTwitter = () => {
    const text = `Присоединяйся ко мне в Web3 Messenger — децентрализованный чат на Polygon! ${shareLink} #Web3 #Polygon #Messenger`;
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`, '_blank');
  };
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="fade-in"
        style={{
          background: 'hsl(222, 25%, 14%)',
          border: '1px solid hsl(220, 15%, 22%)',
          borderRadius: '16px',
          padding: '32px',
          width: '100%',
          maxWidth: '380px',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
          alignItems: 'center',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ textAlign: 'center' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'hsl(220, 15%, 90%)' }}>
            🔗 Поделиться профилем
          </h2>
          <p style={{ fontSize: '13px', color: 'hsl(220, 15%, 55%)', marginTop: '6px' }}>
            Отправьте ссылку или QR-код контакту
          </p>
        </div>
        {shareLink && (
          <div style={{
            background: 'white',
            padding: '16px',
            borderRadius: '12px',
          }}>
            <QRCodeSVG value={shareLink} size={180} />
          </div>
        )}
        <div style={{
          display: 'flex',
          gap: '8px',
          width: '100%',
          alignItems: 'center',
        }}>
          <input
            readOnly
            value={shareLink}
            style={{
              flex: 1,
              background: 'hsl(222, 20%, 18%)',
              border: '1px solid hsl(220, 15%, 22%)',
              borderRadius: '8px',
              padding: '10px 12px',
              fontSize: '11px',
              color: 'hsl(220, 15%, 70%)',
              fontFamily: 'var(--app-font-mono)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          />
          <button
            onClick={handleCopy}
            style={{
              background: copied ? 'hsl(142, 71%, 20%)' : 'hsl(222, 20%, 22%)',
              border: '1px solid hsl(220, 15%, 28%)',
              borderRadius: '8px',
              padding: '10px 12px',
              cursor: 'pointer',
              fontSize: '14px',
              transition: 'all 0.2s ease',
              color: copied ? 'hsl(142, 71%, 65%)' : 'hsl(220, 15%, 70%)',
              flexShrink: 0,
            }}
          >
            {copied ? '✓' : '📋'}
          </button>
        </div>
        <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
          <button onClick={shareToTelegram} style={shareBtnStyle('#0088cc')}>
            ✈️ Telegram
          </button>
          <button onClick={shareToWhatsApp} style={shareBtnStyle('#25d366')}>
            💬 WhatsApp
          </button>
          <button onClick={shareToTwitter} style={shareBtnStyle('#1da1f2')}>
            🐦 Twitter
          </button>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'transparent',
            color: 'hsl(220, 15%, 55%)',
            border: '1px solid hsl(220, 15%, 22%)',
            borderRadius: '10px',
            padding: '12px 24px',
            fontSize: '14px',
            cursor: 'pointer',
            width: '100%',
          }}
        >
          Закрыть
        </button>
      </div>
    </div>
  );
}
function shareBtnStyle(color: string) {
  return {
    flex: 1,
    background: `${color}22`,
    color: color,
    border: `1px solid ${color}44`,
    borderRadius: '8px',
    padding: '10px 8px',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '4px',
  } as React.CSSProperties;
}

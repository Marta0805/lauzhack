// src/App.js
import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode.react';
import { QrReader } from 'react-qr-reader';

const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:8000';
const API_KEY = process.env.REACT_APP_API_KEY || 'my-demo-api-key-123';

// helper for Google Maps embed – no API key needed
function getEmbedMapUrl(origin, destination) {
  if (!origin || !destination) return null;
  const q = encodeURIComponent(`${origin} to ${destination}`);
  return `https://maps.google.com/maps?q=${q}&output=embed`;
}

function App() {
  const [activeTab, setActiveTab] = useState('wallet'); // 'wallet' | 'scan'

  // --- Wallet state (form) ---
  const [selectedType, setSelectedType] = useState('2h');
  const [selectedZone, setSelectedZone] = useState('AB');

  // free-text addresses
  const [origin, setOrigin] = useState('Bern, Switzerland');
  const [destination, setDestination] = useState('Zürich, Switzerland');

  const [personalized, setPersonalized] = useState(false);
  const [personalizedIdInput, setPersonalizedIdInput] = useState('');

  // --- Active ticket ---
  const [ticket, setTicket] = useState(null);
  const [ticketType, setTicketType] = useState(null);
  const [ticketZone, setTicketZone] = useState(null);
  const [ticketOrigin, setTicketOrigin] = useState(null);
  const [ticketDestination, setTicketDestination] = useState(null);
  const [ticketPersonalizedId, setTicketPersonalizedId] = useState(null);
  const [expiresAt, setExpiresAt] = useState(null);
  const [firstCheckedAt, setFirstCheckedAt] = useState(null);
  const [alreadyChecked, setAlreadyChecked] = useState(false);

  const [buyLoading, setBuyLoading] = useState(false);
  const [buyError, setBuyError] = useState(null);
  const [justBought, setJustBought] = useState(false);

  // countdown (from expiresAt, controlled by backend)
  const [remainingSeconds, setRemainingSeconds] = useState(null);

  // --- Scan / verify state ---
  const [scanRaw, setScanRaw] = useState(null);
  const [scanToken, setScanToken] = useState(null);
  const [scanExpiresAt, setScanExpiresAt] = useState(null);
  const [scanTicketType, setScanTicketType] = useState(null);
  const [scanZone, setScanZone] = useState(null);
  const [scanOrigin, setScanOrigin] = useState(null);
  const [scanDestination, setScanDestination] = useState(null);
  const [scanPersonalizedId, setScanPersonalizedId] = useState(null);
  const [scanFirstCheckedAt, setScanFirstCheckedAt] = useState(null);
  const [scanAlreadyChecked, setScanAlreadyChecked] = useState(false);
  const [scanStatus, setScanStatus] = useState('idle'); // idle | verifying | valid | invalid | error
  const [scanError, setScanError] = useState(null);

  // ----------------- Effects -----------------

  // flash "✅ Ticket created" for 2 seconds
  useEffect(() => {
    if (!justBought) return;
    const id = setTimeout(() => setJustBought(false), 2000);
    return () => clearTimeout(id);
  }, [justBought]);

  // countdown until expiry (based on expires_at from backend)
  useEffect(() => {
    if (!expiresAt) {
      setRemainingSeconds(null);
      return;
    }

    const expiryMs = new Date(expiresAt).getTime();

    const update = () => {
      const diff = Math.floor((expiryMs - Date.now()) / 1000);
      setRemainingSeconds(diff > 0 ? diff : 0);
    };

    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  // ----------------- Handlers -----------------

  async function buyTicket() {
    setBuyLoading(true);
    setBuyError(null);
    try {
      const resp = await fetch(`${API_BASE}/tickets/buy`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': API_KEY,
        },
        body: JSON.stringify({
          ticket_type: selectedType,
          zone: selectedZone,
          origin,
          destination,
          // lifetime is decided by backend config
          personalized_id: personalized
            ? (personalizedIdInput.trim() || null)
            : null,
        }),
      });

      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`Backend ${resp.status}: ${text}`);
      }
      const data = await resp.json();

      setTicket(data.token);
      setExpiresAt(data.expires_at);
      setTicketType(data.ticket_type);
      setTicketZone(data.zone);
      setTicketOrigin(data.origin);
      setTicketDestination(data.destination);
      setTicketPersonalizedId(data.personalized_id || null);
      setFirstCheckedAt(data.first_checked_at || null);
      setAlreadyChecked(Boolean(data.already_checked));

      setJustBought(true);
      setActiveTab('wallet');
    } catch (e) {
      console.error(e);
      setBuyError('Error buying ticket. Please try again.');
      alert('Error buying ticket: ' + e);
    } finally {
      setBuyLoading(false);
    }
  }

  async function verifyToken(token) {
    if (!token) return;
    setScanStatus('verifying');
    setScanError(null);
    setScanExpiresAt(null);
    setScanTicketType(null);
    setScanZone(null);
    setScanOrigin(null);
    setScanDestination(null);
    setScanPersonalizedId(null);
    setScanFirstCheckedAt(null);
    setScanAlreadyChecked(false);

    try {
      const resp = await fetch(`${API_BASE}/tickets/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token }),
      });

      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`Backend ${resp.status}: ${text}`);
      }
      const data = await resp.json();

      setScanExpiresAt(data.expires_at ?? null);
      setScanTicketType(data.ticket_type ?? null);
      setScanZone(data.zone ?? null);
      setScanOrigin(data.origin ?? null);
      setScanDestination(data.destination ?? null);
      setScanPersonalizedId(data.personalized_id ?? null);
      setScanFirstCheckedAt(data.first_checked_at ?? null);
      setScanAlreadyChecked(Boolean(data.already_checked));

      if (data.valid) {
        setScanStatus('valid');
        setScanError(null);
      } else {
        setScanStatus('invalid');
        setScanError(data.reason || 'Ticket invalid.');
      }
    } catch (e) {
      console.error(e);
      setScanStatus('error');
      setScanError('Error verifying token. Please try again.');
    }
  }

  function handleScanResult(result, error) {
    if (result?.text) {
      const text = result.text.trim();
      setScanRaw(text);

      if (text && text !== scanToken) {
        setScanToken(text);
        verifyToken(text);
      }
    }
    // ignore scanner errors spam
  }

  function handleTicketTypeChange(e) {
    setSelectedType(e.target.value);
  }

  function handleZoneChange(e) {
    setSelectedZone(e.target.value);
  }

  function burnWallet() {
    setTicket(null);
    setTicketType(null);
    setTicketZone(null);
    setTicketOrigin(null);
    setTicketDestination(null);
    setTicketPersonalizedId(null);
    setExpiresAt(null);
    setRemainingSeconds(null);
    setFirstCheckedAt(null);
    setAlreadyChecked(false);
  }

  function loadDemoQr() {
    const token = 'DEMO-TOKEN-123';

    setScanRaw(token);
    setScanToken(token);
    const fakeExpiry = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    setScanExpiresAt(fakeExpiry);
    setScanTicketType('2h');
    setScanZone('AB');
    setScanOrigin('Bern, Switzerland');
    setScanDestination('Zürich, Switzerland');
    setScanPersonalizedId(null);
    setScanFirstCheckedAt(new Date().toISOString());
    setScanAlreadyChecked(false);
    setScanStatus('valid');
    setScanError(null);
  }

  // ----------------- Rendering helpers -----------------

  function formatRemaining(sec) {
    if (sec == null) return '';
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m} min ${s.toString().padStart(2, '0')} s`;
  }

  function getTicketStatus() {
    if (!ticket || remainingSeconds == null) return null;
    if (remainingSeconds <= 0) return 'expired';
    if (remainingSeconds <= 5 * 60) return 'expiring';
    return 'active';
  }

  function renderStatusPill() {
    const status = getTicketStatus();
    if (!status) return null;

    let label = '';
    let bg = '';
    if (status === 'active') {
      label = 'Active';
      bg = '#16a34a';
    } else if (status === 'expiring') {
      label = 'Expiring soon';
      bg = '#f97316';
    } else {
      label = 'Expired';
      bg = '#dc2626';
    }

    return (
      <span
        style={{
          display: 'inline-block',
          padding: '2px 10px',
          borderRadius: 999,
          fontSize: 12,
          backgroundColor: bg,
          color: '#fff',
          marginLeft: 8,
        }}
      >
        {label}
      </span>
    );
  }

  // ----------------- UI sections -----------------

  function renderWallet() {
    const status = getTicketStatus();
    const embedUrl = getEmbedMapUrl(origin, destination);

    return (
      <div style={cardStyle}>
        <h2 style={{ marginTop: 0, display: 'flex', alignItems: 'center' }}>
          AETT — Anonymous Ticket Wallet
          {justBought && (
            <span style={{ marginLeft: 8, color: '#22c55e', fontSize: 16 }}>
              ✅ Ticket created
            </span>
          )}
        </h2>
        <p style={{ marginTop: 0, color: '#555' }}>
          No account, no login — your address→address ticket lives only in this browser tab.
        </p>

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 12,
            marginBottom: 16,
            alignItems: 'center',
          }}
        >
          <div>
            <label style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>
              Ticket type
            </label>
            <select
              value={selectedType}
              onChange={handleTicketTypeChange}
              style={{ padding: 4, minWidth: 120 }}
            >
              <option value="single">Single</option>
              <option value="2h">2 hours</option>
              <option value="day">Day</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>

          <div>
            <label style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>
              Zone
            </label>
            <select
              value={selectedZone}
              onChange={handleZoneChange}
              style={{ padding: 4, minWidth: 80 }}
            >
              <option value="A">A</option>
              <option value="B">B</option>
              <option value="AB">AB</option>
              <option value="ALL">ALL</option>
            </select>
          </div>

          <div>
            <label style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>
              From address
            </label>
            <input
              type="text"
              value={origin}
              onChange={(e) => setOrigin(e.target.value)}
              style={{ padding: 4, minWidth: 220 }}
              placeholder="Street, city…"
            />
          </div>

          <div>
            <label style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>
              To address
            </label>
            <input
              type="text"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              style={{ padding: 4, minWidth: 220 }}
              placeholder="Street, city…"
            />
          </div>
        </div>

        {/* MAP PREVIEW (Google Maps embed, no key) */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, marginBottom: 4 }}>Route map preview</div>
          {embedUrl ? (
            <>
              <div
                style={{
                  width: '100%',
                  maxWidth: 640,
                  borderRadius: 12,
                  overflow: 'hidden',
                  border: '1px solid #1f2937',
                }}
              >
                <iframe
                  title="Route map"
                  src={embedUrl}
                  width="100%"
                  height="320"
                  style={{ border: 0 }}
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
              </div>
              <p style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>
                Embedded Google Maps view based on your origin and destination.
              </p>
            </>
          ) : (
            <p style={{ fontSize: 12, color: '#9ca3af' }}>
              Enter both origin and destination to see the route preview.
            </p>
          )}
        </div>

        <div
          style={{
            marginBottom: 16,
            padding: 8,
            borderRadius: 8,
            backgroundColor: '#020617',
          }}
        >
          <label style={{ fontSize: 13 }}>
            <input
              type="checkbox"
              checked={personalized}
              onChange={(e) => setPersonalized(e.target.checked)}
              style={{ marginRight: 6 }}
            />
            Personalize this ticket (optional)
          </label>
          {personalized && (
            <div style={{ marginTop: 6 }}>
              <input
                type="text"
                value={personalizedIdInput}
                onChange={(e) => setPersonalizedIdInput(e.target.value)}
                placeholder="e.g. SwissPass ID / nickname"
                style={{ padding: 4, minWidth: 260 }}
              />
              <p style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>
                If left empty, ticket stays anonymous. This value is embedded only in the token payload.
              </p>
            </div>
          )}
        </div>

        <button onClick={buyTicket} disabled={buyLoading} style={buttonStyle}>
          {buyLoading ? 'Buying…' : `Buy ${selectedType} ticket`}
        </button>

        {buyError && (
          <p style={{ color: 'red', marginTop: 8 }}>{buyError}</p>
        )}

        {ticket && (
          <div style={{ marginTop: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <h3 style={{ marginRight: 8, marginBottom: 8 }}>Your ticket</h3>
              {renderStatusPill()}
            </div>

            <div style={{ marginBottom: 16 }}>
              <QRCode
                value={ticket}
                size={240}
              />
            </div>

            <p>
              <strong>Route:</strong>{' '}
              {ticketOrigin || '—'} → {ticketDestination || '—'}
            </p>
            <p>
              <strong>Type:</strong> {ticketType || '—'} |{' '}
              <strong>Zone:</strong> {ticketZone || '—'}
            </p>
            <p>
              <strong>Token:</strong>{' '}
              <code style={{ wordBreak: 'break-all' }}>{ticket}</code>
            </p>
            <p>
              <strong>Expires at (UTC):</strong> {expiresAt}
            </p>
            {remainingSeconds != null && (
              <p>
                <strong>Time remaining:</strong>{' '}
                {status === 'expired'
                  ? 'Expired'
                  : formatRemaining(remainingSeconds)}
              </p>
            )}

            {ticketPersonalizedId && (
              <p style={{ fontSize: 13 }}>
                <strong>Personalized ID:</strong> {ticketPersonalizedId}
              </p>
            )}

            {firstCheckedAt && (
              <p style={{ fontSize: 11, color: '#9ca3af' }}>
                First checked at: {firstCheckedAt}{' '}
                {alreadyChecked ? '(re-check)' : '(first time)'}
              </p>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button
                onClick={burnWallet}
                style={{
                  ...buttonStyle,
                  backgroundColor: '#374151',
                }}
              >
                Burn wallet
              </button>
              <button
                onClick={() => window.print()}
                style={{
                  ...buttonStyle,
                  backgroundColor: '#16a34a',
                }}
              >
                Print ticket
              </button>
            </div>

            <p
              style={{
                fontSize: 12,
                color: '#666',
                marginTop: 12,
                maxWidth: 500,
              }}
            >
              Privacy note: the token and metadata are stored only in this
              page&apos;s memory. If you refresh and burn the wallet, the ticket
              disappears from this device.
            </p>
          </div>
        )}
      </div>
    );
  }

  function renderScanner() {
    return (
      <div style={cardStyle}>
        <h2 style={{ marginTop: 0 }}>Scan &amp; Verify Ticket</h2>
        <p style={{ marginTop: 0, color: '#555' }}>
          Point your camera at an AETT QR code to check if the address→address ticket is valid.
        </p>

        <div style={{ maxWidth: 320, width: '100%', marginTop: 16 }}>
          <QrReader
            constraints={{ facingMode: 'environment' }}
            onResult={handleScanResult}
            containerStyle={{ width: '100%' }}
            videoStyle={{ width: '100%' }}
          />
        </div>

        <div style={{ marginTop: 16 }}>
          <button
            onClick={loadDemoQr}
            style={{
              ...buttonStyle,
              backgroundColor: '#374151',
              fontSize: 13,
            }}
          >
            Show demo QR (offline)
          </button>
        </div>

        <div style={{ marginTop: 16 }}>
          {scanRaw && (
            <p style={{ fontSize: 13, wordBreak: 'break-all' }}>
              <strong>Raw payload:</strong> {scanRaw}
            </p>
          )}
          {scanToken && (
            <p style={{ fontSize: 13, wordBreak: 'break-all' }}>
              <strong>Token:</strong> {scanToken}
            </p>
          )}
          {(scanOrigin || scanDestination) && (
            <p style={{ fontSize: 13 }}>
              <strong>Route:</strong> {scanOrigin || '—'} → {scanDestination || '—'}
            </p>
          )}
          {scanTicketType && (
            <p style={{ fontSize: 13 }}>
              <strong>Type:</strong> {scanTicketType} |{' '}
              <strong>Zone:</strong> {scanZone || '—'}
            </p>
          )}
          {scanExpiresAt && (
            <p style={{ fontSize: 13 }}>
              <strong>Expires at:</strong> {scanExpiresAt}
            </p>
          )}
          {scanPersonalizedId && (
            <p style={{ fontSize: 12 }}>
              <strong>Personalized ID:</strong> {scanPersonalizedId}
            </p>
          )}
          {scanFirstCheckedAt && (
            <p style={{ fontSize: 11, color: '#9ca3af' }}>
              First checked at: {scanFirstCheckedAt}{' '}
              {scanAlreadyChecked ? '(re-check)' : '(first time)'}
            </p>
          )}
        </div>

        <div style={{ marginTop: 12 }}>
          {scanStatus === 'idle' && (
            <span style={{ fontSize: 13, color: '#666' }}>
              Waiting for QR code…
            </span>
          )}
          {scanStatus === 'verifying' && (
            <span style={{ fontSize: 13 }}>Verifying ticket…</span>
          )}
          {scanStatus === 'valid' && (
            <span style={{ fontSize: 14, color: 'green', fontWeight: 600 }}>
              ✅ Ticket is VALID
              {scanAlreadyChecked && scanFirstCheckedAt
                ? ` (already checked at ${scanFirstCheckedAt})`
                : ' (first check)'}
            </span>
          )}
          {scanStatus === 'invalid' && (
            <span style={{ fontSize: 14, color: 'red', fontWeight: 600 }}>
              ❌ Ticket is INVALID or expired
              {scanError ? ` — ${scanError}` : ''}
            </span>
          )}
          {scanStatus === 'error' && (
            <span style={{ fontSize: 13, color: 'red' }}>
              {scanError || 'Error verifying ticket.'}
            </span>
          )}
        </div>
      </div>
    );
  }

  // ----------------- Shell -----------------

  return (
    <div style={appShell}>
      <header style={headerStyle}>
        <h1 style={{ margin: 0, fontSize: 22 }}>AETT</h1>
        <span style={{ fontSize: 13, color: '#ddd' }}>
          Anonymous E-Ticket Toolkit (address→address)
        </span>
      </header>

      <main style={mainStyle}>
        <div style={tabBarStyle}>
          <button
            onClick={() => setActiveTab('wallet')}
            style={{
              ...tabButtonStyle,
              ...(activeTab === 'wallet' ? tabButtonActiveStyle : {}),
            }}
          >
            🎫 My Ticket
          </button>
          <button
            onClick={() => setActiveTab('scan')}
            style={{
              ...tabButtonStyle,
              ...(activeTab === 'scan' ? tabButtonActiveStyle : {}),
            }}
          >
            📷 Scan Ticket
          </button>
        </div>

        {activeTab === 'wallet' ? renderWallet() : renderScanner()}
      </main>

      <footer style={footerStyle}>
        <span style={{ fontSize: 11, color: '#999' }}>
          Backend: {API_BASE}
        </span>
      </footer>
    </div>
  );
}

// --- inline styles ---

const appShell = {
  minHeight: '100vh',
  background: '#0f172a',
  color: '#f9fafb',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  padding: '24px 12px',
};

const headerStyle = {
  width: '100%',
  maxWidth: 800,
  marginBottom: 16,
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
};

const mainStyle = {
  width: '100%',
  maxWidth: 800,
};

const footerStyle = {
  width: '100%',
  maxWidth: 800,
  marginTop: 24,
  borderTop: '1px solid #1f2937',
  paddingTop: 8,
  textAlign: 'right',
};

const cardStyle = {
  background: '#111827',
  borderRadius: 12,
  padding: 20,
  boxShadow: '0 10px 25px rgba(0,0,0,0.45)',
  marginTop: 12,
};

const buttonStyle = {
  padding: '8px 16px',
  borderRadius: 999,
  border: 'none',
  background: '#2563eb',
  color: '#fff',
  cursor: 'pointer',
  fontWeight: 600,
  fontSize: 14,
};

const tabBarStyle = {
  display: 'flex',
  gap: 8,
  marginBottom: 8,
};

const tabButtonStyle = {
  flex: 1,
  padding: '8px 12px',
  borderRadius: 999,
  border: '1px solid #1f2937',
  background: '#020617',
  color: '#e5e7eb',
  cursor: 'pointer',
  fontSize: 14,
};

const tabButtonActiveStyle = {
  background: '#1d4ed8',
  borderColor: '#1d4ed8',
  color: '#f9fafb',
};

export default App;

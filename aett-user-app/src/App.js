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

// lepo prikazivanje vremena
function formatTimestamp(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleString();
}

function App() {
  const [activeTab, setActiveTab] = useState('wallet'); // 'wallet' | 'scan'

  // --- Wallet form state ---
  const [selectedType, setSelectedType] = useState('2h');
  const [selectedZone, setSelectedZone] = useState('AB');
  const [origin, setOrigin] = useState('Bern, Switzerland');
  const [destination, setDestination] = useState('Zürich, Switzerland');
  const [personalized, setPersonalized] = useState(false);
  const [personalizedIdInput, setPersonalizedIdInput] = useState('');

  // --- Tickets: više karata + istorija (u localStorage) ---
  const [tickets, setTickets] = useState([]); // [{ token, ticketType, ... }]
  const [justBought, setJustBought] = useState(false);
  const [buyLoading, setBuyLoading] = useState(false);
  const [buyError, setBuyError] = useState(null);

  // vreme za live countdown
  const [now, setNow] = useState(Date.now());

  // --- Scan / verify state (za Scan tab) ---
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

  // učitaj istoriju iz localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem('aett_tickets');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setTickets(parsed);
        }
      }
    } catch (e) {
      console.error('Failed to load tickets from localStorage', e);
    }
  }, []);

  // upiši istoriju u localStorage kad se promeni
  useEffect(() => {
    try {
      localStorage.setItem('aett_tickets', JSON.stringify(tickets));
    } catch (e) {
      console.error('Failed to save tickets to localStorage', e);
    }
  }, [tickets]);

  // flash "✅ Ticket created" na 2 sekunde
  useEffect(() => {
    if (!justBought) return;
    const id = setTimeout(() => setJustBought(false), 2000);
    return () => clearTimeout(id);
  }, [justBought]);

  // globalni "sat" za countdown (osvežava se na 1s)
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // ----------------- Helpers za vreme / status karte -----------------

  function getTicketStatus(ticket) {
    if (!ticket.expiresAt) return null;
    const expiryMs = new Date(ticket.expiresAt).getTime();
    const diffSec = Math.floor((expiryMs - now) / 1000);
    if (diffSec <= 0) return 'expired';
    if (diffSec <= 5 * 60) return 'expiring';
    return 'active';
  }

  function formatRemaining(expiresAt) {
    if (!expiresAt) return '';
    const expiryMs = new Date(expiresAt).getTime();
    const diffSec = Math.floor((expiryMs - now) / 1000);
    if (diffSec <= 0) return '0 min 00 s';
    const m = Math.floor(diffSec / 60);
    const s = diffSec % 60;
    return `${m} min ${s.toString().padStart(2, '0')} s`;
  }

  function renderStatusPill(ticket) {
    const status = getTicketStatus(ticket);
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

  // ----------------- Handleri -----------------

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

      const newTicket = {
        token: data.token,
        ticketType: data.ticket_type,
        ticketZone: data.zone,
        origin: data.origin,
        destination: data.destination,
        personalizedId: data.personalized_id || null,
        expiresAt: data.expires_at,
        firstCheckedAt: data.first_checked_at || null,
        alreadyChecked: Boolean(data.already_checked),
        createdAt: new Date().toISOString(),
      };

      // najnovija karta ide na vrh
      setTickets((prev) => [newTicket, ...prev]);
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

        // ako ova karta postoji u našem wallet-u, ažuriraj istoriju (firstCheckedAt / alreadyChecked)
        setTickets((prev) =>
          prev.map((t) =>
            t.token === token
              ? {
                  ...t,
                  firstCheckedAt: t.firstCheckedAt || data.first_checked_at,
                  alreadyChecked: t.alreadyChecked || Boolean(data.already_checked),
                }
              : t
          )
        );
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

  function handleDeleteTicket(token) {
    setTickets((prev) => prev.filter((t) => t.token !== token));
  }

  function burnWallet() {
    if (!window.confirm('Delete all tickets from this device?')) return;
    setTickets([]);
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

  // ----------------- UI sections -----------------

  function renderWallet() {
    const embedUrl = getEmbedMapUrl(origin, destination);

    const activeTickets = tickets.filter(
      (t) => getTicketStatus(t) !== 'expired'
    );
    const expiredTickets = tickets.filter(
      (t) => getTicketStatus(t) === 'expired'
    );

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
          No account, no login — your address→address tickets live only in this browser tab
          (and locally in this device&apos;s history).
        </p>

        {/* Form za novu kartu */}
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

        {/* MAP PREVIEW */}
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

        {/* Personalization */}
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

        <div
          style={{
            marginTop: 20,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <h3 style={{ margin: 0 }}>My tickets</h3>
          {tickets.length > 0 && (
            <button
              onClick={burnWallet}
              style={{
                ...buttonStyle,
                backgroundColor: '#374151',
                padding: '4px 12px',
                fontSize: 12,
              }}
            >
              Clear all from this device
            </button>
          )}
        </div>

        {/* ACTIVE TICKETS */}
        {activeTickets.length === 0 && expiredTickets.length === 0 && (
          <p style={{ fontSize: 13, color: '#9ca3af', marginTop: 8 }}>
            No tickets yet. Buy one to get started.
          </p>
        )}

        {activeTickets.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <h4 style={{ margin: '8px 0' }}>Active tickets</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {activeTickets.map((t) => (
                <div
                  key={t.token}
                  style={{
                    borderRadius: 12,
                    border: '1px solid #1f2937',
                    padding: 12,
                    display: 'flex',
                    gap: 12,
                    flexWrap: 'wrap',
                  }}
                >
                  <div>
                    <QRCode value={t.token} size={140} />
                  </div>
                  <div style={{ flex: 1, minWidth: 220 }}>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <strong>
                        {t.origin} → {t.destination}
                      </strong>
                      {renderStatusPill(t)}
                    </div>
                    <p style={{ margin: '4px 0', fontSize: 13 }}>
                      <strong>Type:</strong> {t.ticketType || '—'} |{' '}
                      <strong>Zone:</strong> {t.ticketZone || '—'}
                    </p>
                    <p style={{ margin: '4px 0', fontSize: 12 }}>
                      <strong>Token:</strong>{' '}
                      <code style={{ wordBreak: 'break-all' }}>{t.token}</code>
                    </p>
                    <p style={{ margin: '4px 0', fontSize: 13 }}>
                      <strong>Expires at (UTC):</strong> {t.expiresAt}
                    </p>
                    <p style={{ margin: '4px 0', fontSize: 13 }}>
                      <strong>Time remaining:</strong>{' '}
                      {getTicketStatus(t) === 'expired'
                        ? 'Expired'
                        : formatRemaining(t.expiresAt)}
                    </p>

                    {t.personalizedId && (
                      <p style={{ margin: '4px 0', fontSize: 13 }}>
                        <strong>Personalized ID:</strong> {t.personalizedId}
                      </p>
                    )}

                    {t.firstCheckedAt && (
                      <p style={{ margin: '4px 0', fontSize: 11, color: '#9ca3af' }}>
                        First checked at: {formatTimestamp(t.firstCheckedAt)}{' '}
                        {t.alreadyChecked ? '(re-check)' : '(first time)'}
                      </p>
                    )}

                    <div style={{ marginTop: 6, display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => window.print()}
                        style={{
                          ...buttonStyle,
                          backgroundColor: '#16a34a',
                          padding: '4px 10px',
                          fontSize: 12,
                        }}
                      >
                        Print
                      </button>
                      <button
                        onClick={() => handleDeleteTicket(t.token)}
                        style={{
                          ...buttonStyle,
                          backgroundColor: '#4b5563',
                          padding: '4px 10px',
                          fontSize: 12,
                        }}
                      >
                        Remove from this device
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* HISTORY / EXPIRED TICKETS */}
        {expiredTickets.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <h4 style={{ margin: '8px 0' }}>Ticket history (expired)</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {expiredTickets.map((t) => (
                <div
                  key={t.token}
                  style={{
                    borderRadius: 10,
                    border: '1px dashed #374151',
                    padding: 10,
                    fontSize: 12,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>
                      {t.origin} → {t.destination}
                    </span>
                    <span style={{ color: '#dc2626' }}>Expired</span>
                  </div>
                  <div>
                    <strong>Type:</strong> {t.ticketType || '—'} |{' '}
                    <strong>Zone:</strong> {t.ticketZone || '—'}
                  </div>
                  <div>
                    <strong>Expires at:</strong> {t.expiresAt}
                  </div>
                  {t.firstCheckedAt && (
                    <div>
                      <strong>First checked:</strong>{' '}
                      {formatTimestamp(t.firstCheckedAt)}
                    </div>
                  )}
                  <button
                    onClick={() => handleDeleteTicket(t.token)}
                    style={{
                      ...buttonStyle,
                      backgroundColor: '#4b5563',
                      padding: '3px 8px',
                      fontSize: 11,
                      marginTop: 4,
                    }}
                  >
                    Remove from history
                  </button>
                </div>
              ))}
            </div>
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
          Point your camera at an AETT QR code to check if the address→address
          ticket is valid. This works for your tickets and for any compatible AETT ticket.
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
              <strong>Route:</strong> {scanOrigin || '—'} →{' '}
              {scanDestination || '—'}
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
              First checked at: {formatTimestamp(scanFirstCheckedAt)}{' '}
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
                ? ` (already checked at ${formatTimestamp(scanFirstCheckedAt)})`
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
          Anonymous E-Ticket Toolkit (address→address, multi-ticket wallet)
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
            🎫 My Tickets
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

// src/App.js
import React, { useState } from 'react';
import { QrReader } from 'react-qr-reader';

const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:8000';
console.log('AETT Conductor | API base =', API_BASE);

function formatTimestamp(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleString();
}

function App() {
  const [rawPayload, setRawPayload] = useState(null);   // ceo tekst iz QR-a
  const [token, setToken] = useState(null);             // izdvojeni token

  const [status, setStatus] = useState('idle');         // idle | verifying | valid | invalid | error
  const [reason, setReason] = useState(null);

  const [expiresAt, setExpiresAt] = useState(null);
  const [ticketType, setTicketType] = useState(null);
  const [zone, setZone] = useState(null);
  const [chain, setChain] = useState(null);

  const [origin, setOrigin] = useState(null);
  const [destination, setDestination] = useState(null);
  const [personalizedId, setPersonalizedId] = useState(null);

  const [firstCheckedAt, setFirstCheckedAt] = useState(null);
  const [alreadyChecked, setAlreadyChecked] = useState(false);

  // demo input: simulate scan (paste token here)
  const [simulatedInput, setSimulatedInput] = useState('');

  async function verifyScannedPayload(scannedText) {
    if (!scannedText) return;

    // ako smo već proverili isti QR i ništa se nije promenilo, nema potrebe da spamujemo backend
    if (scannedText === rawPayload && status === 'valid') {
      return;
    }

    setRawPayload(scannedText);
    setStatus('verifying');
    setReason(null);

    setExpiresAt(null);
    setTicketType(null);
    setZone(null);
    setChain(null);
    setOrigin(null);
    setDestination(null);
    setPersonalizedId(null);
    setFirstCheckedAt(null);
    setAlreadyChecked(false);

    // 1. Izvuci token:
    //    - ako je QR čisti token (novi sistem) -> koristi direktno
    //    - ako je JSON (fallback) -> probaj .token ili .ticket
    let extractedToken = scannedText;

    try {
      const maybeObj = JSON.parse(scannedText);
      if (maybeObj && typeof maybeObj === 'object') {
        if (maybeObj.token) {
          extractedToken = maybeObj.token;
        } else if (maybeObj.ticket) {
          extractedToken = maybeObj.ticket;
        }
      }
    } catch {
      // nije JSON, sasvim ok
    }

    setToken(extractedToken);

    try {
      const resp = await fetch(`${API_BASE}/tickets/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token: extractedToken }),
      });

      let data;
      try {
        data = await resp.json();
      } catch {
        const txt = await resp.text();
        throw new Error(`Backend ${resp.status}: ${txt}`);
      }

      // backend uvek vraća 200 + { valid: bool, reason?: string, ... }
      if (!resp.ok) {
        throw new Error(data?.reason || `Backend ${resp.status}`);
      }

      if (data.valid) {
        setStatus('valid');
      } else {
        setStatus('invalid');
      }

      setReason(data.reason ?? null);
      setExpiresAt(data.expires_at ?? null);
      setTicketType(data.ticket_type ?? null);
      setZone(data.zone ?? null);
      setChain(data.chain ?? null);
      setOrigin(data.origin ?? null);
      setDestination(data.destination ?? null);
      setPersonalizedId(data.personalized_id ?? null);
      setFirstCheckedAt(data.first_checked_at ?? null);
      setAlreadyChecked(Boolean(data.already_checked));
    } catch (err) {
      console.error('Verify error:', err);
      setStatus('error');
      setReason(err.message || 'Network / server error');
    }
  }

  function renderStatusLabel() {
    if (status === 'verifying') {
      return <span>🔄 Verifying…</span>;
    }

    if (status === 'valid') {
      const formattedFirst = formatTimestamp(firstCheckedAt);

      if (alreadyChecked && firstCheckedAt) {
        return (
          <span style={{ color: 'lime', fontWeight: 600 }}>
            ✅ VALID (already checked first at {formattedFirst})
          </span>
        );
      }

      if (firstCheckedAt) {
        return (
          <span style={{ color: 'lime', fontWeight: 600 }}>
            ✅ VALID (first check at {formattedFirst})
          </span>
        );
      }

      return (
        <span style={{ color: 'lime', fontWeight: 600 }}>
          ✅ VALID
        </span>
      );
    }

    if (status === 'invalid') {
      return (
        <span style={{ color: 'red', fontWeight: 600 }}>
          ❌ INVALID
        </span>
      );
    }

    if (status === 'error') {
      return (
        <span style={{ color: 'orange', fontWeight: 600 }}>
          ⚠️ ERROR
        </span>
      );
    }

    return <span>Waiting for QR…</span>;
  }

  // demo: ručno verifikuj token iz inputa
  function handleSimulateVerify() {
    const trimmed = simulatedInput.trim();
    if (!trimmed) return;
    verifyScannedPayload(trimmed);
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#020617',
        color: '#e5e7eb',
        fontFamily:
          'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: 20,
      }}
    >
      <header style={{ width: '100%', maxWidth: 800, marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: 24 }}>AETT Conductor Scanner</h1>
        <p style={{ margin: 0, fontSize: 14, color: '#9ca3af' }}>
          Scan anonymous address→address tickets. The same ticket can be checked
          by multiple conductors on multiple trains; we show when it was first scanned.
        </p>
      </header>

      <main style={{ width: '100%', maxWidth: 800 }}>
        <div
          style={{
            background: '#0f172a',
            borderRadius: 12,
            padding: 20,
            boxShadow: '0 10px 25px rgba(0,0,0,0.45)',
          }}
        >
          <h2 style={{ marginTop: 0, marginBottom: 8, fontSize: 18 }}>
            Scanner
          </h2>
          <p
            style={{
              marginTop: 0,
              marginBottom: 12,
              color: '#9ca3af',
              fontSize: 14,
            }}
          >
            In production, the QR scanner fills the token automatically.
            For the demo, you can also paste a token from the wallet app
            into the “Simulate scan” field below.
          </p>

          {/* Kamera skener */}
          <div style={{ width: 320, maxWidth: '100%', marginBottom: 16 }}>
            <QrReader
              constraints={{ facingMode: 'environment' }}
              onResult={(result, error) => {
                if (result?.text) {
                  verifyScannedPayload(result.text);
                }
                // error ignorisemo da ne spamuje UI
              }}
              containerStyle={{ width: '100%' }}
              videoStyle={{ width: '100%' }}
            />
          </div>

          {/* DEMO: Simulate scan input */}
          <div
            style={{
              marginBottom: 16,
              padding: 10,
              borderRadius: 8,
              backgroundColor: '#020617',
              border: '1px dashed #1f2937',
            }}
          >
            <label
              style={{
                fontSize: 13,
                display: 'block',
                marginBottom: 6,
                color: '#e5e7eb',
              }}
            >
              Simulate scan (paste token from wallet)
            </label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input
                type="text"
                value={simulatedInput}
                onChange={(e) => setSimulatedInput(e.target.value)}
                placeholder="Paste token string here…"
                style={{
                  flex: 1,
                  minWidth: 220,
                  padding: 6,
                  borderRadius: 999,
                  border: '1px solid #4b5563',
                  backgroundColor: '#020617',
                  color: '#e5e7eb',
                  fontSize: 13,
                }}
              />
              <button
                type="button"
                onClick={handleSimulateVerify}
                style={{
                  padding: '6px 14px',
                  borderRadius: 999,
                  border: 'none',
                  background: '#2563eb',
                  color: '#fff',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: 13,
                  whiteSpace: 'nowrap',
                }}
              >
                Verify
              </button>
            </div>
            <p
              style={{
                fontSize: 11,
                color: '#9ca3af',
                marginTop: 4,
              }}
            >
              This field is for the hackathon demo only. In real deployment, the
              verification logic is triggered only by the QR camera.
            </p>
          </div>

          {/* Rezultati verifikacije */}
          <div style={{ marginTop: 8 }}>
            <h3 style={{ marginBottom: 4 }}>Status: {renderStatusLabel()}</h3>

            {reason && (
              <p style={{ fontSize: 13, color: '#f97316' }}>
                Reason: {reason}
              </p>
            )}

            {token && (
              <p style={{ fontSize: 13, wordBreak: 'break-all' }}>
                <strong>Token:</strong> <code>{token}</code>
              </p>
            )}

            {rawPayload && rawPayload !== token && (
              <p
                style={{
                  fontSize: 12,
                  wordBreak: 'break-all',
                  color: '#9ca3af',
                }}
              >
                <strong>Raw payload:</strong> {rawPayload}
              </p>
            )}

            {origin && destination && (
              <p style={{ fontSize: 13 }}>
                <strong>Route:</strong> {origin} → {destination}
              </p>
            )}

            {(ticketType || zone) && (
              <p style={{ fontSize: 13 }}>
                <strong>Type:</strong> {ticketType || '—'} |{' '}
                <strong>Zone:</strong> {zone || '—'}
              </p>
            )}

            {expiresAt && (
              <p style={{ fontSize: 13 }}>
                <strong>Expires at:</strong> {expiresAt}
              </p>
            )}

            {personalizedId && (
              <p style={{ fontSize: 12 }}>
                <strong>Personalized ID (optional):</strong> {personalizedId}
              </p>
            )}

            {chain && (
              <p
                style={{
                  fontSize: 11,
                  color: '#6b7280',
                  wordBreak: 'break-all',
                }}
              >
                <strong>Chain hash:</strong> {chain}
              </p>
            )}

            {firstCheckedAt && (
              <p style={{ fontSize: 11, color: '#9ca3af' }}>
                First checked at: {formatTimestamp(firstCheckedAt)}{' '}
                {alreadyChecked ? '(re-check)' : '(first time)'}
              </p>
            )}
          </div>
        </div>
      </main>

      <footer
        style={{
          width: '100%',
          maxWidth: 800,
          marginTop: 24,
          borderTop: '1px solid #1f2937',
          paddingTop: 8,
          fontSize: 11,
          color: '#6b7280',
          textAlign: 'right',
        }}
      >
        Backend: {API_BASE}
      </footer>
    </div>
  );
}

export default App;

// src/App.js
import React, { useState } from 'react';
import { QrReader } from 'react-qr-reader';

const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:8000';

function App() {
  const [rawPayload, setRawPayload] = useState(null);   // ceo tekst iz QR-a
  const [token, setToken] = useState(null);             // izdvojeni token
  const [status, setStatus] = useState('idle');         // idle | verifying | valid | invalid | error
  const [reason, setReason] = useState(null);           // razlog kad je invalid/error
  const [expiresAt, setExpiresAt] = useState(null);
  const [ticketType, setTicketType] = useState(null);
  const [zone, setZone] = useState(null);
  const [chain, setChain] = useState(null);             // "cybertrack" hash

  async function verifyScannedPayload(scannedText) {
    if (!scannedText) return;

    setRawPayload(scannedText);
    setStatus('verifying');
    setReason(null);
    setExpiresAt(null);
    setTicketType(null);
    setZone(null);
    setChain(null);

    // 1. Izvuci token:
    //    - ako je QR čisti token (novi sistem) -> koristi direktno
    //    - ako je JSON (stari sistem) -> probaj .token ili .ticket
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
    } catch (_) {
      // nije JSON, OK
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

      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`Backend ${resp.status}: ${text}`);
      }

      const data = await resp.json();
      // data: { valid, reason?, expires_at?, ticket_type?, zone?, chain? }

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
    } catch (err) {
      console.error(err);
      setStatus('error');
      setReason(err.message || 'Network / server error');
    }
  }

  function renderStatusLabel() {
    if (status === 'verifying') {
      return <span>🔄 Verifying…</span>;
    }
    if (status === 'valid') {
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

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#020617',
        color: '#e5e7eb',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: 20,
      }}
    >
      <header style={{ width: '100%', maxWidth: 800, marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: 24 }}>AETT Conductor Scanner</h1>
        <p style={{ margin: 0, fontSize: 14, color: '#9ca3af' }}>
          Scan passenger QR codes and verify tickets against the backend.
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
          <p style={{ marginTop: 0, marginBottom: 12, color: '#9ca3af', fontSize: 14 }}>
            Point the camera at the passenger&apos;s QR code. The app will send the
            scanned token to <code>{API_BASE}/tickets/verify</code>.
          </p>

          <div style={{ width: 320, maxWidth: '100%', marginBottom: 16 }}>
            <QrReader
              constraints={{ facingMode: 'environment' }}
              onResult={(result, error) => {
                if (result?.text) {
                  // može da vrti više puta, ali za demo je ok
                  verifyScannedPayload(result.text);
                }
                // error ignorisemo da ne spamuje UI
              }}
              containerStyle={{ width: '100%' }}
              videoStyle={{ width: '100%' }}
            />
          </div>

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
              <p style={{ fontSize: 12, wordBreak: 'break-all', color: '#9ca3af' }}>
                <strong>Raw payload:</strong> {rawPayload}
              </p>
            )}

            {expiresAt && (
              <p style={{ fontSize: 13 }}>
                <strong>Expires at (UTC):</strong> {expiresAt}
              </p>
            )}

            {(ticketType || zone) && (
              <p style={{ fontSize: 13 }}>
                <strong>Type:</strong> {ticketType || '—'} |{' '}
                <strong>Zone:</strong> {zone || '—'}
              </p>
            )}

            {chain && (
              <p style={{ fontSize: 11, color: '#6b7280', wordBreak: 'break-all' }}>
                <strong>Chain hash:</strong> {chain}
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

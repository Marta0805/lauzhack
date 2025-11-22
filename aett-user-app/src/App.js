import React, { useState } from 'react';
import QRCode from 'qrcode.react';

const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:8000';

function App() {
  const [ticket, setTicket] = useState(null);
  const [expiresAt, setExpiresAt] = useState(null);
  const [loading, setLoading] = useState(false);

  async function buyTicket() {
    setLoading(true);
    try {
      const resp = await fetch(`${API_BASE}/buy?duration_minutes=120`, { method: 'POST' });
      const data = await resp.json();
      setTicket(data.token);
      setExpiresAt(data.expires_at);
    } catch (e) {
      alert('Error buying ticket: ' + e);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{padding:20,fontFamily:'Arial'}}>
      <h2>AETT — Anonymous Ticket Wallet</h2>
      <p>No account, no login — your ticket lives only on this device.</p>
      <button onClick={buyTicket} disabled={loading}>
        {loading ? 'Buying...' : 'Buy 2h Ticket (Demo)'}
      </button>

      {ticket && (
        <div style={{marginTop:20}}>
          <h3>Your ticket</h3>
          <QRCode value={JSON.stringify({ticket, expiresAt})} size={240} />
          <p>Token: <code style={{wordBreak:'break-all'}}>{ticket}</code></p>
          <p>Expires at: {expiresAt}</p>
          <p style={{fontSize:12,color:'#666'}}>Note: this token is stored only in this app (Local state). Refreshing the page will lose it — intentional for privacy.</p>
        </div>
      )}
    </div>
  );
}

export default App;
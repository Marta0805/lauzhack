import React, { useState } from 'react';
import {QrReader} from 'react-qr-reader';

const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:8000';

function App(){
  const [lastScan, setLastScan] = useState(null);
  const [status, setStatus] = useState(null);

  async function handleScan(result) {
    if (!result) return;
    try {
      const parsed = JSON.parse(result);
      const token = parsed.ticket || parsed;
      setLastScan(token);
      const resp = await fetch(`${API_BASE}/verify/${encodeURIComponent(token)}`);
      const data = await resp.json();
      setStatus(data.valid ? 'valid' : 'invalid');
    } catch (e) {
      setStatus('error');
    }
  }

  return (
    <div style={{padding:20,fontFamily:'Arial'}}>
      <h2>Conductor Scanner (AETT)</h2>
      <p>Point camera at passenger QR code</p>

      <div style={{width:320,maxWidth:'100%'}}>
        <QrReader
          onResult={(result, error) => {
            if (!!result) handleScan(result?.text);
          }}
          constraints={{ facingMode: 'environment' }}
        />
      </div>

      <div style={{marginTop:16}}>
        <p>Last token: <code style={{wordBreak:'break-all'}}>{lastScan}</code></p>
        <h3>Status: {status === 'valid' ? <span style={{color:'green'}}>✅ VALID</span> : status === 'invalid' ? <span style={{color:'red'}}>❌ INVALID</span> : status === 'error' ? <span>⚠️ ERROR</span> : <span>Waiting...</span>}</h3>
      </div>
    </div>
  );
}

export default App;
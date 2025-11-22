from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from uuid import uuid4
from datetime import datetime, timedelta
from typing import Dict

app = FastAPI(title="AETT Backend")

TOKENS: Dict[str, str] = {}

class BuyResponse(BaseModel):
    token: str
    expires_at: str

class VerifyResponse(BaseModel):
    valid: bool
    expires_at: str | None = None

def make_expiry(duration_minutes: int = 60):
    return (datetime.utcnow() + timedelta(minutes=duration_minutes)).isoformat() + "Z"

@app.post("/buy", response_model=BuyResponse)
async def buy_ticket(duration_minutes: int = 60):
    token = str(uuid4())
    expiry = make_expiry(duration_minutes)
    TOKENS[token] = expiry
    return BuyResponse(token=token, expires_at=expiry)

@app.get("/verify/{token}", response_model=VerifyResponse)
async def verify_token(token: str):
    expiry_iso = TOKENS.get(token)
    if not expiry_iso:
        return VerifyResponse(valid=False, expires_at=None)
    expiry_dt = datetime.fromisoformat(expiry_iso.replace('Z',''))
    if datetime.utcnow() > expiry_dt:
        del TOKENS[token]
        return VerifyResponse(valid=False, expires_at=None)
    return VerifyResponse(valid=True, expires_at=expiry_iso)

@app.get("/health")
async def health():
    return {"status": "ok", "valid_tokens": len(TOKENS)}
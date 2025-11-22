import base64
import hmac
import json
import os
import pathlib
from datetime import datetime, timedelta, timezone
from typing import Literal, Optional, Dict

from fastapi import FastAPI, HTTPException, Depends, Header, Body
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, BaseSettings, Field

# ---------------------------------------------------------------------------
# Settings / configuration
# ---------------------------------------------------------------------------


class Settings(BaseSettings):
    # strong secret for HMAC
    secret_key: str = Field(..., env="AETT_SECRET_KEY")
    # API key for trusted clients (wallet / conductor)
    api_key: str = Field(..., env="AETT_API_KEY")
    # default ticket lifetime in minutes
    ticket_lifetime_minutes: int = Field(
        2, env="AETT_TICKET_LIFETIME_MINUTES"
    )
    # logical issuer name
    issuer: str = Field("aett-backend", env="AETT_ISSUER")
    # raw origins string from env; we'll parse manually to avoid JSON issues
    allowed_origins_raw: str = Field(
        "http://localhost:3000", env="AETT_ALLOWED_ORIGINS"
    )

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()


def parse_allowed_origins(raw: str):
    """
    Support:
      - AETT_ALLOWED_ORIGINS=http://localhost:3000
      - AETT_ALLOWED_ORIGINS=http://a.com,http://b.com
      - AETT_ALLOWED_ORIGINS=["http://a.com","http://b.com"]
      - AETT_ALLOWED_ORIGINS=*
    """
    raw = (raw or "").strip()
    if not raw:
        return ["http://localhost:3000"]

    # wildcard za hackathon: dozvoli sve
    if raw == "*":
        return ["*"]

    # try JSON array first (["http://a", "http://b"])
    if raw.startswith("["):
        try:
            arr = json.loads(raw)
            return [str(o).strip() for o in arr if str(o).strip()]
        except Exception:
            # fall back to comma split
            pass

    # fallback: comma-separated list
    return [o.strip() for o in raw.split(",") if o.strip()]


app = FastAPI(title="AETT Backend (stateless tickets)")

origins = parse_allowed_origins(settings.allowed_origins_raw)

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],   # dozvoli sve metode (uklj. OPTIONS, POST, GET...)
    allow_headers=["*"],   # dozvoli sve headere (Content-Type, X-API-Key, itd.)
)

# ---------------------------------------------------------------------------
# Mini-JWT (HS256) helpers
# ---------------------------------------------------------------------------

HEADER = {"alg": "HS256", "typ": "AETT"}


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64url_decode(data: str) -> bytes:
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + padding)


def _sign(message: bytes) -> str:
    sig = hmac.new(settings.secret_key.encode("utf-8"), message, "sha256").digest()
    return _b64url_encode(sig)


class TicketPayload(BaseModel):
    jti: str  # ticket id (random hex)
    sub: Literal["ticket"] = "ticket"
    ticket_type: Literal["single", "2h", "day", "monthly"]
    zone: str

    # address → address
    origin: str
    destination: str

    iat: int  # issued at (unix seconds)
    exp: int  # expires at (unix seconds)
    iss: str
    chain: Optional[str] = None  # optional "cybertrack" hash

    # optional personalization
    personalized_id: Optional[str] = None

    def expires_at_iso(self) -> str:
        return datetime.fromtimestamp(self.exp, tz=timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# Persistent state (hash-chain + first scan times)
# ---------------------------------------------------------------------------

STATE_FILE = pathlib.Path("aett_state.json")

# simple in-memory "blockchain-like" last hash
LAST_CHAIN_HASH: Optional[str] = None

# kada je dati ticket (jti) prvi put skeniran
FIRST_SCAN: Dict[str, int] = {}


def load_state():
    """Učitaj LAST_CHAIN_HASH i FIRST_SCAN iz JSON fajla ako postoji."""
    global LAST_CHAIN_HASH, FIRST_SCAN
    if not STATE_FILE.exists():
        return
    try:
        with STATE_FILE.open("r", encoding="utf-8") as f:
            data = json.load(f)
        LAST_CHAIN_HASH = data.get("last_chain_hash")
        fs = data.get("first_scan", {})
        FIRST_SCAN = {str(k): int(v) for k, v in fs.items()}
        print("State loaded from", STATE_FILE)
    except Exception as e:
        print("WARN: failed to load state:", e)


def save_state():
    """Upiši LAST_CHAIN_HASH i FIRST_SCAN u JSON fajl (brutal, ali ok za hackathon)."""
    try:
        data = {
            "last_chain_hash": LAST_CHAIN_HASH,
            "first_scan": FIRST_SCAN,
        }
        with STATE_FILE.open("w", encoding="utf-8") as f:
            json.dump(data, f)
    except Exception as e:
        print("WARN: failed to save state:", e)


# učitaj stanje pri startu servera
load_state()

# ---------------------------------------------------------------------------
# Encode / decode helpers
# ---------------------------------------------------------------------------


def encode_ticket(payload: TicketPayload) -> str:
    # pydantic v1: use .json()
    payload_json = payload.json(
        separators=(",", ":"), sort_keys=True
    ).encode("utf-8")
    header_json = json.dumps(
        HEADER, separators=(",", ":"), sort_keys=True
    ).encode("utf-8")

    header_b64 = _b64url_encode(header_json)
    payload_b64 = _b64url_encode(payload_json)

    signing_input = f"{header_b64}.{payload_b64}".encode("ascii")
    signature_b64 = _sign(signing_input)

    return f"{header_b64}.{payload_b64}.{signature_b64}"


def decode_and_verify(token: str) -> TicketPayload:
    try:
        header_b64, payload_b64, sig_b64 = token.split(".")
    except ValueError:
        raise HTTPException(status_code=400, detail="Malformed token")

    signing_input = f"{header_b64}.{payload_b64}".encode("ascii")
    expected_sig = _sign(signing_input)

    # Constant-time compare
    if not hmac.compare_digest(expected_sig, sig_b64):
        raise HTTPException(status_code=401, detail="Invalid signature")

    try:
        payload_json = _b64url_decode(payload_b64).decode("utf-8")
        payload_data = json.loads(payload_json)
        payload = TicketPayload.parse_obj(payload_data)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid payload")

    now = int(datetime.now(tz=timezone.utc).timestamp())
    if now > payload.exp:
        raise HTTPException(status_code=401, detail="Ticket expired")

    if payload.iss != settings.issuer:
        raise HTTPException(status_code=401, detail="Invalid issuer")

    return payload


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class BuyRequest(BaseModel):
    ticket_type: Literal["single", "2h", "day", "monthly"]
    zone: str
    origin: str
    destination: str
    personalized_id: Optional[str] = None


class BuyResponse(BaseModel):
    token: str
    expires_at: str
    ticket_type: str
    zone: str
    origin: str
    destination: str
    chain: Optional[str] = None
    personalized_id: Optional[str] = None

    # za UX: odmah znamo da karta još nije očitana
    first_checked_at: Optional[str] = None
    already_checked: bool = False


class VerifyResponse(BaseModel):
    valid: bool
    reason: Optional[str] = None

    expires_at: Optional[str] = None
    ticket_type: Optional[str] = None
    zone: Optional[str] = None
    origin: Optional[str] = None
    destination: Optional[str] = None
    chain: Optional[str] = None
    personalized_id: Optional[str] = None

    # multi-scan info (3 voza, 3 konduktera)
    first_checked_at: Optional[str] = None
    already_checked: bool = False


# ---------------------------------------------------------------------------
# Security dependencies
# ---------------------------------------------------------------------------


async def require_api_key(x_api_key: str = Header(..., alias="X-API-Key")):
    if x_api_key != settings.api_key:
        raise HTTPException(status_code=401, detail="Invalid API key")
    return True


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@app.post(
    "/tickets/buy",
    response_model=BuyResponse,
    dependencies=[Depends(require_api_key)],
)
async def buy_ticket(req: BuyRequest):
    """
    Issue a new stateless ticket.
    The QR code should encode ONLY the `token` string from this response.
    """
    global LAST_CHAIN_HASH

    now = datetime.now(tz=timezone.utc)
    exp = now + timedelta(minutes=settings.ticket_lifetime_minutes)

    # --- "Cybertrack" hash-chain:
    # each ticket links to the previous ticket's hash using a HMAC-based hash
    prev = LAST_CHAIN_HASH or ""
    raw_chain = (
        f"{prev}|{req.ticket_type}|{req.zone}|{req.origin}|"
        f"{req.destination}|{int(now.timestamp())}"
    )
    chain_hash = _b64url_encode(
        hmac.new(
            settings.secret_key.encode("utf-8"),
            raw_chain.encode("utf-8"),
            "sha256",
        ).digest()
    )
    LAST_CHAIN_HASH = chain_hash
    save_state()   # <<< sačuvaj novi last_chain_hash

    payload = TicketPayload(
        jti=os.urandom(16).hex(),
        ticket_type=req.ticket_type,
        zone=req.zone,
        origin=req.origin,
        destination=req.destination,
        iat=int(now.timestamp()),
        exp=int(exp.timestamp()),
        iss=settings.issuer,
        chain=chain_hash,
        personalized_id=req.personalized_id,
    )

    token = encode_ticket(payload)

    return BuyResponse(
        token=token,
        expires_at=payload.expires_at_iso(),
        ticket_type=req.ticket_type,
        zone=req.zone,
        origin=req.origin,
        destination=req.destination,
        chain=chain_hash,
        personalized_id=req.personalized_id,
        first_checked_at=None,
        already_checked=False,
    )


@app.post("/tickets/verify", response_model=VerifyResponse)
async def verify_ticket(token: str = Body(..., embed=True)):
    """
    Conductor app hits this endpoint with the scanned QR payload.
    Body: { "token": "<opaque-token-string>" }

    Ticket ostaje validan i kada ga skeniraju više konduktera:
    - dok ne istekne exp, `valid=True`
    - čuvamo samo vreme PRVOG skeniranja (FIRST_SCAN[jti])
    - vraćamo `already_checked = True/False`
    """
    global FIRST_SCAN

    try:
        payload = decode_and_verify(token)
    except HTTPException as ex:
        reason = ex.detail if isinstance(ex.detail, str) else "invalid"
        return VerifyResponse(valid=False, reason=reason)

    now_ts = int(datetime.now(tz=timezone.utc).timestamp())
    first_ts = FIRST_SCAN.get(payload.jti)
    already = first_ts is not None

    if first_ts is None:
        # prvo očitavanje ove karte
        first_ts = now_ts
        FIRST_SCAN[payload.jti] = first_ts
        save_state()   # <<< sačuvaj update FIRST_SCAN

    first_iso = datetime.fromtimestamp(first_ts, tz=timezone.utc).isoformat()

    return VerifyResponse(
        valid=True,
        expires_at=payload.expires_at_iso(),
        ticket_type=payload.ticket_type,
        zone=payload.zone,
        origin=payload.origin,
        destination=payload.destination,
        chain=payload.chain,
        personalized_id=payload.personalized_id,
        first_checked_at=first_iso,
        already_checked=already,
    )


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "issuer": settings.issuer,
        "ticket_lifetime_minutes": settings.ticket_lifetime_minutes,
        "allowed_origins": origins,
    }

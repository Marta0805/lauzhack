AETT – Anonymous E-Ticket Toolkit

LauzHack 2025 project – privacy-friendly public transport tickets.

1. Idea

Today: every digital ticket is linked to a real identity (credit card, app account, phone).
Goal: anonymous but verifiable tickets.

AETT = small end-to-end prototype:

User Wallet – buy & store multiple QR tickets

Conductor Scanner – validate tickets (camera or “simulate scan” input)

Backend (FastAPI) – stateless tickets signed with HMAC

2. What problem do we solve?

- Passenger can buy a ticket without account or name

- Ticket can be checked by many conductors, many times

- Copying the QR is useless (backend state + signature)

- Optional “virtual card” for perks, still pseudonymous

3. Architecture
Backend (FastAPI, Python)

Issues signed tokens (mini-JWT, HS256) with:

ticket_type (single, day, monthly)

zone

origin, destination (free-text addresses)

optional personalized_id and card_id

validity window (iat, exp)

Endpoints:

POST /tickets/buy – create ticket

POST /tickets/verify – validate token, return metadata

GET /health – health check

Stateless: everything is in the token + HMAC.

In-memory “cybertrack” chain for extra tamper-evidence (optional).

User Wallet App (React)

Buy anonymous ticket from address → address

Show Google Maps iframe preview of the route

Generate QR code from the opaque token

Store multiple tickets in a local wallet (localStorage)

Split into:

Active tickets (countdown, status pill)

Expired history

Optional:

Personalized ID (nickname / SwissPass-like id)

Virtual AETT Card tab:

creates local CARD-… id

shows QR + card id

future tickets can embed card_id (pseudonymous perks)

Conductor Scanner App (React)

Live camera scan (react-qr-reader)

Simulate scan text input:

paste token from wallet

click “Verify” → calls /tickets/verify

perfect for the demo when camera is flaky

Shows:

VALID / INVALID

reason (expired / bad signature / wrong issuer…)

route, ticket type, zone, expiry time

first check vs. re-check for the same ticket

4. Demo Flow

Start backend: uvicorn main:app --reload

Start wallet app on port 3000

buy a day ticket

show QR + map preview + countdown

Start conductor app on port 3001

copy token from wallet

paste into “Simulate scan” → ✅ VALID

show that multiple scans are allowed, with “already checked at …” info

5. Why this matters

Copy-safe: each ticket has unique ID + state, backend detects duplicates.

Anonymous by default: no name, no card, only route + type + time.

Optional identity: virtual card + personalized ID for discounts or loyalty.

Realistic: aligns with Swiss public transport setup (multi-leg trips, multiple checks, address-based travel).

6. Tech stack

Backend: Python, FastAPI, HMAC mini-JWT

Frontend: React, qrcode.react, react-qr-reader

Storage: in-memory + browser localStorage (for demo)
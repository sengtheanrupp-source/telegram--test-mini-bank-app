# Mini App Improvements (updated)

## Menus — English only
All main menu labels are English again (Scan QR, Pay Bill, Screen, Post, etc.).

## 1. Screen share (phone → mini app for team demo)
New **Screen** tile on home opens **Screen Share**:
- **Phone (Host):** Start sharing → pick screen/app → get a 6-letter **Room code**
- Send the code to teammates in Telegram
- **PC (Viewer):** Screen → Join room → paste code → **live phone screen** in the mini app

Uses PeerJS + WebRTC (STUN). No extra backend. Good for walkthrough demos to the team.

Still available: Image & screenshot KHQR scanner (link at bottom of Screen Share view).

## 2. Post & Comment — Khmer still supported
Noto Sans Khmer font; captions/comments accept Khmer text (inputs keep Khmer placeholders + font).

## 3. បាទ / ទេ only — no voice
- Confirmation is **button-only** (no TTS / no spoken prompts).
- AI-style ask sheet with **បាទ** and **ទេ**.
- On **បាទ**, the app continues the action (KHQR pay, Pay Bills mode, Deeplink confirm).
- On **ទេ**, cancels.

## 4. Snappier button animation
Faster active/scale feedback (less sticky web feel).

## Deploy
Same static / Vercel deploy. PeerJS loads from CDN (`unpkg.com/peerjs`).

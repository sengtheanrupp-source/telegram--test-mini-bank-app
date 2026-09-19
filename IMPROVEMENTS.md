# Screen Share (open-source WebRTC)

## Why Telegram alone cannot do AnyDesk-style share
Telegram Mini App WebView **blocks** `getDisplayMedia` (OS screen capture) on Android & iOS.
Native apps (AnyDesk, TeamViewer) use MediaProjection / ReplayKit — not available in a web mini app.

## Solution (open source)
Stack: **WebRTC + PeerJS + STUN** (no paid server).

### Mode A — Real phone screen (recommended)
1. In mini app: **Screen → Share real screen**
2. Opens **Chrome** page `screen-host.html`
3. User allows **Entire screen**
4. Team joins same **Room code** inside the mini app (PC)
5. Live OS screen video (clear, fullscreen on PC)

### Mode B — Mini-app UI demo (inside Telegram)
Streams only the payment mini app UI (html2canvas + WebRTC). Good for payment flow walkthrough without leaving Telegram.

## Files
- `screen-host.html` — host page for real OS share (open in Chrome)
- `index.html` / `app.js` — viewer + mini-app demo + room join

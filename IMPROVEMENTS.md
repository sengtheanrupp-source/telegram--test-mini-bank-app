# Mini App Improvements (2026-09-19)

## 1. Home menu — Screen
- Replaced **Upload QR** tile with **អេក្រង់ / Screen** on the main home grid.
- Opens the existing Image & Screen KHQR Scanner (upload screenshot from Android/iOS or Capture Tab/Screen on PC).
- Purpose: view phone screen content (screenshots) inside the Telegram mini app on desktop.

## 2. Post & Comment — Khmer language
- Added **Noto Sans Khmer** font (Google Fonts).
- Post caption and comment inputs: `lang="km"`, `dir="auto"`, Khmer placeholders.
- Feed captions and comments render with Khmer font for correct Unicode display.

## 3. System voice + បាទ / ទេ (Pay Bills, KHQR, Deeplink)
- Removed reliance on pure “sound commands” for these flows.
- New **voiceYesNoSheet** UI: system speaks (male preference), user taps **បាទ** or **ទេ**.
- **Pay Bills**: asks Inquiry only vs Inquiry & pay.
- **KHQR**: after scan, asks “Pay?” before confirm.
- **Deeplink**: asks confirm; on **បាទ** auto-clicks Confirm (and tries Done).
- Works together with existing voiceConfirm preference in Settings.

## 4. Faster, less “sticky” clicks
- Shorter transitions (≈0.06–0.1s) with spring easing.
- Stronger `:active` scale on tiles, primary buttons, and cards (game/social feel).
- `touch-action: manipulation` to reduce mobile tap delay.

## 5. UI & voice bilingual + male speaker
- Home tiles and CTAs: **Khmer on top**, **English under**.
- System TTS prefers **male** voices for Khmer and English (`speakSystemMale`).
- Yes/No sheet labels: បាទ/ទេ with Yes/No under.

### Files touched
- `index.html` — fonts, CSS, home menu, inputs, voice sheet
- `app.js` — askVoiceYesNo, prompt helpers, confirm wrappers, Khmer caption CSS

### Deploy
Same as before (Vercel / static host). No new env vars required.

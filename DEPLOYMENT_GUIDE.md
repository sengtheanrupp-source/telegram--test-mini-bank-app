# Complete Guide: Git Push, Vercel Free Deployment & Telegram Mini App Setup

Follow this simple step-by-step guide to push your Telegram Mini App code to Git, deploy it to Vercel with a free SSL domain, and link it with Telegram `@BotFather` so your team and users can open and test it directly inside Telegram.

---

## 📌 Step 1: Initialize Git and Push Code to GitHub

1. **Open PowerShell or Terminal** in your project folder:

   ```bash
   cd "d:\Thean\Bill24 Working\Test Case\BillFlow\Tool\telegram mini payment app"
   ```

2. **Initialize Git Repository**:

   ```bash
   git init
   git branch -M main
   ```

3. **Stage and Commit all Files**:

   ```bash
   git add .
   git commit -m "updated the Khmer voice to male
   ```

4. **Create a Repository on GitHub**:
   - Go to [GitHub.com](https://github.com/new) and create a new repository (e.g. `git `).
   - Copy your repository URL (e.g. `https://github.com/your-username/telegram-mini-bank-app.git`).

5. **Link and Push to GitHub**:
   ```bash
   git remote add origin https://github.com/your-username/telegram-mini-bank-app.git
   git push -u origin main
   ```

---

## 🚀 Step 2: Deploy to Vercel (Free Domain & SSL)

### Method A: Via Vercel Web Dashboard (Recommended)

1. Go to [Vercel.com](https://vercel.com) and log in (or sign up free with GitHub).
2. Click **"Add New..."** → **"Project"**.
3. Select your GitHub repository (`telegram-mini-bank-app`) and click **"Import"**.
4. Keep all default settings (Framework Preset: _Other_ / _Static Site_).
5. Click **"Deploy"**.
6. Within 15 seconds, Vercel will give you a live HTTPS domain, for example:
   `https://telegram-mini-bank-app.vercel.app`

### Method B: Via Vercel CLI (Command Line)

1. Run Vercel CLI in your terminal:
   ```bash
   npx vercel
   ```
2. Log in when prompted.
3. Accept default options (Press Enter for all steps).
4. Vercel will output your production URL:
   `https://telegram-mini-bank-app.vercel.app`

---

## 🤖 Step 3: Register Mini App with Telegram `@BotFather`

1. Open **Telegram** on phone or desktop and search for `@BotFather`.
2. Start chat with `@BotFather` and send command:

   ```text
   /newbot
   ```

   Follow instructions to choose a name and username (e.g. `BillPaymentDemoBot`).

3. Send command to create a Mini App:
   ```text
   /newapp
   ```
4. Select your bot (`@BillPaymentDemoBot`).
5. Enter **Title**: `Bank Payment & KHQR`
6. Enter **Description**: `Inquiry, Pay bills, and Live Camera KHQR scanner for Telegram`
7. Upload demo image/photo when requested (or send `/empty` to skip).
8. Enter **Web App URL**: Paste your Vercel URL from Step 2:
   ```text
   https://telegram-mini-bank-app.vercel.app
   ```
9. Enter a **Short Name** (e.g. `pay` or `app`).

10. 🎉 **Done!** `@BotFather` will generate your direct Telegram Mini App share link:
    `t.me/BillPaymentDemoBot/pay`

---

## 💡 How to Test & Give to Users / Team

- **Direct Link**: Share `t.me/BillPaymentDemoBot/pay` in Telegram group chats or direct messages.
- **Menu Button**: Set your Mini App as the default Bot Menu button:
  1. In `@BotFather`, send `/mybots` → select your bot.
  2. Click **Bot Settings** → **Menu Button** → **Configure menu button**.
  3. Enter URL `https://telegram-mini-bank-app.vercel.app` and Text `Open Bank App`.
- When users tap the button in Telegram, the Mini App slides up seamlessly inside Telegram!

---

## 🌟 Key Features Included in This Project

- **Live Phone Camera KHQR Scanner**: Uses camera feed with `facingMode: environment` to scan physical or printed KHQR codes in real time.
- **Auto Confirm KHQR Popup**: Scanning KHQR automatically triggers a confirmation dialog displaying extracted Amount, Currency, Biller, Ref No, and Confirm Pay button.
- **Image & Screen Snipper Scanner**: Upload photos from gallery or capture browser tabs to crop and scan KHQR codes.
- **Inquiry & Pay Engine**: Input consumer/invoice codes to fetch balances and submit payments with full Bill24 Gateway API & Sandbox Mock mode.
- **Telegram Native Feel**: Integrated with `telegram-web-app.js` for Telegram user theme matching, user greeting, and haptic feedback.

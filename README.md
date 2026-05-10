# 🍔 McBairan

> **Freeze. Reveal. Go viral.** The Bairaneffect — built and deployed for free.

Made by **Badal** · [@deep.build](https://instagram.com/deep.build)

---

## What it does

Upload your video → AI removes the background from the last frame → center-wipe reveals your slideshow → your cutout floats on top as a sticker.

```
Your video  →  Freeze last frame  →  AI cutout  →  Center wipe reveal  →  🔥 Final video
```

Everything runs on **your own free server**. No subscriptions. No API keys.

---

## Deploy in 2 minutes (free)

### Step 1 — Fork this repo

Hit **Fork** at the top right of this page. Now you own a copy.

### Step 2 — Deploy backend to Render (free)

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy)

1. Go to [render.com](https://render.com) → New → Web Service
2. Connect your forked GitHub repo
3. Render reads `render.yaml` automatically — just hit **Deploy**
4. Wait ~3 minutes for the first build (it installs rembg + ffmpeg)
5. Copy your Render URL e.g. `https://mcbairan-xxxx.onrender.com`

### Step 3 — Enable GitHub Pages

1. In your forked repo → **Settings → Pages**
2. Source: `Deploy from branch` → `main` → `/public` folder
3. Your site goes live at `https://YOUR_USERNAME.github.io/mcbairan`

### Step 4 — Share the link

Send your GitHub Pages URL to friends. They paste your Render URL into the Backend field, upload a video, and hit generate. Done.

---

## Run locally

```bash
git clone https://github.com/YOUR_USERNAME/mcbairan.git
cd mcbairan

npm install
pip install rembg        # free AI background removal

npm start
# Open http://localhost:3001
```

Requirements: Node 18+, FFmpeg, Python 3.8+

---

## How it works

| Step | Tool | What happens |
|------|------|--------------|
| 1 | FFmpeg | Extract last frame from video |
| 2 | rembg (local AI) | Remove background — no API key |
| 3 | Sharp | Add sticker border via pixel dilation |
| 4 | FFmpeg blend filter | Center-out curtain wipe + sticker overlay |

The center-wipe is pure FFmpeg math — no plugins:
```
if(between(Y, centerY - halfH*T/duration, centerY + halfH*T/duration), newVideo, frozenFrame)
```

---

## Stack

- **Node.js** + Express — server + job queue
- **FFmpeg** — all video processing
- **rembg** (Python, U2Net model) — AI background removal, runs locally
- **Sharp** — image processing
- **Render** — free hosting (750 hrs/month)
- **GitHub Pages** — free frontend hosting

---

## Credits

Original effect concept: [roshanbvadassery/bairaneffect](https://github.com/roshanbvadassery/bairaneffect)  
This version: rebuilt, rebranded, web UI, free stack — by Badal [@deep.build](https://instagram.com/deep.build)

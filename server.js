const express = require('express');
const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const multer = require('multer');

const app = express();
app.use(express.json({ limit: '500mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// CORS — allow GitHub Pages frontend to talk to this server
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
const TEMP_BASE_DIR = path.join(__dirname, 'temp-requests');
const OUTPUT_BASE_DIR = path.join(__dirname, 'public', 'results');

if (!fs.existsSync(TEMP_BASE_DIR)) fs.mkdirSync(TEMP_BASE_DIR, { recursive: true });
if (!fs.existsSync(OUTPUT_BASE_DIR)) fs.mkdirSync(OUTPUT_BASE_DIR, { recursive: true });

// In-memory job store
const jobs = {};

// File upload config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${safe}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB
});

function genId() {
  return `job_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
}

function log(jobId, msg) {
  const job = jobs[jobId];
  if (!job) return;
  const line = `[${new Date().toLocaleTimeString('en-IN')}] ${msg}`;
  job.logs.push(line);
  console.log(`[${jobId}] ${msg}`);
}

function setProgress(jobId, step, pct) {
  const job = jobs[jobId];
  if (!job) return;
  job.step = step;
  job.progress = pct;
}

function runScript(script, args, jobId) {
  return new Promise((resolve, reject) => {
    const proc = spawn('node', [path.join(__dirname, script), ...args], {
      stdio: ['ignore', 'pipe', 'pipe']
    });
    proc.stdout.on('data', d => log(jobId, d.toString().trim()));
    proc.stderr.on('data', d => log(jobId, d.toString().trim()));
    proc.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`${script} failed (exit ${code})`));
    });
  });
}

async function processVideo(jobId, mainVideoPath, middleImagePaths) {
  const workDir = path.join(TEMP_BASE_DIR, jobId);
  const imagesDir = path.join(workDir, 'middle-images');
  const outputDir = path.join(workDir, 'output');

  fs.mkdirSync(imagesDir, { recursive: true });
  fs.mkdirSync(outputDir, { recursive: true });

  jobs[jobId].status = 'processing';

  try {
    // Convert + copy main video
    setProgress(jobId, 'Converting video...', 5);
    log(jobId, '🎬 Converting video to MP4...');
    const mainVideo = path.join(workDir, 'main-video.MP4');
    await new Promise((resolve, reject) => {
      const proc = spawn(FFMPEG, [
        '-i', mainVideoPath,
        '-c:v', 'libx264', '-c:a', 'aac',
        '-movflags', '+faststart', '-y', mainVideo
      ], { stdio: ['ignore', 'pipe', 'pipe'] });
      proc.on('close', code => code === 0 ? resolve() : reject(new Error('Video conversion failed')));
    });
    log(jobId, '✅ Video ready');

    // Slideshow from images
    if (middleImagePaths.length > 0) {
      setProgress(jobId, 'Building slideshow...', 12);
      log(jobId, `🖼️  Copying ${middleImagePaths.length} images for slideshow...`);
      middleImagePaths.forEach((imgPath, i) => {
        const ext = path.extname(imgPath);
        fs.copyFileSync(imgPath, path.join(imagesDir, `img_${String(i).padStart(3, '0')}${ext}`));
      });
      log(jobId, '🎞️  Creating slideshow...');
      await runScript('create-middle-slideshow.js', [imagesDir, path.join(outputDir, 'middle-slideshow.mp4')], jobId);
      log(jobId, '✅ Slideshow done');
    }

    // Step 1 — Extract last frame
    setProgress(jobId, 'Extracting last frame...', 28);
    log(jobId, '🎬 Step 1: Extracting last frame...');
    await runScript('step1-extract-last-frame.js', [workDir], jobId);
    log(jobId, '✅ Step 1 done');

    // Step 2 — Remove background
    setProgress(jobId, 'Removing background (AI)...', 45);
    log(jobId, '🤖 Step 2: AI background removal (rembg)...');
    await runScript('step2-remove-background.js', [workDir], jobId);
    log(jobId, '✅ Step 2 done');

    // Step 3 — Sticker border
    setProgress(jobId, 'Creating sticker...', 65);
    log(jobId, '🖼️  Step 3: Adding sticker border...');
    await runScript('step3-add-borders.js', [workDir], jobId);
    log(jobId, '✅ Step 3 done');

    // Step 4 — Compose
    setProgress(jobId, 'Composing final video...', 80);
    log(jobId, '🎬 Step 4: Composing the McBairan effect...');
    await runScript('step4-compose-video.js', [workDir], jobId);
    log(jobId, '✅ Step 4 done');

    // Save result
    setProgress(jobId, 'Saving result...', 95);
    const src = path.join(outputDir, 'final-video.mp4');
    const dest = path.join(OUTPUT_BASE_DIR, `${jobId}.mp4`);
    fs.copyFileSync(src, dest);

    jobs[jobId].status = 'done';
    jobs[jobId].progress = 100;
    jobs[jobId].step = 'Done!';
    jobs[jobId].resultUrl = `/results/${jobId}.mp4`;
    log(jobId, `🎉 McBairan effect ready! /results/${jobId}.mp4`);

    // Cleanup
    fs.rmSync(workDir, { recursive: true, force: true });
    // Also remove uploaded source files
    try { fs.unlinkSync(mainVideoPath); } catch (_) {}
    middleImagePaths.forEach(p => { try { fs.unlinkSync(p); } catch (_) {} });

  } catch (err) {
    jobs[jobId].status = 'error';
    jobs[jobId].error = err.message;
    log(jobId, `❌ Error: ${err.message}`);
    if (fs.existsSync(workDir)) fs.rmSync(workDir, { recursive: true, force: true });
  }
}

// ── Routes ──────────────────────────────────────────────

app.post('/api/process', upload.fields([
  { name: 'mainVideo', maxCount: 1 },
  { name: 'middleImages', maxCount: 50 }
]), (req, res) => {
  const mainVideo = req.files?.['mainVideo']?.[0];
  const middleImages = req.files?.['middleImages'] || [];

  if (!mainVideo) {
    return res.status(400).json({ error: 'mainVideo is required' });
  }

  const jobId = genId();
  jobs[jobId] = {
    id: jobId,
    status: 'queued',
    step: 'Queued...',
    progress: 0,
    logs: [],
    resultUrl: null,
    error: null,
    createdAt: Date.now()
  };

  log(jobId, `📥 New job — video: ${mainVideo.originalname}, images: ${middleImages.length}`);

  const imagePaths = middleImages.map(f => f.path);
  processVideo(jobId, mainVideo.path, imagePaths);

  res.json({ jobId });
});

app.get('/api/status/:jobId', (req, res) => {
  const job = jobs[req.params.jobId];
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json(job);
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, name: 'McBairan', version: '1.0.0' });
});

// Serve result videos
app.use('/results', express.static(OUTPUT_BASE_DIR));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`\n🍔 McBairan server running on port ${PORT}`);
  console.log(`   Built by Badal · @deep.build`);
  console.log(`   POST /api/process — upload video + images`);
  console.log(`   GET  /api/status/:jobId — poll job status\n`);
});

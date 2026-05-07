import { Router } from 'express';
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SESSION_FILE = path.join(__dirname, '../mcp/banana-pro-ai/session.json');
const DOWNLOAD_DIR = path.join(__dirname, '../outputs/banana-images');
const BASE_URL = 'https://bananaproai.com/tw';
const CHROME_DIR = path.join(os.homedir(), 'Library/Application Support/Google/Chrome');

if (!fs.existsSync(DOWNLOAD_DIR)) fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });

const router = Router();

// ── Shared headless browser ───────────────────────────────────────────────────
let browser = null;
let browserContext = null;

async function getBrowserContext() {
  if (!browser || !browser.isConnected()) {
    browser = await chromium.launch({ headless: true });
    const opts = { viewport: { width: 1280, height: 900 } };
    if (fs.existsSync(SESSION_FILE)) opts.storageState = SESSION_FILE;
    browserContext = await browser.newContext(opts);
  }
  return browserContext;
}

async function saveSession(ctx) {
  const target = ctx || browserContext;
  if (!target) return;
  await target.storageState({ path: SESSION_FILE });
}

async function resetHeadlessContext() {
  if (browser && browser.isConnected()) {
    await browser.close().catch(() => {});
  }
  browser = null;
  browserContext = null;
}

async function isLoggedIn(page) {
  // Cookie check is faster and doesn't need page navigation
  const cookies = await page.context().cookies('https://bananaproai.com');
  return cookies.some((c) => c.name.includes('session-token') || c.name.includes('next-auth'));
}

// ── Google login jobs (in-memory) ─────────────────────────────────────────────
const googleJobs = new Map(); // jobId → { status, message }

// ── GET /api/banana/google-accounts ──────────────────────────────────────────
// Reads Chrome profile Preferences to list signed-in Google accounts
router.get('/google-accounts', (req, res) => {
  const accounts = [];

  if (!fs.existsSync(CHROME_DIR)) {
    return res.json({ ok: true, accounts });
  }

  const profileDirs = ['Default'];
  try {
    fs.readdirSync(CHROME_DIR).forEach((entry) => {
      if (/^Profile \d+$/.test(entry)) profileDirs.push(entry);
    });
  } catch { /* ignore */ }

  for (const profile of profileDirs) {
    const prefFile = path.join(CHROME_DIR, profile, 'Preferences');
    if (!fs.existsSync(prefFile)) continue;
    try {
      const prefs = JSON.parse(fs.readFileSync(prefFile, 'utf-8'));
      const list = prefs?.account_info || [];
      for (const acct of list) {
        if (!acct.email) continue;
        // Avoid duplicates
        if (accounts.some((a) => a.email === acct.email)) continue;
        accounts.push({
          email: acct.email,
          name: acct.full_name || acct.given_name || acct.email,
          picture: acct.picture_url || '',
          profile,
        });
      }
    } catch { /* skip corrupted prefs */ }
  }

  res.json({ ok: true, accounts });
});

// ── POST /api/banana/google-login ─────────────────────────────────────────────
// Launches headed browser → homepage → 登入彈窗 → 使用 Google 登入 → OAuth popup
router.post('/google-login', async (req, res) => {
  const { email } = req.body; // optional: pre-select Google account
  const jobId = `glogin_${Date.now()}`;
  googleJobs.set(jobId, { status: 'pending', message: '瀏覽器開啟中...' });
  res.json({ ok: true, jobId });

  (async () => {
    let headedBrowser = null;
    try {
      // 優先用系統 Chrome（Google 信任），移除 automation 標記
      try {
        headedBrowser = await chromium.launch({
          headless: false,
          channel: 'chrome',
          args: [
            '--no-sandbox',
            '--window-position=-3000,0',
            '--disable-blink-features=AutomationControlled',
          ],
        });
      } catch {
        headedBrowser = await chromium.launch({
          headless: false,
          args: [
            '--no-sandbox',
            '--window-position=-3000,0',
            '--disable-blink-features=AutomationControlled',
          ],
        });
      }

      const ctx = await headedBrowser.newContext({
        viewport: { width: 1280, height: 800 },
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
      });

      // 移除 webdriver 標記，避免 Google 偵測自動化
      await ctx.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      });

      const page = await ctx.newPage();

      // Step 1: 背景靜默執行 BananaProAI 點擊流程
      googleJobs.set(jobId, { status: 'pending', message: '請在彈出的 Google 視窗中選擇帳號...' });
      await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 20000 });

      // 關閉 cookie banner
      for (let i = 0; i < 2; i++) {
        try {
          await page.locator('button:has-text("全部接受")').first().click({ timeout: 2500 });
          await page.waitForTimeout(500);
        } catch { break; }
      }

      // 確認 HeadlessUI overlay 已清空
      const portalBlocking = await page.evaluate(() => {
        const p = document.getElementById('headlessui-portal-root');
        return !!(p && p.children.length > 0);
      }).catch(() => false);

      if (portalBlocking) {
        await page.keyboard.press('Escape').catch(() => {});
        await page.waitForTimeout(500);
      }

      await page.waitForTimeout(200);

      // 開啟登入彈窗
      await page.locator('button:has-text("登入")').first().click({ timeout: 10000 });
      await page.waitForSelector('button:has-text("使用 Google 登入")', { timeout: 8000 });

      // 點 Google 登入 → 捕捉 popup（這個才是使用者看到的 Google 帳號選擇視窗）
      const [popup] = await Promise.all([
        page.waitForEvent('popup', { timeout: 8000 }),
        page.locator('button:has-text("使用 Google 登入")').click(),
      ]);

      // 把 Google popup 調整成合適大小並帶到前景
      await popup.setViewportSize({ width: 480, height: 600 });

      // Step 5: 等使用者在 Google 視窗完成選帳號（最多 3 分鐘）
      await popup.waitForEvent('close', { timeout: 180000 });

      // Step 6: Give NextAuth time to write the session cookie
      await page.waitForTimeout(2500);

      // Step 7: Verify via cookie — NextAuth sets next-auth.session-token
      const cookies = await ctx.cookies('https://bananaproai.com');
      const hasSession = cookies.some(
        (c) => c.name.includes('session-token') || c.name.includes('next-auth')
      );

      if (!hasSession) {
        // Fallback: reload and check UI
        await page.reload({ waitUntil: 'networkidle', timeout: 15000 });
        const loginBtnCount = await page.locator('button:has-text("登入")').count();
        if (loginBtnCount > 0) {
          throw new Error('授權未完成，請重試');
        }
      }

      // Save session and reload headless context
      await saveSession(ctx);
      await resetHeadlessContext();

      googleJobs.set(jobId, { status: 'success', message: 'Google 登入成功！' });
    } catch (err) {
      googleJobs.set(jobId, { status: 'error', message: err.message });
    } finally {
      if (headedBrowser) {
        setTimeout(() => headedBrowser.close().catch(() => {}), 2000);
      }
      setTimeout(() => googleJobs.delete(jobId), 600_000);
    }
  })();
});

// ── GET /api/banana/google-login-status/:jobId ────────────────────────────────
router.get('/google-login-status/:jobId', (req, res) => {
  const job = googleJobs.get(req.params.jobId);
  if (!job) return res.json({ ok: false, status: 'error', message: 'Job 不存在' });
  res.json({ ok: true, ...job });
});

// ── POST /api/banana/login (email + password fallback) ────────────────────────
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.json({ ok: false, error: '請提供 email 和 password' });

  let page;
  try {
    const ctx = await getBrowserContext();
    page = await ctx.newPage();
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.locator('input[type="email"], input[name="email"]').first().fill(email);
    await page.locator('input[type="password"]').first().fill(password);
    await page.locator('button[type="submit"], button:has-text("登入"), button:has-text("Login"), button:has-text("Sign in")').first().click();
    await page.waitForURL((url) => !url.toString().includes('/login'), { timeout: 15000 });
    await saveSession();
    await page.close();
    res.json({ ok: true, message: '登入成功' });
  } catch (err) {
    if (page) await page.close().catch(() => {});
    res.json({ ok: false, error: err.message });
  }
});

// ── GET /api/banana/status ────────────────────────────────────────────────────
router.get('/status', async (req, res) => {
  try {
    const ctx = await getBrowserContext();
    // isLoggedIn now only reads cookies — no page needed
    const mockPage = { context: () => ctx };
    const loggedIn = await isLoggedIn(mockPage);
    res.json({ ok: true, loggedIn });
  } catch (err) {
    res.json({ ok: false, loggedIn: false, error: err.message });
  }
});

// ── POST /api/banana/generate ─────────────────────────────────────────────────
router.post('/generate', async (req, res) => {
  const { prompt, aspectRatio = 'auto', resolution = '1K', imageCount = 1 } = req.body;
  if (!prompt) return res.json({ ok: false, error: '請提供 prompt' });

  let page;
  try {
    const ctx = await getBrowserContext();
    page = await ctx.newPage();

    await page.goto(`${BASE_URL}/image/gemini-3-1-flash-image/`, {
      waitUntil: 'networkidle',
      timeout: 20000,
    });

    if (page.url().includes('login') || await page.locator('button:has-text("登入")').count() > 0) {
      throw new Error('Session 已過期，請重新登入');
    }

    // Dismiss cookie banner if present
    try {
      await page.locator('button:has-text("全部接受")').first().click({ timeout: 3000 });
      await page.waitForTimeout(500);
    } catch { /* no banner */ }

    // Click aspect ratio button (label: '自動' for auto, else the ratio string)
    const ratioLabel = aspectRatio === 'auto' ? '自動' : aspectRatio;
    try {
      await page.getByRole('button', { name: ratioLabel, exact: true }).first().click({ timeout: 5000 });
    } catch { /* keep default */ }

    // Click resolution button
    try {
      await page.getByRole('button', { name: resolution, exact: true }).first().click({ timeout: 5000 });
    } catch { /* keep default */ }

    // Click image count button (scope to section near '圖片數量' label)
    try {
      const countParent = page.locator('text=圖片數量').locator('../..');
      await countParent.getByRole('button', { name: String(imageCount), exact: true }).first().click({ timeout: 5000 });
    } catch { /* keep default */ }

    // Record existing image srcs before generating
    const existingImgSrcs = await page.evaluate(() =>
      Array.from(document.querySelectorAll('img[src]')).map(img => img.src)
    );

    // Fill prompt
    const promptInput = page.locator('textarea').first();
    await promptInput.waitFor({ timeout: 10000 });
    await promptInput.fill(prompt);

    // Click generate
    await page.getByRole('button', { name: '生成 圖片' }).click();

    // Wait for new images to appear (up to 120s)
    await page.waitForFunction(
      (existing) => {
        const imgs = Array.from(document.querySelectorAll('img[src]'));
        return imgs.some(img => {
          const src = img.src;
          return !existing.includes(src) && src.startsWith('http') && src.length > 60
            && !src.includes('logo') && !src.includes('avatar') && !src.includes('icon');
        });
      },
      existingImgSrcs,
      { timeout: 120000 }
    );

    // Small wait to let all images in a batch load
    await page.waitForTimeout(2000);

    // Collect new image srcs
    const newImgSrcs = await page.evaluate((existing) =>
      Array.from(document.querySelectorAll('img[src]'))
        .map(img => img.src)
        .filter(src => !existing.includes(src) && src.startsWith('http') && src.length > 60
          && !src.includes('logo') && !src.includes('avatar') && !src.includes('icon')),
      existingImgSrcs
    );

    if (!newImgSrcs.length) throw new Error('未偵測到生成結果，請重試');

    // Download each new image
    const timestamp = Date.now();
    const savedImages = [];
    for (let i = 0; i < newImgSrcs.length; i++) {
      const filename = `banana_${timestamp}_${i}.png`;
      const outputPath = path.join(DOWNLOAD_DIR, filename);
      const buf = await page.evaluate(async (url) => {
        const r = await fetch(url);
        return Array.from(new Uint8Array(await r.arrayBuffer()));
      }, newImgSrcs[i]);
      fs.writeFileSync(outputPath, Buffer.from(buf));
      const base64 = fs.readFileSync(outputPath).toString('base64');
      savedImages.push({
        filename,
        path: `/outputs/banana-images/${filename}`,
        base64: `data:image/png;base64,${base64}`,
      });
    }

    await saveSession();
    await page.close();

    res.json({
      ok: true,
      prompt,
      images: savedImages,
      // backward compat: single image fields
      filename: savedImages[0].filename,
      path: savedImages[0].path,
      base64: savedImages[0].base64,
    });
  } catch (err) {
    if (page) await page.close().catch(() => {});
    res.json({ ok: false, error: err.message });
  }
});

// ── GET /api/banana/points ────────────────────────────────────────────────────
let pointsCache = null; // { points, ts }
const POINTS_TTL = 5 * 60 * 1000; // 5 minutes

router.get('/points', async (req, res) => {
  if (pointsCache && Date.now() - pointsCache.ts < POINTS_TTL) {
    return res.json({ ok: true, points: pointsCache.points, cached: true });
  }
  let page;
  try {
    const ctx = await getBrowserContext();
    const cookies = await ctx.cookies('https://bananaproai.com');
    const loggedIn = cookies.some(c => c.name.includes('session-token') || c.name.includes('next-auth'));
    if (!loggedIn) return res.json({ ok: true, points: null, loggedIn: false });

    page = await ctx.newPage();
    await page.goto(`${BASE_URL}/image/gemini-3-1-flash-image/`, {
      waitUntil: 'networkidle', timeout: 20000,
    });
    // Wait for the points balance element to load with a real value (> 0 or stable)
    await page.waitForFunction(() => {
      const el = Array.from(document.querySelectorAll('div'))
        .find(e => e.className?.includes('gradient') && /^\d+$/.test(e.textContent.trim()));
      return el && parseInt(el.textContent.trim()) > 0;
    }, { timeout: 8000 }).catch(() => {});
    const points = await page.evaluate(() => {
      const el = Array.from(document.querySelectorAll('div'))
        .find(e => e.className?.includes('gradient') && /^\d+$/.test(e.textContent.trim()));
      return el ? parseInt(el.textContent.trim()) : null;
    });
    await page.close();
    if (points !== null) pointsCache = { points, ts: Date.now() };
    res.json({ ok: true, points, loggedIn: true });
  } catch (err) {
    if (page) await page.close().catch(() => {});
    res.json({ ok: false, points: null, error: err.message });
  }
});

// ── GET /api/banana/images ────────────────────────────────────────────────────
router.get('/images', (req, res) => {
  try {
    const files = fs.readdirSync(DOWNLOAD_DIR)
      .filter((f) => /\.(png|jpg|webp)$/i.test(f))
      .sort().reverse().slice(0, 50)
      .map((f) => ({
        filename: f,
        path: `/outputs/banana-images/${f}`,
        ts: parseInt(f.match(/\d+/)?.[0] || '0'),
      }));
    res.json({ ok: true, images: files });
  } catch (err) {
    res.json({ ok: false, error: err.message });
  }
});

export default router;

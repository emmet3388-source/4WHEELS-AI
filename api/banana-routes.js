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
  const { prompt, aspectRatio = '1:1' } = req.body;
  if (!prompt) return res.json({ ok: false, error: '請提供 prompt' });

  let page;
  try {
    const ctx = await getBrowserContext();
    page = await ctx.newPage();

    // Gemini 3.1 Flash Image 的直接頁面
    await page.goto(`${BASE_URL}/image/gemini-3-1-flash-image/`, {
      waitUntil: 'networkidle',
      timeout: 20000,
    });

    // If redirected to login, session expired
    if (page.url().includes('login') || await page.locator('button:has-text("登入")').count() > 0) {
      throw new Error('Session 已過期，請重新登入');
    }

    const promptInput = page.locator(
      'textarea, input[placeholder*="prompt" i], input[placeholder*="描述" i], input[placeholder*="Describe" i], input[type="text"]'
    ).first();
    await promptInput.waitFor({ timeout: 10000 });
    await promptInput.fill(prompt);

    await page.locator(
      'button:has-text("Generate"), button:has-text("生成"), button:has-text("Create"), button:has-text("產生")'
    ).first().click();

    const resultImg = page.locator(
      '.result img, .output img, [class*="result"] img, [class*="generated"] img, img[src*="cdn"], img[src*="storage"]'
    ).last();
    await resultImg.waitFor({ timeout: 90000 });

    const timestamp = Date.now();
    const filename = `banana_${timestamp}.png`;
    const outputPath = path.join(DOWNLOAD_DIR, filename);

    const imgSrc = await resultImg.getAttribute('src');
    if (imgSrc && imgSrc.startsWith('http')) {
      const buf = await page.evaluate(async (url) => {
        const r = await fetch(url);
        return Array.from(new Uint8Array(await r.arrayBuffer()));
      }, imgSrc);
      fs.writeFileSync(outputPath, Buffer.from(buf));
    } else {
      await resultImg.screenshot({ path: outputPath });
    }

    const base64 = fs.readFileSync(outputPath).toString('base64');
    await saveSession();
    await page.close();

    res.json({
      ok: true,
      filename,
      path: `/outputs/banana-images/${filename}`,
      base64: `data:image/png;base64,${base64}`,
      prompt,
    });
  } catch (err) {
    if (page) await page.close().catch(() => {});
    res.json({ ok: false, error: err.message });
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

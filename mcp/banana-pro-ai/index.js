import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import os from 'os';

const BASE_URL = 'https://bananaproai.com/tw';
const DOWNLOAD_DIR = path.join(os.homedir(), 'Downloads', 'banana-pro-ai');

// Ensure download dir exists
if (!fs.existsSync(DOWNLOAD_DIR)) {
  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
}

const server = new Server(
  { name: 'banana-pro-ai', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

// Shared browser instance
let browser = null;
let context = null;

async function getBrowser() {
  if (!browser || !browser.isConnected()) {
    browser = await chromium.launch({
      headless: false, // Visible so user can log in if needed
      args: ['--no-sandbox'],
    });
    context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      // Persist login session
      storageState: getStorageStatePath(),
    });
  }
  return { browser, context };
}

function getStorageStatePath() {
  const stateFile = path.join(
    path.dirname(new URL(import.meta.url).pathname),
    'session.json'
  );
  return fs.existsSync(stateFile) ? stateFile : undefined;
}

async function saveSession() {
  if (!context) return;
  const stateFile = path.join(
    path.dirname(new URL(import.meta.url).pathname),
    'session.json'
  );
  await context.storageState({ path: stateFile });
}

// ─── Tool: generate_image ─────────────────────────────────────────────────────

async function generateImage({ prompt, style = 'realistic', width = 1024, height = 1024 }) {
  const { context } = await getBrowser();
  const page = await context.newPage();

  try {
    await page.goto(`${BASE_URL}/image`, { waitUntil: 'networkidle' });

    // Check if login is required
    const isLoginPage = await page.locator('input[type="email"], input[name="email"]').count() > 0;
    if (isLoginPage) {
      await page.close();
      return {
        success: false,
        error: '需要先登入。請執行 login 工具後再試。',
      };
    }

    // Find the prompt textarea
    const promptInput = page.locator('textarea, input[placeholder*="prompt" i], input[placeholder*="描述" i]').first();
    await promptInput.waitFor({ timeout: 10000 });
    await promptInput.fill(prompt);

    // Click generate button
    const generateBtn = page.locator(
      'button:has-text("Generate"), button:has-text("生成"), button:has-text("Create")'
    ).first();
    await generateBtn.click();

    // Wait for image to appear (up to 60 seconds)
    const resultImage = page.locator('img[src*="blob:"], img[src*="cdn"], img[src*="result"], .result img, .output img').last();
    await resultImage.waitFor({ timeout: 60000 });

    // Download the image
    const timestamp = Date.now();
    const filename = `banana_image_${timestamp}.png`;
    const outputPath = path.join(DOWNLOAD_DIR, filename);

    const imgSrc = await resultImage.getAttribute('src');
    if (imgSrc && imgSrc.startsWith('http')) {
      // Download via fetch
      const response = await page.evaluate(async (url) => {
        const res = await fetch(url);
        const buf = await res.arrayBuffer();
        return Array.from(new Uint8Array(buf));
      }, imgSrc);

      fs.writeFileSync(outputPath, Buffer.from(response));
    } else {
      // Screenshot the result element
      await resultImage.screenshot({ path: outputPath });
    }

    await saveSession();
    await page.close();

    return {
      success: true,
      path: outputPath,
      prompt,
      message: `圖片已儲存至：${outputPath}`,
    };
  } catch (err) {
    await page.close();
    return { success: false, error: err.message };
  }
}

// ─── Tool: generate_video ─────────────────────────────────────────────────────

async function generateVideo({ prompt, model = 'veo3', duration = 5 }) {
  const { context } = await getBrowser();
  const page = await context.newPage();

  try {
    await page.goto(`${BASE_URL}/video`, { waitUntil: 'networkidle' });

    const isLoginPage = await page.locator('input[type="email"], input[name="email"]').count() > 0;
    if (isLoginPage) {
      await page.close();
      return { success: false, error: '需要先登入。請執行 login 工具後再試。' };
    }

    // Select model if selector exists
    const modelSelector = page.locator(`[data-model="${model}"], button:has-text("${model.toUpperCase()}")`);
    if (await modelSelector.count() > 0) {
      await modelSelector.first().click();
    }

    // Fill prompt
    const promptInput = page.locator('textarea, input[placeholder*="prompt" i]').first();
    await promptInput.waitFor({ timeout: 10000 });
    await promptInput.fill(prompt);

    // Click generate
    const generateBtn = page.locator(
      'button:has-text("Generate"), button:has-text("生成"), button:has-text("Create")'
    ).first();
    await generateBtn.click();

    // Wait for video (up to 3 minutes)
    const resultVideo = page.locator('video source, video[src], a[download*=".mp4"]').last();
    await resultVideo.waitFor({ timeout: 180000 });

    const videoSrc = await resultVideo.getAttribute('src') || await resultVideo.getAttribute('href');
    const timestamp = Date.now();
    const filename = `banana_video_${timestamp}.mp4`;
    const outputPath = path.join(DOWNLOAD_DIR, filename);

    if (videoSrc && videoSrc.startsWith('http')) {
      const response = await page.evaluate(async (url) => {
        const res = await fetch(url);
        const buf = await res.arrayBuffer();
        return Array.from(new Uint8Array(buf));
      }, videoSrc);
      fs.writeFileSync(outputPath, Buffer.from(response));
    } else {
      // Take screenshot as fallback
      await page.screenshot({ path: outputPath.replace('.mp4', '.png') });
    }

    await saveSession();
    await page.close();

    return {
      success: true,
      path: outputPath,
      prompt,
      model,
      message: `影片已儲存至：${outputPath}`,
    };
  } catch (err) {
    await page.close();
    return { success: false, error: err.message };
  }
}

// ─── Tool: login ─────────────────────────────────────────────────────────────

async function login({ email, password }) {
  const { context } = await getBrowser();
  const page = await context.newPage();

  try {
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });

    await page.locator('input[type="email"], input[name="email"]').first().fill(email);
    await page.locator('input[type="password"]').first().fill(password);
    await page.locator('button[type="submit"], button:has-text("登入"), button:has-text("Login")').first().click();

    // Wait for redirect after login
    await page.waitForURL((url) => !url.toString().includes('/login'), { timeout: 15000 });

    await saveSession();
    await page.close();

    return { success: true, message: '登入成功！Session 已儲存。' };
  } catch (err) {
    await page.close();
    return { success: false, error: `登入失敗：${err.message}` };
  }
}

// ─── Tool: screenshot ────────────────────────────────────────────────────────

async function takeScreenshot({ url }) {
  const { context } = await getBrowser();
  const page = await context.newPage();

  try {
    const targetUrl = url || BASE_URL;
    await page.goto(targetUrl, { waitUntil: 'networkidle' });

    const timestamp = Date.now();
    const outputPath = path.join(DOWNLOAD_DIR, `screenshot_${timestamp}.png`);
    await page.screenshot({ path: outputPath, fullPage: true });
    await page.close();

    return { success: true, path: outputPath };
  } catch (err) {
    await page.close();
    return { success: false, error: err.message };
  }
}

// ─── MCP Tool Definitions ─────────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'banana_login',
      description: '登入 BananaProAI 帳號，儲存 session 供後續使用',
      inputSchema: {
        type: 'object',
        properties: {
          email: { type: 'string', description: '帳號 email' },
          password: { type: 'string', description: '密碼' },
        },
        required: ['email', 'password'],
      },
    },
    {
      name: 'banana_generate_image',
      description: '使用 BananaProAI 生成 AI 圖片',
      inputSchema: {
        type: 'object',
        properties: {
          prompt: {
            type: 'string',
            description: '圖片描述（英文效果最佳）',
          },
          style: {
            type: 'string',
            description: '風格：realistic / anime / artistic',
            enum: ['realistic', 'anime', 'artistic'],
            default: 'realistic',
          },
        },
        required: ['prompt'],
      },
    },
    {
      name: 'banana_generate_video',
      description: '使用 BananaProAI 生成 AI 影片（Veo 3 / Seedance）',
      inputSchema: {
        type: 'object',
        properties: {
          prompt: {
            type: 'string',
            description: '影片描述（英文效果最佳）',
          },
          model: {
            type: 'string',
            description: '模型選擇：veo3 / veo3_1 / seedance',
            enum: ['veo3', 'veo3_1', 'seedance'],
            default: 'veo3',
          },
        },
        required: ['prompt'],
      },
    },
    {
      name: 'banana_screenshot',
      description: '對 BananaProAI 頁面截圖，用於確認狀態或除錯',
      inputSchema: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: '要截圖的 URL（選填，預設首頁）',
          },
        },
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  let result;
  switch (name) {
    case 'banana_login':
      result = await login(args);
      break;
    case 'banana_generate_image':
      result = await generateImage(args);
      break;
    case 'banana_generate_video':
      result = await generateVideo(args);
      break;
    case 'banana_screenshot':
      result = await takeScreenshot(args);
      break;
    default:
      result = { error: `Unknown tool: ${name}` };
  }

  return {
    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
  };
});

// Cleanup on exit
process.on('SIGINT', async () => {
  if (browser) await browser.close();
  process.exit(0);
});

// Start server
const transport = new StdioServerTransport();
await server.connect(transport);

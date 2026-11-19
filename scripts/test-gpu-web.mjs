import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readdir, mkdtemp, mkdir } from 'node:fs/promises';
import { createServer } from 'node:net';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const browsers = process.env.PLAYWRIGHT_BROWSERS_PATH || path.join(root, '.playwright');
process.env.PLAYWRIGHT_BROWSERS_PATH = browsers;
const { chromium } = await import('@playwright/test');
const suite = process.argv[2] || 'registration';
const verify =
  suite === 'outfits'
    ? (await import('../e2e/outfit-demo.ts')).verifyOutfitDemo
    : (await import('../e2e/gpu-registration.ts')).verifyGpuRegistration;
let ownedBrowser, browser, context;
try {
  let endpoint = process.env.WARDROBE_CDP_URL;
  if (!endpoint) {
    const folders = (await readdir(browsers))
      .filter((s) => s.startsWith('chromium_headless_shell-'))
      .sort();
    if (!folders.length)
      throw new Error(
        'Install the browser first: PLAYWRIGHT_BROWSERS_PATH=.playwright npx playwright install chromium --only-shell',
      );
    const exe =
      process.env.WARDROBE_BROWSER_EXECUTABLE ||
      path.join(browsers, folders.at(-1), 'chrome-headless-shell-win64/chrome-headless-shell.exe');
    const listener = createServer();
    await new Promise((resolve) => listener.listen(0, '127.0.0.1', resolve));
    const port = listener.address().port;
    await new Promise((resolve) => listener.close(resolve));
    await mkdir(path.join(root, '.logs'), { recursive: true });
    const profile = await mkdtemp(path.join(root, '.logs', 'browser-profile-'));
    // TCP CDP avoids the Windows automation pipe startup hang observed on this machine.
    ownedBrowser = spawn(
      exe,
      [
        '--headless',
        '--no-sandbox',
        '--remote-debugging-address=127.0.0.1',
        `--remote-debugging-port=${port}`,
        `--user-data-dir=${profile}`,
        'about:blank',
      ],
      { windowsHide: true, stdio: 'ignore' },
    );
    ownedBrowser.on('error', (error) => console.error(error.message));
    endpoint = `http://127.0.0.1:${port}`;
    const deadline = Date.now() + 30_000;
    while (true) {
      try {
        const r = await fetch(`${endpoint}/json/version`, { signal: AbortSignal.timeout(500) });
        if (r.ok) break;
      } catch {}
      if (Date.now() > deadline) throw new Error('Headless browser startup timed out');
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  console.log('Browser endpoint:', endpoint);
  browser = await chromium.connectOverCDP(endpoint, { timeout: 15_000 });
  context = await browser.newContext({
    baseURL: process.env.WARDROBE_WEB_URL || 'http://127.0.0.1:3000',
    viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  page.on('pageerror', (error) => console.error('Browser error:', error.message));
  await verify(page, context.request);
  console.log(
    'PASS: GPU auto-fill, persistence, invalid input, retry, desktop/mobile, browser timing.',
  );
} catch (error) {
  const page = context?.pages()[0];
  if (page) {
    console.error(
      await page
        .locator('body')
        .innerText()
        .catch(() => 'Page unavailable'),
    );
    await page
      .screenshot({ path: 'test-results/gpu-web-failure.png', fullPage: true })
      .catch(() => {});
  }
  throw error;
} finally {
  await context?.close();
  await browser?.close();
  ownedBrowser?.kill();
}

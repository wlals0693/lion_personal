import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
const root = fileURLToPath(new URL('../', import.meta.url));
const modelRoot =
  process.env.WARDROBE_MODEL_ROOT || path.resolve(root, '../wardrobe-desktop-handoff');
const python = process.env.WARDROBE_PYTHON || path.join(modelRoot, '.venv/Scripts/python.exe');
if (!existsSync(python))
  throw new Error('GPU Python을 찾지 못했어요. WARDROBE_PYTHON을 확인해주세요.');
console.log('STYLAI 실제 서비스: http://127.0.0.1:3000/');
console.log('GPU 연결 점검이 필요하면: http://127.0.0.1:3000/demo/start');
console.log('GPU gateway ready와 웹 Ready 표시 후 접속하세요. 종료: Ctrl+C');
const shutdownToken = randomBytes(32).toString('hex');
const children = [
  spawn(python, [path.join(root, 'scripts/gpu_service.py')], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, WARDROBE_MODEL_ROOT: modelRoot, WARDROBE_SHUTDOWN_TOKEN: shutdownToken },
  }),
  spawn(
    process.execPath,
    [
      path.join(root, 'node_modules/next/dist/bin/next'),
      'dev',
      '--webpack',
      '--hostname',
      '127.0.0.1',
      '--port',
      '3000',
    ],
    { cwd: root, stdio: 'inherit' },
  ),
];
let closing = false;
async function killTree(child) {
  if (child.exitCode !== null || !child.pid) return;
  if (process.platform === 'win32') {
    await new Promise((resolve) => {
      const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
        windowsHide: true,
        stdio: 'ignore',
      });
      killer.on('exit', resolve);
      killer.on('error', resolve);
    });
  } else child.kill('SIGTERM');
}
async function stop() {
  if (closing) return;
  closing = true;
  try {
    await fetch(`http://127.0.0.1:${process.env.WARDROBE_GPU_PORT || '8092'}/shutdown`, {
      method: 'POST',
      headers: { 'X-Shutdown-Token': shutdownToken },
      signal: AbortSignal.timeout(2000),
    });
  } catch {}
  await killTree(children[1]);
  const deadline = Date.now() + 5000;
  while (children[0].exitCode === null && Date.now() < deadline)
    await new Promise((resolve) => setTimeout(resolve, 100));
  await killTree(children[0]);
  process.exit(process.exitCode || 0);
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (const child of children) {
  child.on('error', (error) => {
    console.error(error.message);
    stop();
    process.exitCode = 1;
  });
  child.on('exit', (code) => {
    if (!closing) {
      stop();
      process.exitCode = code || 0;
    }
  });
}
if (process.argv.includes('--check')) {
  const deadline = Date.now() + 45000;
  try {
    while (true) {
      try {
        const [web, gpu] = await Promise.all([
          fetch('http://127.0.0.1:3000/demo/outfits', { signal: AbortSignal.timeout(1000) }),
          fetch(`http://127.0.0.1:${process.env.WARDROBE_GPU_PORT || '8092'}/health`, {
            signal: AbortSignal.timeout(1000),
          }),
        ]);
        if (web.ok && gpu.ok) {
          console.log('PASS: one-command demo web and CUDA gateway ready.');
          break;
        }
      } catch {}
      if (closing || Date.now() > deadline) throw new Error('Demo readiness failed');
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await stop();
  }
}

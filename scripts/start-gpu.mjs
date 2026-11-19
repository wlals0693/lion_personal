import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const modelRoot =
  process.env.WARDROBE_MODEL_ROOT || path.resolve(root, '../wardrobe-desktop-handoff');
const python =
  process.env.WARDROBE_PYTHON ||
  path.join(modelRoot, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
if (!existsSync(python))
  throw new Error(`GPU 전용 Python을 찾을 수 없어요: ${python}. WARDROBE_PYTHON을 설정해주세요.`);
const child = spawn(python, [path.join(root, 'scripts/gpu_service.py')], {
  stdio: 'inherit',
  env: { ...process.env, WARDROBE_MODEL_ROOT: modelRoot },
});
// Python handles Ctrl+C and terminates its model process in finally.
process.on('SIGINT', () => {});
child.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});

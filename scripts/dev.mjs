// `npm run dev`: start the DM proxy and Vite together; Ctrl+C stops both.
import { spawn } from 'node:child_process';

// `node scripts/dev.mjs [preview] [...vite args]`, e.g. npm run dev -- --host
const args = process.argv.slice(2);
const viteArgs = args[0] === 'preview' ? args : args.filter((a) => a !== 'dev');
const procs = [
  spawn(process.execPath, ['server/dmProxy.mjs'], { stdio: 'inherit' }),
  spawn(process.execPath, ['node_modules/vite/bin/vite.js', ...viteArgs], { stdio: 'inherit' }),
];
let stopping = false;
const stop = (code = 0) => {
  if (stopping) return;
  stopping = true;
  for (const p of procs) if (p.exitCode === null) p.kill('SIGTERM');
  process.exitCode = code;
};
for (const p of procs) p.on('exit', (code) => stop(code ?? 0));
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));

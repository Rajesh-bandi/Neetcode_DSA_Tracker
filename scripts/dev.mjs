// Runs both halves of the project with one command, labelled output and a
// single Ctrl-C. The frontend proxies /api to the backend, so cookies stay
// same-origin in development.
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const children = [];

function run(name, cwd, args, colour) {
  const child = spawn('npm', args, { cwd: resolve(root, cwd), stdio: ['ignore', 'pipe', 'pipe'] });
  const write = (stream) => (chunk) => {
    for (const line of String(chunk).split('\n')) {
      if (line.trim()) stream.write(`${colour}[${name}]${'\u001b[0m'} ${line}\n`);
    }
  };
  child.stdout.on('data', write(process.stdout));
  child.stderr.on('data', write(process.stderr));
  child.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.error(`${colour}[${name}]${'\u001b[0m'} exited with ${code}`);
      shutdown(code);
    }
  });
  children.push(child);
}

let closing = false;
function shutdown(code = 0) {
  if (closing) return;
  closing = true;
  for (const child of children) child.kill('SIGTERM');
  setTimeout(() => process.exit(code), 300);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

run('api', 'backend', ['run', 'dev'], '\u001b[35m');
run('web', 'frontend', ['run', 'dev'], '\u001b[36m');

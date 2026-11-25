// Turn a session into a resume command and run it in the session's original directory.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { IS_WIN, isDir } from './util.js';
import { SAFE_ID } from './agents/common.js';

export function resumeSpec(session, agents) {
  const agent = agents.find((a) => a.name === session.agent);
  if (!agent) throw new Error(`no agent adapter named "${session.agent}"`);
  const spec = agent.resume(session);
  const cwdOk = spec.cwd && isDir(spec.cwd);
  return { ...spec, cwd: cwdOk ? spec.cwd : process.cwd(), cwdMissing: Boolean(spec.cwd && !cwdOk), originalCwd: spec.cwd };
}

function quote(a, { win = IS_WIN } = {}) {
  if (/^[\w@%+=:,./\\-]+$/.test(a)) return a;
  return win ? `"${a.replace(/"/g, '""')}"` : `'${a.replace(/'/g, `'\\''`)}'`;
}

/** Copy-pasteable shell line, e.g. `cd '/x/proj' && claude --resume abc`. */
export function shellLine(spec, { win = IS_WIN } = {}) {
  const cmd = [spec.command, ...spec.args].map((a) => quote(a, { win })).join(' ');
  if (!spec.cwd) return cmd;
  return win ? `cd /d ${quote(spec.cwd, { win })} && ${cmd}` : `cd ${quote(spec.cwd, { win })} && ${cmd}`;
}

/** Locate an executable on PATH (honours PATHEXT on Windows). Returns the full path or ''. */
export function which(cmd) {
  if (/[\\/]/.test(cmd)) return fs.existsSync(cmd) ? cmd : '';
  const exts = IS_WIN ? ['', ...(process.env.PATHEXT || '.EXE;.CMD;.BAT;.COM').split(';').map((e) => e.toLowerCase())] : [''];
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    if (!dir) continue;
    for (const ext of exts) {
      const full = path.join(dir, cmd + ext);
      try { if (fs.statSync(full).isFile()) return full; } catch { /* keep looking */ }
    }
  }
  return '';
}

/** Launch the agent attached to this terminal; resolves with its exit code. */
export function run(spec) {
  if (!which(spec.command)) return Promise.reject(new Error(`"${spec.command}" is not on your PATH — install it or run: ${shellLine(spec)}`));
  for (const a of spec.args) {
    // Args only ever carry ids/flags we built; refuse anything shell-active on Windows,
    // where we have to go through cmd.exe to find .cmd shims (gemini, qwen from npm).
    if (IS_WIN && /[&|<>^%!"\r\n]/.test(a)) return Promise.reject(new Error(`refusing unsafe argument: ${a}`));
  }
  return new Promise((resolve, reject) => {
    const child = spawn(spec.command, spec.args, {
      cwd: spec.cwd, stdio: 'inherit', shell: IS_WIN, env: process.env,
    });
    child.on('error', (e) => reject(e.code === 'ENOENT' ? new Error(`"${spec.command}" is not on your PATH`) : e));
    child.on('exit', (code, sig) => resolve(sig ? 1 : code ?? 0));
  });
}

export { SAFE_ID };

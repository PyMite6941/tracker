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
  // Windows can only launch PATHEXT files; npm also drops an extensionless sh script next to each
  // .cmd shim (for Git Bash), which must never win. Bare name only if it already has an extension.
  const winExts = (process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean).map((e) => e.toLowerCase());
  const exts = IS_WIN ? (path.extname(cmd) ? [''] : winExts) : [''];
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    if (!dir) continue;
    for (const ext of exts) {
      const full = path.join(dir, cmd + ext);
      try { if (fs.statSync(full).isFile()) return full; } catch { /* keep looking */ }
    }
  }
  return '';
}

/**
 * How to spawn `spec` without a shell joining args unquoted. On Windows, .exe/.com run directly;
 * .cmd/.bat shims (npm-installed CLIs) must go through cmd.exe, so we build one verbatim, quoted
 * command line and refuse arguments cmd.exe would interpret. Exported for tests.
 */
export function launchPlan(spec, { win = IS_WIN, resolved = which(spec.command) } = {}) {
  if (!resolved) throw new Error(`"${spec.command}" is not on your PATH — install it or run: ${shellLine(spec, { win })}`);
  if (!win || /\.(exe|com)$/i.test(resolved)) return { file: resolved, args: spec.args, opts: {} };
  for (const a of spec.args) {
    if (/[&|<>^%!"\r\n]/.test(a)) throw new Error(`refusing argument cmd.exe would interpret: ${a}`);
  }
  const q = (s) => (/[\s()]/.test(s) || s === '' ? `"${s}"` : s);
  const line = [resolved, ...spec.args].map(q).join(' ');
  return { file: process.env.ComSpec || 'cmd.exe', args: ['/d', '/s', '/c', `"${line}"`], opts: { windowsVerbatimArguments: true } };
}

/** Launch the agent attached to this terminal; resolves with its exit code. */
export function run(spec) {
  let plan;
  try { plan = launchPlan(spec); } catch (e) { return Promise.reject(e); }
  return new Promise((resolve, reject) => {
    const child = spawn(plan.file, plan.args, {
      cwd: spec.cwd, stdio: 'inherit', env: process.env, ...plan.opts,
    });
    child.on('error', (e) => reject(e.code === 'ENOENT' ? new Error(`"${spec.command}" is not on your PATH`) : e));
    child.on('exit', (code, sig) => resolve(sig ? 1 : code ?? 0));
  });
}

export { SAFE_ID };

#!/usr/bin/env node
import { main } from '../src/cli.js';

main().then(
  (code) => { process.exitCode = code ?? 0; },
  (err) => {
    process.stderr.write(`tracker: ${err?.message || err}\n`);
    if (process.env.TRACKER_DEBUG) process.stderr.write(String(err?.stack) + '\n');
    process.exitCode = 1;
  },
);

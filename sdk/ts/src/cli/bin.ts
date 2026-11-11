#!/usr/bin/env node
import { runCli } from './main.ts';

process.exitCode = await runCli(process.argv.slice(2), {
  stdout: text => { process.stdout.write(text); },
  stderr: text => { process.stderr.write(text); },
  cwd: process.cwd(),
  now: () => new Date(),
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeRunDir, type LaunchPlan } from '../../src/projection/index.ts';

function scratch(t: { after(fn: () => void): void }): string {
  const dir = mkdtempSync(join(tmpdir(), 'hcs-sdk-run-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}
const plan = (runDir: string): LaunchPlan => ({
  generation: 'gen-7', runDir, argv: [], env: {}, secrets: [],
  files: [
    { path: 'engine/config.json', content: '{"a":1}' },
    { path: 'bin/start', content: new Uint8Array([35, 33]), mode: 0o755 },
    { path: 'skills/notes', link: '/hcs/generations/7/entries/dev.example.notes/skills/notes' },
  ],
});

test('writeRunDir materializes the plan into a new directory', t => {
  const run = join(scratch(t), 'run');
  writeRunDir(plan(run), run);
  assert.equal(readFileSync(join(run, 'engine/config.json'), 'utf8'), '{"a":1}');
  assert.equal(statSync(join(run, 'bin/start')).mode & 0o777, 0o755);
  assert.equal(readlinkSync(join(run, 'skills/notes')), '/hcs/generations/7/entries/dev.example.notes/skills/notes');
  assert.deepEqual(readdirSync(run).sort(), ['bin', 'engine', 'skills']);
});

test('writeRunDir accepts an existing empty directory', t => {
  const run = join(scratch(t), 'run');
  mkdirSync(run);
  writeRunDir(plan(run), run);
  assert.equal(readFileSync(join(run, 'engine/config.json'), 'utf8'), '{"a":1}');
});

test('writeRunDir refuses an existing non-empty directory and leaves it untouched', t => {
  const run = join(scratch(t), 'run');
  mkdirSync(run);
  writeFileSync(join(run, 'live.json'), 'live');
  assert.throws(() => writeRunDir(plan(run), run), /not empty/);
  assert.deepEqual(readdirSync(run), ['live.json']);
  assert.deepEqual(readdirSync(join(run, '..')), ['run']);
});

test('writeRunDir refuses a directory other than the plan run directory', t => {
  const base = scratch(t);
  assert.throws(() => writeRunDir(plan(join(base, 'run')), join(base, 'elsewhere')), /run directory/);
  assert.deepEqual(readdirSync(base), []);
});

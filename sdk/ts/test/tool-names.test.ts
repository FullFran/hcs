import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { buildToolNameMap, engineToolName } from '../src/index.ts';

const files = { contribution: 'dev.example.files', server: 'files', tools: ['x_list'] };
const filesX = { contribution: 'dev.example.files-x', server: 'files_x', tools: ['list'] };

test('engineToolName: the observed naming rules', () => {
  assert.equal(engineToolName('opencode', 'files', 'x_list'), 'files_x_list');
  assert.equal(engineToolName('opencode', 'my.srv', 'do it'), 'my_srv_do_it');
  assert.equal(engineToolName('opencode', 'a-b', 'c-d'), 'a-b_c-d');
  assert.equal(engineToolName('mcp-double-underscore', 'files', 'x_list'), 'mcp__files__x_list');
  assert.equal(engineToolName('pi', 'my-srv', 'a-b'), 'mcp__my_srv__a_b');
  assert.equal(engineToolName((s, t) => `${t}@${s}`, 'files', 'list'), 'list@files');
});

test('engineToolName: Pi keeps 55 characters and 8 hex of sha256(server NUL tool) over 64 characters', () => {
  const server = 'srv', tool = 't'.repeat(80);
  const flat = `mcp__srv__${tool}`;
  const hash = createHash('sha256').update(`${server}\0${tool}`).digest('hex').slice(0, 8);
  const name = engineToolName('pi', server, tool);
  assert.equal(name, `${flat.slice(0, 55)}_${hash}`);
  assert.equal(name.length, 64);
  assert.equal(engineToolName('pi', 'srv', 't'.repeat(54)), `mcp__srv__${'t'.repeat(54)}`); // exactly 64: unchanged
});

test('no collision: every tool is mapped and nothing is reported', () => {
  const mail = { contribution: 'dev.example.mail', server: 'mail', tools: ['send'] };
  const { map, reported } = buildToolNameMap('opencode', [files, mail]);
  assert.deepEqual(reported, []);
  assert.deepEqual([...map], [
    ['files_x_list', { contribution: 'dev.example.files', tool: 'x_list' }],
    ['mail_send', { contribution: 'dev.example.mail', tool: 'send' }],
  ]);
});

test('entries collide (files/x_list versus files_x/list): R006, none projected, each reported ambiguous_provider', () => {
  const { map, reported } = buildToolNameMap('opencode', [files, filesX]);
  assert.deepEqual(reported, [
    { contribution: 'dev.example.files', code: 'ambiguous_provider', reason: 'entries', tool: 'x_list', engineName: 'files_x_list' },
    { contribution: 'dev.example.files-x', code: 'ambiguous_provider', reason: 'entries', tool: 'list', engineName: 'files_x_list' },
  ]);
  assert.equal(map.size, 0);
});

test('the outcome does not depend on generation order', () => {
  const a = buildToolNameMap('opencode', [files, filesX]);
  const b = buildToolNameMap('opencode', [filesX, files]);
  assert.deepEqual(new Set(a.reported.map(r => r.contribution)), new Set(b.reported.map(r => r.contribution)));
  assert.equal(b.map.size, 0);
});

test('every entry on a shared name is reported, and an entry with a free tool is left out whole', () => {
  const x = { contribution: 'x', server: 'a', tools: ['b_c'] };
  const y = { contribution: 'y', server: 'a_b', tools: ['c'] };
  const z = { contribution: 'z', server: 'a_b_c', tools: [] };
  const w = { contribution: 'w', server: 'a', tools: ['b_c', 'other'] };
  const { map, reported } = buildToolNameMap('opencode', [x, y, z, w]);
  assert.deepEqual(reported.map(r => r.contribution), ['x', 'y', 'w']);
  assert.deepEqual([...map.keys()], []); // w's other tool is left out with w
});

test('host tool collision: unsupported_contribution, not ambiguous_provider; the entry holds no names', () => {
  const { map, reported } = buildToolNameMap('opencode', [{ ...files, tools: ['x_list', 'y'] }], ['files_x_list']);
  assert.deepEqual(reported, [{ contribution: 'dev.example.files', code: 'unsupported_contribution', reason: 'host-tool', tool: 'x_list', engineName: 'files_x_list' }]);
  assert.equal(map.size, 0);
});

test('replacement can create a collision between entries (Pi)', () => {
  const a = { contribution: 'a', server: 's', tools: ['a-b'] };
  const b = { contribution: 'b', server: 's', tools: ['a_b'] };
  const { reported } = buildToolNameMap('pi', [a, b]);
  assert.deepEqual(reported.map(r => [r.contribution, r.code]), [['a', 'ambiguous_provider'], ['b', 'ambiguous_provider']]);
});

test('two tools of one entry that share an engine name: unsupported_contribution for that entry', () => {
  const s = { contribution: 's', server: 's', tools: ['a-b', 'a_b'] };
  const { map, reported } = buildToolNameMap('pi', [s]);
  assert.deepEqual(reported, [{ contribution: 's', code: 'unsupported_contribution', reason: 'same-entry', tool: 'a_b', engineName: 'mcp__s__a_b' }]);
  assert.equal(map.size, 0);
});

test('a name an entry shares with another entry makes it ambiguous even when it also collides with a host tool', () => {
  const { reported } = buildToolNameMap('opencode', [files, filesX], ['files_x_list']);
  assert.deepEqual(reported.map(r => [r.contribution, r.code]), [['dev.example.files', 'ambiguous_provider'], ['dev.example.files-x', 'ambiguous_provider']]);
});

test('Pi hashed names keep long names apart; the map reads them back by identity, not by parsing', () => {
  const long = 't'.repeat(70);
  const a = { contribution: 'a', server: 'x', tools: [long + 'A'] };
  const b = { contribution: 'b', server: 'x', tools: [long + 'B'] };
  const { map, reported } = buildToolNameMap('pi', [a, b]);
  assert.deepEqual(reported, []);
  assert.equal(map.size, 2);
  assert.deepEqual(map.get(engineToolName('pi', 'x', long + 'B')), { contribution: 'b', tool: long + 'B' });
});

test('two inputs with the same contribution id are rejected with a TypeError', () => {
  const a = { contribution: 'dup', server: 'a', tools: ['t'] };
  const b = { contribution: 'dup', server: 'b', tools: ['t'] };
  assert.throws(() => buildToolNameMap('opencode', [a, b]), TypeError);
});

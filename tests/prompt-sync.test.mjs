// Guards the sync invariant between the two buildPrompt copies
// (public/background.js and src/llm/ollamaClient.js) and the date grounding
// added so the local model doesn't flag post-cutoff dates as slop.
// background.js is a classic script, so it's evaluated in a node:vm context.
// Run with: npm test

import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildPrompt as appBuildPrompt } from '../src/llm/ollamaClient.js';

// Stub of the only chrome APIs background.js touches at the top level. Adding
// new top-level chrome usage there will fail this load — extend the stub.
const context = vm.createContext({
  chrome: {
    action: { onClicked: { addListener() {} } },
    runtime: { onMessage: { addListener() {} } },
  },
});
const source = readFileSync(new URL('../public/background.js', import.meta.url), 'utf8');
vm.runInContext(source, context, { filename: 'background.js' });

const backgroundBuildPrompt = context.buildPrompt;

const CASES = [
  { title: 'Recently discovered in June 2026', channel: 'Some Channel' },
  { title: 'Plain title with no channel', channel: '' },
];

test('background.js and ollamaClient.js build identical prompts', () => {
  assert.equal(typeof backgroundBuildPrompt, 'function');
  for (const video of CASES) {
    assert.equal(backgroundBuildPrompt(video), appBuildPrompt(video));
  }
});

test('prompt grounds the model with today\'s date and a dates-are-not-slop rule', () => {
  const prompt = appBuildPrompt(CASES[0]);
  assert.ok(prompt.includes(`Today's date: ${new Date().toISOString().slice(0, 10)}`));
  assert.ok(prompt.includes('Dates or years in the title are not a quality signal'));
});

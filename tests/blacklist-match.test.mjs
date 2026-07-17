// Guards the title folding background.js applies before matching blacklist
// keywords. Slop titles routinely use curly punctuation and fancy-unicode
// fonts; raw includes() let both walk past the user's explicit blacklist.
// background.js is a classic script, so it's evaluated in a node:vm context.
// Run with: npm test

import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';
import assert from 'node:assert/strict';

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

const { foldForMatching } = context;

// How classify() uses it: fold both sides, then substring-match.
function blacklisted(title, keyword) {
  return foldForMatching(title).includes(foldForMatching(keyword));
}

test('blacklist folding defeats curly quotes and fancy unicode', () => {
  assert.equal(typeof foldForMatching, 'function');
  assert.ok(blacklisted('DON’T WATCH this alone', "don't watch"));
  assert.ok(blacklisted('𝗱𝘄𝗻 𝘄𝗮𝘁𝗰𝗵', 'dwn watch'));
  assert.ok(blacklisted('You WON’T Believe This', "won't believe"));
});

test('blacklist folding still matches plain titles and is case-insensitive', () => {
  assert.ok(blacklisted('Insane REACTION video', 'reaction'));
  assert.ok(blacklisted('Reaction Time', 'REACTION'));
  assert.ok(blacklisted('a keyword with spaces here', '  keyword with spaces  '));
});

test('blacklist folding does not invent matches', () => {
  assert.ok(!blacklisted('A thoughtful documentary', 'reaction'));
  assert.ok(!blacklisted('', 'reaction'));
});

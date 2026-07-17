// Guards the DEFAULT_PREFERENCES / DEFAULT_SLOP_PREFS sync invariants (see
// CLAUDE.md): src/storage/preferences.js ↔ public/background.js ↔
// public/content/slop-filters.js.
//
// classifier.js keeps its defaults closure-local and derives its slop values
// from YTC_SLOP_CONFIG at runtime, so checking preferences.js against
// slop-filters.js covers the classifier's slop side transitively. Its
// top-level defaults (sensitivity etc.) aren't reachable without DOM stubbing
// and are not asserted here.
// Run with: npm test

import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_PREFERENCES, DEFAULT_SLOP_PREFS } from '../src/storage/preferences.js';

// `tail` is an expression appended to the script and returned as its
// completion value — the only way to reach top-level `const`s, which don't
// become properties of the vm global.
function vmLoad(relPath, context, tail = 'undefined') {
  const source = readFileSync(new URL(relPath, import.meta.url), 'utf8');
  const value = vm.runInContext(`${source}\n;(${tail})`, vm.createContext(context), {
    filename: relPath,
  });
  // vm objects have the context's prototypes, which fails deepStrictEqual
  // against host-realm objects — round-trip to normalize.
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

test('background.js DEFAULT_PREFERENCES matches the app copy (minus slop)', () => {
  const backgroundDefaults = vmLoad(
    '../public/background.js',
    {
      chrome: {
        action: { onClicked: { addListener() {} } },
        runtime: { onMessage: { addListener() {} } },
      },
    },
    'DEFAULT_PREFERENCES'
  );
  const { slop, ...appWithoutSlop } = DEFAULT_PREFERENCES;
  // Background intentionally has no slop key (CLAUDE.md); everything else
  // must stay identical or the worker filters with different defaults.
  assert.deepEqual(backgroundDefaults, appWithoutSlop);
});

test('app DEFAULT_SLOP_PREFS mirrors slop-filters.js config', () => {
  const context = {};
  vmLoad('../public/content/slop-filters.js', context);
  const config = context.YTC_SLOP_CONFIG;
  assert.deepEqual(DEFAULT_SLOP_PREFS, {
    hideThreshold: config.thresholds.hide,
    dimThreshold: config.thresholds.dim,
    weights: {
      tier1: config.tier1.weight,
      tier2: config.tier2.weight,
      structural: config.structural.weight,
      // classifier.js hardcodes neutral multipliers and debug off; the app
      // defaults must agree so both sides start from the same effective prefs.
      topicMultiplier: 1,
      channelMultiplier: 1,
    },
    debug: false,
  });
});

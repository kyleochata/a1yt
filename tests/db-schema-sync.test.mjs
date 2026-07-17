// Guards the shared-IndexedDB sync invariant (see CLAUDE.md): src/db/database.js
// and public/background.js open the same 'yt-curator' database and either
// context may run the upgrade, so DB_NAME, DB_VERSION, and every store/index
// created in onupgradeneeded must stay identical on both sides.
// background.js is a classic script, so it's evaluated in a node:vm context
// (same technique as prompt-sync.test.mjs / preferences-sync.test.mjs).
// Run with: npm test

import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';
import assert from 'node:assert/strict';

// A fake indexedDB.open() that records every store/index created during
// onupgradeneeded instead of actually persisting anything.
function createIndexedDBStub() {
  const schema = { name: null, version: null, stores: [] };
  const fakeDb = {
    objectStoreNames: { contains: () => false },
    createObjectStore(name, opts) {
      const store = { name, keyPath: opts?.keyPath ?? null, indexes: [] };
      schema.stores.push(store);
      return {
        createIndex(indexName, keyPath, indexOpts) {
          store.indexes.push({
            name: indexName,
            keyPath,
            unique: indexOpts?.unique ?? false,
            multiEntry: indexOpts?.multiEntry ?? false,
          });
        },
      };
    },
  };
  const request = { result: fakeDb, onupgradeneeded: null, onsuccess: null, onerror: null };
  const indexedDBStub = {
    open(name, version) {
      schema.name = name;
      schema.version = version;
      return request;
    },
  };
  return { indexedDBStub, request, schema };
}

// Drives a captured IDBOpenDBRequest through upgrade + success synchronously
// (openDB() assigns the handlers before returning, since the executor runs
// synchronously) and returns the recorded schema.
async function recordSchema(openDB, request, schema) {
  const dbPromise = openDB();
  request.onupgradeneeded({ target: { result: request.result } });
  request.onsuccess();
  await dbPromise;
  return schema;
}

test('database.js and background.js create identical IndexedDB schemas', async () => {
  const app = createIndexedDBStub();
  globalThis.indexedDB = app.indexedDBStub;
  const { openDB: appOpenDB } = await import('../src/db/database.js');
  const appSchema = await recordSchema(appOpenDB, app.request, app.schema);

  const bg = createIndexedDBStub();
  const context = vm.createContext({
    chrome: {
      action: { onClicked: { addListener() {} } },
      runtime: { onMessage: { addListener() {} } },
    },
    indexedDB: bg.indexedDBStub,
  });
  const source = readFileSync(new URL('../public/background.js', import.meta.url), 'utf8');
  vm.runInContext(source, context, { filename: 'background.js' });
  const bgSchema = await recordSchema(context.openDB, bg.request, bg.schema);

  assert.deepEqual(bgSchema, appSchema);
  assert.equal(appSchema.name, 'yt-curator');
  assert.ok(appSchema.version >= 3);
  assert.deepEqual(
    appSchema.stores.map((s) => s.name),
    ['videos', 'classifications', 'discovery']
  );
});

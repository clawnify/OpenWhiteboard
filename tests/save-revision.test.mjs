import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const wranglerRequire = createRequire(require.resolve("wrangler/package.json"));
const { build } = wranglerRequire("esbuild");
const { Miniflare } = wranglerRequire("miniflare");

async function withServer(fn) {
  const bundle = await build({ entryPoints: ["src/server/index.ts"], bundle: true,
    write: false, format: "esm", platform: "browser", external: ["node:*"] });
  const mf = new Miniflare({ modules: true, script: bundle.outputFiles[0].text,
    compatibilityDate: "2026-05-15", compatibilityFlags: ["nodejs_compat"], d1Databases: ["DB"] });
  try {
    const db = await mf.getD1Database("DB");
    await db.exec((await readFile("src/server/schema.sql", "utf8")).replaceAll("\n", " "));
    const call = async (method, path, body) => {
      const r = await mf.dispatchFetch(`https://test.local${path}`, {
        method, headers: { "Content-Type": "application/json" }, body: body && JSON.stringify(body),
      });
      return { status: r.status, body: await r.json() };
    };
    await fn(call);
  } finally { await mf.dispose(); }
}

test("a save made from a stale revision is refused with the current drawing", async () => {
  await withServer(async (call) => {
    const { body: created } = await call("POST", "/api/drawings", { name: "Board" });
    assert.equal(created.revision, 0);

    const first = await call("PUT", `/api/drawings/${created.id}`, { scene_data: '{"a":1}', revision: 0 });
    assert.equal(first.status, 200);
    assert.equal(first.body.revision, 1);

    const stale = await call("PUT", `/api/drawings/${created.id}`, { scene_data: '{"b":2}', revision: 0 });
    assert.equal(stale.status, 409);
    assert.equal(stale.body.scene_data, '{"a":1}');
    assert.equal(stale.body.revision, 1);

    const current = await call("PUT", `/api/drawings/${created.id}`, { scene_data: '{"c":3}', revision: 1 });
    assert.equal(current.status, 200);
    assert.equal(current.body.scene_data, '{"c":3}');
    assert.equal(current.body.revision, 2);
  });
});

test("a save without a revision overwrites and still moves the revision on", async () => {
  await withServer(async (call) => {
    const { body: created } = await call("POST", "/api/drawings", {});
    const api = await call("PUT", `/api/drawings/${created.id}`, { scene_data: '{"agent":true}' });
    assert.equal(api.status, 200);
    assert.equal(api.body.revision, 1);

    // A tab that loaded revision 0 can no longer write over the agent's change.
    const tab = await call("PUT", `/api/drawings/${created.id}`, { scene_data: '{"tab":true}', revision: 0 });
    assert.equal(tab.status, 409);
    assert.equal(tab.body.scene_data, '{"agent":true}');
  });
});

test("renaming keeps the scene and its revision", async () => {
  await withServer(async (call) => {
    const { body: created } = await call("POST", "/api/drawings", { scene_data: '{"x":1}' });
    const renamed = await call("PUT", `/api/drawings/${created.id}`, { name: "Renamed" });
    assert.equal(renamed.status, 200);
    assert.equal(renamed.body.name, "Renamed");
    assert.equal(renamed.body.scene_data, '{"x":1}');
    assert.equal(renamed.body.revision, 0);

    const saved = await call("PUT", `/api/drawings/${created.id}`, { scene_data: '{"x":2}', revision: 0 });
    assert.equal(saved.status, 200);
    assert.equal(saved.body.name, "Renamed");
  });
});

test("saving a drawing that does not exist is a 404", async () => {
  await withServer(async (call) => {
    const r = await call("PUT", "/api/drawings/missing", { scene_data: "{}", revision: 0 });
    assert.equal(r.status, 404);
  });
});

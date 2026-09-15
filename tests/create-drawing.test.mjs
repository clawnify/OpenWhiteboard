import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const wranglerRequire = createRequire(require.resolve("wrangler/package.json"));
const { build } = wranglerRequire("esbuild");
const { Miniflare } = wranglerRequire("miniflare");

test("creation returns its own drawing even when another drawing sorts later", async () => {
  const bundle = await build({ entryPoints: ["src/server/index.ts"], bundle: true,
    write: false, format: "esm", platform: "browser", external: ["node:*"] });
  const mf = new Miniflare({ modules: true, script: bundle.outputFiles[0].text,
    compatibilityDate: "2026-05-15", compatibilityFlags: ["nodejs_compat"], d1Databases: ["DB"] });
  try {
    const db = await mf.getD1Database("DB");
    await db.exec((await readFile("src/server/schema.sql", "utf8")).replaceAll("\n", " "));
    await db.prepare("INSERT INTO drawings (id, name, created_at) VALUES (?, ?, ?)")
      .bind("existing", "Existing drawing", "2099-01-01 00:00:00").run();
    const ids = new Set();
    for (const name of ["First drawing", "Second drawing"]) {
      const response = await mf.dispatchFetch("https://test.local/api/drawings", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }),
      });
      assert.equal(response.status, 201);
      const drawing = await response.json();
      assert.equal(drawing.name, name);
      assert.notEqual(drawing.id, "existing");
      ids.add(drawing.id);
    }
    assert.equal(ids.size, 2);
  } finally { await mf.dispose(); }
});

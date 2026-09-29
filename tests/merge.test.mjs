import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const wranglerRequire = createRequire(require.resolve("wrangler/package.json"));
const { build } = wranglerRequire("esbuild");

const bundle = await build({ entryPoints: ["src/client/merge.ts"], bundle: true, write: false, format: "esm" });
const { mergeElements, syncedScene } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`
);

// What a tab holds after loading: the server's elements, restored by Excalidraw with a version each.
const loaded = (raw) => ({ raw, local: raw.map((e) => ({ ...e, version: e.version ?? 1 })) });
const ids = (elements) => elements.map((e) => e.id);
const byId = (elements, id) => elements.find((e) => e.id === id);

test("an API edit without versions survives a stale tab's edit to another element", () => {
  const { raw, local } = loaded([{ id: "a", x: 0 }, { id: "b", x: 0 }]);
  const base = syncedScene(raw, local);
  const tab = [{ ...local[0], x: 50, version: 2 }, local[1]];   // the tab moved a
  const server = [{ id: "a", x: 0 }, { id: "b", x: 99 }];         // the agent moved b, no version

  const { elements, fromRemote } = mergeElements(base, tab, server, new Set());
  assert.equal(byId(elements, "a").x, 50);
  assert.equal(byId(elements, "b").x, 99);
  assert.deepEqual([...fromRemote], ["b"]);
});

test("an element removed through the API stays removed", () => {
  const { raw, local } = loaded([{ id: "a" }, { id: "b" }]);
  const base = syncedScene(raw, local);
  const tab = [...local, { id: "c", version: 1 }];                // the tab added c
  const server = [{ id: "a" }];                                   // the agent dropped b

  const { elements } = mergeElements(base, tab, server, new Set());
  assert.deepEqual(ids(elements), ["a", "c"]);
});

test("an element this tab edited is kept when the other side removed it", () => {
  const { raw, local } = loaded([{ id: "a", x: 0 }]);
  const base = syncedScene(raw, local);
  const tab = [{ ...local[0], x: 5, version: 2 }];

  const { elements } = mergeElements(base, tab, [], new Set());
  assert.deepEqual(ids(elements), ["a"]);
  assert.equal(elements[0].x, 5);
});

test("when both sides edit the same element, the higher version wins", () => {
  const { raw, local } = loaded([{ id: "a", x: 0, version: 3 }]);
  const base = syncedScene(raw, local);

  const newerThere = mergeElements(base, [{ id: "a", x: 1, version: 4 }], [{ id: "a", x: 2, version: 6 }], new Set());
  assert.equal(newerThere.elements[0].x, 2);

  const newerHere = mergeElements(base, [{ id: "a", x: 1, version: 7 }], [{ id: "a", x: 2, version: 6 }], new Set());
  assert.equal(newerHere.elements[0].x, 1);
});

test("an element being edited here is never replaced", () => {
  const { raw, local } = loaded([{ id: "t", text: "hi", version: 3 }]);
  const base = syncedScene(raw, local);
  const { elements } = mergeElements(base, [{ id: "t", text: "hello", version: 4 }],
    [{ id: "t", text: "yo", version: 9 }], new Set(["t"]));
  assert.equal(elements[0].text, "hello");
});

test("a deletion made in another tab reaches this one", () => {
  const { raw, local } = loaded([{ id: "a", version: 2 }, { id: "b", version: 1 }]);
  const base = syncedScene(raw, local);
  const tab = [local[0], { ...local[1], x: 1, version: 2 }];
  const server = [{ id: "a", version: 3, isDeleted: true }, { id: "b", version: 1 }];

  const { elements } = mergeElements(base, tab, server, new Set());
  assert.equal(byId(elements, "a").isDeleted, true);
  assert.equal(byId(elements, "b").x, 1);
});

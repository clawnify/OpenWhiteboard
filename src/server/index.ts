import { createApp, createRoute, z } from "@clawnify/app";
import { query, get, run } from "./db.js";

type Env = { Bindings: { DB: D1Database } };

const app = createApp<Env>({ title: "OpenWhiteboard API", version: "1.0.0" });

// ── Schemas ──────────────────────────────────────────────────────────

const DrawingSchema = z.object({
  id: z.string(),
  name: z.string(),
  scene_data: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

const ErrorSchema = z.object({ error: z.string() });

// ── List drawings ───────────────────────────────────────────────────

const listDrawings = createRoute({
  method: "get",
  path: "/api/drawings",
  responses: {
    200: { content: { "application/json": { schema: z.array(DrawingSchema) } }, description: "OK" },
  },
});

app.openapi(listDrawings, async (c) => {
  const rows = await query<z.infer<typeof DrawingSchema>>(
    "SELECT * FROM drawings ORDER BY updated_at DESC"
  );
  return c.json(rows, 200);
});

// ── Get drawing ─────────────────────────────────────────────────────

const getDrawing = createRoute({
  method: "get",
  path: "/api/drawings/{id}",
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: { content: { "application/json": { schema: DrawingSchema } }, description: "OK" },
    404: { content: { "application/json": { schema: ErrorSchema } }, description: "Not found" },
  },
});

app.openapi(getDrawing, async (c) => {
  const { id } = c.req.valid("param");
  const row = await get<z.infer<typeof DrawingSchema>>("SELECT * FROM drawings WHERE id = ?", [id]);
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json(row, 200);
});

// ── Create drawing ──────────────────────────────────────────────────

const createDrawing = createRoute({
  method: "post",
  path: "/api/drawings",
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({
            name: z.string().optional(),
            scene_data: z.string().optional(),
          }),
        },
      },
    },
  },
  responses: {
    201: { content: { "application/json": { schema: DrawingSchema } }, description: "Created" },
  },
});

app.openapi(createDrawing, async (c) => {
  const body = c.req.valid("json");
  const name = body.name || "Untitled";
  const scene_data = body.scene_data || '{"elements":[],"appState":{},"files":{}}';

  await run("INSERT INTO drawings (name, scene_data) VALUES (?, ?)", [name, scene_data]);
  const row = await get<z.infer<typeof DrawingSchema>>(
    "SELECT * FROM drawings ORDER BY created_at DESC LIMIT 1"
  );
  return c.json(row!, 201);
});

// ── Update drawing ──────────────────────────────────────────────────

const updateDrawing = createRoute({
  method: "put",
  path: "/api/drawings/{id}",
  request: {
    params: z.object({ id: z.string() }),
    body: {
      content: {
        "application/json": {
          schema: z.object({
            name: z.string().optional(),
            scene_data: z.string().optional(),
          }),
        },
      },
    },
  },
  responses: {
    200: { content: { "application/json": { schema: DrawingSchema } }, description: "OK" },
    404: { content: { "application/json": { schema: ErrorSchema } }, description: "Not found" },
  },
});

app.openapi(updateDrawing, async (c) => {
  const { id } = c.req.valid("param");
  const body = c.req.valid("json");

  const existing = await get<z.infer<typeof DrawingSchema>>("SELECT * FROM drawings WHERE id = ?", [id]);
  if (!existing) return c.json({ error: "Not found" }, 404);

  const name = body.name ?? existing.name;
  const scene_data = body.scene_data ?? existing.scene_data;

  await run(
    "UPDATE drawings SET name = ?, scene_data = ?, updated_at = datetime('now') WHERE id = ?",
    [name, scene_data, id]
  );

  const row = await get<z.infer<typeof DrawingSchema>>("SELECT * FROM drawings WHERE id = ?", [id]);
  return c.json(row!, 200);
});

// ── Delete drawing ──────────────────────────────────────────────────

const deleteDrawing = createRoute({
  method: "delete",
  path: "/api/drawings/{id}",
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: { content: { "application/json": { schema: z.object({ ok: z.boolean() }) } }, description: "Deleted" },
    404: { content: { "application/json": { schema: ErrorSchema } }, description: "Not found" },
  },
});

app.openapi(deleteDrawing, async (c) => {
  const { id } = c.req.valid("param");
  const existing = await get("SELECT id FROM drawings WHERE id = ?", [id]);
  if (!existing) return c.json({ error: "Not found" }, 404);
  await run("DELETE FROM drawings WHERE id = ?", [id]);
  return c.json({ ok: true }, 200);
});

export default app;

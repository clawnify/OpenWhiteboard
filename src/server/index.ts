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
  revision: z.number(),
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

  const row = await get<z.infer<typeof DrawingSchema>>(
    "INSERT INTO drawings (name, scene_data) VALUES (?, ?) RETURNING *",
    [name, scene_data]
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
            // The revision the new scene_data was made from. When it is no longer current the save is
            // refused with 409, so a stale copy never replaces a newer one. Omit it to overwrite regardless.
            revision: z.number().int().optional(),
          }),
        },
      },
    },
  },
  responses: {
    200: { content: { "application/json": { schema: DrawingSchema } }, description: "OK" },
    404: { content: { "application/json": { schema: ErrorSchema } }, description: "Not found" },
    409: { content: { "application/json": { schema: DrawingSchema } }, description: "Changed since that revision; the current drawing" },
  },
});

app.openapi(updateDrawing, async (c) => {
  const { id } = c.req.valid("param");
  const body = c.req.valid("json");

  const scene = body.scene_data ?? null;
  const guarded = scene !== null && body.revision !== undefined;

  // One statement, so nothing can land between the revision check and the write.
  const row = await get<z.infer<typeof DrawingSchema>>(
    `UPDATE drawings SET name = COALESCE(?, name), scene_data = COALESCE(?, scene_data),
       revision = revision + (? IS NOT NULL), updated_at = datetime('now')
     WHERE id = ?${guarded ? " AND revision = ?" : ""} RETURNING *`,
    guarded ? [body.name ?? null, scene, scene, id, body.revision!] : [body.name ?? null, scene, scene, id]
  );
  if (row) return c.json(row, 200);

  const current = await get<z.infer<typeof DrawingSchema>>("SELECT * FROM drawings WHERE id = ?", [id]);
  if (!current) return c.json({ error: "Not found" }, 404);
  return c.json(current, 409);
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

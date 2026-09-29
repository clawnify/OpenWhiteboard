# OpenWhiteboard

[![Deploy with Clawnify](https://app.clawnify.com/deploy-button.svg)](https://app.clawnify.com/deploy?repo=clawnify/OpenWhiteboard)

A collaborative whiteboard with hand-drawn style for sketching diagrams, wireframes, flowcharts, and visual brainstorming. Built with **Excalidraw + Preact + Tailwind CSS + Hono + SQLite**. Deploys to Cloudflare Workers via [Clawnify](https://clawnify.com).

## Features

- **Excalidraw canvas** — full drawing toolkit with shapes, text, arrows, freehand, and eraser
- **Hand-drawn aesthetic** — sketchy, informal style powered by Rough.js for a natural whiteboard feel
- **Drawing gallery** — grid view of all saved drawings with element count preview
- **Auto-save** — changes persisted automatically with 2-second debounce
- **Inline rename** — click the drawing title in the editor to rename on the spot
- **Export** — PNG and SVG export built into the Excalidraw toolbar
- **Dark mode** — toggle between light and dark canvas themes
- **Grid mode** — snap-to-grid for precise layouts
- **Keyboard shortcuts** — full Excalidraw shortcut set (Ctrl+Z undo, Ctrl+D duplicate, etc.)
- **URL-based routing** — deep-linkable `/drawing/:id` URLs with browser back/forward support
- **Present mode** — view-only exploring: drag to pan, scroll to zoom, nothing can be moved; `/drawing/:id?view` opens a board straight into it
- **Default view** — every board opens centred with room around it (80% of the screen, zoom between 80% and 100%)
- **Shape library** — access Excalidraw's community shape libraries

## Quickstart

```bash
git clone https://github.com/clawnify/OpenWhiteboard.git
cd open-whiteboard
pnpm install
```

Start the dev server:

```bash
pnpm dev
```

Open `http://localhost:5179` in your browser. The database schema is applied automatically on startup.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Preact, TypeScript, Tailwind CSS v4, Vite |
| **Drawing Engine** | Excalidraw (via Preact compat) |
| **Backend** | Hono with Zod OpenAPI validation |
| **Database** | SQLite (better-sqlite3), swapped to D1 at deploy |

### Prerequisites

- Node.js 20+
- pnpm

## Architecture

```
src/
  server/
    index.ts    — Hono REST API with Zod-validated routes
    db.ts       — SQLite database adapter (async wrappers)
    dev.ts      — Node.js dev server entry
    schema.sql  — Database schema (drawings table)
  client/
    app.tsx               — Root component with routing
    hooks/use-router.ts   — pushState URL router
    hooks/use-drawings.ts — Drawing CRUD + auto-save
    components/
      home.tsx    — Drawing gallery with create/rename/delete
      editor.tsx  — Excalidraw canvas with header toolbar
```

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/drawings` | List all drawings |
| POST | `/api/drawings` | Create a drawing |
| GET | `/api/drawings/:id` | Get a drawing |
| PUT | `/api/drawings/:id` | Update a drawing (name and/or scene data) |
| DELETE | `/api/drawings/:id` | Delete a drawing |

Several tabs, people and agents can edit the same board. Each drawing carries a `revision`, which goes up by one on
every write to `scene_data`. Send the `revision` you read with the new `scene_data`: if the board has changed since,
nothing is written and you get `409` with the current drawing. Re-read it, apply your change to that, and save again.
A write without `revision` overwrites whatever is there, so use it only when that is what you mean.

An open tab whose save gets a `409` merges instead of overwriting: it keeps each element from whichever side changed
it, so an element added, moved or left out through the API survives a tab that was showing an older copy.

### Scene Data Format

Drawings are stored as JSON containing Excalidraw elements, app state, and embedded files:

```json
{
  "elements": [
    { "type": "rectangle", "x": 100, "y": 100, "width": 200, "height": 150, "roughness": 1 }
  ],
  "appState": { "viewBackgroundColor": "#ffffff", "theme": "light" },
  "files": {}
}
```

## Deploy

```bash
npx clawnify deploy
```

## License

MIT

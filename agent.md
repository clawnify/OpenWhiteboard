# OpenWhiteboard Template

A collaborative whiteboard application built with Excalidraw, Preact, and Hono. Provides a hand-drawn style canvas for sketching diagrams, wireframes, flowcharts, and visual brainstorming.

## Architecture

- **Frontend:** Preact + Excalidraw + Tailwind CSS 4
- **Backend:** Hono REST API with Zod-validated routes
- **Database:** SQLite (better-sqlite3) — drawings stored as JSON scene data
- **Build:** Vite with Preact preset

## Key Features

- Excalidraw canvas with all drawing tools (shapes, text, arrows, freehand)
- Drawing gallery with create/rename/delete
- Auto-save with 2-second debounce
- URL-based routing (`/drawing/:id`)
- Hand-drawn sketch aesthetic
- Dark mode toggle
- Export to PNG/SVG (built into Excalidraw)
- Present mode: view-only, drag to pan; share `/drawing/:id?view` to open a board straight into it

## Data Model

### drawings
- `id` TEXT PRIMARY KEY (UUID)
- `name` TEXT — drawing title
- `scene_data` TEXT — JSON containing Excalidraw elements, appState, and files
- `created_at` TEXT
- `updated_at` TEXT
- `revision` INTEGER — goes up by one on every write to `scene_data`

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/drawings | List all drawings |
| GET | /api/drawings/:id | Get a drawing |
| POST | /api/drawings | Create new drawing |
| PUT | /api/drawings/:id | Update drawing (name and/or scene data) |
| DELETE | /api/drawings/:id | Delete drawing |

Several tabs, people and agents can edit the same board. Each drawing carries a `revision`, which goes up by one on
every write to `scene_data`. Send the `revision` you read with the new `scene_data`: if the board has changed since,
nothing is written and you get `409` with the current drawing. Re-read it, apply your change to that, and save again.
A write without `revision` overwrites whatever is there, so use it only when that is what you mean.

An open tab whose save gets a `409` merges instead of overwriting: it keeps each element from whichever side changed
it, so an element added, moved or left out through the API survives a tab that was showing an older copy.

## Customization Points

- **Theme:** Excalidraw supports light/dark mode via the `theme` prop
- **UI Options:** Configure which canvas actions are shown via `UIOptions` prop
- **Libraries:** Custom shape libraries can be loaded via `initialData.libraryItems`
- **Custom fonts:** Excalidraw uses Virgil (hand-drawn) and Cascadia (code) fonts by default
- **Grid:** Grid mode can be enabled/disabled

## Scene Data Format

```json
{
  "elements": [
    {
      "type": "rectangle",
      "x": 100, "y": 100,
      "width": 200, "height": 150,
      "strokeColor": "#000000",
      "backgroundColor": "transparent",
      "roughness": 1,
      "seed": 12345
    }
  ],
  "appState": {
    "viewBackgroundColor": "#ffffff",
    "theme": "light"
  },
  "files": {}
}
```

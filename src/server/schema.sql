CREATE TABLE IF NOT EXISTS drawings (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)),2) || '-' || hex(randomblob(6)))),
  name TEXT DEFAULT 'Untitled',
  scene_data TEXT DEFAULT '{"elements":[],"appState":{},"files":{}}',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  revision INTEGER NOT NULL DEFAULT 0
);

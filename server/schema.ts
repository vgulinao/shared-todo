// Applied at every startup. Every statement is idempotent, so there is no migration step.
// Columns for later stories (parent_id, description, cost) are here from day one; see specs/010.
export const schema = `
CREATE TABLE IF NOT EXISTS lists (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  edit_token  TEXT NOT NULL UNIQUE,
  view_token  TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS items (
  id          TEXT PRIMARY KEY,
  list_id     TEXT NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  parent_id   TEXT REFERENCES items(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT,
  done        INTEGER NOT NULL DEFAULT 0,
  cost        REAL,
  position    REAL NOT NULL
);

CREATE INDEX IF NOT EXISTS items_by_list ON items(list_id);
`;

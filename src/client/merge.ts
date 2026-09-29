// Merging a save that lost a race: the board changed on the server since this tab last synced.
//
// Each element is judged against the scene this tab last agreed with the server, not by version numbers
// alone. Boards written through the API often carry elements without a `version`, and an element removed
// through the API is simply absent, so comparing versions would quietly undo those writes.

export type Element = { id: string; version?: number; [key: string]: unknown };

/** The scene this tab last agreed with the server: each element as the server holds it, and its version here. */
export interface Synced {
  raw: Map<string, string>;
  versions: Map<string, number | undefined>;
}

export function syncedScene(raw: readonly Element[], local: readonly Element[]): Synced {
  return {
    raw: new Map(raw.map((e) => [e.id, JSON.stringify(e)])),
    versions: new Map(local.map((e) => [e.id, e.version])),
  };
}

/**
 * Keeps whichever side changed each element. When both did, the one mid-edit here or with the higher
 * version wins, and the other side's edit to that element is lost. `fromRemote` names the elements
 * taken from the server, so the caller can record their versions as synced.
 */
export function mergeElements(
  base: Synced,
  local: readonly Element[],
  remote: readonly Element[],
  editing: ReadonlySet<string>,
): { elements: Element[]; fromRemote: Set<string> } {
  const localById = new Map(local.map((e) => [e.id, e]));
  const remoteById = new Map(remote.map((e) => [e.id, e]));
  const elements: Element[] = [];
  const fromRemote = new Set<string>();

  const ids = new Set([...remote.map((e) => e.id), ...local.map((e) => e.id)]);
  for (const id of ids) {
    const l = localById.get(id);
    const r = remoteById.get(id);
    const remoteChanged = (r && JSON.stringify(r)) !== base.raw.get(id);
    const localChanged = l?.version !== base.versions.get(id);

    let pick = l;
    if (remoteChanged) {
      const keepLocal = localChanged && l && (!r || editing.has(id) || (l.version ?? 0) > (r.version ?? 0));
      if (!keepLocal) pick = r;
    }
    if (!pick) continue;
    if (pick === r) fromRemote.add(id);
    elements.push(pick);
  }
  return { elements, fromRemote };
}

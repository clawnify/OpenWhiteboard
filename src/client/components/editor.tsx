import { useState, useEffect, useRef, useCallback } from "preact/hooks";
import { ArrowLeft, Check, Pencil, PencilLine, Presentation } from "lucide-preact";
import type { Drawing, SceneData } from "../types";
import { mergeElements, syncedScene, type Element, type Synced } from "../merge";

interface EditorProps {
  drawing: Drawing;
  saveDrawing: (id: string, sceneData: string, revision: number) => Promise<{ saved: boolean; drawing: Drawing }>;
  renameDrawing: (id: string, name: string) => Promise<void>;
  navigate: (to: string) => void;
}

const SAVED_SETTINGS = [
  "viewBackgroundColor", "currentItemFontFamily", "currentItemFontSize", "currentItemStrokeColor",
  "currentItemBackgroundColor", "currentItemFillStyle", "currentItemStrokeWidth", "currentItemRoughness",
  "currentItemOpacity", "gridSize", "gridModeEnabled", "theme",
] as const;

function toScene(elements: readonly any[], appState: any, files: any): SceneData {
  return {
    elements,
    appState: Object.fromEntries(SAVED_SETTINGS.map((k) => [k, appState[k]])),
    files: files || {},
  };
}

function parseScene(sceneData: string): Partial<SceneData> {
  try { return JSON.parse(sceneData); } catch { return {}; }
}

export function Editor({ drawing, saveDrawing, renameDrawing, navigate }: EditorProps) {
  const [excalidrawAPI, setExcalidrawAPI] = useState<any>(null);
  const [ExcalidrawComp, setExcalidrawComp] = useState<any>(null);
  const [renaming, setRenaming] = useState(false);
  const [nameValue, setNameValue] = useState(drawing.name);
  const initialDataLoaded = useRef(false);
  // What was last loaded or saved. Excalidraw calls onChange for panning, zooming and selecting too;
  // saving those would write this tab's copy over anyone else's edits for no change at all.
  const savedKey = useRef<string | null>(null);
  const hashVersion = useRef<((elements: readonly any[]) => number) | null>(null);
  const restoreElements = useRef<((elements: any[], local: readonly any[], opts?: any) => any[]) | null>(null);
  const drawingIdRef = useRef(drawing.id);
  const drawingRef = useRef(drawing);
  drawingRef.current = drawing;
  // A save names the revision it was made from, and the server refuses it if the board has moved on.
  // `synced` is the scene at that revision, which a refused save is merged against.
  const revision = useRef(drawing.revision);
  const synced = useRef<Synced | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saving = useRef(false);
  const saveAgain = useRef(false);
  const apiRef = useRef<any>(null);
  apiRef.current = excalidrawAPI;
  // Present mode: Excalidraw's view mode, where dragging pans and nothing can be edited. `?view` opens a link in it.
  const [presenting, setPresenting] = useState(() => new URLSearchParams(window.location.search).has("view"));
  const presentingRef = useRef(presenting);
  presentingRef.current = presenting;

  // Default view: centre the board so it fills 80% of the screen, never zoomed below 80% (a bigger board
  // is panned instead) or above 100%. From there people zoom however they like.
  const getBounds = useRef<((elements: readonly any[]) => [number, number, number, number]) | null>(null);
  const frameBoard = (api: any) => {
    const elements = api?.getSceneElements();
    if (!elements?.length || !getBounds.current) return;
    const [x1, y1, x2, y2] = getBounds.current(elements);
    const { width, height } = api.getAppState();
    const fit = Math.min(width / Math.max(x2 - x1, 1), height / Math.max(y2 - y1, 1)) * 0.8;
    const zoom = Math.min(1, Math.max(0.8, fit));
    api.updateScene({
      appState: {
        zoom: { value: zoom },
        scrollX: width / (2 * zoom) - (x1 + x2) / 2,
        scrollY: height / (2 * zoom) - (y1 + y2) / 2,
      },
    });
  };

  const togglePresenting = () => {
    const next = !presenting;
    setPresenting(next);
    const params = new URLSearchParams(window.location.search);
    if (next) params.set("view", "");
    else params.delete("view");
    const query = params.toString().replace(/(^|&)view=(?=&|$)/, "$1view");
    window.history.replaceState(null, "", window.location.pathname + (query ? `?${query}` : ""));
    if (next) frameBoard(excalidrawAPI);
  };

  // Every board opens on the default view, including a shared `?view` link.
  useEffect(() => {
    if (!excalidrawAPI) return;
    setTimeout(() => frameBoard(excalidrawAPI), 50);
  }, [excalidrawAPI]);

  // Dynamically import Excalidraw (it's a large bundle)
  useEffect(() => {
    import("@excalidraw/excalidraw").then((mod) => {
      getBounds.current = mod.getCommonBounds as any;
      hashVersion.current = mod.hashElementsVersion as any;
      restoreElements.current = mod.restoreElements as any;
      setExcalidrawComp(() => mod.Excalidraw);
    });
  }, []);

  // Reset when drawing changes
  useEffect(() => {
    if (drawingIdRef.current !== drawing.id) {
      drawingIdRef.current = drawing.id;
      initialDataLoaded.current = false;
      savedKey.current = null;
      revision.current = drawing.revision;
      synced.current = null;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      setNameValue(drawing.name);

      if (excalidrawAPI) {
        try {
          const scene = JSON.parse(drawing.scene_data);
          excalidrawAPI.updateScene({
            elements: scene.elements || [],
            appState: { ...scene.appState },
          });
          if (scene.files && Object.keys(scene.files).length > 0) {
            excalidrawAPI.addFiles(Object.values(scene.files));
          }
        } catch {}
      }
    }
  }, [drawing.id, excalidrawAPI]);

  const sceneKey = (scene: SceneData) =>
    [
      hashVersion.current ? hashVersion.current(scene.elements) : JSON.stringify(scene.elements),
      JSON.stringify(scene.appState),
      Object.keys(scene.files).sort().join(),
    ].join("|");

  // The save was refused: someone else changed the board. Take in their changes, keeping this tab's own
  // where they don't collide, and make the server's scene the new starting point.
  const mergeCurrent = (api: any, current: Drawing) => {
    const remote = parseScene(current.scene_data);
    const remoteElements = (remote.elements ?? []) as Element[];
    const local = api.getSceneElementsIncludingDeleted();
    const base = synced.current ?? syncedScene([], []);
    const s = api.getAppState();
    const editing = new Set<string>([s.editingTextElement?.id, s.resizingElement?.id, s.newElement?.id].filter(Boolean));
    const { elements, fromRemote } = mergeElements(base, local, remoteElements, editing);
    const merged = restoreElements.current!(elements, local, { repairBindings: true });
    api.updateScene({ elements: merged, captureUpdate: "NEVER" });   // their changes aren't this person's to undo
    const have = api.getFiles();
    const missing = Object.values(remote.files ?? {}).filter((f: any) => !have[f.id]);
    if (missing.length) api.addFiles(missing);
    synced.current = {
      raw: syncedScene(remoteElements, []).raw,
      versions: new Map(merged.map((e: Element) => [e.id, fromRemote.has(e.id) ? e.version : base.versions.get(e.id)])),
    };
  };

  // One save at a time. Edits made while a save is out go in the next one, which starts from its revision.
  const flush = useCallback(async () => {
    if (saving.current) { saveAgain.current = true; return; }
    saving.current = true;
    const id = drawing.id;
    try {
      do {
        saveAgain.current = false;
        const api = apiRef.current;
        if (!api || drawingIdRef.current !== id) return;
        const scene = toScene(api.getSceneElementsIncludingDeleted(), api.getAppState(), api.getFiles());
        const key = sceneKey(scene);
        if (key === savedKey.current) continue;
        const sent = JSON.stringify(scene);
        const result = await saveDrawing(id, sent, revision.current);
        if (drawingIdRef.current !== id) return;
        revision.current = result.drawing.revision;
        if (result.saved) {
          savedKey.current = key;
          const elements = (JSON.parse(sent) as SceneData).elements as Element[];
          synced.current = syncedScene(elements, elements);
        } else {
          mergeCurrent(api, result.drawing);
          saveAgain.current = true;
        }
      } while (saveAgain.current);
    } catch {
      // The failure is shown by useDrawings; the next edit tries again.
    } finally {
      saving.current = false;
    }
  }, [drawing.id, saveDrawing]);

  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

  const handleChange = useCallback(
    (elements: readonly any[], appState: any, files: any) => {
      if (presentingRef.current) return;   // panning around a presented board isn't an edit

      const key = sceneKey(toScene(elements, appState, files));
      if (!initialDataLoaded.current) {
        initialDataLoaded.current = true;
        savedKey.current = key;
        synced.current = syncedScene((parseScene(drawingRef.current.scene_data).elements ?? []) as Element[], elements);
        return;
      }
      if (key === savedKey.current) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(flush, 2000);
    },
    [flush]
  );

  const getInitialData = useCallback(() => {
    try {
      const scene = JSON.parse(drawing.scene_data);
      return {
        elements: scene.elements || [],
        appState: {
          ...scene.appState,
          collaborators: new Map(),
        },
        files: scene.files || {},
        scrollToContent: true,
      };
    } catch {
      return {
        elements: [],
        appState: { collaborators: new Map() },
        files: {},
        scrollToContent: true,
      };
    }
  }, [drawing.scene_data]);

  const commitRename = async () => {
    if (nameValue.trim() && nameValue.trim() !== drawing.name) {
      await renameDrawing(drawing.id, nameValue.trim());
    }
    setRenaming(false);
  };

  return (
    <div class="h-screen w-screen flex flex-col bg-white">
      {/* Header */}
      <div class="h-12 flex items-center gap-3 px-3 border-b border-gray-200 bg-white z-10 shrink-0">
        <button
          onClick={() => navigate("/")}
          class="p-1.5 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          title="Back to home"
        >
          <ArrowLeft size={18} />
        </button>

        {renaming ? (
          <div class="flex items-center gap-1.5">
            <input
              type="text"
              value={nameValue}
              onInput={(e) => setNameValue((e.target as HTMLInputElement).value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename();
                if (e.key === "Escape") {
                  setNameValue(drawing.name);
                  setRenaming(false);
                }
              }}
              class="text-sm font-medium text-gray-900 border border-blue-300 rounded px-2 py-1 outline-none focus:ring-2 focus:ring-blue-100"
              autoFocus
            />
            <button
              onClick={commitRename}
              class="p-1 rounded text-blue-600 hover:bg-blue-50"
            >
              <Check size={16} />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setRenaming(true)}
            class="flex items-center gap-1.5 text-sm font-medium text-gray-900 hover:text-blue-600 transition-colors group"
          >
            {drawing.name}
            <Pencil size={12} class="text-gray-300 group-hover:text-blue-400" />
          </button>
        )}

        <button
          onClick={togglePresenting}
          class="ml-auto flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors"
          title={presenting ? "Back to editing" : "Present: drag to explore, nothing can be moved"}
        >
          {presenting ? <PencilLine size={16} /> : <Presentation size={16} />}
          {presenting ? "Edit" : "Present"}
        </button>
      </div>

      {/* Excalidraw Canvas */}
      <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        {ExcalidrawComp ? (
          <div class="excalidraw-container" style={{ position: "absolute", inset: 0 }}>
            <ExcalidrawComp
              excalidrawAPI={(api: any) => setExcalidrawAPI(api)}
              initialData={getInitialData()}
              onChange={handleChange}
              viewModeEnabled={presenting}
              zenModeEnabled={presenting}
              theme="light"
              UIOptions={{
                canvasActions: {
                  loadScene: false,
                  saveToActiveFile: false,
                  toggleTheme: true,
                },
              }}
            />
          </div>
        ) : (
          <div class="flex items-center justify-center h-full">
            <div class="text-center">
              <div class="w-6 h-6 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-3" />
              <p class="text-gray-400 text-sm">Loading editor...</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

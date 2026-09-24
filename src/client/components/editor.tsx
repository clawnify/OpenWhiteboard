import { useState, useEffect, useRef, useCallback } from "preact/hooks";
import { ArrowLeft, Check, Pencil, PencilLine, Presentation } from "lucide-preact";
import type { Drawing, SceneData } from "../types";

interface EditorProps {
  drawing: Drawing;
  saveDrawing: (id: string, sceneData: string) => void;
  renameDrawing: (id: string, name: string) => Promise<void>;
  navigate: (to: string) => void;
}

export function Editor({ drawing, saveDrawing, renameDrawing, navigate }: EditorProps) {
  const [excalidrawAPI, setExcalidrawAPI] = useState<any>(null);
  const [ExcalidrawComp, setExcalidrawComp] = useState<any>(null);
  const [renaming, setRenaming] = useState(false);
  const [nameValue, setNameValue] = useState(drawing.name);
  const initialDataLoaded = useRef(false);
  const drawingIdRef = useRef(drawing.id);
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
      setExcalidrawComp(() => mod.Excalidraw);
    });
  }, []);

  // Reset when drawing changes
  useEffect(() => {
    if (drawingIdRef.current !== drawing.id) {
      drawingIdRef.current = drawing.id;
      initialDataLoaded.current = false;
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

  const handleChange = useCallback(
    (elements: readonly any[], appState: any, files: any) => {
      if (!initialDataLoaded.current) {
        initialDataLoaded.current = true;
        return;
      }
      if (presentingRef.current) return;   // panning around a presented board isn't an edit

      const sceneData: SceneData = {
        elements,
        appState: {
          viewBackgroundColor: appState.viewBackgroundColor,
          currentItemFontFamily: appState.currentItemFontFamily,
          currentItemFontSize: appState.currentItemFontSize,
          currentItemStrokeColor: appState.currentItemStrokeColor,
          currentItemBackgroundColor: appState.currentItemBackgroundColor,
          currentItemFillStyle: appState.currentItemFillStyle,
          currentItemStrokeWidth: appState.currentItemStrokeWidth,
          currentItemRoughness: appState.currentItemRoughness,
          currentItemOpacity: appState.currentItemOpacity,
          gridSize: appState.gridSize,
          gridModeEnabled: appState.gridModeEnabled,
          theme: appState.theme,
        },
        files: files || {},
      };

      saveDrawing(drawing.id, JSON.stringify(sceneData));
    },
    [drawing.id, saveDrawing]
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

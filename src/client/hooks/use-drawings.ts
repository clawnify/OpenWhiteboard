import { useState, useEffect, useCallback } from "preact/hooks";
import { api } from "../api";
import type { Drawing } from "../types";

export function useDrawings() {
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [activeDrawing, setActiveDrawing] = useState<Drawing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Drawing[]>("GET", "/api/drawings")
      .then(setDrawings)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const loadDrawing = useCallback(async (id: string) => {
    try {
      setLoading(true);
      const d = await api<Drawing>("GET", `/api/drawings/${id}`);
      setActiveDrawing(d);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const createDrawing = useCallback(async (name?: string): Promise<Drawing> => {
    const d = await api<Drawing>("POST", "/api/drawings", { name: name || "Untitled" });
    setDrawings((prev) => [d, ...prev]);
    return d;
  }, []);

  // Saves a scene made from `revision`. When the board has changed since, nothing is written and the
  // current drawing comes back with `saved: false`, for the caller to merge and save again.
  const saveDrawing = useCallback(
    async (id: string, sceneData: string, revision: number): Promise<{ saved: boolean; drawing: Drawing }> => {
      let updated: Drawing;
      try {
        const r = await fetch(`/api/drawings/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scene_data: sceneData, revision }),
        });
        const data = await r.json();
        if (r.status === 409) return { saved: false, drawing: data as Drawing };
        if (!r.ok) throw new Error((data as { error?: string }).error || "Request failed");
        updated = data as Drawing;
      } catch (e: any) {
        setError(e.message);
        throw e;
      }
      setActiveDrawing((prev) => (prev?.id === id ? updated : prev));
      setDrawings((prev) => prev.map((d) => (d.id === id ? updated : d)));
      return { saved: true, drawing: updated };
    },
    []
  );

  const renameDrawing = useCallback(async (id: string, name: string) => {
    const updated = await api<Drawing>("PUT", `/api/drawings/${id}`, { name });
    setActiveDrawing((prev) => (prev?.id === id ? updated : prev));
    setDrawings((prev) => prev.map((d) => (d.id === id ? updated : d)));
  }, []);

  const deleteDrawing = useCallback(async (id: string) => {
    await api("DELETE", `/api/drawings/${id}`);
    setDrawings((prev) => prev.filter((d) => d.id !== id));
    if (activeDrawing?.id === id) setActiveDrawing(null);
  }, [activeDrawing]);

  return {
    drawings,
    activeDrawing,
    loading,
    error,
    loadDrawing,
    createDrawing,
    saveDrawing,
    renameDrawing,
    deleteDrawing,
    setError,
  };
}

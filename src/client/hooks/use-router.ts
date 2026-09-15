import { reportLocation } from "@clawnify/app/client";
import { useState, useEffect, useCallback } from "preact/hooks";

export function useRouter() {
  const [path, setPath] = useState(window.location.pathname);

  const navigate = useCallback((to: string) => {
    window.history.pushState(null, "", to);
    setPath(to);
  }, []);

  useEffect(() => {
    const handler = () => setPath(window.location.pathname);
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, []);

  useEffect(() => { reportLocation(path); }, [path]);

  const match = path.match(/^\/drawing\/([^/]+)$/);
  const drawingId = match ? match[1] : null;

  return { path, navigate, drawingId };
}

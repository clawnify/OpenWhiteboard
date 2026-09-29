export interface Drawing {
  id: string;
  name: string;
  scene_data: string;
  created_at: string;
  updated_at: string;
  revision: number;
}

export interface SceneData {
  elements: readonly Record<string, unknown>[];
  appState: Record<string, unknown>;
  files: Record<string, unknown>;
}

import { invoke } from "@tauri-apps/api/core";

export interface Profile {
  id: string;
  name: string;
  color: string;
  data_dir: string;
  running: boolean;
  signed_in: boolean;
}

export interface ClaudeStatus {
  found: boolean;
  path: string | null;
}

export interface LaunchCheck {
  first_run: boolean;
  others_running: boolean;
}

export const api = {
  listProfiles: () => invoke<Profile[]>("list_profiles"),
  addProfile: (name: string, color: string) =>
    invoke<Profile[]>("add_profile", { name, color }),
  updateProfile: (id: string, name: string, color: string) =>
    invoke<Profile[]>("update_profile", { id, name, color }),
  removeProfile: (id: string) => invoke<Profile[]>("remove_profile", { id }),
  preLaunchCheck: (id: string) => invoke<LaunchCheck>("pre_launch_check", { id }),
  launchProfile: (id: string) => invoke<void>("launch_profile", { id }),
  claudeStatus: () => invoke<ClaudeStatus>("claude_status"),
  setClaudePath: (path: string | null) =>
    invoke<ClaudeStatus>("set_claude_path", { path }),
  openDataDir: (id: string) => invoke<void>("open_data_dir", { id }),
};

export const PALETTE = [
  "#3B82F6",
  "#EF4444",
  "#10B981",
  "#F59E0B",
  "#8B5CF6",
  "#EC4899",
  "#14B8A6",
  "#F97316",
];

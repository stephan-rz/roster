import { invoke } from "@tauri-apps/api/core";

export interface Account {
  email: string | null;
  name: string | null;
  org: string | null;
}

export interface Profile {
  id: string;
  name: string;
  color: string;
  data_dir: string;
  running: boolean;
  signed_in: boolean;
  account: Account | null;
}

export interface ClaudeStatus {
  found: boolean;
  path: string | null;
}

export interface LaunchCheck {
  first_run: boolean;
  others_running: boolean;
}

export interface ImportCandidate {
  data_dir: string;
  suggested_name: string;
  signed_in: boolean;
  account: Account | null;
}

export const api = {
  listProfiles: () => invoke<Profile[]>("list_profiles"),
  refreshAccounts: () => invoke<Profile[]>("refresh_accounts"),
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
  discoverImportable: () => invoke<ImportCandidate[]>("discover_importable"),
  importProfile: (name: string, color: string, dataDir: string) =>
    invoke<Profile[]>("import_profile", { name, color, dataDir }),
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

import { invoke } from "@tauri-apps/api/core";

/** The apps Roster can run side by side. Must match Rust's `AppKind`. */
export type AppKind = "claude" | "chatgpt";

export const APP_ORDER: AppKind[] = ["claude", "chatgpt"];

export const APP_META: Record<
  AppKind,
  {
    label: string;
    vendor: string;
    plans: string[];
    chip: string;
    dot: string;
    exe: string;
    /** URL scheme its sign-in callbacks come back on. Must match Rust's `url_scheme`. */
    scheme: string;
  }
> = {
  claude: {
    label: "Claude",
    vendor: "Anthropic",
    plans: ["Free", "Pro", "Max", "Team", "Enterprise"],
    chip: "bg-orange-500/10 text-orange-300 ring-1 ring-inset ring-orange-500/25",
    dot: "bg-orange-400",
    exe: "Claude.exe",
    scheme: "claude",
  },
  chatgpt: {
    label: "ChatGPT",
    vendor: "OpenAI",
    plans: ["Free", "Go", "Plus", "Pro", "Business", "Enterprise"],
    chip: "bg-slate-200/10 text-slate-200 ring-1 ring-inset ring-slate-400/25",
    dot: "bg-slate-300",
    exe: "ChatGPT.exe",
    // ChatGPT ships inside the OpenAI.Codex package, so its scheme is `codex`.
    scheme: "codex",
  },
};

/** Which app a pasted callback URL belongs to, or null if it matches none. */
export function appForLink(url: string): AppKind | null {
  const u = url.trim().toLowerCase();
  return APP_ORDER.find((k) => u.startsWith(`${APP_META[k].scheme}://`)) ?? null;
}

export interface Account {
  email: string | null;
  name: string | null;
  org: string | null;
}

export interface Profile {
  id: string;
  name: string;
  color: string;
  plan: string | null;
  app: AppKind;
  data_dir: string;
  running: boolean;
  signed_in: boolean;
  account: Account | null;
}

export interface AppStatus {
  app: AppKind;
  label: string;
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
  app: AppKind;
  signed_in: boolean;
  account: Account | null;
}

export const api = {
  listProfiles: () => invoke<Profile[]>("list_profiles"),
  refreshAccounts: () => invoke<Profile[]>("refresh_accounts"),
  addProfile: (name: string, color: string, plan: string | null, app: AppKind) =>
    invoke<Profile[]>("add_profile", { name, color, plan, app }),
  updateProfile: (id: string, name: string, color: string, plan: string | null) =>
    invoke<Profile[]>("update_profile", { id, name, color, plan }),
  removeProfile: (id: string) => invoke<Profile[]>("remove_profile", { id }),
  preLaunchCheck: (id: string) => invoke<LaunchCheck>("pre_launch_check", { id }),
  launchProfile: (id: string) => invoke<void>("launch_profile", { id }),
  deliverLink: (id: string, url: string) => invoke<void>("deliver_link", { id, url }),
  appStatuses: () => invoke<AppStatus[]>("app_statuses"),
  setAppPath: (app: AppKind, path: string | null) =>
    invoke<AppStatus[]>("set_app_path", { app, path }),
  openDataDir: (id: string) => invoke<void>("open_data_dir", { id }),
  openUrl: (url: string) => invoke<void>("open_url", { url }),
  appVersion: () => invoke<string>("app_version"),
  discoverImportable: () => invoke<ImportCandidate[]>("discover_importable"),
  importProfile: (name: string, color: string, dataDir: string, app: AppKind) =>
    invoke<Profile[]>("import_profile", { name, color, dataDir, app }),
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

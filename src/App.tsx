import { useCallback, useEffect, useState, type ReactNode } from "react";
import { api, PALETTE, type ClaudeStatus, type Profile } from "./api";

/* ------------------------------- icons ------------------------------- */
const Icon = {
  Plus: (p: any) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" {...p}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
  Play: (p: any) => (
    <svg viewBox="0 0 24 24" fill="currentColor" {...p}>
      <path d="M8 5v14l11-7z" />
    </svg>
  ),
  Gear: (p: any) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
  Pencil: (p: any) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
    </svg>
  ),
  Folder: (p: any) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  ),
  Trash: (p: any) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
    </svg>
  ),
  Stack: (p: any) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" {...p}>
      <path d="M12 3 3 8l9 5 9-5-9-5z" />
      <path d="m3 13 9 5 9-5" />
    </svg>
  ),
};

/* ------------------------------- modal shell ------------------------------- */
function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onMouseDown={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-md rounded-2xl border border-slate-700/70 bg-slate-900 shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="border-b border-slate-800 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-100">{title}</h2>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

/* ------------------------------- status badge ------------------------------- */
function Badge({ profile }: { profile: Profile }) {
  if (profile.running)
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-300">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" /> Running
      </span>
    );
  if (profile.signed_in)
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-500/10 px-2.5 py-1 text-xs font-medium text-sky-300">
        <span className="h-1.5 w-1.5 rounded-full bg-sky-400" /> Signed in
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-700/40 px-2.5 py-1 text-xs font-medium text-slate-400">
      <span className="h-1.5 w-1.5 rounded-full bg-slate-500" /> Not set up
    </span>
  );
}

/* ------------------------------- profile card ------------------------------- */
function ProfileCard({
  profile,
  launching,
  onLaunch,
  onEdit,
  onFolder,
  onRemove,
}: {
  profile: Profile;
  launching: boolean;
  onLaunch: () => void;
  onEdit: () => void;
  onFolder: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60 transition hover:border-slate-700 hover:bg-slate-900">
      <div className="h-1 w-full" style={{ backgroundColor: profile.color }} />
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span
              className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-sm font-semibold text-white shadow-inner"
              style={{ backgroundColor: profile.color }}
            >
              {profile.name.trim().charAt(0).toUpperCase() || "?"}
            </span>
            <div className="min-w-0">
              <div className="truncate font-semibold text-slate-100">{profile.name || "Untitled"}</div>
              <div className="mt-0.5">
                <Badge profile={profile} />
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <button
            onClick={onLaunch}
            disabled={launching}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-500 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Icon.Play className="h-4 w-4" />
            {launching ? "Launching…" : "Launch"}
          </button>
          <IconBtn title="Edit" onClick={onEdit}>
            <Icon.Pencil className="h-4 w-4" />
          </IconBtn>
          <IconBtn title="Open data folder" onClick={onFolder}>
            <Icon.Folder className="h-4 w-4" />
          </IconBtn>
          <IconBtn title="Remove" onClick={onRemove} danger>
            <Icon.Trash className="h-4 w-4" />
          </IconBtn>
        </div>
      </div>
    </div>
  );
}

function IconBtn({
  children,
  title,
  onClick,
  danger,
}: {
  children: ReactNode;
  title: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={`grid h-9 w-9 place-items-center rounded-xl border border-slate-800 bg-slate-800/40 text-slate-400 transition hover:bg-slate-800 ${
        danger ? "hover:text-rose-400" : "hover:text-slate-200"
      }`}
    >
      {children}
    </button>
  );
}

/* ------------------------------- add / edit dialog ------------------------------- */
function EditDialog({
  initial,
  onSave,
  onClose,
}: {
  initial: Profile | null;
  onSave: (name: string, color: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [color, setColor] = useState(initial?.color ?? PALETTE[0]);
  const valid = name.trim().length > 0;
  return (
    <Modal title={initial ? "Edit account" : "New account"} onClose={onClose}>
      <label className="block text-sm font-medium text-slate-300">Name</label>
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && valid && onSave(name, color)}
        placeholder="Personal, Work, Client X…"
        className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-800/60 px-3 py-2 text-slate-100 outline-none placeholder:text-slate-500 focus:border-indigo-500"
      />

      <div className="mt-4 text-sm font-medium text-slate-300">Color</div>
      <div className="mt-2 flex flex-wrap gap-2">
        {PALETTE.map((c) => (
          <button
            key={c}
            onClick={() => setColor(c)}
            className={`h-8 w-8 rounded-full transition ${
              color === c ? "ring-2 ring-white ring-offset-2 ring-offset-slate-900" : "opacity-80 hover:opacity-100"
            }`}
            style={{ backgroundColor: c }}
          />
        ))}
      </div>

      <div className="mt-6 flex justify-end gap-2">
        <button onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800">
          Cancel
        </button>
        <button
          disabled={!valid}
          onClick={() => onSave(name.trim(), color)}
          className="rounded-xl bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-400 disabled:opacity-50"
        >
          {initial ? "Save" : "Create"}
        </button>
      </div>
    </Modal>
  );
}

/* ------------------------------- settings dialog ------------------------------- */
function SettingsDialog({
  claude,
  onSaved,
  onClose,
}: {
  claude: ClaudeStatus;
  onSaved: (s: ClaudeStatus) => void;
  onClose: () => void;
}) {
  const [path, setPath] = useState(claude.path ?? "");
  const [busy, setBusy] = useState(false);

  async function save(next: string | null) {
    setBusy(true);
    try {
      onSaved(await api.setClaudePath(next));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Settings" onClose={onClose}>
      <div className="text-sm font-medium text-slate-300">Claude.exe location</div>
      <p className="mt-1 text-xs text-slate-500">
        Roster finds Claude automatically. Only set this if detection fails (it re-detects on every launch, so it
        survives Claude updates).
      </p>
      <div
        className={`mt-3 rounded-xl border px-3 py-2 text-xs ${
          claude.found ? "border-emerald-800 bg-emerald-500/10 text-emerald-300" : "border-amber-800 bg-amber-500/10 text-amber-300"
        }`}
      >
        {claude.found ? `Detected: ${claude.path}` : "Claude.exe not found automatically."}
      </div>

      <input
        value={path}
        onChange={(e) => setPath(e.target.value)}
        placeholder="C:\\…\\Claude.exe"
        className="mt-3 w-full rounded-xl border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-indigo-500"
      />
      <div className="mt-4 flex justify-between">
        <button
          onClick={() => save(null)}
          disabled={busy}
          className="rounded-xl px-3 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800 disabled:opacity-50"
        >
          Reset to auto
        </button>
        <div className="flex gap-2">
          <button onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800">
            Close
          </button>
          <button
            onClick={() => save(path)}
            disabled={busy}
            className="rounded-xl bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-400 disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------- app ------------------------------- */
export default function App() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [claude, setClaude] = useState<ClaudeStatus>({ found: false, path: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState<Profile | "new" | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [warn, setWarn] = useState<Profile | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<Profile | null>(null);
  const [launchingId, setLaunchingId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [ps, cs] = await Promise.all([api.listProfiles(), api.claudeStatus()]);
      setProfiles(ps);
      setClaude(cs);
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshStatus = useCallback(async () => {
    try {
      setProfiles(await api.listProfiles());
    } catch {
      /* ignore transient poll errors */
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const t = setInterval(refreshStatus, 4000);
    const onFocus = () => refreshStatus();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(t);
      window.removeEventListener("focus", onFocus);
    };
  }, [refreshStatus]);

  async function onLaunch(p: Profile) {
    try {
      const chk = await api.preLaunchCheck(p.id);
      if (chk.first_run && chk.others_running) {
        setWarn(p);
        return;
      }
      await reallyLaunch(p);
    } catch (e) {
      setError(String(e));
    }
  }

  async function reallyLaunch(p: Profile) {
    setWarn(null);
    setLaunchingId(p.id);
    try {
      await api.launchProfile(p.id);
    } catch (e) {
      setError(String(e));
    } finally {
      setTimeout(() => {
        setLaunchingId(null);
        refreshStatus();
      }, 1800);
    }
  }

  async function onSave(name: string, color: string) {
    try {
      if (editing === "new") setProfiles(await api.addProfile(name, color));
      else if (editing) setProfiles(await api.updateProfile(editing.id, name, color));
      setEditing(null);
    } catch (e) {
      setError(String(e));
    }
  }

  async function doRemove(p: Profile) {
    try {
      setProfiles(await api.removeProfile(p.id));
    } catch (e) {
      setError(String(e));
    } finally {
      setConfirmRemove(null);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900 text-slate-200">
      <div className="mx-auto flex min-h-screen max-w-3xl flex-col px-6">
        {/* header */}
        <header className="flex items-center justify-between py-6">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-500/15 text-indigo-300">
              <Icon.Stack className="h-6 w-6" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold tracking-tight text-white">Roster</h1>
                <span className="rounded-full border border-slate-700 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-400">
                  Unofficial
                </span>
              </div>
              <p className="text-xs text-slate-500">Multiple Claude accounts, side by side</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium sm:inline-flex ${
                claude.found ? "bg-emerald-500/10 text-emerald-300" : "bg-amber-500/10 text-amber-300"
              }`}
              title={claude.path ?? undefined}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${claude.found ? "bg-emerald-400" : "bg-amber-400"}`} />
              {claude.found ? "Claude detected" : "Claude not found"}
            </span>
            <button
              title="Settings"
              onClick={() => setSettingsOpen(true)}
              className="grid h-9 w-9 place-items-center rounded-xl border border-slate-800 bg-slate-800/40 text-slate-400 transition hover:text-slate-200"
            >
              <Icon.Gear className="h-5 w-5" />
            </button>
          </div>
        </header>

        {error && (
          <div className="mb-4 rounded-xl border border-rose-900 bg-rose-950/50 px-4 py-3 text-sm text-rose-200">
            {error}
          </div>
        )}

        {/* body */}
        <main className="flex-1">
          {loading ? (
            <div className="py-20 text-center text-slate-500">Loading…</div>
          ) : profiles.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-dashed border-slate-800 bg-slate-900/40 py-16 text-center">
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-indigo-500/15 text-indigo-300">
                <Icon.Stack className="h-8 w-8" />
              </div>
              <h2 className="mt-4 text-base font-semibold text-slate-200">Add your first account</h2>
              <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">
                Each account gets its own isolated Claude window — separate login, history, and settings.
              </p>
              <button
                onClick={() => setEditing("new")}
                className="mt-5 inline-flex items-center gap-2 rounded-xl bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-400"
              >
                <Icon.Plus className="h-4 w-4" /> New account
              </button>
            </div>
          ) : (
            <>
              <div className="mb-3 flex items-center justify-between">
                <div className="text-sm text-slate-500">
                  {profiles.length} account{profiles.length === 1 ? "" : "s"}
                </div>
                <button
                  onClick={() => setEditing("new")}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800/40 px-3 py-1.5 text-sm font-medium text-slate-200 hover:bg-slate-800"
                >
                  <Icon.Plus className="h-4 w-4" /> New account
                </button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {profiles.map((p) => (
                  <ProfileCard
                    key={p.id}
                    profile={p}
                    launching={launchingId === p.id}
                    onLaunch={() => onLaunch(p)}
                    onEdit={() => setEditing(p)}
                    onFolder={() => api.openDataDir(p.id).catch((e) => setError(String(e)))}
                    onRemove={() => setConfirmRemove(p)}
                  />
                ))}
              </div>
            </>
          )}
        </main>

        {/* footer */}
        <footer className="py-6 text-center text-xs text-slate-600">
          Roster is an independent tool and is not affiliated with, or endorsed by, Anthropic.
        </footer>
      </div>

      {/* dialogs */}
      {editing && (
        <EditDialog
          initial={editing === "new" ? null : editing}
          onSave={onSave}
          onClose={() => setEditing(null)}
        />
      )}
      {settingsOpen && (
        <SettingsDialog claude={claude} onSaved={setClaude} onClose={() => setSettingsOpen(false)} />
      )}
      {warn && (
        <Modal title="Heads up: first sign-in" onClose={() => setWarn(null)}>
          <p className="text-sm text-slate-300">
            This account hasn't signed in yet, and another Claude window is open. Claude signs in through{" "}
            <code className="rounded bg-slate-800 px-1 text-slate-200">claude://</code> links, so the login can land in
            the wrong window. It's safest to fully quit other Claude windows first.
          </p>
          <div className="mt-6 flex justify-end gap-2">
            <button onClick={() => setWarn(null)} className="rounded-xl px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800">
              Cancel
            </button>
            <button
              onClick={() => reallyLaunch(warn)}
              className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-400"
            >
              Launch anyway
            </button>
          </div>
        </Modal>
      )}
      {confirmRemove && (
        <Modal title="Remove account" onClose={() => setConfirmRemove(null)}>
          <p className="text-sm text-slate-300">
            Remove <span className="font-semibold text-slate-100">{confirmRemove.name}</span> from Roster? Its signed-in
            data folder is <span className="font-medium text-slate-100">kept, not deleted</span> — you can add it back
            later.
          </p>
          <div className="mt-6 flex justify-end gap-2">
            <button onClick={() => setConfirmRemove(null)} className="rounded-xl px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800">
              Cancel
            </button>
            <button
              onClick={() => doRemove(confirmRemove)}
              className="rounded-xl bg-rose-500 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-400"
            >
              Remove
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

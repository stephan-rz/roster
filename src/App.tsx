import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  api,
  appForLink,
  APP_META,
  APP_ORDER,
  PALETTE,
  type AppKind,
  type AppStatus,
  type ImportCandidate,
  type Profile,
} from "./api";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

const REPO_URL = "https://github.com/stephan-rz/roster";
const PLAN_STYLES: Record<string, string> = {
  Free: "bg-slate-700/50 text-slate-300",
  Go: "bg-cyan-500/15 text-cyan-300",
  Plus: "bg-violet-500/15 text-violet-300",
  Pro: "bg-violet-500/15 text-violet-300",
  Max: "bg-amber-500/15 text-amber-300 ring-1 ring-inset ring-amber-500/30",
  Team: "bg-sky-500/15 text-sky-300",
  Business: "bg-sky-500/15 text-sky-300",
  Enterprise: "bg-emerald-500/15 text-emerald-300",
};

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
  Download: (p: any) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
    </svg>
  ),
  Link: (p: any) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  ),
  GitHub: (p: any) => (
    <svg viewBox="0 0 24 24" fill="currentColor" {...p}>
      <path d="M12 .5C5.7.5.5 5.7.5 12c0 5.1 3.3 9.4 7.9 10.9.6.1.8-.3.8-.6v-2c-3.2.7-3.9-1.5-3.9-1.5-.5-1.3-1.3-1.7-1.3-1.7-1.1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.7-1.6-2.6-.3-5.3-1.3-5.3-5.7 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.3 1.2 1-.3 2-.4 3-.4s2 .1 3 .4c2.3-1.6 3.3-1.2 3.3-1.2.6 1.6.2 2.8.1 3.1.8.8 1.2 1.8 1.2 3.1 0 4.4-2.7 5.4-5.3 5.7.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6 4.6-1.5 7.9-5.8 7.9-10.9C23.5 5.7 18.3.5 12 .5z" />
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

/* ------------------------------- app chip ------------------------------- */
function AppChip({ app, className = "" }: { app: AppKind; className?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${APP_META[app].chip} ${className}`}
    >
      {APP_META[app].label}
    </span>
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
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                <Badge profile={profile} />
                {profile.plan && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      PLAN_STYLES[profile.plan] ?? "bg-slate-700/50 text-slate-300"
                    }`}
                  >
                    {profile.plan}
                  </span>
                )}
              </div>
              {profile.account?.email && (
                <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs">
                  {profile.account.name && (
                    <span className="font-medium text-slate-300">{profile.account.name}</span>
                  )}
                  <span className="truncate text-slate-500">{profile.account.email}</span>
                  {profile.account.org && (
                    <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-medium text-slate-400">
                      {profile.account.org}
                    </span>
                  )}
                </div>
              )}
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
  onSave: (name: string, color: string, plan: string | null, app: AppKind) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [color, setColor] = useState(initial?.color ?? PALETTE[0]);
  const [plan, setPlan] = useState<string | null>(initial?.plan ?? null);
  const [app, setApp] = useState<AppKind>(initial?.app ?? "claude");
  const valid = name.trim().length > 0;
  const submit = () => onSave(name.trim(), color, plan, app);

  // Plans differ per app, so drop a selection that doesn't exist for the new one.
  function pickApp(next: AppKind) {
    setApp(next);
    if (plan && !APP_META[next].plans.includes(plan)) setPlan(null);
  }

  return (
    <Modal title={initial ? "Edit account" : "New account"} onClose={onClose}>
      <div className="text-sm font-medium text-slate-300">App</div>
      {initial ? (
        <div className="mt-2 flex items-center gap-2">
          <AppChip app={initial.app} />
          <span className="text-xs text-slate-500">
            Can't be changed — the data folder is set up for {APP_META[initial.app].label}.
          </span>
        </div>
      ) : (
        <div className="mt-2 grid grid-cols-2 gap-2">
          {APP_ORDER.map((k) => (
            <button
              key={k}
              onClick={() => pickApp(k)}
              className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                app === k
                  ? "border-indigo-500 bg-indigo-500/10 text-slate-100"
                  : "border-slate-700 bg-slate-800/40 text-slate-400 hover:bg-slate-800"
              }`}
            >
              <span className="flex items-center justify-center gap-2">
                <span className={`h-2 w-2 rounded-full ${APP_META[k].dot}`} />
                {APP_META[k].label}
              </span>
            </button>
          ))}
        </div>
      )}

      <label className="mt-4 block text-sm font-medium text-slate-300">Name</label>
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && valid && submit()}
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

      <div className="mt-4 text-sm font-medium text-slate-300">
        Plan <span className="font-normal text-slate-500">(optional)</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {[null, ...APP_META[app].plans].map((pl) => (
          <button
            key={pl ?? "none"}
            onClick={() => setPlan(pl)}
            className={`rounded-lg px-3 py-1 text-sm font-medium transition ${
              plan === pl ? "bg-indigo-500 text-white" : "bg-slate-800/60 text-slate-300 hover:bg-slate-800"
            }`}
          >
            {pl ?? "None"}
          </button>
        ))}
      </div>

      <div className="mt-6 flex justify-end gap-2">
        <button onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800">
          Cancel
        </button>
        <button
          disabled={!valid}
          onClick={submit}
          className="rounded-xl bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-400 disabled:opacity-50"
        >
          {initial ? "Save" : "Create"}
        </button>
      </div>
    </Modal>
  );
}

/* ------------------------------- settings dialog ------------------------------- */
function AppPathRow({
  status,
  onSaved,
}: {
  status: AppStatus;
  onSaved: (s: AppStatus[]) => void;
}) {
  const meta = APP_META[status.app];
  const [path, setPath] = useState(status.path ?? "");
  const [busy, setBusy] = useState(false);

  async function save(next: string | null) {
    setBusy(true);
    try {
      onSaved(await api.setAppPath(status.app, next));
      if (next === null) setPath("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-800/20 p-3">
      <div className="flex items-center gap-2">
        <AppChip app={status.app} />
        <span className="text-sm font-medium text-slate-300">{meta.exe} location</span>
      </div>
      <div
        className={`mt-2 rounded-lg border px-3 py-2 text-xs ${
          status.found
            ? "border-emerald-800 bg-emerald-500/10 text-emerald-300"
            : "border-amber-800 bg-amber-500/10 text-amber-300"
        }`}
      >
        {status.found ? `Detected: ${status.path}` : `${meta.exe} not found automatically.`}
      </div>
      <input
        value={path}
        onChange={(e) => setPath(e.target.value)}
        placeholder={`C:\\…\\${meta.exe}`}
        className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-indigo-500"
      />
      <div className="mt-2 flex justify-end gap-2">
        <button
          onClick={() => save(null)}
          disabled={busy}
          className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-400 hover:bg-slate-800 disabled:opacity-50"
        >
          Reset to auto
        </button>
        <button
          onClick={() => save(path)}
          disabled={busy}
          className="rounded-lg bg-indigo-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-400 disabled:opacity-50"
        >
          Save
        </button>
      </div>
    </div>
  );
}

function SettingsDialog({
  statuses,
  onSaved,
  onClose,
}: {
  statuses: AppStatus[];
  onSaved: (s: AppStatus[]) => void;
  onClose: () => void;
}) {
  const [version, setVersion] = useState("");
  useEffect(() => {
    api.appVersion().then(setVersion).catch(() => {});
  }, []);

  return (
    <Modal title="Settings" onClose={onClose}>
      <p className="text-xs text-slate-500">
        Roster finds each app automatically and re-detects on every launch, so it survives their updates. Only set a
        path here if detection fails.
      </p>

      <div className="mt-3 space-y-3">
        {statuses.map((s) => (
          <AppPathRow key={s.app} status={s} onSaved={onSaved} />
        ))}
      </div>

      <div className="mt-4 flex justify-end">
        <button onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800">
          Close
        </button>
      </div>

      <div className="mt-5 flex items-center border-t border-slate-800 pt-3">
        <button
          onClick={() => api.openUrl(REPO_URL)}
          title="View Roster on GitHub"
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-slate-400 transition hover:bg-slate-800 hover:text-slate-200"
        >
          <Icon.GitHub className="h-4 w-4" />
          GitHub
          {version && <span className="text-slate-500">v{version}</span>}
        </button>
      </div>
    </Modal>
  );
}

/* ------------------------------- sign-in link dialog ------------------------------- */
/**
 * Both apps register their URL scheme on the package, not per instance, so
 * Windows hands every sign-in callback to whichever instance owns the default
 * data dir. Pasting the link here delivers it to the profile that actually
 * started the flow.
 */
function LinkDialog({
  profiles,
  onDelivered,
  onClose,
}: {
  profiles: Profile[];
  onDelivered: (name: string) => void;
  onClose: () => void;
}) {
  const [url, setUrl] = useState("");
  const [target, setTarget] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = url.trim();
  const app = trimmed ? appForLink(trimmed) : null;
  const matches = app ? profiles.filter((p) => p.app === app) : [];
  const chosen = matches.find((p) => p.id === target) ?? null;

  async function deliver() {
    if (!chosen) return;
    setBusy(true);
    setError(null);
    try {
      await api.deliverLink(chosen.id, trimmed);
      onDelivered(chosen.name);
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Deliver a sign-in link" onClose={onClose}>
      <p className="text-xs text-slate-500">
        Connecting something like Figma sends you to your browser and back on a{" "}
        <code className="rounded bg-slate-800 px-1 text-slate-300">claude://</code> or{" "}
        <code className="rounded bg-slate-800 px-1 text-slate-300">codex://</code> link. Windows always hands that to
        the default instance. Paste it here to send it to the right account instead.
      </p>

      <label className="mt-4 block text-sm font-medium text-slate-300">Sign-in link</label>
      <textarea
        autoFocus
        rows={3}
        value={url}
        onChange={(e) => {
          setUrl(e.target.value);
          setError(null);
        }}
        placeholder="claude://…"
        className="mt-1.5 w-full resize-none break-all rounded-xl border border-slate-700 bg-slate-800/60 px-3 py-2 font-mono text-xs text-slate-100 outline-none placeholder:text-slate-500 focus:border-indigo-500"
      />

      {trimmed && !app && (
        <div className="mt-2 rounded-lg border border-amber-800 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
          That isn't a link Roster can route. It should start with <code>claude://</code> or <code>codex://</code>.
        </div>
      )}

      {app && (
        <>
          <div className="mt-4 flex items-center gap-2 text-sm font-medium text-slate-300">
            Send to <AppChip app={app} />
          </div>
          {matches.length === 0 ? (
            <div className="mt-2 rounded-lg border border-slate-700 bg-slate-800/40 px-3 py-2 text-xs text-slate-400">
              No {APP_META[app].label} accounts in Roster yet.
            </div>
          ) : (
            <div className="mt-2 space-y-1.5">
              {matches.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setTarget(p.id)}
                  className={`flex w-full items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition ${
                    target === p.id
                      ? "border-indigo-500 bg-indigo-500/10"
                      : "border-slate-800 bg-slate-800/30 hover:bg-slate-800"
                  }`}
                >
                  <span className="h-5 w-5 shrink-0 rounded-full" style={{ backgroundColor: p.color }} />
                  <span className="min-w-0 flex-1 truncate text-sm text-slate-100">{p.name}</span>
                  <span className={`shrink-0 text-[11px] ${p.running ? "text-emerald-400" : "text-slate-500"}`}>
                    {p.running ? "Running" : "Will start"}
                  </span>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {error && (
        <div className="mt-3 rounded-lg border border-rose-900 bg-rose-950/50 px-3 py-2 text-xs text-rose-200">
          {error}
        </div>
      )}

      <div className="mt-6 flex justify-end gap-2">
        <button onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800">
          Cancel
        </button>
        <button
          disabled={!chosen || busy}
          onClick={deliver}
          className="rounded-xl bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-400 disabled:opacity-50"
        >
          {busy ? "Delivering…" : "Deliver"}
        </button>
      </div>
    </Modal>
  );
}

/* ------------------------------- import dialog ------------------------------- */
type ImportRow = { cand: ImportCandidate; selected: boolean; name: string; color: string };

function ImportDialog({
  colorOffset,
  onImported,
  onError,
  onClose,
}: {
  colorOffset: number;
  onImported: (ps: Profile[]) => void;
  onError: (e: string) => void;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<ImportRow[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .discoverImportable()
      .then((cands) =>
        setRows(
          [...cands]
            .sort((a, b) => APP_ORDER.indexOf(a.app) - APP_ORDER.indexOf(b.app))
            .map((c, i) => ({
              cand: c,
              selected: true,
              name: c.suggested_name,
              color: PALETTE[(colorOffset + i) % PALETTE.length],
            })),
        ),
      )
      .catch(() => setRows([]));
  }, [colorOffset]);

  const patch = (i: number, p: Partial<ImportRow>) =>
    setRows((rs) => (rs ? rs.map((r, j) => (j === i ? { ...r, ...p } : r)) : rs));

  const cycleColor = (i: number) =>
    setRows((rs) =>
      rs
        ? rs.map((r, j) =>
            j === i ? { ...r, color: PALETTE[(PALETTE.indexOf(r.color) + 1) % PALETTE.length] } : r,
          )
        : rs,
    );

  const chosen = rows?.filter((r) => r.selected && r.name.trim()).length ?? 0;

  async function doImport() {
    if (!rows) return;
    setBusy(true);
    let latest: Profile[] | null = null;
    try {
      for (const r of rows.filter((r) => r.selected && r.name.trim())) {
        latest = await api.importProfile(r.name.trim(), r.color, r.cand.data_dir, r.cand.app);
      }
      if (latest) onImported(latest);
      onClose();
    } catch (e) {
      onError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Import existing accounts" onClose={onClose}>
      {rows === null ? (
        <div className="py-8 text-center text-sm text-slate-500">
          Scanning for Claude and ChatGPT folders…
        </div>
      ) : rows.length === 0 ? (
        <div className="py-8 text-center text-sm text-slate-500">
          No existing Claude or ChatGPT folders found to import.
        </div>
      ) : (
        <>
          <p className="mb-3 text-xs text-slate-500">
            Found these on your PC. Importing keeps each login in place — no re-sign-in.
          </p>
          <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
            {rows.map((r, i) => (
              <div key={r.cand.data_dir} className="rounded-xl border border-slate-800 bg-slate-800/30 p-3">
                <div className="flex items-center gap-2.5">
                  <input
                    type="checkbox"
                    checked={r.selected}
                    onChange={(e) => patch(i, { selected: e.target.checked })}
                    className="h-4 w-4 shrink-0 accent-indigo-500"
                  />
                  <button
                    onClick={() => cycleColor(i)}
                    title="Change color"
                    className="h-5 w-5 shrink-0 rounded-full ring-1 ring-white/10"
                    style={{ backgroundColor: r.color }}
                  />
                  <input
                    value={r.name}
                    onChange={(e) => patch(i, { name: e.target.value })}
                    className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-900/60 px-2 py-1 text-sm text-slate-100 outline-none focus:border-indigo-500"
                  />
                  <AppChip app={r.cand.app} className="shrink-0" />
                </div>
                <div className="mt-2 pl-[26px] text-xs">
                  {r.cand.account?.email ? (
                    <span className="text-slate-400">
                      {r.cand.account.name && (
                        <span className="text-slate-300">{r.cand.account.name} · </span>
                      )}
                      {r.cand.account.email}
                      {r.cand.account.org && <span className="text-slate-500"> · {r.cand.account.org}</span>}
                    </span>
                  ) : (
                    <span className="text-slate-500">{r.cand.signed_in ? "Signed in" : "Not signed in"}</span>
                  )}
                  <div className="mt-0.5 truncate text-[10px] text-slate-600">{r.cand.data_dir}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <button onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800">
              Cancel
            </button>
            <button
              disabled={busy || chosen === 0}
              onClick={doImport}
              className="rounded-xl bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-400 disabled:opacity-50"
            >
              {busy ? "Importing…" : chosen > 0 ? `Import ${chosen}` : "Import"}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}

/* ------------------------------- app ------------------------------- */
export default function App() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [statuses, setStatuses] = useState<AppStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState<Profile | "new" | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [update, setUpdate] = useState<Update | null>(null);
  const [updating, setUpdating] = useState(false);
  const [warn, setWarn] = useState<Profile | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<Profile | null>(null);
  const [launchingId, setLaunchingId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [ps, st] = await Promise.all([api.listProfiles(), api.appStatuses()]);
      setProfiles(ps);
      setStatuses(st);
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

  // Reads each signed-in profile's account from disk (slower) — done on load
  // and after launches, not on every poll.
  const refreshAccounts = useCallback(async () => {
    try {
      setProfiles(await api.refreshAccounts());
    } catch {
      /* best-effort */
    }
  }, []);

  useEffect(() => {
    refresh().then(refreshAccounts);
  }, [refresh, refreshAccounts]);

  // Look for a newer release on launch (no-op offline or in dev).
  useEffect(() => {
    check()
      .then(setUpdate)
      .catch(() => {
        /* ignore */
      });
  }, []);

  async function installUpdate() {
    if (!update) return;
    setUpdating(true);
    try {
      await update.downloadAndInstall();
      await relaunch();
    } catch (e) {
      setError(String(e));
      setUpdating(false);
    }
  }

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
      // A fresh sign-in takes a few seconds to persist — pick up the account.
      setTimeout(refreshAccounts, 6000);
    }
  }

  async function onSave(name: string, color: string, plan: string | null, app: AppKind) {
    try {
      if (editing === "new") setProfiles(await api.addProfile(name, color, plan, app));
      else if (editing) setProfiles(await api.updateProfile(editing.id, name, color, plan));
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

  // Cards are grouped per app, so a mixed roster stays readable at a glance.
  const groups = APP_ORDER.map((app) => ({
    app,
    items: profiles.filter((p) => p.app === app),
  })).filter((g) => g.items.length > 0);

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
              <p className="text-xs text-slate-500">Multiple Claude and ChatGPT accounts, side by side</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {statuses.map((s) => (
              <span
                key={s.app}
                className={`hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium sm:inline-flex ${
                  s.found ? "bg-emerald-500/10 text-emerald-300" : "bg-slate-700/40 text-slate-500"
                }`}
                title={s.path ?? `${s.label} not found on this PC`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${s.found ? "bg-emerald-400" : "bg-slate-600"}`} />
                {s.label}
              </span>
            ))}
            <button
              title="Settings"
              onClick={() => setSettingsOpen(true)}
              className="grid h-9 w-9 place-items-center rounded-xl border border-slate-800 bg-slate-800/40 text-slate-400 transition hover:text-slate-200"
            >
              <Icon.Gear className="h-5 w-5" />
            </button>
          </div>
        </header>

        {update && (
          <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-indigo-800 bg-indigo-950/40 px-4 py-3">
            <span className="text-sm text-indigo-100">
              Update available — <strong>v{update.version}</strong>
            </span>
            <button
              onClick={installUpdate}
              disabled={updating}
              className="shrink-0 rounded-lg bg-indigo-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-400 disabled:opacity-50"
            >
              {updating ? "Installing…" : "Install & restart"}
            </button>
          </div>
        )}

        {error && (
          <div className="mb-4 rounded-xl border border-rose-900 bg-rose-950/50 px-4 py-3 text-sm text-rose-200">
            {error}
          </div>
        )}

        {notice && (
          <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-emerald-900 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-200">
            {notice}
            <button onClick={() => setNotice(null)} className="shrink-0 text-xs text-emerald-400 hover:text-emerald-200">
              Dismiss
            </button>
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
                Each account gets its own isolated Claude or ChatGPT window — separate login, history, and settings.
              </p>
              <div className="mt-5 flex items-center justify-center gap-3">
                <button
                  onClick={() => setEditing("new")}
                  className="inline-flex items-center gap-2 rounded-xl bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-400"
                >
                  <Icon.Plus className="h-4 w-4" /> New account
                </button>
                <button
                  onClick={() => setImportOpen(true)}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800"
                >
                  <Icon.Download className="h-4 w-4" /> Import existing
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="mb-3 flex items-center justify-between">
                <div className="text-sm text-slate-500">
                  {profiles.length} account{profiles.length === 1 ? "" : "s"}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setLinkOpen(true)}
                    title="Send a third-party sign-in link to the right account"
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800/40 px-3 py-1.5 text-sm font-medium text-slate-300 hover:bg-slate-800"
                  >
                    <Icon.Link className="h-4 w-4" /> Sign-in link
                  </button>
                  <button
                    onClick={() => setImportOpen(true)}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800/40 px-3 py-1.5 text-sm font-medium text-slate-300 hover:bg-slate-800"
                  >
                    <Icon.Download className="h-4 w-4" /> Import
                  </button>
                  <button
                    onClick={() => setEditing("new")}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800/40 px-3 py-1.5 text-sm font-medium text-slate-200 hover:bg-slate-800"
                  >
                    <Icon.Plus className="h-4 w-4" /> New account
                  </button>
                </div>
              </div>
              <div className="space-y-5">
                {groups.map((g) => (
                  <section key={g.app}>
                    <div className="mb-2 flex items-center gap-2">
                      <AppChip app={g.app} />
                      <span className="text-xs text-slate-600">
                        {g.items.length} account{g.items.length === 1 ? "" : "s"}
                      </span>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {g.items.map((p) => (
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
                  </section>
                ))}
              </div>
            </>
          )}
        </main>

        {/* footer */}
        <footer className="py-6 text-center text-xs text-slate-600">
          Roster is an independent tool and is not affiliated with, or endorsed by, Anthropic or OpenAI.
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
        <SettingsDialog statuses={statuses} onSaved={setStatuses} onClose={() => setSettingsOpen(false)} />
      )}
      {importOpen && (
        <ImportDialog
          colorOffset={profiles.length}
          onImported={setProfiles}
          onError={setError}
          onClose={() => setImportOpen(false)}
        />
      )}
      {linkOpen && (
        <LinkDialog
          profiles={profiles}
          onDelivered={(name) => {
            setNotice(`Sign-in link sent to ${name}.`);
            setTimeout(() => refreshStatus(), 1500);
          }}
          onClose={() => setLinkOpen(false)}
        />
      )}
      {warn && (
        <Modal title="Heads up: first sign-in" onClose={() => setWarn(null)}>
          <p className="text-sm text-slate-300">
            This account hasn't signed in yet, and another {APP_META[warn.app].label} window is open. Signing in hands
            off to your browser and back through a{" "}
            <code className="rounded bg-slate-800 px-1 text-slate-200">
              {APP_META[warn.app].scheme}://
            </code>{" "}
            link, so the login can land in the wrong window. It's safest to fully quit other{" "}
            {APP_META[warn.app].label} windows first.
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

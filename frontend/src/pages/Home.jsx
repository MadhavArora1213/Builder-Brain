import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Plus, Trash2, Clock, Mic, Sparkles, ChevronDown, Settings, LogOut } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import AmbientBackground from "@/components/AmbientBackground";

function getTimeGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function getDateLabel() {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());
}

const STATUS_LABEL = {
  idle: "Draft", asking: "Awaiting answers", planning: "Planning",
  awaiting_approval: "Needs approval", building: "Building", testing: "Testing",
  paused: "Paused", complete: "Live", failed: "Failed",
};

const STATUS_STYLE = {
  complete: { backgroundColor: "color-mix(in srgb, var(--moss) 12%, transparent)", color: "var(--moss)" },
  failed: { backgroundColor: "color-mix(in srgb, var(--danger) 12%, transparent)", color: "var(--danger)" },
  asking: { backgroundColor: "color-mix(in srgb, var(--muted-foreground) 10%, transparent)", color: "var(--muted-foreground)" },
  planning: { backgroundColor: "color-mix(in srgb, var(--gold) 12%, transparent)", color: "var(--gold)" },
  building: { backgroundColor: "color-mix(in srgb, var(--gold) 12%, transparent)", color: "var(--gold)" },
  awaiting_approval: { backgroundColor: "color-mix(in srgb, var(--gold) 12%, transparent)", color: "var(--gold)" },
};

export default function Home() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [prompt, setPrompt] = useState("");
  const [projects, setProjects] = useState([]);
  const [busy, setBusy] = useState(false);
  const [showProjects, setShowProjects] = useState(false);

  const greeting = useMemo(() => {
    const timeGreeting = getTimeGreeting();
    const name = user?.email || "there";
    return `${timeGreeting}, ${name}.`;
  }, [user]);

  const dateLabel = useMemo(() => getDateLabel(), []);

  const load = async () => {
    try { const { data } = await api.get("/projects"); setProjects(data); } catch {}
  };
  useEffect(() => { load(); }, []);

  const start = async () => {
    if (!prompt.trim()) return;
    setBusy(true);
    try {
      const title = prompt.trim().slice(0, 48);
      const { data } = await api.post("/projects", { title });
      navigate(`/builder/${data.id}`, { state: { firstMessage: prompt.trim() } });
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
      setBusy(false);
    }
  };

  const del = async (e, id) => {
    e.stopPropagation();
    if (!window.confirm("Delete this project and its sandbox?")) return;
    try { await api.delete(`/projects/${id}`); toast.success("Project deleted"); load(); }
    catch { toast.error("Failed to delete"); }
  };

  return (
    <div className="relative flex h-dvh flex-col overflow-hidden" style={{ backgroundColor: "var(--parchment)", color: "var(--ink)" }}>
      <AmbientBackground />

      {/* Top bar */}
      <div className="relative z-[1] flex items-center justify-end gap-3 px-6 py-4">
        {user?.role === "admin" && (
          <button onClick={() => navigate("/admin")}
            className="flex items-center gap-1.5 text-[13px] font-medium transition-all hover:-translate-y-0.5"
            style={{ color: "var(--gold)" }}>
            Admin
          </button>
        )}
        <button onClick={() => navigate("/settings")}
          className="flex items-center gap-1.5 text-[13px] font-medium transition-all hover:-translate-y-0.5"
          style={{ color: "var(--muted-foreground)" }}>
          <Settings className="w-4 h-4" /> Settings
        </button>
        <span className="text-[13px] hidden sm:inline" style={{ color: "var(--muted-foreground)" }}>{user?.email}</span>
        <button onClick={logout}
          className="flex items-center gap-1.5 text-[13px] font-medium rounded-full px-3 py-1.5 transition-all hover:-translate-y-0.5"
          style={{ backgroundColor: "color-mix(in srgb, var(--danger) 10%, transparent)", color: "var(--danger)" }}>
          <LogOut className="w-3.5 h-3.5" /> Logout
        </button>
      </div>

      {/* Center content */}
      <div className="relative z-[1] flex flex-1 flex-col items-center justify-center px-4 text-center">
        {/* Date */}
        <p className="mb-3 min-h-[1.4em] text-sm" style={{ color: "var(--muted-foreground)" }}>
          {dateLabel}
        </p>

        {/* Greeting */}
        <h1
          data-testid="greeting"
          className="max-w-[22ch] text-[clamp(2rem,3.4vw,2.75rem)] font-semibold leading-[1.08] tracking-[-0.03em]"
          style={{ color: "var(--ink)", overflowWrap: "anywhere" }}
        >
          {greeting}
        </h1>

        {/* Focus on text */}
        <p className="mt-3 max-w-[42ch] text-base" style={{ color: "var(--ink)" }}>
          What should we{" "}
          <span className="font-semibold" style={{ color: "var(--gold)" }}>
            focus on
          </span>{" "}
          today?
        </p>

        {/* Composer / Search input */}
        <div className="mt-8 flex w-full max-w-[760px] justify-center">
          <div
            className="flex w-full items-center gap-2 rounded-2xl px-4 py-3 backdrop-blur-[12px] transition-shadow hover:shadow-lg"
            style={{
              background: "color-mix(in srgb, var(--card) 70%, transparent)",
              border: "1px solid var(--border)",
              boxShadow: "0 2px 12px rgba(0,0,0,0.04)",
            }}
          >
            {/* Plus / Add button */}
            <button
              className="flex h-8 w-8 flex-none items-center justify-center rounded-full transition-colors"
              style={{ color: "var(--muted-foreground)" }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "color-mix(in srgb, var(--gold) 10%, transparent)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
              }}
            >
              <Plus className="h-5 w-5" />
            </button>

            {/* Text input */}
            <input
              data-testid="home-prompt-input"
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") start(); }}
              placeholder="Ask Grizon"
              className="flex-1 bg-transparent text-base outline-none placeholder:text-[color:var(--muted-foreground)]"
              style={{ color: "var(--ink)" }}
            />

            {/* Agent selector */}
            <button
              className="flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-medium transition-colors"
              style={{ color: "var(--gold)" }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "color-mix(in srgb, var(--gold) 10%, transparent)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
              }}
            >
              <Sparkles className="h-4 w-4" />
              Auto
              <ChevronDown className="h-3 w-3" />
            </button>

            {/* Mic button */}
            <button
              className="flex h-9 w-9 flex-none items-center justify-center rounded-full transition-colors"
              style={{
                backgroundColor: "color-mix(in srgb, var(--gold) 15%, transparent)",
                color: "var(--gold)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "color-mix(in srgb, var(--gold) 25%, transparent)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "color-mix(in srgb, var(--gold) 15%, transparent)";
              }}
            >
              <Mic className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Show projects toggle */}
        {projects.length > 0 && (
          <button
            onClick={() => setShowProjects(!showProjects)}
            className="mt-8 flex items-center gap-2.5 rounded-full px-4 py-2 text-sm font-medium transition-all hover:shadow-md"
            style={{
              color: "var(--muted-foreground)",
              backgroundColor: "color-mix(in srgb, var(--card) 60%, transparent)",
              border: "1px solid var(--border)",
            }}
          >
            <Clock className="h-4 w-4" />
            {projects.length} project{projects.length !== 1 ? "s" : ""}
            <ChevronDown
              className="h-4 w-4 transition-transform duration-300"
              style={{ transform: showProjects ? "rotate(180deg)" : "rotate(0deg)" }}
            />
          </button>
        )}
      </div>

      {/* Projects panel (slides up from bottom) */}
      {showProjects && projects.length > 0 && (
        <div
          className="absolute inset-x-0 bottom-0 z-[1] px-6 py-8"
          style={{
            borderColor: "color-mix(in srgb, var(--border) 60%, transparent)",
            backgroundColor: "color-mix(in srgb, var(--parchment) 95%, transparent)",
            backdropFilter: "blur(8px)",
          }}
        >
          <div className="mx-auto max-w-4xl">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {projects.map((p) => (
                <div
                  key={p.id}
                  data-testid={`project-card-${p.id}`}
                  onClick={() => navigate(`/builder/${p.id}`)}
                  className="group cursor-pointer rounded-2xl border p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
                  style={{
                    backgroundColor: "var(--card)",
                    borderColor: "var(--border)",
                  }}
                >
                  <div className="flex items-start justify-between">
                    <span
                      className="inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                      style={
                        STATUS_STYLE[p.workflow?.status] || {
                          backgroundColor: "color-mix(in srgb, var(--muted-foreground) 8%, transparent)",
                          color: "var(--muted-foreground)",
                        }
                      }
                    >
                      {STATUS_LABEL[p.workflow?.status] || "Draft"}
                    </span>
                    <button
                      data-testid={`delete-project-${p.id}`}
                      onClick={(e) => del(e, p.id)}
                      className="rounded-lg p-1 opacity-0 transition-all group-hover:opacity-100 hover:bg-[color:var(--sand)]"
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <h3
                    className="mt-3 text-[15px] font-medium leading-snug line-clamp-2"
                    style={{ color: "var(--ink)" }}
                  >
                    {p.title}
                  </h3>
                  <div
                    className="mt-4 flex items-center gap-1.5 text-[11px]"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    <Clock className="h-3 w-3" />
                    {new Date(p.updated_at).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowUp, Plus, Trash2, Clock } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import Nav from "@/components/Nav";

const GREETINGS = [
  "What's on your mind today?",
  "What are we building today?",
  "Describe an app — I'll build it.",
  "Got an idea? Let's ship it.",
  "What should we create right now?",
  "Turn a sentence into software.",
  "What do you want to bring to life?",
];

const STATUS_LABEL = {
  idle: "Draft", asking: "Awaiting answers", planning: "Planning",
  awaiting_approval: "Needs approval", building: "Building", testing: "Testing",
  paused: "Paused", complete: "Live", failed: "Failed",
};

export default function Home() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [prompt, setPrompt] = useState("");
  const [projects, setProjects] = useState([]);
  const [busy, setBusy] = useState(false);
  const greeting = useMemo(() => GREETINGS[Math.floor(Math.random() * GREETINGS.length)], []);

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
    <div className="min-h-screen">
      <Nav />
      <main className="max-w-5xl mx-auto px-6 pt-20 pb-16">
        <div className="text-center mb-10 animate-fade-up">
          <p className="font-mono text-xs uppercase tracking-widest text-gold mb-3">Grizon AI Builder</p>
          <h1 data-testid="greeting" className="font-heading text-5xl sm:text-6xl text-ink leading-tight">
            {greeting}
          </h1>
        </div>

        <div className="max-w-3xl mx-auto bg-white border border-[#cecac8] rounded-sm shadow-md p-4 animate-fade-up">
          <textarea
            data-testid="home-prompt-input"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) start(); }}
            placeholder="e.g. Build an expense tracker with a dashboard and monthly charts…"
            rows={3}
            className="w-full resize-none bg-transparent font-mono text-sm outline-none placeholder:text-ink/40"
          />
          <div className="flex items-center justify-between pt-2 border-t border-[#ece8e4] mt-2">
            <span className="font-mono text-[11px] text-ink/40">⌘/Ctrl + Enter to start</span>
            <button data-testid="start-build-btn" onClick={start} disabled={busy || !prompt.trim()}
              className="flex items-center gap-1.5 bg-forest hover:bg-forest-dark text-white rounded-sm px-4 py-2 text-sm font-medium transition-transform hover:-translate-y-px disabled:opacity-50">
              {busy ? "Starting…" : <>Build <ArrowUp className="w-4 h-4" /></>}
            </button>
          </div>
        </div>

        <div className="mt-16">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-heading text-2xl text-ink">Your projects</h2>
            <span className="font-mono text-xs text-ink/40">{projects.length} total</span>
          </div>
          {projects.length === 0 ? (
            <div className="border border-dashed border-[#cecac8] rounded-sm p-12 text-center font-mono text-sm text-ink/40">
              No projects yet. Describe something above to begin.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {projects.map((p) => (
                <div key={p.id} data-testid={`project-card-${p.id}`} onClick={() => navigate(`/builder/${p.id}`)}
                  className="group bg-white border border-[#cecac8] rounded-sm p-5 cursor-pointer hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between">
                    <div className={`font-mono text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-sm ${p.workflow?.status === "complete" ? "bg-moss/15 text-moss" : p.workflow?.status === "failed" ? "bg-danger/15 text-danger" : "bg-sand text-ink/60"}`}>
                      {STATUS_LABEL[p.workflow?.status] || "Draft"}
                    </div>
                    <button data-testid={`delete-project-${p.id}`} onClick={(e) => del(e, p.id)}
                      className="opacity-0 group-hover:opacity-100 text-ink/40 hover:text-danger transition-opacity">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <h3 className="font-heading text-xl text-ink mt-3 line-clamp-2">{p.title}</h3>
                  <div className="flex items-center gap-1.5 mt-4 font-mono text-[11px] text-ink/40">
                    <Clock className="w-3 h-3" /> {new Date(p.updated_at).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

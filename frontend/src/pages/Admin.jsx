import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { Database, BookText, Users, FolderGit2, MessageSquare, Cpu, Plus, Trash2, Edit3, X, Bot, KeyRound, Save, LayoutDashboard, Settings, ChevronRight, FileText, RotateCcw } from "lucide-react";
import api from "@/lib/api";
import Nav from "@/components/Nav";

const SIDEBAR_ITEMS = [
  { key: "overview", label: "Overview", icon: LayoutDashboard },
  { key: "database", label: "Database", icon: Database },
  { key: "skills", label: "Skills", icon: BookText },
  { key: "agents", label: "Agents", icon: Bot },
  { key: "prompts", label: "Prompts", icon: FileText },
  { key: "integrations", label: "Integrations", icon: Settings },
];

export default function Admin() {
  const [tab, setTab] = useState("overview");

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: "var(--parchment)", color: "var(--ink)" }}>
      <Nav />
      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        <aside className="w-64 shrink-0 border-r flex flex-col"
          style={{ borderColor: "var(--border)", backgroundColor: "var(--card)" }}>
          <div className="px-5 py-5 border-b" style={{ borderColor: "var(--border)" }}>
            <h2 className="font-heading text-xl" style={{ color: "var(--ink)" }}>Admin Panel</h2>
            <p className="font-mono text-[11px] mt-1" style={{ color: "var(--muted-foreground)" }}>System management</p>
          </div>
          <nav className="flex-1 p-3 space-y-1">
            {SIDEBAR_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = tab === item.key;
              return (
                <button key={item.key} data-testid={`admin-tab-${item.key}`} onClick={() => setTab(item.key)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-sm font-mono text-sm transition-all group"
                  style={active
                    ? { backgroundColor: "var(--forest)", color: "white" }
                    : { color: "var(--muted-foreground)" }}>
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="flex-1 text-left">{item.label}</span>
                  <ChevronRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-60 transition-opacity" />
                </button>
              );
            })}
          </nav>
          <div className="p-4 border-t" style={{ borderColor: "var(--border)" }}>
            <p className="font-mono text-[10px]" style={{ color: "var(--muted-foreground)" }}>Grizon AI v1.0</p>
          </div>
        </aside>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-8">
          <div className="max-w-5xl">
            <div className="mb-6">
              <h1 className="font-heading text-3xl" style={{ color: "var(--ink)" }}>
                {SIDEBAR_ITEMS.find((i) => i.key === tab)?.label}
              </h1>
            </div>
            {tab === "overview" && <Overview />}
            {tab === "database" && <DatabaseView />}
            {tab === "skills" && <Skills />}
            {tab === "agents" && <Agents />}
            {tab === "prompts" && <Prompts />}
            {tab === "integrations" && <Integrations />}
          </div>
        </main>
      </div>
    </div>
  );
}

function Overview() {
  const [stats, setStats] = useState(null);
  useEffect(() => { api.get("/admin/stats").then((r) => setStats(r.data)).catch(() => {}); }, []);
  const cards = [
    { label: "Users", value: stats?.users, icon: Users },
    { label: "Projects", value: stats?.projects, icon: FolderGit2 },
    { label: "Messages", value: stats?.messages, icon: MessageSquare },
    { label: "Builds", value: stats?.builds, icon: Cpu },
  ];
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4" data-testid="admin-overview">
      {cards.map((c) => (
        <div key={c.label} className="border rounded-sm p-5"
          style={{ backgroundColor: "var(--card)", borderColor: "var(--border)" }}>
          <c.icon className="w-5 h-5 mb-3" style={{ color: "var(--gold)" }} />
          <div className="font-heading text-4xl" style={{ color: "var(--ink)" }}>{c.value ?? "—"}</div>
          <div className="font-mono text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>{c.label}</div>
        </div>
      ))}
    </div>
  );
}

function DatabaseView() {
  const [tables, setTables] = useState([]);
  const [selected, setSelected] = useState(null);
  const [rows, setRows] = useState([]);
  useEffect(() => { api.get("/admin/tables").then((r) => setTables(r.data)).catch(() => {}); }, []);
  const open = async (name) => {
    setSelected(name);
    const { data } = await api.get(`/admin/tables/${name}`);
    setRows(data.rows);
  };
  const cols = rows.length ? Object.keys(rows[0]).slice(0, 6) : [];
  return (
    <div className="flex gap-6" data-testid="admin-database">
      <div className="w-56 shrink-0 space-y-1">
        {tables.map((t) => (
          <button key={t.name} data-testid={`table-${t.name}`} onClick={() => open(t.name)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-sm font-mono text-xs transition-colors"
            style={selected === t.name
              ? { backgroundColor: "var(--forest)", color: "white" }
              : { backgroundColor: "var(--parchment)", color: "var(--foreground)" }}>
            <span className="flex items-center gap-2"><Database className="w-3.5 h-3.5" /> {t.name}</span>
            <span className="opacity-60">{t.count}</span>
          </button>
        ))}
      </div>
      <div className="flex-1 border rounded-sm overflow-hidden"
        style={{ backgroundColor: "var(--card)", borderColor: "var(--border)" }}>
        {!selected ? (
          <div className="p-12 text-center font-mono text-sm" style={{ color: "var(--muted-foreground)" }}>Select a table to browse its rows.</div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center font-mono text-sm" style={{ color: "var(--muted-foreground)" }}>No rows in {selected}.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono">
              <thead style={{ backgroundColor: "var(--sand)" }}>
                <tr>{cols.map((c) => <th key={c} className="text-left px-3 py-2" style={{ color: "var(--muted-foreground)" }}>{c}</th>)}</tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-t" style={{ borderColor: "var(--sand)" }}>
                    {cols.map((c) => <td key={c} className="px-3 py-2 max-w-[220px] truncate" style={{ color: "var(--foreground)" }}>{typeof r[c] === "object" ? JSON.stringify(r[c]) : String(r[c] ?? "")}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

const AGENT_LIST = [
  { key: "manager", label: "Manager Agent" },
  { key: "question", label: "Q&A Agent" },
  { key: "planner", label: "Planner Agent" },
  { key: "coding", label: "Coding Agent" },
  { key: "testing", label: "Testing Agent" },
];

function Agents() {
  const [models, setModels] = useState({});
  const [saving, setSaving] = useState(false);
  const [availableModels, setAvailableModels] = useState({});
  const [loadingModels, setLoadingModels] = useState({});

  useEffect(() => {
    api.get("/admin/agent-models").then((r) => {
      const m = r.data.models;
      setModels(m);
      Object.keys(m).forEach((key) => {
        const provider = m[key]?.provider;
        if (provider) fetchModels(provider, key, false);
      });
    }).catch(() => {});
  }, []);

  const fetchModels = async (provider, agentKey, autoSelect) => {
    setLoadingModels((prev) => ({ ...prev, [agentKey]: true }));
    try {
      const { data } = await api.get(`/admin/models/${provider}`);
      const modelsList = data.models || [];
      setAvailableModels((prev) => ({ ...prev, [agentKey]: modelsList }));
      if (autoSelect && modelsList.length > 0) {
        setModels((prev) => ({
          ...prev,
          [agentKey]: { model: modelsList[0].id, provider },
        }));
      }
    } catch {
      setAvailableModels((prev) => ({ ...prev, [agentKey]: [] }));
    } finally {
      setLoadingModels((prev) => ({ ...prev, [agentKey]: false }));
    }
  };

  const onProviderChange = (agentKey, newProvider) => {
    fetchModels(newProvider, agentKey, true);
  };

  const save = async () => {
    setSaving(true);
    try { const { data } = await api.put("/admin/agent-models", { models }); setModels(data.models); toast.success("Agent models updated"); }
    catch { toast.error("Failed to save"); } finally { setSaving(false); }
  };
  return (
    <div data-testid="admin-agents">
      <p className="font-mono text-xs mb-5" style={{ color: "var(--muted-foreground)" }}>Configure the model and provider each agent uses. Models are fetched directly from the provider API — select a provider, then pick a model from the dropdown.</p>
      <div className="border rounded-sm divide-y" style={{ backgroundColor: "var(--card)", borderColor: "var(--border)", divideColor: "var(--sand)" }}>
        {AGENT_LIST.map((a) => {
          const currentProvider = models[a.key]?.provider || "sarvam";
          const currentModel = models[a.key]?.model || "";
          const options = availableModels[a.key] || [];
          const isLoading = loadingModels[a.key];
          return (
            <div key={a.key} className="flex items-center px-5 py-4 gap-4">
              <span className="flex items-center gap-3 font-mono text-sm w-40 shrink-0" style={{ color: "var(--foreground)" }}>
                <Bot className="w-4 h-4" style={{ color: "var(--gold)" }} /> {a.label}
              </span>
              <select data-testid={`provider-${a.key}`} value={currentProvider}
                onChange={(e) => onProviderChange(a.key, e.target.value)}
                className="border rounded-sm px-3 py-2 text-sm font-mono w-40 shrink-0 focus:outline-none focus:ring-2"
                style={{ backgroundColor: "var(--parchment)", borderColor: "var(--border)", color: "var(--foreground)" }}>
                <option value="sarvam">Sarvam</option>
                <option value="openrouter">OpenRouter</option>
              </select>
              <select data-testid={`model-${a.key}`} value={currentModel}
                onChange={(e) => setModels({ ...models, [a.key]: { ...models[a.key], model: e.target.value, provider: currentProvider } })}
                disabled={isLoading}
                className="border rounded-sm px-3 py-2 text-sm font-mono flex-1 focus:outline-none focus:ring-2"
                style={{ backgroundColor: "var(--parchment)", borderColor: "var(--border)", color: "var(--foreground)" }}>
                <option value="">{isLoading ? "Loading models…" : "Select a model"}</option>
                {options.map((m) => (
                  <option key={m.id} value={m.id}>{m.name || m.id}{m.context_length ? ` (${(m.context_length / 1000).toFixed(0)}k)` : ""}</option>
                ))}
              </select>
            </div>
          );
        })}
      </div>
      <button data-testid="save-agent-models-btn" onClick={save} disabled={saving}
        className="mt-5 flex items-center gap-1.5 text-white rounded-sm px-5 py-2.5 text-sm disabled:opacity-50"
        style={{ backgroundColor: "var(--forest)" }}>
        <Save className="w-4 h-4" /> {saving ? "Saving…" : "Save models"}
      </button>
    </div>
  );
}

const PROMPT_AGENTS = [
  { key: "manager", label: "Manager Agent", desc: "Classifies user intent (NEW/MODIFY/CHAT) and routes the conversation." },
  { key: "question", label: "Question Agent", desc: "Generates clarifying questions before building." },
  { key: "planner", label: "Planner Agent", desc: "Converts requirements into a structured implementation plan." },
  { key: "coding", label: "Coding Agent", desc: "Generates the full application code from the plan." },
  { key: "testing", label: "Testing Agent", desc: "Verifies the build works and produces a PRD." },
];

function Prompts() {
  const [prompts, setPrompts] = useState({});
  const [defaults, setDefaults] = useState({});
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    api.get("/admin/agent-prompts").then((r) => {
      setPrompts(r.data.prompts);
      setDefaults(r.data.defaults);
    }).catch(() => {});
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const { data } = await api.put("/admin/agent-prompts", { prompts });
      setPrompts(data.prompts);
      toast.success("Agent prompts updated");
    } catch { toast.error("Failed to save"); } finally { setSaving(false); }
  };

  const resetAll = async () => {
    if (!window.confirm("Reset all prompts to defaults?")) return;
    try {
      const { data } = await api.post("/admin/agent-prompts/reset");
      setPrompts(data.prompts);
      toast.success("Prompts reset to defaults");
    } catch { toast.error("Failed to reset"); }
  };

  const resetOne = (key) => {
    setPrompts({ ...prompts, [key]: defaults[key] || "" });
    toast.success(`Reset ${key} to default`);
  };

  return (
    <div data-testid="admin-prompts">
      <p className="font-mono text-xs mb-5" style={{ color: "var(--muted-foreground)" }}>
        Edit the system prompt each agent receives. Changes apply to all new conversations immediately.
        Each agent has specific JSON output requirements — keep those intact when editing.
      </p>
      <div className="space-y-3">
        {PROMPT_AGENTS.map((a) => {
          const isOpen = expanded === a.key;
          return (
            <div key={a.key} className="border rounded-sm overflow-hidden"
              style={{ backgroundColor: "var(--card)", borderColor: "var(--border)" }}>
              <button onClick={() => setExpanded(isOpen ? null : a.key)}
                className="w-full flex items-center justify-between px-5 py-3 text-left"
                style={{ backgroundColor: isOpen ? "var(--sand)" : "transparent" }}>
                <span className="flex items-center gap-3">
                  <Bot className="w-4 h-4" style={{ color: "var(--gold)" }} />
                  <span className="font-mono text-sm font-medium" style={{ color: "var(--ink)" }}>{a.label}</span>
                  <span className="font-mono text-[11px]" style={{ color: "var(--muted-foreground)" }}>— {a.desc}</span>
                </span>
                <span className="font-mono text-[10px] px-2 py-0.5 rounded-sm"
                  style={{ backgroundColor: "var(--sand)", color: "var(--muted-foreground)" }}>
                  {(prompts[a.key] || "").length} chars
                </span>
              </button>
              {isOpen && (
                <div className="px-5 pb-4 border-t" style={{ borderColor: "var(--sand)" }}>
                  <div className="flex items-center justify-between mt-3 mb-2">
                    <span className="font-mono text-[11px]" style={{ color: "var(--muted-foreground)" }}>
                      System prompt for {a.label}
                    </span>
                    <button onClick={() => resetOne(a.key)}
                      className="flex items-center gap-1 font-mono text-[11px] hover:opacity-70"
                      style={{ color: "var(--gold)" }}>
                      <RotateCcw className="w-3 h-3" /> Reset to default
                    </button>
                  </div>
                  <textarea
                    data-testid={`prompt-${a.key}`}
                    value={prompts[a.key] || ""}
                    onChange={(e) => setPrompts({ ...prompts, [a.key]: e.target.value })}
                    rows={12}
                    className="w-full border rounded-sm px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 resize-y"
                    style={{ backgroundColor: "var(--parchment)", borderColor: "var(--border)", color: "var(--foreground)", minHeight: "160px" }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-3 mt-5">
        <button data-testid="save-agent-prompts-btn" onClick={save} disabled={saving}
          className="flex items-center gap-1.5 text-white rounded-sm px-5 py-2.5 text-sm disabled:opacity-50"
          style={{ backgroundColor: "var(--forest)" }}>
          <Save className="w-4 h-4" /> {saving ? "Saving…" : "Save prompts"}
        </button>
        <button onClick={resetAll}
          className="flex items-center gap-1.5 rounded-sm px-5 py-2.5 text-sm border hover:opacity-80"
          style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>
          <RotateCcw className="w-4 h-4" /> Reset all to defaults
        </button>
      </div>
    </div>
  );
}

const INTEG_FIELDS = [
  { key: "sarvam_model", label: "Sarvam Model", secret: false },
  { key: "sarvam_base_url", label: "Sarvam Base URL", secret: false },
  { key: "sarvam_api_key", label: "Sarvam API Key", secret: true },
  { key: "openrouter_model", label: "OpenRouter Model", secret: false },
  { key: "openrouter_base_url", label: "OpenRouter Base URL", secret: false },
  { key: "openrouter_api_key", label: "OpenRouter API Key", secret: true },
  { key: "mcp_url", label: "NemoClaw MCP URL", secret: false },
  { key: "mcp_token", label: "NemoClaw MCP Token", secret: true },
];

function Integrations() {
  const [cfg, setCfg] = useState({});
  const [saving, setSaving] = useState(false);
  useEffect(() => { api.get("/admin/settings").then((r) => setCfg(r.data)).catch(() => {}); }, []);
  const save = async () => {
    setSaving(true);
    try { const { data } = await api.put("/admin/settings", cfg); setCfg(data); toast.success("Integration settings saved"); }
    catch { toast.error("Failed to save"); } finally { setSaving(false); }
  };
  return (
    <div data-testid="admin-integrations">
      <p className="font-mono text-xs mb-5" style={{ color: "var(--muted-foreground)" }}>LLM providers (Sarvam and OpenRouter) and NemoClaw sandbox credentials. Changes apply immediately to new agent runs and sandbox calls. Handle with care — these are secrets.</p>
      <div className="space-y-4 max-w-2xl">
        {INTEG_FIELDS.map((f) => (
          <div key={f.key}>
            <label className="font-mono text-xs flex items-center gap-1.5 mb-1.5" style={{ color: "var(--muted-foreground)" }}>
              {f.secret && <KeyRound className="w-3.5 h-3.5" style={{ color: "var(--gold)" }} />}{f.label}
            </label>
            <input data-testid={`integ-${f.key}`} type={f.secret ? "password" : "text"} value={cfg[f.key] || ""}
              onChange={(e) => setCfg({ ...cfg, [f.key]: e.target.value })}
              className="w-full border rounded-sm px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2"
              style={{ backgroundColor: "var(--parchment)", borderColor: "var(--border)", color: "var(--foreground)" }} />
          </div>
        ))}
      </div>
      <button data-testid="save-integrations-btn" onClick={save} disabled={saving}
        className="mt-5 flex items-center gap-1.5 text-white rounded-sm px-5 py-2.5 text-sm disabled:opacity-50"
        style={{ backgroundColor: "var(--forest)" }}>
        <Save className="w-4 h-4" /> {saving ? "Saving…" : "Save settings"}
      </button>
    </div>
  );
}

const EMPTY = { name: "", content: "", category: "coding", agents: ["coding"], enabled: true };

function Skills() {
  const [skills, setSkills] = useState([]);
  const [editing, setEditing] = useState(null);
  const load = () => api.get("/admin/skills").then((r) => setSkills(r.data)).catch(() => {});
  useEffect(() => { load(); }, []);

  const save = async () => {
    try {
      if (editing.id) await api.put(`/admin/skills/${editing.id}`, editing);
      else await api.post("/admin/skills", editing);
      toast.success("Skill saved"); setEditing(null); load();
    } catch { toast.error("Failed to save"); }
  };
  const del = async (id) => {
    if (!window.confirm("Delete this skill?")) return;
    await api.delete(`/admin/skills/${id}`); load();
  };
  const toggle = async (s) => { await api.put(`/admin/skills/${s.id}`, { ...s, enabled: !s.enabled }); load(); };

  return (
    <div data-testid="admin-skills">
      <div className="flex justify-between items-center mb-5">
        <p className="font-mono text-xs" style={{ color: "var(--muted-foreground)" }}>Agent skill.md files — enabled skills are injected into the Coding Agent.</p>
        <button data-testid="new-skill-btn" onClick={() => setEditing({ ...EMPTY })}
          className="flex items-center gap-1.5 text-white rounded-sm px-4 py-2 text-sm hover:-translate-y-px transition-transform"
          style={{ backgroundColor: "var(--forest)" }}>
          <Plus className="w-4 h-4" /> New Skill
        </button>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        {skills.map((s) => (
          <div key={s.id} data-testid={`skill-${s.id}`} className="border rounded-sm p-4"
            style={{ backgroundColor: "var(--card)", borderColor: "var(--border)" }}>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <BookText className="w-4 h-4" style={{ color: "var(--gold)" }} />
                <span className="font-mono text-sm" style={{ color: "var(--ink)" }}>{s.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <button data-testid={`toggle-skill-${s.id}`} onClick={() => toggle(s)}
                  className="font-mono text-[10px] px-2 py-0.5 rounded-sm"
                  style={s.enabled
                    ? { backgroundColor: "color-mix(in srgb, var(--moss) 15%, transparent)", color: "var(--moss)" }
                    : { backgroundColor: "var(--sand)", color: "var(--muted-foreground)" }}>
                  {s.enabled ? "enabled" : "disabled"}
                </button>
                <button onClick={() => setEditing(s)} className="hover:opacity-70" style={{ color: "var(--muted-foreground)" }}>
                  <Edit3 className="w-4 h-4" />
                </button>
                <button data-testid={`delete-skill-${s.id}`} onClick={() => del(s.id)} className="hover:opacity-70" style={{ color: "var(--danger)" }}>
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="flex gap-1 mt-2 flex-wrap">
              {(s.agents || []).map((a) => (
                <span key={a} className="font-mono text-[10px] px-2 py-0.5 rounded-sm"
                  style={{ backgroundColor: "var(--sand)", color: "var(--muted-foreground)" }}>{a}</span>
              ))}
            </div>
            <p className="font-mono text-[11px] mt-2 line-clamp-2 whitespace-pre-wrap" style={{ color: "var(--muted-foreground)" }}>{s.content}</p>
          </div>
        ))}
      </div>

      {editing && (
        <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ backgroundColor: "color-mix(in srgb, var(--ink) 40%, transparent)" }}
          onClick={() => setEditing(null)}>
          <div className="border rounded-sm w-full max-w-lg p-5" onClick={(e) => e.stopPropagation()}
            data-testid="skill-editor" style={{ backgroundColor: "var(--card)", borderColor: "var(--border)" }}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-heading text-2xl" style={{ color: "var(--ink)" }}>{editing.id ? "Edit Skill" : "New Skill"}</h3>
              <button onClick={() => setEditing(null)}><X className="w-5 h-5" style={{ color: "var(--muted-foreground)" }} /></button>
            </div>
            <div className="space-y-3">
              <input data-testid="skill-name-input" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="react.skill.md"
                className="w-full border rounded-sm px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2"
                style={{ backgroundColor: "var(--parchment)", borderColor: "var(--border)", color: "var(--foreground)" }} />
              <input value={editing.agents.join(",")} onChange={(e) => setEditing({ ...editing, agents: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} placeholder="agents: coding,testing"
                className="w-full border rounded-sm px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2"
                style={{ backgroundColor: "var(--parchment)", borderColor: "var(--border)", color: "var(--foreground)" }} />
              <textarea data-testid="skill-content-input" value={editing.content} onChange={(e) => setEditing({ ...editing, content: e.target.value })} rows={8} placeholder="# Skill markdown…"
                className="w-full border rounded-sm px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2"
                style={{ backgroundColor: "var(--parchment)", borderColor: "var(--border)", color: "var(--foreground)" }} />
              <label className="flex items-center gap-2 font-mono text-xs" style={{ color: "var(--foreground)" }}>
                <input type="checkbox" checked={editing.enabled} onChange={(e) => setEditing({ ...editing, enabled: e.target.checked })} /> enabled
              </label>
              <button data-testid="save-skill-btn" onClick={save} className="w-full text-white rounded-sm py-2.5 text-sm font-medium"
                style={{ backgroundColor: "var(--forest)" }}>Save Skill</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Database, BookText, Users, FolderGit2, MessageSquare, Cpu, Plus, Trash2, Edit3, X, Bot, KeyRound, Save, LayoutDashboard, Settings, ChevronRight, ArrowLeft, LogOut } from "lucide-react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

const SIDEBAR_ITEMS = [
  { key: "overview", label: "Overview", icon: LayoutDashboard },
  { key: "database", label: "Database", icon: Database },
  { key: "skills", label: "Skills", icon: BookText },
  { key: "agents", label: "Agents", icon: Bot },
  { key: "integrations", label: "Integrations", icon: Settings },
];

export default function Admin() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState("overview");

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: "var(--parchment)", color: "var(--ink)" }}>
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-4 shrink-0">
        <button onClick={() => navigate("/")}
          className="flex h-9 w-9 items-center justify-center rounded-xl transition-all hover:-translate-y-0.5 hover:shadow-md"
          style={{ backgroundColor: "color-mix(in srgb, var(--gold) 10%, transparent)", color: "var(--gold)" }}>
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-3">
          <span className="text-[13px] hidden sm:inline" style={{ color: "var(--muted-foreground)" }}>{user?.email}</span>
          <button onClick={logout}
            className="flex items-center gap-1.5 text-[13px] font-medium rounded-full px-3 py-1.5 transition-all hover:-translate-y-0.5"
            style={{ backgroundColor: "color-mix(in srgb, var(--danger) 10%, transparent)", color: "var(--danger)" }}>
            <LogOut className="w-3.5 h-3.5" /> Logout
          </button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0 px-6 pb-6 gap-6">
        {/* Sidebar */}
        <aside className="w-56 shrink-0 rounded-2xl flex flex-col p-3"
          style={{ backgroundColor: "color-mix(in srgb, var(--card) 70%, transparent)", boxShadow: "0 2px 16px rgba(0,0,0,0.05)" }}>
          <div className="px-3 py-4 mb-2">
            <h2 className="text-base font-bold" style={{ color: "var(--ink)" }}>Admin Panel</h2>
            <p className="text-[11px] mt-0.5" style={{ color: "var(--muted-foreground)" }}>System management</p>
          </div>
          <nav className="flex-1 space-y-0.5">
            {SIDEBAR_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = tab === item.key;
              return (
                <button key={item.key} data-testid={`admin-tab-${item.key}`} onClick={() => setTab(item.key)}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all"
                  style={active
                    ? { backgroundColor: "var(--gold)", color: "white", boxShadow: "0 2px 10px color-mix(in srgb, var(--gold) 30%, transparent)" }
                    : { color: "var(--muted-foreground)" }}>
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="flex-1 text-left">{item.label}</span>
                  {active && <ChevronRight className="w-3.5 h-3.5" />}
                </button>
              );
            })}
          </nav>
          <div className="px-3 py-3 mt-auto">
            <p className="text-[10px]" style={{ color: "var(--muted-foreground)" }}>Grizon AI v1.0</p>
          </div>
        </aside>

        {/* Content */}
        <main className="flex-1 overflow-y-auto flex flex-col">
          <div className="max-w-5xl flex-1 flex flex-col">
            <div className="mb-8">
              <h1 className="text-3xl font-bold" style={{ color: "var(--ink)" }}>
                {SIDEBAR_ITEMS.find((i) => i.key === tab)?.label}
              </h1>
              <p className="text-[13px] mt-1" style={{ color: "var(--muted-foreground)" }}>
                {tab === "overview" && "System statistics and overview"}
                {tab === "database" && "Browse and manage database tables"}
                {tab === "skills" && "Manage agent skill files"}
                {tab === "agents" && "Configure AI agent models"}
                {tab === "integrations" && "Manage API keys and integrations"}
              </p>
            </div>
            <div className="flex-1 flex flex-col">
              {tab === "overview" && <Overview />}
              {tab === "database" && <DatabaseView />}
              {tab === "skills" && <Skills />}
              {tab === "agents" && <Agents />}
              {tab === "integrations" && <Integrations />}
            </div>
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
    { label: "Users", value: stats?.users, icon: Users, gradient: "linear-gradient(135deg, color-mix(in srgb, var(--gold) 15%, transparent), color-mix(in srgb, var(--gold) 5%, transparent))" },
    { label: "Projects", value: stats?.projects, icon: FolderGit2, gradient: "linear-gradient(135deg, color-mix(in srgb, var(--moss) 15%, transparent), color-mix(in srgb, var(--moss) 5%, transparent))" },
    { label: "Messages", value: stats?.messages, icon: MessageSquare, gradient: "linear-gradient(135deg, color-mix(in srgb, var(--primary) 12%, transparent), color-mix(in srgb, var(--primary) 4%, transparent))" },
    { label: "Builds", value: stats?.builds, icon: Cpu, gradient: "linear-gradient(135deg, color-mix(in srgb, var(--danger) 12%, transparent), color-mix(in srgb, var(--danger) 4%, transparent))" },
  ];
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4" data-testid="admin-overview">
      {cards.map((c) => (
        <div key={c.label} className="rounded-2xl p-5 transition-all hover:-translate-y-0.5 hover:shadow-lg"
          style={{ background: c.gradient, boxShadow: "0 2px 12px rgba(0,0,0,0.04)" }}>
          <div className="flex h-10 w-10 items-center justify-center rounded-xl mb-4"
            style={{ backgroundColor: "color-mix(in srgb, var(--gold) 15%, transparent)" }}>
            <c.icon className="w-5 h-5" style={{ color: "var(--gold)" }} />
          </div>
          <div className="text-4xl font-bold tracking-tight" style={{ color: "var(--ink)" }}>{c.value ?? "—"}</div>
          <div className="text-[12px] font-medium mt-1" style={{ color: "var(--muted-foreground)" }}>{c.label}</div>
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
    <div className="flex gap-6 flex-1" data-testid="admin-database">
      <div className="w-52 shrink-0 space-y-1">
        {tables.map((t) => (
          <button key={t.name} data-testid={`table-${t.name}`} onClick={() => open(t.name)}
            className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-[12px] font-medium transition-all"
            style={selected === t.name
              ? { backgroundColor: "var(--gold)", color: "white", boxShadow: "0 2px 8px color-mix(in srgb, var(--gold) 25%, transparent)" }
              : { color: "var(--muted-foreground)" }}>
            <span className="flex items-center gap-2"><Database className="w-3.5 h-3.5" /> {t.name}</span>
            <span className={selected === t.name ? "opacity-80" : "opacity-50"}>{t.count}</span>
          </button>
        ))}
      </div>
      <div className="flex-1 rounded-2xl overflow-hidden flex flex-col"
        style={{ backgroundColor: "color-mix(in srgb, var(--card) 70%, transparent)", boxShadow: "0 2px 16px rgba(0,0,0,0.05)" }}>
        {!selected ? (
          <div className="flex-1 flex items-center justify-center text-sm" style={{ color: "var(--muted-foreground)" }}>Select a table to browse its rows.</div>
        ) : rows.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-sm" style={{ color: "var(--muted-foreground)" }}>No rows in {selected}.</div>
        ) : (
          <div className="overflow-auto flex-1">
            <table className="w-full text-[12px]">
              <thead className="sticky top-0" style={{ backgroundColor: "color-mix(in srgb, var(--sand) 50%, transparent)" }}>
                <tr>{cols.map((c) => <th key={c} className="text-left px-4 py-3 font-semibold" style={{ color: "var(--muted-foreground)" }}>{c}</th>)}</tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="transition-colors hover:bg-[color:var(--sand)]">
                    {cols.map((c) => <td key={c} className="px-4 py-2.5 max-w-[220px] truncate" style={{ color: "var(--ink)" }}>{typeof r[c] === "object" ? JSON.stringify(r[c]) : String(r[c] ?? "")}</td>)}
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
      <p className="text-[12px] mb-5" style={{ color: "var(--muted-foreground)" }}>Configure the model and provider each agent uses. Models are fetched directly from the provider API — select a provider, then pick a model from the dropdown.</p>
      <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: "color-mix(in srgb, var(--card) 70%, transparent)", boxShadow: "0 2px 16px rgba(0,0,0,0.05)" }}>
        {AGENT_LIST.map((a, idx) => {
          const currentProvider = models[a.key]?.provider || "sarvam";
          const currentModel = models[a.key]?.model || "";
          const options = availableModels[a.key] || [];
          const isLoading = loadingModels[a.key];
          return (
            <div key={a.key} className="flex items-center px-5 py-5 gap-4 transition-colors hover:bg-[color:var(--sand)]"
              style={idx < AGENT_LIST.length - 1 ? { borderBottom: "1px solid color-mix(in srgb, var(--sand) 60%, transparent)" } : {}}>
              <span className="flex items-center gap-3 text-[13px] font-medium w-44 shrink-0" style={{ color: "var(--ink)" }}>
                <div className="flex h-8 w-8 items-center justify-center rounded-xl"
                  style={{ backgroundColor: "color-mix(in srgb, var(--gold) 12%, transparent)" }}>
                  <Bot className="w-4 h-4" style={{ color: "var(--gold)" }} />
                </div>
                {a.label}
              </span>
              <select data-testid={`provider-${a.key}`} value={currentProvider}
                onChange={(e) => onProviderChange(a.key, e.target.value)}
                className="rounded-xl px-3 py-2.5 text-[12px] w-40 shrink-0 outline-none focus:ring-2 focus:ring-[color:var(--gold)] transition-shadow"
                style={{ backgroundColor: "color-mix(in srgb, var(--sand) 50%, transparent)", color: "var(--ink)" }}>
                <option value="sarvam">Sarvam</option>
                <option value="openrouter">OpenRouter</option>
              </select>
              <select data-testid={`model-${a.key}`} value={currentModel}
                onChange={(e) => setModels({ ...models, [a.key]: { ...models[a.key], model: e.target.value, provider: currentProvider } })}
                disabled={isLoading}
                className="rounded-xl px-3 py-2.5 text-[12px] flex-1 outline-none focus:ring-2 focus:ring-[color:var(--gold)] transition-shadow"
                style={{ backgroundColor: "color-mix(in srgb, var(--sand) 50%, transparent)", color: "var(--ink)" }}>
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
        className="mt-5 flex items-center gap-1.5 text-white rounded-full px-5 py-2.5 text-sm font-semibold transition-all hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-50"
        style={{ backgroundColor: "var(--gold)", boxShadow: "0 2px 10px color-mix(in srgb, var(--gold) 25%, transparent)" }}>
        <Save className="w-4 h-4" /> {saving ? "Saving…" : "Save models"}
      </button>
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
      <p className="text-[12px] mb-5" style={{ color: "var(--muted-foreground)" }}>LLM providers (Sarvam and OpenRouter) and NemoClaw sandbox credentials. Changes apply immediately to new agent runs and sandbox calls.</p>
      <div className="space-y-5 max-w-2xl">
        {INTEG_FIELDS.map((f) => (
          <div key={f.key}>
            <label className="text-[12px] font-semibold flex items-center gap-1.5 mb-2" style={{ color: "var(--ink)" }}>
              {f.secret && <KeyRound className="w-3.5 h-3.5" style={{ color: "var(--gold)" }} />}{f.label}
            </label>
            <input data-testid={`integ-${f.key}`} type={f.secret ? "password" : "text"} value={cfg[f.key] || ""}
              onChange={(e) => setCfg({ ...cfg, [f.key]: e.target.value })}
              className="w-full rounded-xl px-4 py-3 text-[13px] outline-none focus:ring-2 focus:ring-[color:var(--gold)] transition-shadow"
              style={{ backgroundColor: "color-mix(in srgb, var(--sand) 50%, transparent)", color: "var(--ink)" }} />
          </div>
        ))}
      </div>
      <button data-testid="save-integrations-btn" onClick={save} disabled={saving}
        className="mt-5 flex items-center gap-1.5 text-white rounded-full px-5 py-2.5 text-sm font-semibold transition-all hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-50"
        style={{ backgroundColor: "var(--gold)", boxShadow: "0 2px 10px color-mix(in srgb, var(--gold) 25%, transparent)" }}>
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
        <p className="text-[12px]" style={{ color: "var(--muted-foreground)" }}>Agent skill.md files — enabled skills are injected into the Coding Agent.</p>
        <button data-testid="new-skill-btn" onClick={() => setEditing({ ...EMPTY })}
          className="flex items-center gap-1.5 text-white rounded-full px-4 py-2 text-[13px] font-semibold transition-all hover:-translate-y-0.5 hover:shadow-md"
          style={{ backgroundColor: "var(--gold)", boxShadow: "0 2px 8px color-mix(in srgb, var(--gold) 20%, transparent)" }}>
          <Plus className="w-4 h-4" /> New Skill
        </button>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        {skills.map((s) => (
          <div key={s.id} data-testid={`skill-${s.id}`} className="rounded-2xl p-5 transition-all hover:-translate-y-0.5 hover:shadow-lg"
            style={{ backgroundColor: "color-mix(in srgb, var(--card) 70%, transparent)", boxShadow: "0 2px 12px rgba(0,0,0,0.04)" }}>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl"
                  style={{ backgroundColor: "color-mix(in srgb, var(--gold) 12%, transparent)" }}>
                  <BookText className="w-4 h-4" style={{ color: "var(--gold)" }} />
                </div>
                <span className="text-[14px] font-semibold" style={{ color: "var(--ink)" }}>{s.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <button data-testid={`toggle-skill-${s.id}`} onClick={() => toggle(s)}
                  className="text-[10px] font-semibold px-2.5 py-1 rounded-full transition-all"
                  style={s.enabled
                    ? { backgroundColor: "color-mix(in srgb, var(--moss) 12%, transparent)", color: "var(--moss)" }
                    : { backgroundColor: "color-mix(in srgb, var(--muted-foreground) 8%, transparent)", color: "var(--muted-foreground)" }}>
                  {s.enabled ? "enabled" : "disabled"}
                </button>
                <button onClick={() => setEditing(s)} className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors hover:bg-[color:var(--sand)]" style={{ color: "var(--muted-foreground)" }}>
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
                <button data-testid={`delete-skill-${s.id}`} onClick={() => del(s.id)} className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors hover:bg-[color:var(--sand)]" style={{ color: "var(--danger)" }}>
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <div className="flex gap-1.5 mt-3 flex-wrap">
              {(s.agents || []).map((a) => (
                <span key={a} className="text-[10px] font-semibold px-2.5 py-0.5 rounded-full"
                  style={{ backgroundColor: "color-mix(in srgb, var(--gold) 10%, transparent)", color: "var(--gold)" }}>{a}</span>
              ))}
            </div>
            <p className="text-[12px] mt-3 line-clamp-2 whitespace-pre-wrap leading-relaxed" style={{ color: "var(--muted-foreground)" }}>{s.content}</p>
          </div>
        ))}
      </div>

      {editing && (
        <div className="fixed inset-0 flex items-center justify-center z-50 p-4"
          style={{ backgroundColor: "color-mix(in srgb, var(--ink) 40%, transparent)", backdropFilter: "blur(4px)" }}
          onClick={() => setEditing(null)}>
          <div className="rounded-2xl w-full max-w-lg p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}
            data-testid="skill-editor" style={{ backgroundColor: "var(--card)" }}>
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-lg font-semibold" style={{ color: "var(--ink)" }}>{editing.id ? "Edit Skill" : "New Skill"}</h3>
              <button onClick={() => setEditing(null)}
                className="flex h-7 w-7 items-center justify-center rounded-full transition-colors hover:bg-[color:var(--sand)]"
                style={{ color: "var(--muted-foreground)" }}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3">
              <input data-testid="skill-name-input" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="react.skill.md"
                className="w-full rounded-xl px-3.5 py-2.5 text-[12px] outline-none focus:ring-2 focus:ring-[color:var(--gold)]"
                style={{ backgroundColor: "color-mix(in srgb, var(--sand) 50%, transparent)", color: "var(--ink)" }} />
              <input value={editing.agents.join(",")} onChange={(e) => setEditing({ ...editing, agents: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} placeholder="agents: coding,testing"
                className="w-full rounded-xl px-3.5 py-2.5 text-[12px] outline-none focus:ring-2 focus:ring-[color:var(--gold)]"
                style={{ backgroundColor: "color-mix(in srgb, var(--sand) 50%, transparent)", color: "var(--ink)" }} />
              <textarea data-testid="skill-content-input" value={editing.content} onChange={(e) => setEditing({ ...editing, content: e.target.value })} rows={8} placeholder="# Skill markdown…"
                className="w-full rounded-xl px-3.5 py-2.5 text-[12px] resize-none outline-none focus:ring-2 focus:ring-[color:var(--gold)]"
                style={{ backgroundColor: "color-mix(in srgb, var(--sand) 50%, transparent)", color: "var(--ink)" }} />
              <label className="flex items-center gap-2 text-[12px] font-medium" style={{ color: "var(--ink)" }}>
                <input type="checkbox" checked={editing.enabled} onChange={(e) => setEditing({ ...editing, enabled: e.target.checked })} /> enabled
              </label>
              <button data-testid="save-skill-btn" onClick={save}
                className="w-full text-white rounded-full py-2.5 text-sm font-semibold transition-all hover:-translate-y-0.5 hover:shadow-lg"
                style={{ backgroundColor: "var(--gold)", boxShadow: "0 2px 10px color-mix(in srgb, var(--gold) 25%, transparent)" }}>Save Skill</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

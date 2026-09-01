import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { Database, BookText, Users, FolderGit2, MessageSquare, Cpu, Plus, Trash2, Edit3, X, Bot, KeyRound, Save } from "lucide-react";
import api from "@/lib/api";
import Nav from "@/components/Nav";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "database", label: "Database" },
  { key: "skills", label: "Skills" },
  { key: "agents", label: "Agents" },
  { key: "integrations", label: "Integrations" },
];

export default function Admin() {
  const [tab, setTab] = useState("overview");
  return (
    <div className="min-h-screen">
      <Nav />
      <main className="max-w-7xl mx-auto px-6 py-8">
        <h1 className="font-heading text-4xl text-ink mb-1">Admin Dashboard</h1>
        <p className="font-mono text-xs text-ink/50 mb-6">System-wide data & agent skills</p>
        <div className="flex gap-1 border-b border-[#cecac8] mb-6">
          {TABS.map((t) => (
            <button key={t.key} data-testid={`admin-tab-${t.key}`} onClick={() => setTab(t.key)}
              className={`font-mono text-sm px-4 py-2 -mb-px border-b-2 transition-colors ${tab === t.key ? "border-forest text-forest" : "border-transparent text-ink/50 hover:text-ink"}`}>
              {t.label}
            </button>
          ))}
        </div>
        {tab === "overview" && <Overview />}
        {tab === "database" && <DatabaseView />}
        {tab === "skills" && <Skills />}
        {tab === "agents" && <Agents />}
        {tab === "integrations" && <Integrations />}
      </main>
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
        <div key={c.label} className="bg-white border border-[#cecac8] rounded-sm p-5">
          <c.icon className="w-5 h-5 text-gold mb-3" />
          <div className="font-heading text-4xl text-ink">{c.value ?? "—"}</div>
          <div className="font-mono text-xs text-ink/50 mt-1">{c.label}</div>
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
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6" data-testid="admin-database">
      <div className="lg:col-span-1 space-y-1">
        {tables.map((t) => (
          <button key={t.name} data-testid={`table-${t.name}`} onClick={() => open(t.name)}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-sm font-mono text-xs transition-colors ${selected === t.name ? "bg-forest text-white" : "bg-white border border-[#cecac8] hover:bg-sand text-ink/80"}`}>
            <span className="flex items-center gap-2"><Database className="w-3.5 h-3.5" /> {t.name}</span>
            <span className="opacity-60">{t.count}</span>
          </button>
        ))}
      </div>
      <div className="lg:col-span-3 bg-white border border-[#cecac8] rounded-sm overflow-hidden">
        {!selected ? (
          <div className="p-12 text-center font-mono text-sm text-ink/40">Select a table to browse its rows.</div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center font-mono text-sm text-ink/40">No rows in {selected}.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono">
              <thead className="bg-sand"><tr>{cols.map((c) => <th key={c} className="text-left px-3 py-2 text-ink/60">{c}</th>)}</tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-t border-[#ece8e4]">
                    {cols.map((c) => <td key={c} className="px-3 py-2 text-ink/80 max-w-[220px] truncate">{typeof r[c] === "object" ? JSON.stringify(r[c]) : String(r[c] ?? "")}</td>)}
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
  useEffect(() => { api.get("/admin/agent-models").then((r) => setModels(r.data.models)).catch(() => {}); }, []);
  const save = async () => {
    setSaving(true);
    try { const { data } = await api.put("/admin/agent-models", { models }); setModels(data.models); toast.success("Agent models updated"); }
    catch { toast.error("Failed to save"); } finally { setSaving(false); }
  };
  return (
    <div data-testid="admin-agents" className="max-w-4xl">
      <p className="font-mono text-xs text-ink/50 mb-4">Configure the model and provider each agent uses. Models are read dynamically at run time — new executions use the latest value. Not hard-coded in the agents.</p>
      <div className="bg-white border border-[#cecac8] rounded-sm divide-y divide-[#ece8e4]">
        {AGENT_LIST.map((a) => (
          <div key={a.key} className="flex items-center justify-between px-4 py-3 gap-4">
            <span className="flex items-center gap-2 font-mono text-sm text-ink w-32"><Bot className="w-4 h-4 text-gold" /> {a.label}</span>
            <select data-testid={`provider-${a.key}`} value={models[a.key]?.provider || "sarvam"} 
              onChange={(e) => setModels({ ...models, [a.key]: { ...models[a.key], model: models[a.key]?.model || "", provider: e.target.value } })}
              className="bg-white border border-[#cecac8] rounded-sm px-3 py-1.5 text-sm font-mono w-32 focus:outline-none focus:ring-2 focus:ring-forest">
              <option value="sarvam">Sarvam</option>
              <option value="openrouter">OpenRouter</option>
            </select>
            <input data-testid={`model-${a.key}`} value={models[a.key]?.model || ""} 
              onChange={(e) => setModels({ ...models, [a.key]: { ...models[a.key], model: e.target.value, provider: models[a.key]?.provider || "sarvam" } })}
              className="bg-white border border-[#cecac8] rounded-sm px-3 py-1.5 text-sm font-mono flex-1 focus:outline-none focus:ring-2 focus:ring-forest" 
              placeholder="Model name" />
          </div>
        ))}
      </div>
      <button data-testid="save-agent-models-btn" onClick={save} disabled={saving}
        className="mt-4 flex items-center gap-1.5 bg-forest text-white rounded-sm px-4 py-2 text-sm hover:bg-forest-dark disabled:opacity-50">
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
    <div data-testid="admin-integrations" className="max-w-2xl">
      <p className="font-mono text-xs text-ink/50 mb-4">LLM providers (Sarvam and OpenRouter) and NemoClaw sandbox credentials. Changes apply immediately to new agent runs and sandbox calls. Handle with care — these are secrets.</p>
      <div className="space-y-3">
        {INTEG_FIELDS.map((f) => (
          <div key={f.key}>
            <label className="font-mono text-xs text-ink/60 flex items-center gap-1.5 mb-1">{f.secret && <KeyRound className="w-3.5 h-3.5 text-gold" />}{f.label}</label>
            <input data-testid={`integ-${f.key}`} type={f.secret ? "password" : "text"} value={cfg[f.key] || ""}
              onChange={(e) => setCfg({ ...cfg, [f.key]: e.target.value })}
              className="w-full bg-white border border-[#cecac8] rounded-sm px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-forest" />
          </div>
        ))}
      </div>
      <button data-testid="save-integrations-btn" onClick={save} disabled={saving}
        className="mt-4 flex items-center gap-1.5 bg-forest text-white rounded-sm px-4 py-2 text-sm hover:bg-forest-dark disabled:opacity-50">
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
      <div className="flex justify-between items-center mb-4">
        <p className="font-mono text-xs text-ink/50">Agent skill.md files — enabled skills are injected into the Coding Agent.</p>
        <button data-testid="new-skill-btn" onClick={() => setEditing({ ...EMPTY })}
          className="flex items-center gap-1.5 bg-forest text-white rounded-sm px-3 py-1.5 text-sm hover:-translate-y-px transition-transform">
          <Plus className="w-4 h-4" /> New Skill
        </button>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        {skills.map((s) => (
          <div key={s.id} data-testid={`skill-${s.id}`} className="bg-white border border-[#cecac8] rounded-sm p-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <BookText className="w-4 h-4 text-gold" />
                <span className="font-mono text-sm text-ink">{s.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <button data-testid={`toggle-skill-${s.id}`} onClick={() => toggle(s)}
                  className={`font-mono text-[10px] px-2 py-0.5 rounded-sm ${s.enabled ? "bg-moss/15 text-moss" : "bg-sand text-ink/40"}`}>
                  {s.enabled ? "enabled" : "disabled"}
                </button>
                <button onClick={() => setEditing(s)} className="text-ink/40 hover:text-forest"><Edit3 className="w-4 h-4" /></button>
                <button data-testid={`delete-skill-${s.id}`} onClick={() => del(s.id)} className="text-ink/40 hover:text-danger"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
            <div className="flex gap-1 mt-2 flex-wrap">
              {(s.agents || []).map((a) => <span key={a} className="font-mono text-[10px] bg-sand px-2 py-0.5 rounded-sm text-ink/60">{a}</span>)}
            </div>
            <p className="font-mono text-[11px] text-ink/50 mt-2 line-clamp-2 whitespace-pre-wrap">{s.content}</p>
          </div>
        ))}
      </div>

      {editing && (
        <div className="fixed inset-0 bg-ink/40 flex items-center justify-center z-50 p-4" onClick={() => setEditing(null)}>
          <div className="bg-white border border-[#cecac8] rounded-sm w-full max-w-lg p-5" onClick={(e) => e.stopPropagation()} data-testid="skill-editor">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-heading text-2xl text-ink">{editing.id ? "Edit Skill" : "New Skill"}</h3>
              <button onClick={() => setEditing(null)}><X className="w-5 h-5 text-ink/50" /></button>
            </div>
            <div className="space-y-3">
              <input data-testid="skill-name-input" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="react.skill.md"
                className="w-full bg-white border border-[#cecac8] rounded-sm px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-forest" />
              <input value={editing.agents.join(",")} onChange={(e) => setEditing({ ...editing, agents: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} placeholder="agents: coding,testing"
                className="w-full bg-white border border-[#cecac8] rounded-sm px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-forest" />
              <textarea data-testid="skill-content-input" value={editing.content} onChange={(e) => setEditing({ ...editing, content: e.target.value })} rows={8} placeholder="# Skill markdown…"
                className="w-full bg-white border border-[#cecac8] rounded-sm px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-forest" />
              <label className="flex items-center gap-2 font-mono text-xs text-ink/70">
                <input type="checkbox" checked={editing.enabled} onChange={(e) => setEditing({ ...editing, enabled: e.target.checked })} /> enabled
              </label>
              <button data-testid="save-skill-btn" onClick={save} className="w-full bg-forest text-white rounded-sm py-2.5 text-sm font-medium hover:bg-forest-dark">Save Skill</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

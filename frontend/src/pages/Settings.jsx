import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, Check, Sun, Moon, Github, Loader2, LogOut, Settings as SettingsIcon } from "lucide-react";
import { toast } from "sonner";
import api, { formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { THEME_LIST } from "@/lib/themes";

function ThemeCard({ t, active, onSelect }) {
  const isDark = t.group === "dark";
  return (
    <button
      onClick={() => onSelect(t.id)}
      className="relative rounded-2xl p-6 text-left transition-all hover:-translate-y-1 hover:shadow-xl group"
      style={{
        backgroundColor: t.bg,
        boxShadow: active ? `0 8px 32px color-mix(in srgb, ${t.accent} 30%, transparent)` : "0 2px 8px rgba(0,0,0,0.06)",
        border: active ? `2px solid ${t.accent}` : "2px solid transparent",
      }}
    >
      {active && (
        <div className="absolute top-3 right-3 w-7 h-7 rounded-full flex items-center justify-center shadow-lg"
          style={{ backgroundColor: t.accent }}>
          <Check className="w-4 h-4 text-white" />
        </div>
      )}
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: `color-mix(in srgb, ${t.accent} 15%, transparent)` }}>
          {isDark ? (
            <Moon className="w-4 h-4" style={{ color: t.accent }} />
          ) : (
            <Sun className="w-4 h-4" style={{ color: t.accent }} />
          )}
        </div>
        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: t.text, opacity: 0.4 }}>
          {t.group}
        </span>
      </div>
      <h3 className="text-[15px] font-bold mb-4" style={{ color: t.text }}>
        {t.name}
      </h3>
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-full"
          style={{ backgroundColor: `color-mix(in srgb, ${t.accent} 12%, transparent)` }}>
          <div className="w-3 h-3 rounded-full ring-1 ring-black/5" style={{ backgroundColor: t.accent }} />
          <span className="text-[9px] font-semibold" style={{ color: t.text, opacity: 0.6 }}>Accent</span>
        </div>
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-full"
          style={{ backgroundColor: `color-mix(in srgb, ${t.bg} 50%, transparent)` }}>
          <div className="w-3 h-3 rounded-full ring-1 ring-black/5" style={{ backgroundColor: t.bg }} />
          <span className="text-[9px] font-semibold" style={{ color: t.text, opacity: 0.6 }}>BG</span>
        </div>
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-full"
          style={{ backgroundColor: `color-mix(in srgb, ${t.text} 8%, transparent)` }}>
          <div className="w-3 h-3 rounded-full ring-1 ring-black/5" style={{ backgroundColor: t.text }} />
          <span className="text-[9px] font-semibold" style={{ color: t.text, opacity: 0.6 }}>Text</span>
        </div>
      </div>
    </button>
  );
}

export default function Settings() {
  const { user, logout } = useAuth();
  const { themeId, setTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [github, setGithub] = useState(null);
  const [repositories, setRepositories] = useState([]);
  const [repository, setRepository] = useState("");
  const [branch, setBranch] = useState("main");
  const [githubBusy, setGithubBusy] = useState(false);
  const [newRepoName, setNewRepoName] = useState("");

  const returnTo = location.state?.returnTo || sessionStorage.getItem("settings-return-path") || "/";

  useEffect(() => {
    sessionStorage.setItem("settings-return-path", returnTo);
  }, [returnTo]);

  const loadGithub = async () => {
    try {
      const { data } = await api.get("/github/connection");
      setGithub(data);
      setRepository(data.repository || "");
      setBranch(data.branch || "main");
      if (data.connected) {
        const repos = await api.get("/github/repositories");
        setRepositories(repos.data);
      }
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    }
  };

  useEffect(() => { loadGithub(); }, []);

  const handleBack = () => {
    const target = location.state?.returnTo || sessionStorage.getItem("settings-return-path") || "/";
    navigate(target === "/settings" ? "/" : target, { replace: false });
  };

  const connectGithub = async () => {
    setGithubBusy(true);
    try {
      sessionStorage.setItem("settings-return-path", returnTo);
      const { data } = await api.get("/github/connect");
      window.location.href = data.url;
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
      setGithubBusy(false);
    }
  };

  const authorizeGithub = async () => {
    setGithubBusy(true);
    try {
      sessionStorage.setItem("settings-return-path", returnTo);
      const { data } = await api.get("/github/oauth/connect");
      window.location.href = data.url;
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
      setGithubBusy(false);
    }
  };

  const saveGithub = async () => {
    if (!repository) return;
    setGithubBusy(true);
    try {
      await api.put("/github/connection", { repository, branch });
      toast.success("GitHub repository selected");
      await loadGithub();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    } finally {
      setGithubBusy(false);
    }
  };

  const createGithubRepository = async () => {
    if (!newRepoName.trim()) return;
    setGithubBusy(true);
    try {
      const { data } = await api.post("/github/repositories", { name: newRepoName.trim(), private: true });
      setNewRepoName("");
      toast.success(`Created ${data.full_name}`);
      await loadGithub();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    } finally {
      setGithubBusy(false);
    }
  };

  const disconnectGithub = async () => {
    setGithubBusy(true);
    try {
      await api.delete("/github/connection");
      setGithub({ connected: false });
      setRepositories([]);
      setRepository("");
      toast.success("GitHub disconnected");
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    } finally {
      setGithubBusy(false);
    }
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--parchment)", color: "var(--ink)" }}>
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-4">
        <button onClick={handleBack}
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

      <main className="max-w-4xl mx-auto px-6 pb-16">
        {/* Profile Section */}
        <section className="mb-14">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-1.5 h-8 rounded-full" style={{ backgroundColor: "var(--gold)" }} />
            <h1 className="text-2xl font-bold" style={{ color: "var(--ink)" }}>Profile</h1>
          </div>
          <div className="rounded-2xl p-7" style={{ backgroundColor: "color-mix(in srgb, var(--card) 70%, transparent)", boxShadow: "0 2px 20px rgba(0,0,0,0.05)" }}>
            <div className="flex items-center gap-5 mb-5">
              <div className="relative">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-bold shadow-lg"
                  style={{ background: "linear-gradient(135deg, var(--gold), color-mix(in srgb, var(--gold) 70%, white))", color: "white" }}>
                  {user?.name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || "?"}
                </div>
                <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center ring-2 ring-white"
                  style={{ backgroundColor: "var(--moss)" }}>
                  <Check className="w-3 h-3 text-white" />
                </div>
              </div>
              <div>
                <p className="text-xl font-bold" style={{ color: "var(--ink)" }}>{user?.name || "User"}</p>
                <p className="text-[13px] mt-0.5" style={{ color: "var(--muted-foreground)" }}>{user?.email}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-xl p-4" style={{ background: "linear-gradient(135deg, color-mix(in srgb, var(--gold) 8%, transparent), color-mix(in srgb, var(--gold) 3%, transparent))" }}>
                <p className="text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: "var(--muted-foreground)" }}>Role</p>
                <p className="text-sm font-bold capitalize" style={{ color: "var(--ink)" }}>{user?.role || "user"}</p>
              </div>
              <div className="rounded-xl p-4" style={{ background: "linear-gradient(135deg, color-mix(in srgb, var(--moss) 8%, transparent), color-mix(in srgb, var(--moss) 3%, transparent))" }}>
                <p className="text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: "var(--muted-foreground)" }}>Joined</p>
                <p className="text-sm font-bold" style={{ color: "var(--ink)" }}>
                  {user?.created_at ? new Date(user.created_at).toLocaleDateString() : "N/A"}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* GitHub Section */}
        <section className="mb-14">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-1.5 h-8 rounded-full" style={{ backgroundColor: "var(--gold)" }} />
            <h2 className="text-2xl font-bold" style={{ color: "var(--ink)" }}>GitHub</h2>
          </div>
          <p className="text-[13px] mb-6 ml-5" style={{ color: "var(--muted-foreground)" }}>
            Connect a GitHub App installation to publish completed projects automatically.
          </p>
          <div className="rounded-2xl p-7" style={{ backgroundColor: "color-mix(in srgb, var(--card) 70%, transparent)", boxShadow: "0 2px 20px rgba(0,0,0,0.05)" }}>
            {!github?.connected ? (
              <button onClick={connectGithub} disabled={githubBusy}
                className="flex items-center gap-2.5 text-white rounded-full px-6 py-3 text-sm font-bold transition-all hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-60"
                style={{ background: "linear-gradient(135deg, var(--gold), color-mix(in srgb, var(--gold) 80%, white))", boxShadow: "0 4px 16px color-mix(in srgb, var(--gold) 30%, transparent)" }}>
                {githubBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Github className="w-4 h-4" />}
                Connect GitHub
              </button>
            ) : (
              <div className="space-y-5">
                {!github.repository && (
                  <div className="flex items-center gap-2 px-4 py-3 rounded-xl text-[13px]"
                    style={{ backgroundColor: "color-mix(in srgb, var(--gold) 8%, transparent)", color: "var(--gold)" }}>
                    <Github className="w-4 h-4" /> Select a repository to enable publishing
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                    style={{ backgroundColor: "color-mix(in srgb, var(--moss) 12%, transparent)" }}>
                    <Github className="w-4 h-4" style={{ color: "var(--moss)" }} />
                  </div>
                  <div>
                    <p className="text-[13px] font-bold" style={{ color: "var(--ink)" }}>
                      Connected as <span style={{ color: "var(--gold)" }}>{github.account_login}</span>
                    </p>
                  </div>
                </div>
                {!github.user_authorized && (
                  <button onClick={authorizeGithub} disabled={githubBusy}
                    className="rounded-full px-5 py-2.5 text-[12px] font-semibold disabled:opacity-50 transition-all hover:-translate-y-0.5 hover:shadow-md"
                    style={{ backgroundColor: "color-mix(in srgb, var(--gold) 12%, transparent)", color: "var(--gold)" }}>
                    Authorize repository creation
                  </button>
                )}
                <div className="flex flex-col sm:flex-row gap-2.5">
                  <select value={repository} onChange={(e) => setRepository(e.target.value)}
                    className="flex-1 rounded-xl px-4 py-3 text-[13px] outline-none focus:ring-2 focus:ring-[color:var(--gold)] transition-shadow font-medium"
                    style={{ backgroundColor: "color-mix(in srgb, var(--sand) 50%, transparent)", color: "var(--ink)" }}>
                    <option value="">Select a repository</option>
                    {repositories.map((repo) => <option key={repo.full_name} value={repo.full_name}>{repo.full_name}</option>)}
                  </select>
                  <input value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="Branch"
                    className="rounded-xl px-4 py-3 text-[13px] sm:w-32 outline-none focus:ring-2 focus:ring-[color:var(--gold)] transition-shadow font-medium"
                    style={{ backgroundColor: "color-mix(in srgb, var(--sand) 50%, transparent)", color: "var(--ink)" }} />
                  <button onClick={saveGithub} disabled={githubBusy || !repository}
                    className="text-white rounded-full px-6 py-3 text-[13px] font-bold disabled:opacity-50 transition-all hover:-translate-y-0.5 hover:shadow-lg"
                    style={{ backgroundColor: "var(--gold)", boxShadow: "0 2px 10px color-mix(in srgb, var(--gold) 25%, transparent)" }}>Save</button>
                </div>
                <div className="flex flex-col sm:flex-row gap-2.5">
                  <input value={newRepoName} onChange={(e) => setNewRepoName(e.target.value)}
                    placeholder="New repository name"
                    className="flex-1 rounded-xl px-4 py-3 text-[13px] outline-none focus:ring-2 focus:ring-[color:var(--gold)] transition-shadow font-medium"
                    style={{ backgroundColor: "color-mix(in srgb, var(--sand) 50%, transparent)", color: "var(--ink)" }} />
                  <button onClick={createGithubRepository} disabled={githubBusy || !newRepoName.trim()}
                    className="rounded-full px-5 py-3 text-[13px] font-semibold disabled:opacity-50 transition-all hover:-translate-y-0.5 hover:shadow-md"
                    style={{ backgroundColor: "color-mix(in srgb, var(--gold) 12%, transparent)", color: "var(--gold)" }}>Create repository</button>
                </div>
                <button onClick={disconnectGithub} disabled={githubBusy}
                  className="text-[12px] font-semibold underline transition-colors hover:opacity-80" style={{ color: "var(--danger)" }}>Disconnect GitHub</button>
              </div>
            )}
          </div>
        </section>

        {/* Theme Section */}
        <section>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-1.5 h-8 rounded-full" style={{ backgroundColor: "var(--gold)" }} />
            <h2 className="text-2xl font-bold" style={{ color: "var(--ink)" }}>Theme</h2>
          </div>
          <p className="text-[13px] mb-6 ml-5" style={{ color: "var(--muted-foreground)" }}>
            Choose a look and feel for Grizon AI. Your preference is saved locally.
          </p>

          {/* Dark themes */}
          <h3 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider mb-4 ml-1" style={{ color: "var(--muted-foreground)" }}>
            <div className="w-5 h-5 rounded-md flex items-center justify-center"
              style={{ backgroundColor: "color-mix(in srgb, var(--muted-foreground) 10%, transparent)" }}>
              <Moon className="w-3 h-3" />
            </div>
            Dark Themes
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
            {THEME_LIST.filter((t) => t.group === "dark").map((t) => (
              <ThemeCard key={t.id} t={t} active={themeId === t.id} onSelect={setTheme} />
            ))}
          </div>

          {/* Light themes */}
          <h3 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider mb-4 ml-1" style={{ color: "var(--muted-foreground)" }}>
            <div className="w-5 h-5 rounded-md flex items-center justify-center"
              style={{ backgroundColor: "color-mix(in srgb, var(--gold) 10%, transparent)" }}>
              <Sun className="w-3 h-3" style={{ color: "var(--gold)" }} />
            </div>
            Light Themes
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {THEME_LIST.filter((t) => t.group === "light").map((t) => (
              <ThemeCard key={t.id} t={t} active={themeId === t.id} onSelect={setTheme} />
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

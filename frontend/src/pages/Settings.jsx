import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Check, Sun, Moon, Github, Loader2 } from "lucide-react";
import { toast } from "sonner";
import api, { formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { THEME_LIST } from "@/lib/themes";
import Nav from "@/components/Nav";

function ThemeCard({ t, active, onSelect }) {
  const isDark = t.group === "dark";
  return (
    <button
      onClick={() => onSelect(t.id)}
      className={`relative rounded-lg border-2 p-4 text-left transition-all hover:scale-[1.02] ${
        active
          ? "border-[var(--primary)] shadow-lg ring-2 ring-[var(--primary)]/30"
          : "border-[var(--border)] hover:border-[var(--primary)]/50"
      }`}
      style={{ backgroundColor: t.bg }}
    >
      {active && (
        <div className="absolute top-3 right-3 w-6 h-6 rounded-full flex items-center justify-center"
          style={{ backgroundColor: t.accent }}>
          <Check className="w-3.5 h-3.5 text-white" />
        </div>
      )}
      <div className="flex items-center gap-2 mb-3">
        {isDark ? (
          <Moon className="w-4 h-4" style={{ color: t.accent }} />
        ) : (
          <Sun className="w-4 h-4" style={{ color: t.accent }} />
        )}
        <span className="text-xs font-mono uppercase tracking-wider" style={{ color: t.text, opacity: 0.6 }}>
          {t.group}
        </span>
      </div>
      <h3 className="font-heading text-lg font-semibold mb-2" style={{ color: t.text }}>
        {t.name}
      </h3>
      <div className="flex gap-2 mt-3">
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-4 rounded-full border border-white/20" style={{ backgroundColor: t.accent }} />
          <span className="text-[10px] font-mono" style={{ color: t.text, opacity: 0.5 }}>Accent</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-4 rounded-full border border-white/20" style={{ backgroundColor: t.bg }} />
          <span className="text-[10px] font-mono" style={{ color: t.text, opacity: 0.5 }}>BG</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-4 rounded-full border border-white/20" style={{ backgroundColor: t.text }} />
          <span className="text-[10px] font-mono" style={{ color: t.text, opacity: 0.5 }}>Text</span>
        </div>
      </div>
    </button>
  );
}

export default function Settings() {
  const { user } = useAuth();
  const { themeId, setTheme } = useTheme();
  const navigate = useNavigate();
  const [github, setGithub] = useState(null);
  const [repositories, setRepositories] = useState([]);
  const [repository, setRepository] = useState("");
  const [branch, setBranch] = useState("main");
  const [githubBusy, setGithubBusy] = useState(false);
  const [newRepoName, setNewRepoName] = useState("");

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

  const connectGithub = async () => {
    setGithubBusy(true);
    try {
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
      <Nav />
      <main className="max-w-4xl mx-auto px-6 py-10">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-sm font-mono mb-8 hover:opacity-70 transition-opacity"
          style={{ color: "var(--muted-foreground, var(--ink))" }}
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>

        {/* Profile Section */}
        <section className="mb-12">
          <h1 className="font-heading text-3xl font-semibold mb-6" style={{ color: "var(--ink)" }}>
            Profile
          </h1>
          <div className="rounded-lg border p-6" style={{ backgroundColor: "var(--card)", borderColor: "var(--border)" }}>
            <div className="flex items-center gap-4 mb-4">
              <div className="w-14 h-14 rounded-full flex items-center justify-center text-xl font-heading font-bold"
                style={{ backgroundColor: "var(--primary)", color: "var(--primary-foreground)" }}>
                {user?.name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || "?"}
              </div>
              <div>
                <p className="text-lg font-semibold" style={{ color: "var(--foreground)" }}>{user?.name || "User"}</p>
                <p className="text-sm font-mono" style={{ color: "var(--muted-foreground)" }}>{user?.email}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 mt-6">
              <div className="rounded-md border p-3" style={{ borderColor: "var(--border)" }}>
                <p className="text-xs font-mono uppercase tracking-wider mb-1" style={{ color: "var(--muted-foreground)" }}>Role</p>
                <p className="font-semibold capitalize" style={{ color: "var(--foreground)" }}>{user?.role || "user"}</p>
              </div>
              <div className="rounded-md border p-3" style={{ borderColor: "var(--border)" }}>
                <p className="text-xs font-mono uppercase tracking-wider mb-1" style={{ color: "var(--muted-foreground)" }}>Joined</p>
                <p className="font-semibold" style={{ color: "var(--foreground)" }}>
                  {user?.created_at ? new Date(user.created_at).toLocaleDateString() : "N/A"}
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="font-heading text-2xl font-semibold mb-2" style={{ color: "var(--ink)" }}>
            GitHub
          </h2>
          <p className="text-sm mb-6" style={{ color: "var(--muted-foreground)" }}>
            Connect a GitHub App installation to publish completed projects automatically.
          </p>
          <div className="rounded-lg border p-6" style={{ backgroundColor: "var(--card)", borderColor: "var(--border)" }}>
            {!github?.connected ? (
              <button onClick={connectGithub} disabled={githubBusy}
                className="flex items-center gap-2 text-white rounded-sm px-4 py-2.5 text-sm disabled:opacity-60"
                style={{ backgroundColor: "var(--forest)" }}>
                {githubBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Github className="w-4 h-4" />}
                Connect GitHub
              </button>
            ) : (
              <div className="space-y-4">
                {!github.repository && (
                  <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
                    Select a repository to enable publishing
                  </p>
                )}
                <p className="font-mono text-sm" style={{ color: "var(--foreground)" }}>
                  Connected as <strong>{github.account_login}</strong>
                </p>
                {!github.user_authorized && (
                  <button onClick={authorizeGithub} disabled={githubBusy}
                    className="rounded-sm border px-4 py-2 text-sm disabled:opacity-50"
                    style={{ borderColor: "var(--border)", color: "var(--foreground)" }}>
                    Authorize repository creation
                  </button>
                )}
                <div className="flex flex-col sm:flex-row gap-2">
                  <select value={repository} onChange={(e) => setRepository(e.target.value)}
                    className="flex-1 border rounded-sm px-3 py-2 text-sm"
                    style={{ backgroundColor: "var(--card)", borderColor: "var(--border)", color: "var(--foreground)" }}>
                    <option value="">Select a repository</option>
                    {repositories.map((repo) => <option key={repo.full_name} value={repo.full_name}>{repo.full_name}</option>)}
                  </select>
                  <input value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="Branch"
                    className="border rounded-sm px-3 py-2 text-sm sm:w-32"
                    style={{ backgroundColor: "var(--card)", borderColor: "var(--border)", color: "var(--foreground)" }} />
                  <button onClick={saveGithub} disabled={githubBusy || !repository}
                    className="text-white rounded-sm px-4 py-2 text-sm disabled:opacity-50"
                    style={{ backgroundColor: "var(--forest)" }}>Save</button>
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input value={newRepoName} onChange={(e) => setNewRepoName(e.target.value)}
                    placeholder="New repository name"
                    className="flex-1 border rounded-sm px-3 py-2 text-sm"
                    style={{ backgroundColor: "var(--card)", borderColor: "var(--border)", color: "var(--foreground)" }} />
                  <button onClick={createGithubRepository} disabled={githubBusy || !newRepoName.trim()}
                    className="rounded-sm border px-4 py-2 text-sm disabled:opacity-50"
                    style={{ borderColor: "var(--border)", color: "var(--foreground)" }}>Create repository</button>
                </div>
                <button onClick={disconnectGithub} disabled={githubBusy}
                  className="text-sm font-mono underline" style={{ color: "var(--danger)" }}>Disconnect GitHub</button>
              </div>
            )}
          </div>
        </section>

        {/* Theme Section */}
        <section>
          <h2 className="font-heading text-2xl font-semibold mb-2" style={{ color: "var(--ink)" }}>
            Theme
          </h2>
          <p className="text-sm mb-6" style={{ color: "var(--muted-foreground)" }}>
            Choose a look and feel for Grizon AI. Your preference is saved locally.
          </p>

          {/* Dark themes */}
          <h3 className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest mb-3" style={{ color: "var(--muted-foreground)" }}>
            <Moon className="w-3.5 h-3.5" /> Dark Themes
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            {THEME_LIST.filter((t) => t.group === "dark").map((t) => (
              <ThemeCard key={t.id} t={t} active={themeId === t.id} onSelect={setTheme} />
            ))}
          </div>

          {/* Light themes */}
          <h3 className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest mb-3" style={{ color: "var(--muted-foreground)" }}>
            <Sun className="w-3.5 h-3.5" /> Light Themes
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

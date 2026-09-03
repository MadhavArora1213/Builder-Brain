import React, { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, ArrowUp, Square, RotateCw, RefreshCw, Terminal, Globe, Loader2, Eye, Code2, ExternalLink, Download, ChevronRight, ChevronDown, FolderClosed, FolderOpen } from "lucide-react";
import { FaReact, FaJs, FaNodeJs, FaCss3Alt, FaHtml5, FaPython, FaJava, FaDatabase, FaEnvira, FaGitAlt, FaImage, FaMarkdown } from "react-icons/fa";
import { SiTypescript, SiJson, SiVite, SiTailwindcss, SiPostcss, SiNodedotjs } from "react-icons/si";
import api from "@/lib/api";
import { ChatMessage, QuestionCard, PlanCard, AgentTimeline } from "@/components/builder/parts";

const ACTIVE = ["building", "testing", "planning"];

const STATUS_STYLE = {
  complete: { backgroundColor: "color-mix(in srgb, var(--moss) 15%, transparent)", color: "var(--moss)" },
  failed: { backgroundColor: "color-mix(in srgb, var(--danger) 15%, transparent)", color: "var(--danger)" },
  idle: { backgroundColor: "var(--sand)", color: "var(--muted-foreground)" },
};

function statusStyle(status, isActive) {
  if (STATUS_STYLE[status]) return STATUS_STYLE[status];
  if (isActive) return { backgroundColor: "color-mix(in srgb, var(--gold) 20%, transparent)", color: "var(--gold)" };
  return STATUS_STYLE.idle;
}

function FileIcon({ filename, className }) {
  const ext = filename.split(".").pop().toLowerCase();
  const name = filename.split("/").pop().toLowerCase();
  const s = className || "w-4 h-4";

  if (name === "package.json") return <SiNodedotjs className={s} style={{ color: "#68a063" }} />;
  if (name === "tsconfig.json" || name === "tsconfig.node.json") return <SiTypescript className={s} style={{ color: "#3178c6" }} />;
  if (name.startsWith("tsconfig")) return <SiTypescript className={s} style={{ color: "#3178c6" }} />;
  if (name === "tailwind.config.ts" || name === "tailwind.config.js") return <SiTailwindcss className={s} style={{ color: "#06b6d4" }} />;
  if (name === "vite.config.ts" || name === "vite.config.js") return <SiVite className={s} style={{ color: "#bd34fe" }} />;
  if (name === "postcss.config.mjs" || name === "postcss.config.js") return <SiPostcss className={s} style={{ color: "#dd3a0a" }} />;
  if (name === ".gitignore") return <FaGitAlt className={s} style={{ color: "#f05033" }} />;

  const map = {
    tsx: <FaReact className={s} style={{ color: "#61dafb" }} />,
    jsx: <FaReact className={s} style={{ color: "#61dafb" }} />,
    ts: <SiTypescript className={s} style={{ color: "#3178c6" }} />,
    js: <FaJs className={s} style={{ color: "#f7df1e" }} />,
    mjs: <FaJs className={s} style={{ color: "#f7df1e" }} />,
    json: <SiJson className={s} style={{ color: "#a8b9cc" }} />,
    css: <FaCss3Alt className={s} style={{ color: "#264de4" }} />,
    html: <FaHtml5 className={s} style={{ color: "#e34c26" }} />,
    py: <FaPython className={s} style={{ color: "#3776ab" }} />,
    java: <FaJava className={s} style={{ color: "#ed8b00" }} />,
    env: <FaEnvira className={s} style={{ color: "#ecd53f" }} />,
    md: <FaMarkdown className={s} style={{ color: "#555" }} />,
    svg: <FaImage className={s} style={{ color: "#ffb13b" }} />,
    png: <FaImage className={s} style={{ color: "#a855f7" }} />,
    jpg: <FaImage className={s} style={{ color: "#a855f7" }} />,
    jpeg: <FaImage className={s} style={{ color: "#a855f7" }} />,
    webp: <FaImage className={s} style={{ color: "#a855f7" }} />,
    sql: <FaDatabase className={s} style={{ color: "#4479a1" }} />,
    sh: <FaEnvira className={s} style={{ color: "#4eaa25" }} />,
  };
  return map[ext] || <Code2 className={s} style={{ color: "var(--muted-foreground)" }} />;
}

function buildTree(files) {
  const root = { name: "", children: {}, isDir: true };
  for (const f of files) {
    const parts = (f.path || "").split("/").filter(Boolean);
    let node = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (i === parts.length - 1) {
        node.children[part] = { name: part, path: f.path, isDir: false };
      } else {
        if (!node.children[part]) node.children[part] = { name: part, children: {}, isDir: true };
        node = node.children[part];
      }
    }
  }
  return root;
}

function FileTreeNode({ node, depth, selectedFile, onSelectFile, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen ?? true);
  const indent = depth * 20;
  if (!node.isDir) {
    return (
      <button onClick={() => onSelectFile(node.path)} title={node.path}
        className="w-full text-left flex items-center gap-2 font-mono text-[11px] border-b truncate"
        style={{ paddingLeft: `${indent + 12}px`, paddingTop: "4px", paddingBottom: "4px",
          backgroundColor: selectedFile === node.path ? "var(--forest)" : "transparent",
          color: selectedFile === node.path ? "white" : "var(--foreground)",
          borderColor: selectedFile === node.path ? "var(--border)" : "var(--sand)" }}>
        <FileIcon filename={node.name} className="w-4 h-4 shrink-0" /> <span className="truncate">{node.name}</span>
      </button>
    );
  }
  const entries = Object.values(node.children).sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return (
    <div>
      <button onClick={() => setOpen(!open)}
        className="w-full text-left flex items-center gap-2 font-mono text-[11px] font-medium border-b"
        style={{ paddingLeft: `${indent + 12}px`, paddingTop: "4px", paddingBottom: "4px",
          backgroundColor: "color-mix(in srgb, var(--parchment) 60%, transparent)",
          color: "var(--foreground)", borderColor: "var(--sand)" }}>
        <span className="w-4 h-4 shrink-0 flex items-center justify-center">
          {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </span>
        {open ? <FolderOpen className="w-4 h-4 shrink-0" style={{ color: "var(--gold)" }} /> : <FolderClosed className="w-4 h-4 shrink-0" style={{ color: "var(--gold)" }} />}
        <span>{node.name}</span>
      </button>
      {open && entries.map((child) => (
        <FileTreeNode key={child.name} node={child} depth={depth + 1} selectedFile={selectedFile} onSelectFile={onSelectFile} />
      ))}
    </div>
  );
}

function FileTree({ files, selectedFile, onSelectFile }) {
  const tree = buildTree(files);
  const entries = Object.values(tree.children).sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return (
    <div className="overflow-y-auto h-full">
      {entries.map((node) => (
        <FileTreeNode key={node.name} node={node} depth={0} selectedFile={selectedFile} onSelectFile={onSelectFile} />
      ))}
    </div>
  );
}

export default function Builder() {
  const { projectId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [messages, setMessages] = useState([]);
  const [files, setFiles] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [logs, setLogs] = useState("");
  const [showLogs, setShowLogs] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);
  const [rightTab, setRightTab] = useState("preview");
  const [selectedFile, setSelectedFile] = useState(null);
  const [publishing, setPublishing] = useState(false);
  const [githubSetupNotice, setGithubSetupNotice] = useState(false);
  const firstSent = useRef(false);
  const scrollRef = useRef(null);
  const atBottom = useRef(true);
  const inputRef = useRef(null);

  const status = project?.workflow?.status || "idle";
  const isActive = ACTIVE.includes(status);

  const fetchAll = useCallback(async () => {
    try {
      const [p, m] = await Promise.all([
        api.get(`/projects/${projectId}`),
        api.get(`/projects/${projectId}/messages`),
      ]);
      setProject(p.data);
      setMessages(m.data);
    } catch {
      navigate("/");
    }
  }, [projectId, navigate]);

  const fetchFiles = useCallback(async () => {
    try { const { data } = await api.get(`/projects/${projectId}/files`); setFiles(data); } catch {}
  }, [projectId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    fetchFiles();
    const t = setInterval(fetchFiles, 1000);
    return () => clearInterval(t);
  }, [fetchFiles]);

  useEffect(() => {
    const fm = location.state?.firstMessage;
    if (fm && !firstSent.current && project && messages.length === 0) {
      firstSent.current = true;
      doSend(fm);
      window.history.replaceState({}, "");
    }
  }, [location.state, project, messages.length]);

  useEffect(() => {
    const t = setInterval(fetchAll, 1000);
    return () => clearInterval(t);
  }, [fetchAll]);

  useEffect(() => {
    if (atBottom.current) scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  async function doSend(content) {
    setSending(true);
    try {
      const endpoint = status === "awaiting_approval" ? "request-changes" : "message";
      await api.post(`/projects/${projectId}/${endpoint}`, { content });
      await fetchAll();
    } catch { toast.error("Failed to send"); }
    finally { setSending(false); }
  }

  const handleRequestChanges = async (changesText) => {
    setSending(true);
    try {
      await api.post(`/projects/${projectId}/request-changes`, { content: changesText });
      toast.success("Changes requested — planner is regenerating the plan…");
      await fetchAll();
    } catch { toast.error("Failed to request changes"); }
    finally { setSending(false); }
  };

  const send = async () => {
    if (!input.trim()) return;
    const c = input.trim();
    setInput("");
    atBottom.current = true;
    await doSend(c);
  };

  const submitAnswers = async (answers) => {
    try { await api.post(`/projects/${projectId}/answers`, { answers }); await fetchAll(); }
    catch { toast.error("Failed to submit answers"); }
  };

  const approve = async () => { try { await api.post(`/projects/${projectId}/approve`); toast.success("Building…"); fetchAll(); } catch { toast.error("Failed"); } };
  const stop = async () => { try { await api.post(`/projects/${projectId}/stop`); toast("Workflow paused"); fetchAll(); } catch {} };
  const retry = async () => { try { await api.post(`/projects/${projectId}/retry`); toast.success("Retrying…"); fetchAll(); } catch {} };
  const refreshPreview = async () => { setPreviewKey((k) => k + 1); try { await api.get(`/projects/${projectId}/sandbox-status`); fetchAll(); } catch {} };
  const loadLogs = async () => { setShowLogs((s) => !s); try { const { data } = await api.get(`/projects/${projectId}/logs`); setLogs(data.logs || ""); } catch {} };
  const redirectToGithubSettings = (event) => {
    if (event) event.preventDefault();
    setGithubSetupNotice(false);
    window.location.href = "/settings";
  };

  const publishToGithub = async () => {
    setGithubSetupNotice(false);
    setPublishing(true);
    try {
      const { data } = await api.post(`/github/projects/${projectId}/publish`);
      toast.success(`Published to ${data.repository}`);
      setGithubSetupNotice(false);
      await fetchAll();
    } catch (err) {
      const detail = err.response?.data?.detail || "GitHub publish failed";
      const needsGithubSetup = /GitHub.*(not connected|not configured|not selected|Connect GitHub|repository.*selected|Authorize GitHub)/i.test(detail);

      if (needsGithubSetup) {
        setGithubSetupNotice(true);
      } else {
        toast.error(detail);
      }
    } finally {
      setPublishing(false);
    }
  };

  const downloadProjectZip = async () => {
    try {
      const { data } = await api.get(`/projects/${projectId}/download`, { responseType: "blob" });
      const blob = new Blob([data], { type: "application/zip" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      const safeTitle = ((project?.title || "project").trim().replace(/\s+/g, "-") || "project").replace(/[\\/:*?"<>|]/g, "_");
      link.href = url;
      link.download = `${safeTitle}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success("Project zip downloaded");
    } catch {
      toast.error("Failed to download project zip");
    }
  };

  const openFile = (path) => {
    setRightTab("code");
    setSelectedFile(path);
  };

  if (!project) return <div className="min-h-screen flex items-center justify-center font-mono" style={{ color: "var(--muted-foreground)" }}>Loading project…</div>;

  const currentFile = files.find((f) => f.path === selectedFile) || files[0];

  return (
    <div className="h-screen flex flex-col" style={{ backgroundColor: "var(--parchment)", color: "var(--ink)" }}>
      {/* Header */}
      <header className="h-14 border-b flex items-center justify-between px-4 shrink-0"
        style={{ borderColor: "var(--border)", backgroundColor: "var(--parchment)" }}>
        <div className="flex items-center gap-3 min-w-0">
          <button data-testid="back-home-btn" onClick={() => navigate("/")} style={{ color: "var(--muted-foreground)" }} className="hover:opacity-70">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="font-heading text-xl truncate" style={{ color: "var(--ink)" }}>{project.title}</h1>
          <span className="font-mono text-[10px] uppercase px-2 py-0.5 rounded-sm" style={statusStyle(status, isActive)}>
            {status}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {isActive && (
            <button data-testid="stop-btn" onClick={stop} className="flex items-center gap-1.5 text-white rounded-sm px-3 py-1.5 text-sm"
              style={{ backgroundColor: "var(--danger)" }}>
              <Square className="w-3.5 h-3.5" /> Stop
            </button>
          )}
          {(status === "failed" || status === "paused" || status === "complete") && (
            <button data-testid="retry-btn" onClick={retry} className="flex items-center gap-1.5 border rounded-sm px-3 py-1.5 text-sm hover:opacity-80"
              style={{ borderColor: "var(--border)", color: "var(--foreground)" }}>
              <RotateCw className="w-3.5 h-3.5" /> Retry
            </button>
          )}
          {status === "complete" && project.workflow?.github?.status === "published" && (
           <button onClick={publishToGithub} disabled={publishing}
             className="font-mono text-[10px] border rounded-sm px-2 py-1 disabled:opacity-50"
             style={{ borderColor: "var(--border)", color: "var(--moss)" }}>
             {publishing ? "Publishing…" : "Publish to GitHub"}
           </button>
          )}
          {status === "complete" && project.workflow?.github?.status !== "published" && (
           <button onClick={publishToGithub} disabled={publishing}
             className="font-mono text-[10px] border rounded-sm px-2 py-1 disabled:opacity-50"
             style={{ borderColor: "var(--border)", color: "var(--forest)" }}>
             {publishing ? "Publishing…" : "Publish to GitHub"}
           </button>
          )}
          {(status === "complete" || files.length > 0) && (
           <button onClick={downloadProjectZip}
             className="flex items-center gap-1.5 border rounded-sm px-2 py-1 text-[10px] font-mono hover:opacity-80"
             style={{ borderColor: "var(--border)", color: "var(--forest)" }}>
             <Download className="w-3.5 h-3.5" /> Download ZIP
           </button>
          )}
        </div>
      </header>

      <div className="grid grid-cols-12 flex-1 min-h-0">
        {/* LEFT — Chat */}
        <section className="col-span-12 lg:col-span-5 flex flex-col border-r min-h-0"
          style={{ borderColor: "var(--border)" }}>
          <AgentTimeline status={status} />
          <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto p-4 space-y-3" data-testid="conversation-scroll">
            {messages.map((m) => {
              if (m.type === "plan") return <PlanCard key={m.id} data={m.data} busy={status !== "awaiting_approval"} onApprove={approve} onRequestChanges={handleRequestChanges} />;
              if (m.type === "questions") return <QuestionCard key={m.id} data={m.data} locked={status !== "asking"} onSubmit={submitAnswers} />;
              return <ChatMessage key={m.id} m={m} onOpenFile={openFile} />;
            })}
            {isActive && !messages.some(m => m.type === "status" || m.type === "file") && (
              <div className="flex items-center gap-2 font-mono text-[11px] pl-1" style={{ color: "var(--forest)" }}>
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Agents working…
              </div>
            )}
          </div>
          <div className="border-t p-3" style={{ borderColor: "var(--border)", backgroundColor: "var(--parchment)" }}>
            <div className="flex items-end gap-2 border rounded-sm p-2" style={{ backgroundColor: "var(--card)", borderColor: "var(--border)" }}>
              <textarea ref={inputRef} data-testid="builder-input" value={input} onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                placeholder={status === "asking" ? "Or type your answer…" : status === "awaiting_approval" ? "Request changes to the plan…" : "Send an instruction…"}
                rows={2} className="flex-1 resize-none bg-transparent font-mono text-sm outline-none"
                style={{ color: "var(--foreground)" }} />
              <button data-testid="send-btn" onClick={send} disabled={sending || !input.trim()}
                className="text-white rounded-sm p-2 disabled:opacity-40 transition-transform hover:-translate-y-px"
                style={{ backgroundColor: "var(--forest)" }}>
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowUp className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </section>

        {/* RIGHT — Preview / Code */}
        <section className="hidden lg:flex col-span-7 flex-col p-4 min-h-0" style={{ backgroundColor: "var(--sand)" }}>
          <div className="flex-1 flex flex-col border rounded-sm overflow-hidden min-h-0"
            style={{ backgroundColor: "var(--card)", borderColor: "var(--border)" }}>
            {/* Tab bar */}
            <div className="h-10 border-b flex items-center gap-2 px-3 shrink-0"
              style={{ backgroundColor: "var(--sand)", borderColor: "var(--border)" }}>
              <div className="flex items-center gap-1 mr-1">
                <button data-testid="tab-preview-btn" onClick={() => setRightTab("preview")}
                  className="flex items-center gap-1 font-mono text-[11px] px-2 py-1 rounded-sm"
                  style={rightTab === "preview" ? { backgroundColor: "var(--forest)", color: "white" } : { color: "var(--muted-foreground)" }}>
                  <Eye className="w-3.5 h-3.5" /> Preview
                </button>
                <button data-testid="tab-code-btn" onClick={() => setRightTab("code")}
                  className="flex items-center gap-1 font-mono text-[11px] px-2 py-1 rounded-sm"
                  style={rightTab === "code" ? { backgroundColor: "var(--forest)", color: "white" } : { color: "var(--muted-foreground)" }}>
                  <Code2 className="w-3.5 h-3.5" /> Code {files.length ? `(${files.length})` : ""}
                </button>
              </div>
              {rightTab === "preview" && (
                <>
                  <div className="flex-1 flex items-center gap-2 border rounded-sm px-2 py-1 min-w-0"
                    style={{ backgroundColor: "var(--card)", borderColor: "var(--border)" }}>
                    <Globe className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--muted-foreground)" }} />
                    <span data-testid="preview-url" className="font-mono text-[11px] truncate" style={{ color: "var(--muted-foreground)" }}>
                      {project.preview_url || "waiting for sandbox…"}
                    </span>
                  </div>
                  <button data-testid="refresh-preview-btn" onClick={refreshPreview} style={{ color: "var(--muted-foreground)" }} className="hover:opacity-70">
                    <RefreshCw className="w-4 h-4" />
                  </button>
                  <button data-testid="open-preview-tab-btn" onClick={() => project.preview_url && window.open(project.preview_url, "_blank")} disabled={!project.preview_url}
                    className="disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-70" style={{ color: "var(--muted-foreground)" }}>
                    <ExternalLink className="w-4 h-4" />
                  </button>
                  <button data-testid="toggle-logs-btn" onClick={loadLogs}
                    className="hover:opacity-70" style={{ color: showLogs ? "var(--forest)" : "var(--muted-foreground)" }}>
                    <Terminal className="w-4 h-4" />
                  </button>
                </>
              )}
            </div>

            {rightTab === "preview" ? (
              <>
                <div className="flex-1 min-h-0 relative">
                  {isActive ? (
                    <div className="w-full h-full flex flex-col items-center justify-center font-mono text-sm gap-3" style={{ color: "var(--muted-foreground)" }} data-testid="preview-building">
                      <Loader2 className="w-7 h-7 animate-spin" style={{ color: "var(--forest)" }} />
                      <span>Preview is building…</span>
                      <span className="text-[11px]" style={{ color: "var(--muted-foreground)", opacity: 0.6 }}>installing dependencies & starting the sandbox</span>
                    </div>
                  ) : project.preview_url ? (
                    <iframe key={previewKey} data-testid="preview-iframe" title="preview" src={project.preview_url} className="w-full h-full border-0" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center font-mono text-sm" style={{ color: "var(--muted-foreground)" }}>No preview yet. Approve a plan to build.</div>
                  )}
                </div>
                {showLogs && (
                  <pre data-testid="logs-pane" className="h-48 shrink-0 p-3 text-[11px] font-mono overflow-auto whitespace-pre-wrap border-t"
                    style={{ backgroundColor: "var(--ink)", color: "var(--parchment)", borderColor: "var(--border)" }}>
                    {logs || "(no logs loaded)"}
                  </pre>
                )}
              </>
            ) : (
              <div className="flex-1 grid grid-cols-3 min-h-0" data-testid="code-view">
                <div className="col-span-1 border-r overflow-y-auto" style={{ borderColor: "var(--border)", backgroundColor: "color-mix(in srgb, var(--parchment) 40%, transparent)" }}>
                  {files.length === 0 ? (
                    <div className="p-4 font-mono text-[11px]" style={{ color: "var(--muted-foreground)" }}>No files yet.</div>
                  ) : (
                    <FileTree files={files} selectedFile={selectedFile} onSelectFile={setSelectedFile} />
                  )}
                </div>
                <div className="col-span-2 min-h-0 overflow-auto">
                  {currentFile ? (
                    <>
                      <div className="sticky top-0 border-b px-3 py-1.5 font-mono text-[11px]"
                        style={{ backgroundColor: "var(--sand)", borderColor: "var(--border)", color: "var(--foreground)" }}>
                        {currentFile.path}
                      </div>
                      <pre className="p-3 text-[11px] font-mono whitespace-pre-wrap leading-relaxed"
                        style={{ color: "var(--foreground)" }}>
                        {currentFile.content}
                      </pre>
                    </>
                  ) : <div className="p-4 font-mono text-[11px]" style={{ color: "var(--muted-foreground)" }}>Select a file.</div>}
                </div>
              </div>
            )}
          </div>
        </section>
      </div>

      {githubSetupNotice && (
        <div className="fixed bottom-4 left-0 right-0 px-4 z-50">
          <div className="mx-auto max-w-4xl rounded-sm border border-red-200 px-4 py-3 text-left shadow-sm"
            style={{ backgroundColor: "#fce4e4", borderColor: "#f4b5b5" }}>
            <a
              href="/settings"
              onClick={redirectToGithubSettings}
              className="flex items-center gap-3 text-base font-medium transition-opacity hover:opacity-80"
              style={{ color: "#a11c1c" }}
            >
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-xs text-white">!</span>
              <span>Connect GitHub to enable publishing</span>
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

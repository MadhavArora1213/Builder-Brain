import React, { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, ArrowUp, Square, RotateCw, RefreshCw, Terminal, Globe, Loader2, Eye, Code2, FileCode2, ExternalLink, Download } from "lucide-react";
import api from "@/lib/api";
import { ChatMessage, QuestionCard, PlanCard, AgentTimeline } from "@/components/builder/parts";

const ACTIVE = ["building", "testing", "planning"];

const STATUS_STYLE = {
  complete: { backgroundColor: "color-mix(in srgb, var(--moss) 12%, transparent)", color: "var(--moss)" },
  failed: { backgroundColor: "color-mix(in srgb, var(--danger) 12%, transparent)", color: "var(--danger)" },
  idle: { backgroundColor: "color-mix(in srgb, var(--muted-foreground) 8%, transparent)", color: "var(--muted-foreground)" },
};

function statusStyle(status, isActive) {
  if (STATUS_STYLE[status]) return STATUS_STYLE[status];
  if (isActive) return { backgroundColor: "color-mix(in srgb, var(--gold) 12%, transparent)", color: "var(--gold)" };
  return STATUS_STYLE.idle;
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
    if (rightTab !== "code" && !isActive) return;
    fetchFiles();
    const t = setInterval(fetchFiles, 3000);
    return () => clearInterval(t);
  }, [rightTab, isActive, fetchFiles]);

  useEffect(() => {
    const fm = location.state?.firstMessage;
    if (fm && !firstSent.current && project && messages.length === 0) {
      firstSent.current = true;
      doSend(fm);
      window.history.replaceState({}, "");
    }
  }, [location.state, project, messages.length]);

  useEffect(() => {
    const t = setInterval(fetchAll, 3000);
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

  if (!project) return <div className="min-h-screen flex items-center justify-center text-sm" style={{ color: "var(--muted-foreground)" }}>Loading project…</div>;

  const currentFile = files.find((f) => f.path === selectedFile) || files[0];

  return (
    <div className="h-screen flex flex-col" style={{ backgroundColor: "var(--parchment)", color: "var(--ink)" }}>
      {/* Header */}
      <header className="h-14 flex items-center justify-between px-5 shrink-0 backdrop-blur-sm"
        style={{ backgroundColor: "color-mix(in srgb, var(--parchment) 85%, transparent)" }}>
        <div className="flex items-center gap-3 min-w-0">
          <button data-testid="back-home-btn" onClick={() => navigate("/")}
            className="flex h-9 w-9 items-center justify-center rounded-xl transition-all hover:-translate-y-0.5 hover:shadow-md"
            style={{ backgroundColor: "color-mix(in srgb, var(--gold) 10%, transparent)", color: "var(--gold)" }}>
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex flex-col">
            <h1 className="text-[15px] font-semibold truncate leading-tight" style={{ color: "var(--ink)" }}>{project.title}</h1>
            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>{status}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isActive && (
            <button data-testid="stop-btn" onClick={stop}
              className="flex items-center gap-1.5 text-white rounded-full px-4 py-2 text-[13px] font-semibold transition-all hover:-translate-y-0.5 hover:shadow-lg"
              style={{ backgroundColor: "var(--danger)", boxShadow: "0 2px 10px color-mix(in srgb, var(--danger) 25%, transparent)" }}>
              <Square className="w-3.5 h-3.5" /> Stop
            </button>
          )}
          {(status === "failed" || status === "paused" || status === "complete") && (
            <button data-testid="retry-btn" onClick={retry}
              className="flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-semibold transition-all hover:-translate-y-0.5 hover:shadow-md"
              style={{ backgroundColor: "color-mix(in srgb, var(--gold) 12%, transparent)", color: "var(--gold)" }}>
              <RotateCw className="w-3.5 h-3.5" /> Retry
            </button>
          )}
          {status === "complete" && (
            <button onClick={publishToGithub} disabled={publishing}
              className="text-[12px] font-semibold rounded-full px-4 py-2 disabled:opacity-50 transition-all hover:-translate-y-0.5"
              style={{ backgroundColor: "color-mix(in srgb, var(--moss) 12%, transparent)", color: "var(--moss)" }}>
              {publishing ? "Publishing…" : "Publish to GitHub"}
            </button>
          )}
          {(status === "complete" || files.length > 0) && (
            <button onClick={downloadProjectZip}
              className="flex items-center gap-1.5 text-[12px] font-semibold rounded-full px-4 py-2 transition-all hover:-translate-y-0.5"
              style={{ backgroundColor: "color-mix(in srgb, var(--gold) 10%, transparent)", color: "var(--gold)" }}>
              <Download className="w-3.5 h-3.5" /> ZIP
            </button>
          )}
        </div>
      </header>

      <div className="grid grid-cols-12 flex-1 min-h-0">
        {/* LEFT — Chat */}
        <section className="col-span-12 lg:col-span-5 flex flex-col min-h-0">
          <AgentTimeline status={status} />
          <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto px-5 py-4 space-y-3" data-testid="conversation-scroll">
            {messages.map((m) => {
              if (m.type === "plan") return <PlanCard key={m.id} data={m.data} busy={status !== "awaiting_approval"} onApprove={approve} onRequestChanges={handleRequestChanges} />;
              if (m.type === "questions") return <QuestionCard key={m.id} data={m.data} locked={status !== "asking"} onSubmit={submitAnswers} />;
              return <ChatMessage key={m.id} m={m} onOpenFile={openFile} />;
            })}
            {isActive && (
              <div className="flex items-center gap-2.5 text-[12px] pl-1 animate-fade-up" style={{ color: "var(--gold)" }}>
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Agents working…
              </div>
            )}
          </div>
          <div className="px-5 pb-4">
            <div className="flex items-end gap-2 rounded-2xl px-4 py-3 backdrop-blur-[12px] transition-all focus-within:shadow-lg focus-within:ring-2 focus-within:ring-[color:var(--gold)]"
              style={{
                background: "color-mix(in srgb, var(--card) 70%, transparent)",
                boxShadow: "0 2px 12px rgba(0,0,0,0.04)",
                border: "1.5px solid color-mix(in srgb, var(--gold) 25%, transparent)",
              }}>
              <textarea ref={inputRef} data-testid="builder-input" value={input} onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                placeholder={status === "asking" ? "Or type your answer…" : status === "awaiting_approval" ? "Request changes to the plan…" : "Send an instruction…"}
                rows={1} className="flex-1 resize-none bg-transparent text-sm outline-none min-h-[24px] max-h-[120px]"
                style={{ color: "var(--ink)" }} />
              <button data-testid="send-btn" onClick={send} disabled={sending || !input.trim()}
                className="flex h-8 w-8 items-center justify-center rounded-full transition-all hover:-translate-y-0.5 disabled:opacity-30"
                style={{
                  backgroundColor: input.trim() ? "var(--gold)" : "color-mix(in srgb, var(--gold) 20%, transparent)",
                  color: input.trim() ? "white" : "var(--gold)",
                }}>
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowUp className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </section>

        {/* RIGHT — Preview / Code */}
        <section className="hidden lg:flex col-span-7 flex-col p-4 min-h-0">
          <div className="flex-1 flex flex-col rounded-2xl overflow-hidden min-h-0 backdrop-blur-[12px]"
            style={{
              background: "color-mix(in srgb, var(--card) 60%, transparent)",
              boxShadow: "0 2px 16px rgba(0,0,0,0.04)",
            }}>
            {/* Tab bar */}
            <div className="h-12 flex items-center gap-2 px-3 shrink-0"
              style={{ backgroundColor: "color-mix(in srgb, var(--sand) 40%, transparent)" }}>
              <div className="flex items-center gap-1.5">
                <button data-testid="tab-preview-btn" onClick={() => setRightTab("preview")}
                  className="flex items-center gap-1.5 text-[12px] font-semibold px-3.5 py-1.5 rounded-full transition-all"
                  style={rightTab === "preview"
                    ? { backgroundColor: "var(--gold)", color: "white", boxShadow: "0 2px 8px color-mix(in srgb, var(--gold) 25%, transparent)" }
                    : { color: "var(--muted-foreground)" }}>
                  <Eye className="w-3.5 h-3.5" /> Preview
                </button>
                <button data-testid="tab-code-btn" onClick={() => setRightTab("code")}
                  className="flex items-center gap-1.5 text-[12px] font-semibold px-3.5 py-1.5 rounded-full transition-all"
                  style={rightTab === "code"
                    ? { backgroundColor: "var(--gold)", color: "white", boxShadow: "0 2px 8px color-mix(in srgb, var(--gold) 25%, transparent)" }
                    : { color: "var(--muted-foreground)" }}>
                  <Code2 className="w-3.5 h-3.5" /> Code {files.length ? `(${files.length})` : ""}
                </button>
              </div>
              {rightTab === "preview" && (
                <>
                  <div className="flex-1 flex items-center gap-2 rounded-full px-3.5 py-1.5 min-w-0"
                    style={{ backgroundColor: "color-mix(in srgb, var(--parchment) 50%, transparent)" }}>
                    <Globe className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--muted-foreground)" }} />
                    <span data-testid="preview-url" className="text-[12px] truncate" style={{ color: "var(--muted-foreground)" }}>
                      {project.preview_url || "waiting for sandbox…"}
                    </span>
                  </div>
                  <button data-testid="refresh-preview-btn" onClick={refreshPreview}
                    className="flex h-7 w-7 items-center justify-center rounded-full transition-all hover:bg-[color:var(--sand)] hover:-translate-y-0.5"
                    style={{ color: "var(--muted-foreground)" }}>
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                  <button data-testid="open-preview-tab-btn" onClick={() => project.preview_url && window.open(project.preview_url, "_blank")} disabled={!project.preview_url}
                    className="flex h-7 w-7 items-center justify-center rounded-full transition-all hover:bg-[color:var(--sand)] hover:-translate-y-0.5 disabled:opacity-40"
                    style={{ color: "var(--muted-foreground)" }}>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                  <button data-testid="toggle-logs-btn" onClick={loadLogs}
                    className="flex h-7 w-7 items-center justify-center rounded-full transition-all hover:bg-[color:var(--sand)] hover:-translate-y-0.5"
                    style={{ color: showLogs ? "var(--gold)" : "var(--muted-foreground)" }}>
                    <Terminal className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
            </div>

            {rightTab === "preview" ? (
              <>
                <div className="flex-1 min-h-0 relative">
                  {isActive ? (
                    <div className="w-full h-full flex flex-col items-center justify-center text-sm gap-3" style={{ color: "var(--muted-foreground)" }} data-testid="preview-building">
                      <Loader2 className="w-8 h-8 animate-spin" style={{ color: "var(--gold)" }} />
                      <span className="font-medium">Preview is building…</span>
                      <span className="text-[12px]" style={{ opacity: 0.6 }}>installing dependencies & starting the sandbox</span>
                    </div>
                  ) : project.preview_url ? (
                    <iframe key={previewKey} data-testid="preview-iframe" title="preview" src={project.preview_url} className="w-full h-full border-0" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[13px]" style={{ color: "var(--muted-foreground)" }}>No preview yet. Approve a plan to build.</div>
                  )}
                </div>
                {showLogs && (
                  <pre data-testid="logs-pane" className="h-48 shrink-0 p-4 text-[12px] font-mono overflow-auto whitespace-pre-wrap rounded-b-xl"
                    style={{ backgroundColor: "var(--ink)", color: "var(--parchment)" }}>
                    {logs || "(no logs loaded)"}
                  </pre>
                )}
              </>
            ) : (
              <div className="flex-1 grid grid-cols-3 min-h-0" data-testid="code-view">
                <div className="col-span-1 overflow-y-auto rounded-l-xl"
                  style={{ backgroundColor: "color-mix(in srgb, var(--parchment) 40%, transparent)" }}>
                  {files.length === 0 ? (
                    <div className="p-4 text-[12px]" style={{ color: "var(--muted-foreground)" }}>No files yet.</div>
                  ) : (
                    [...files].sort((a, b) => a.path.localeCompare(b.path)).map((f) => (
                      <button key={f.path} data-testid={`file-item-${f.path}`} title={f.path} onClick={() => setSelectedFile(f.path)}
                        className="w-full text-left flex items-center gap-2 px-3 py-2 text-[12px] truncate transition-all"
                        style={currentFile?.path === f.path
                          ? { backgroundColor: "var(--gold)", color: "white" }
                          : { color: "var(--ink)" }}>
                        <FileCode2 className="w-3.5 h-3.5 shrink-0" /> <span className="truncate">{f.path}</span>
                      </button>
                    ))
                  )}
                </div>
                <div className="col-span-2 min-h-0 overflow-auto">
                  {currentFile ? (
                    <>
                      <div className="sticky top-0 px-4 py-2 text-[12px]"
                        style={{ backgroundColor: "color-mix(in srgb, var(--sand) 50%, transparent)", color: "var(--foreground)" }}>
                        {currentFile.path}
                      </div>
                      <pre className="p-4 text-[12px] font-mono whitespace-pre-wrap leading-relaxed"
                        style={{ color: "var(--foreground)" }}>
                        {currentFile.content}
                      </pre>
                    </>
                  ) : <div className="p-4 text-[12px]" style={{ color: "var(--muted-foreground)" }}>Select a file.</div>}
                </div>
              </div>
            )}
          </div>
        </section>
      </div>

      {githubSetupNotice && (
        <div className="fixed bottom-4 left-0 right-0 px-4 z-50">
          <div className="mx-auto max-w-4xl rounded-2xl px-4 py-3 text-left shadow-lg backdrop-blur"
            style={{ backgroundColor: "color-mix(in srgb, var(--danger) 10%, var(--card))", border: "1px solid color-mix(in srgb, var(--danger) 20%, transparent)" }}>
            <a href="/settings" onClick={redirectToGithubSettings}
              className="flex items-center gap-3 text-sm font-medium transition-opacity hover:opacity-80"
              style={{ color: "var(--danger)" }}>
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full text-xs text-white" style={{ backgroundColor: "var(--danger)" }}>!</span>
              <span>Connect GitHub to enable publishing</span>
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

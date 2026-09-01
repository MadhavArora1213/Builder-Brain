import React, { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, ArrowUp, Square, RotateCw, RefreshCw, Terminal, Globe, Loader2, Eye, Code2, FileCode2 } from "lucide-react";
import api from "@/lib/api";
import { ChatMessage, QuestionCard, PlanCard, AgentTimeline } from "@/components/builder/parts";

const ACTIVE = ["building", "testing", "planning"];

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

  // fetch file contents only when the Code tab is open or a build is streaming files
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

  // only auto-scroll when the user is already near the bottom
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

  const openFile = (path) => {
    setRightTab("code");
    setSelectedFile(path);
  };

  if (!project) return <div className="min-h-screen flex items-center justify-center font-mono text-ink/50">Loading project…</div>;

  const currentFile = files.find((f) => f.path === selectedFile) || files[0];

  return (
    <div className="h-screen flex flex-col">
      <header className="h-14 border-b border-[#cecac8] bg-parchment flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <button data-testid="back-home-btn" onClick={() => navigate("/")} className="text-ink/60 hover:text-ink"><ArrowLeft className="w-5 h-5" /></button>
          <h1 className="font-heading text-xl text-ink truncate">{project.title}</h1>
          <span className={`font-mono text-[10px] uppercase px-2 py-0.5 rounded-sm ${status === "complete" ? "bg-moss/15 text-moss" : status === "failed" ? "bg-danger/15 text-danger" : isActive ? "bg-gold/20 text-gold" : "bg-sand text-ink/60"}`}>{status}</span>
        </div>
        <div className="flex items-center gap-2">
          {isActive && <button data-testid="stop-btn" onClick={stop} className="flex items-center gap-1.5 bg-danger text-white rounded-sm px-3 py-1.5 text-sm"><Square className="w-3.5 h-3.5" /> Stop</button>}
          {(status === "failed" || status === "paused" || status === "complete") && <button data-testid="retry-btn" onClick={retry} className="flex items-center gap-1.5 border border-[#cecac8] rounded-sm px-3 py-1.5 text-sm hover:bg-sand"><RotateCw className="w-3.5 h-3.5" /> Retry</button>}
        </div>
      </header>

      <div className="grid grid-cols-12 flex-1 min-h-0">
        {/* LEFT 40% */}
        <section className="col-span-12 lg:col-span-5 flex flex-col border-r border-[#cecac8] min-h-0">
          <AgentTimeline status={status} />
          <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto p-4 space-y-3" data-testid="conversation-scroll">
            {messages.map((m) => {
              if (m.type === "plan") return <PlanCard key={m.id} data={m.data} busy={status !== "awaiting_approval"} onApprove={approve} onRequestChanges={() => inputRef.current?.focus()} />;
              if (m.type === "questions") return <QuestionCard key={m.id} data={m.data} locked={status !== "asking"} onSubmit={submitAnswers} />;
              return <ChatMessage key={m.id} m={m} onOpenFile={openFile} />;
            })}
            {isActive && <div className="flex items-center gap-2 font-mono text-[11px] text-forest pl-1"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Agents working…</div>}
          </div>
          <div className="border-t border-[#cecac8] p-3 bg-parchment">
            <div className="flex items-end gap-2 bg-white border border-[#cecac8] rounded-sm p-2">
              <textarea ref={inputRef} data-testid="builder-input" value={input} onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                placeholder={status === "asking" ? "Or type your answer…" : status === "awaiting_approval" ? "Request changes to the plan…" : "Send an instruction…"}
                rows={2} className="flex-1 resize-none bg-transparent font-mono text-sm outline-none placeholder:text-ink/40" />
              <button data-testid="send-btn" onClick={send} disabled={sending || !input.trim()} className="bg-forest hover:bg-forest-dark text-white rounded-sm p-2 disabled:opacity-40 transition-transform hover:-translate-y-px">
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowUp className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </section>

        {/* RIGHT 60% */}
        <section className="hidden lg:flex col-span-7 flex-col bg-sand p-4 min-h-0">
          <div className="flex-1 flex flex-col bg-white border border-[#cecac8] rounded-sm overflow-hidden min-h-0">
            <div className="h-10 bg-sand border-b border-[#cecac8] flex items-center gap-2 px-3 shrink-0">
              <div className="flex items-center gap-1 mr-1">
                <button data-testid="tab-preview-btn" onClick={() => setRightTab("preview")} className={`flex items-center gap-1 font-mono text-[11px] px-2 py-1 rounded-sm ${rightTab === "preview" ? "bg-forest text-white" : "text-ink/60 hover:bg-white"}`}><Eye className="w-3.5 h-3.5" /> Preview</button>
                <button data-testid="tab-code-btn" onClick={() => setRightTab("code")} className={`flex items-center gap-1 font-mono text-[11px] px-2 py-1 rounded-sm ${rightTab === "code" ? "bg-forest text-white" : "text-ink/60 hover:bg-white"}`}><Code2 className="w-3.5 h-3.5" /> Code {files.length ? `(${files.length})` : ""}</button>
              </div>
              {rightTab === "preview" && (
                <>
                  <div className="flex-1 flex items-center gap-2 bg-white border border-[#cecac8] rounded-sm px-2 py-1 min-w-0">
                    <Globe className="w-3.5 h-3.5 text-ink/40 shrink-0" />
                    <span data-testid="preview-url" className="font-mono text-[11px] text-ink/60 truncate">{project.preview_url || "waiting for sandbox…"}</span>
                  </div>
                  <button data-testid="refresh-preview-btn" onClick={refreshPreview} className="text-ink/50 hover:text-ink"><RefreshCw className="w-4 h-4" /></button>
                  <button data-testid="toggle-logs-btn" onClick={loadLogs} className={`${showLogs ? "text-forest" : "text-ink/50"} hover:text-ink`}><Terminal className="w-4 h-4" /></button>
                </>
              )}
            </div>

            {rightTab === "preview" ? (
              <>
                <div className="flex-1 min-h-0 relative">
                  {isActive ? (
                    <div className="w-full h-full flex flex-col items-center justify-center text-ink/50 font-mono text-sm gap-3" data-testid="preview-building">
                      <Loader2 className="w-7 h-7 animate-spin text-forest" />
                      <span>Preview is building…</span>
                      <span className="text-[11px] text-ink/40">installing dependencies & starting the sandbox</span>
                    </div>
                  ) : project.preview_url ? (
                    <iframe key={previewKey} data-testid="preview-iframe" title="preview" src={project.preview_url} className="w-full h-full border-0" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-ink/40 font-mono text-sm">No preview yet. Approve a plan to build.</div>
                  )}
                </div>
                {showLogs && <pre data-testid="logs-pane" className="h-48 shrink-0 bg-ink text-parchment/90 p-3 text-[11px] font-mono overflow-auto whitespace-pre-wrap border-t border-[#cecac8]">{logs || "(no logs loaded)"}</pre>}
              </>
            ) : (
              <div className="flex-1 grid grid-cols-3 min-h-0" data-testid="code-view">
                <div className="col-span-1 border-r border-[#cecac8] overflow-y-auto bg-parchment/40">
                  {files.length === 0 ? (
                    <div className="p-4 font-mono text-[11px] text-ink/40">No files yet.</div>
                  ) : (
                    [...files].sort((a, b) => a.path.localeCompare(b.path)).map((f) => (
                      <button key={f.path} data-testid={`file-item-${f.path}`} title={f.path} onClick={() => setSelectedFile(f.path)}
                        className={`w-full text-left flex items-center gap-1.5 px-3 py-1.5 font-mono text-[11px] border-b border-[#ece8e4] truncate ${currentFile?.path === f.path ? "bg-forest text-white" : "text-ink/70 hover:bg-sand"}`}>
                        <FileCode2 className="w-3 h-3 shrink-0" /> <span className="truncate">{f.path}</span>
                      </button>
                    ))
                  )}
                </div>
                <div className="col-span-2 min-h-0 overflow-auto">
                  {currentFile ? (
                    <>
                      <div className="sticky top-0 bg-sand border-b border-[#cecac8] px-3 py-1.5 font-mono text-[11px] text-ink/70">{currentFile.path}</div>
                      <pre className="p-3 text-[11px] font-mono text-ink/85 whitespace-pre-wrap leading-relaxed">{currentFile.content}</pre>
                    </>
                  ) : <div className="p-4 font-mono text-[11px] text-ink/40">Select a file.</div>}
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

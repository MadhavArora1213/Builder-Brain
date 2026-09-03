import React, { useState } from "react";
import { toast } from "sonner";
import { Check, HelpCircle, ClipboardList, Bot, Wrench, TestTube2, Compass, FileText, FileCode2, X, Eye } from "lucide-react";

const AGENT_META = {
  manager: { icon: Compass, label: "Manager", colorVar: "var(--gold)" },
  question: { icon: HelpCircle, label: "Question", colorVar: "var(--gold)" },
  planner: { icon: ClipboardList, label: "Planner", colorVar: "var(--gold)" },
  coding: { icon: Wrench, label: "Coding", colorVar: "var(--moss)" },
  testing: { icon: TestTube2, label: "Testing", colorVar: "var(--danger)" },
};

export function tinyMarkdown(text) {
  const lines = (text || "").split("\n");
  return lines.map((ln, i) => {
    if (ln.startsWith("### ")) return <h3 key={i}>{ln.slice(4)}</h3>;
    if (ln.startsWith("## ")) return <h2 key={i}>{ln.slice(3)}</h2>;
    if (ln.startsWith("# ")) return <h1 key={i}>{ln.slice(2)}</h1>;
    if (ln.startsWith("- ") || ln.startsWith("* ")) return <li key={i}>{ln.slice(2)}</li>;
    if (!ln.trim()) return <br key={i} />;
    return <p key={i}>{ln.replace(/\*\*(.+?)\*\*/g, "$1")}</p>;
  });
}

export function ChatMessage({ m, onOpenFile }) {
  if (m.role === "user") {
    return (
      <div className="flex justify-end animate-fade-up" data-testid="chat-message-user">
        <div className="max-w-[85%] text-white rounded-2xl rounded-br-md px-4 py-2.5 text-[13px] leading-relaxed"
          style={{ backgroundColor: "var(--gold)", boxShadow: "0 2px 8px color-mix(in srgb, var(--gold) 20%, transparent)" }}>{m.content}</div>
      </div>
    );
  }

  const meta = AGENT_META[m.agent] || { icon: Bot, label: "Agent", colorVar: "var(--muted-foreground)" };
  const Icon = meta.icon;

  if (m.type === "file") {
    return (
      <button data-testid="chat-file" onClick={() => onOpenFile?.(m.data?.path)}
        className="flex items-center gap-2 text-[12px] font-medium hover:opacity-70 pl-1 animate-fade-up group"
        style={{ color: "var(--moss)" }}>
        <FileCode2 className="w-3.5 h-3.5" />
        <span className="underline decoration-dotted group-hover:decoration-solid">{m.content}</span>
      </button>
    );
  }

  if (m.type === "status") {
    return (
      <div className="flex items-center gap-2 text-[12px] pl-1 animate-fade-up" data-testid="chat-status"
        style={{ color: "var(--muted-foreground)" }}>
        <Icon className="w-3.5 h-3.5" style={{ color: meta.colorVar }} />
        <span>{m.content}</span>
      </div>
    );
  }

  if (m.type === "log") {
    return (
      <pre data-testid="chat-log" className="rounded-xl p-4 text-[12px] font-mono overflow-x-auto whitespace-pre-wrap max-h-52 overflow-y-auto animate-fade-up"
        style={{ backgroundColor: "var(--ink)", color: "var(--parchment)" }}>{m.content}</pre>
    );
  }

  if (m.type === "prd") {
    return (
      <div data-testid="chat-prd" className="rounded-2xl p-5 animate-fade-up"
        style={{ backgroundColor: "color-mix(in srgb, var(--gold) 6%, transparent)" }}>
        <div className="flex items-center gap-2.5 mb-3 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--gold)" }}>
          <div className="flex h-6 w-6 items-center justify-center rounded-full"
            style={{ backgroundColor: "color-mix(in srgb, var(--gold) 15%, transparent)" }}>
            <FileText className="w-3.5 h-3.5" />
          </div>
          Product Requirements
        </div>
        <div className="md-body text-[13px] leading-relaxed" style={{ color: "var(--foreground)" }}>{tinyMarkdown(m.content)}</div>
      </div>
    );
  }

  const fileChips = m.data?.files;
  return (
    <div className="flex gap-3 animate-fade-up" data-testid="chat-message-agent">
      <div className="w-7 h-7 shrink-0 rounded-full flex items-center justify-center mt-0.5"
        style={{ backgroundColor: "color-mix(in srgb, var(--gold) 12%, transparent)" }}>
        <Icon className="w-3.5 h-3.5" style={{ color: meta.colorVar }} />
      </div>
      <div className="max-w-[85%]">
        <div className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--muted-foreground)" }}>{meta.label}</div>
        <div className="rounded-2xl rounded-tl-md px-4 py-3 text-[13px] leading-relaxed"
          style={{ backgroundColor: "color-mix(in srgb, var(--card) 70%, transparent)", color: "var(--foreground)" }}>{m.content}</div>
        {Array.isArray(fileChips) && fileChips.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {fileChips.map((f, i) => (
              <button key={i} data-testid="file-chip" onClick={() => onOpenFile?.(f)}
                className="flex items-center gap-1.5 text-[11px] font-medium px-3 py-1 rounded-full transition-all hover:-translate-y-0.5"
                style={{ backgroundColor: "color-mix(in srgb, var(--gold) 10%, transparent)", color: "var(--gold)" }}>
                <FileCode2 className="w-3 h-3" /> {f}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function QuestionCard({ data, onSubmit, locked }) {
  const qs = data?.questions || [];
  const [ans, setAns] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const set = (i, v) => setAns((a) => ({ ...a, [i]: v }));

  const submit = async () => {
    const missing = qs.some((q, i) => q.required && !String(ans[i] ?? "").trim());
    if (missing) { toast.error("Please answer the required questions (marked *)"); return; }
    const payload = qs.map((q, i) => ({ key: q.key, question: q.question, type: q.type, value: ans[i] ?? "" }));
    setSubmitting(true);
    try { await onSubmit?.(payload); } finally { setSubmitting(false); }
  };

  return (
    <div className="rounded-2xl p-6 animate-fade-up" data-testid="question-card"
      style={{ backgroundColor: "color-mix(in srgb, var(--gold) 6%, transparent)" }}>
      <div className="flex items-center gap-2.5 mb-5 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--gold)" }}>
        <div className="flex h-6 w-6 items-center justify-center rounded-full"
          style={{ backgroundColor: "color-mix(in srgb, var(--gold) 15%, transparent)" }}>
          <HelpCircle className="w-3.5 h-3.5" />
        </div>
        A few questions
      </div>
      <div className="space-y-5">
        {qs.map((q, i) => (
          <div key={i}>
            <div className="text-[13px] font-medium mb-2" style={{ color: "var(--foreground)" }}>
              {q.question}{q.required ? <span style={{ color: "var(--danger)" }}> *</span> : <span style={{ color: "var(--muted-foreground)" }}> (optional)</span>}
            </div>
            {q.type === "choice" ? (
              <div className="flex flex-wrap gap-2">
                {(q.options || ["Yes", "No"]).map((opt) => (
                  <button key={opt} disabled={locked} data-testid={`q-opt-${i}`} onClick={() => set(i, opt)}
                    className="text-[13px] font-medium px-4 py-2 rounded-xl transition-all hover:-translate-y-0.5"
                    style={ans[i] === opt
                      ? { backgroundColor: "var(--gold)", color: "white", boxShadow: "0 2px 8px color-mix(in srgb, var(--gold) 30%, transparent)" }
                      : { backgroundColor: "var(--sand)", color: "var(--foreground)", boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }}>
                    {opt}
                  </button>
                ))}
              </div>
            ) : (
              <input disabled={locked} type={q.type === "secret" ? "password" : "text"} value={ans[i] ?? ""}
                onChange={(e) => set(i, e.target.value)} data-testid={`q-input-${i}`}
                placeholder={q.type === "secret" ? "Paste your API key (stored securely)" : "Type your answer"}
                className="w-full rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[color:var(--gold)] transition-shadow"
                style={{
                  backgroundColor: "color-mix(in srgb, var(--card) 80%, transparent)",
                  color: "var(--foreground)",
                }} />
            )}
          </div>
        ))}
      </div>
      {!locked && (
        <button data-testid="submit-answers-btn" onClick={submit} disabled={submitting}
          className="mt-6 text-white rounded-full px-6 py-2.5 text-sm font-semibold transition-all hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-50"
          style={{ backgroundColor: "var(--gold)", boxShadow: "0 2px 10px color-mix(in srgb, var(--gold) 25%, transparent)" }}>
          {submitting ? "Submitting…" : "Submit Answers"}
        </button>
      )}
    </div>
  );
}

export function PlanCard({ data, onApprove, onRequestChanges, busy }) {
  const plan = data?.plan || {};
  const todo = data?.todo || [];
  const [showChangesModal, setShowChangesModal] = useState(false);
  const [changesText, setChangesText] = useState("");
  const [submittingChanges, setSubmittingChanges] = useState(false);

  const handleRequestChanges = async () => {
    if (!changesText.trim()) {
      toast.error("Please describe the changes you want");
      return;
    }
    setSubmittingChanges(true);
    const text = changesText.trim();
    setShowChangesModal(false);
    setChangesText("");
    try {
      await onRequestChanges(text);
    } catch {
      toast.error("Failed to request changes");
    } finally {
      setSubmittingChanges(false);
    }
  };

  return (
    <>
      <div className="rounded-2xl p-6 animate-fade-up" data-testid="plan-card"
        style={{ backgroundColor: "color-mix(in srgb, var(--gold) 6%, transparent)" }}>
        <div className="flex items-center gap-2.5 mb-3 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--gold)" }}>
          <div className="flex h-6 w-6 items-center justify-center rounded-full"
            style={{ backgroundColor: "color-mix(in srgb, var(--gold) 15%, transparent)" }}>
            <ClipboardList className="w-3.5 h-3.5" />
          </div>
          Implementation Plan
        </div>
        <h3 className="text-lg font-semibold mb-2" style={{ color: "var(--ink)" }}>{plan.goal}</h3>
        {plan.technology?.length > 0 && (
          <div className="flex flex-wrap gap-1.5 my-3">
            {plan.technology.map((t, i) => (
              <span key={i} className="text-[11px] font-medium px-3 py-1 rounded-full"
                style={{ backgroundColor: "color-mix(in srgb, var(--gold) 12%, transparent)", color: "var(--gold)" }}>{t}</span>
            ))}
          </div>
        )}
        <ul className="space-y-2.5 my-4">
          {todo.map((t, i) => (
            <li key={i} className="flex items-start gap-2.5 text-[13px]" style={{ color: "var(--foreground)" }}>
              <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full mt-0.5"
                style={{ backgroundColor: "color-mix(in srgb, var(--moss) 12%, transparent)" }}>
                <Check className="w-3 h-3" style={{ color: "var(--moss)" }} />
              </div>
              <span>{t.title}</span>
            </li>
          ))}
        </ul>
        {data?.auto ? (
          <p className="text-[11px]" style={{ color: "var(--muted-foreground)" }}>Auto-approved modification — building now.</p>
        ) : (
          <div className="flex gap-2.5 mt-5">
            <button data-testid="approve-build-btn" onClick={onApprove} disabled={busy}
              className="text-white rounded-full px-6 py-2.5 text-sm font-semibold transition-all hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-50"
              style={{ backgroundColor: "var(--gold)", boxShadow: "0 2px 10px color-mix(in srgb, var(--gold) 25%, transparent)" }}>Approve & Build</button>
            <button data-testid="request-changes-btn" onClick={() => setShowChangesModal(true)} disabled={busy}
              className="rounded-full px-5 py-2.5 text-sm font-medium transition-all hover:-translate-y-0.5"
              style={{ backgroundColor: "color-mix(in srgb, var(--muted-foreground) 10%, transparent)", color: "var(--muted-foreground)" }}>Request Changes</button>
          </div>
        )}
      </div>

      {showChangesModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" data-testid="request-changes-modal">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => !submittingChanges && setShowChangesModal(false)} />
          <div className="relative rounded-2xl shadow-2xl w-full max-w-lg mx-4 p-0 overflow-hidden"
            style={{ backgroundColor: "var(--card)" }}>
            <div className="flex items-center justify-between px-6 py-4"
              style={{ backgroundColor: "color-mix(in srgb, var(--sand) 50%, transparent)" }}>
              <h3 className="text-base font-semibold" style={{ color: "var(--ink)" }}>Request Changes</h3>
              <button onClick={() => !submittingChanges && setShowChangesModal(false)}
                className="flex h-7 w-7 items-center justify-center rounded-full transition-colors hover:bg-[color:var(--sand)]"
                style={{ color: "var(--muted-foreground)" }}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6">
              <p className="text-sm mb-4 leading-relaxed" style={{ color: "var(--muted-foreground)" }}>
                Describe what you'd like to change in the plan. The planner will regenerate a new plan based on your feedback.
              </p>
              <textarea
                data-testid="changes-input"
                value={changesText}
                onChange={(e) => setChangesText(e.target.value)}
                placeholder="e.g. Add user authentication, change the color scheme to dark mode…"
                rows={4}
                className="w-full rounded-xl px-4 py-3 text-sm resize-none outline-none focus:ring-2 focus:ring-[color:var(--gold)] transition-shadow"
                style={{
                  backgroundColor: "color-mix(in srgb, var(--parchment) 60%, transparent)",
                  color: "var(--ink)",
                }}
              />
              <div className="flex justify-end gap-2.5 mt-5">
                <button onClick={() => !submittingChanges && setShowChangesModal(false)}
                  disabled={submittingChanges}
                  className="rounded-full px-5 py-2.5 text-sm font-medium transition-colors hover:bg-[color:var(--sand)] disabled:opacity-50"
                  style={{ color: "var(--muted-foreground)" }}>
                  Cancel
                </button>
                <button
                  data-testid="submit-changes-btn"
                  onClick={handleRequestChanges}
                  disabled={submittingChanges || !changesText.trim()}
                  className="text-white rounded-full px-6 py-2.5 text-sm font-semibold transition-all hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-50"
                  style={{ backgroundColor: "var(--gold)", boxShadow: "0 2px 10px color-mix(in srgb, var(--gold) 25%, transparent)" }}>
                  {submittingChanges ? "Submitting…" : "Submit Changes"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function AgentTimeline({ status }) {
  const steps = [
    { key: "manager", label: "Manager", icon: Compass, states: ["planning", "asking"] },
    { key: "planner", label: "Planner", icon: ClipboardList, states: ["planning", "awaiting_approval"] },
    { key: "coding", label: "Coding", icon: Wrench, states: ["building"] },
    { key: "testing", label: "Testing", icon: TestTube2, states: ["testing"] },
    { key: "done", label: "Preview", icon: Eye, states: ["complete"] },
  ];
  const order = ["asking", "planning", "awaiting_approval", "building", "testing", "complete"];
  const idx = order.indexOf(status);

  return (
    <div className="px-5 pt-4 pb-2" data-testid="agent-timeline">
      <div className="flex items-center gap-0">
        {steps.map((s, i) => {
          const active = s.states.includes(status);
          const done = idx > order.indexOf(s.states[s.states.length - 1]);
          const Icon = s.icon;
          return (
            <React.Fragment key={s.key}>
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl transition-all"
                style={active
                  ? { backgroundColor: "var(--gold)", color: "white", boxShadow: "0 2px 10px color-mix(in srgb, var(--gold) 30%, transparent)" }
                  : done
                    ? { backgroundColor: "color-mix(in srgb, var(--moss) 10%, transparent)", color: "var(--moss)" }
                    : { backgroundColor: "color-mix(in srgb, var(--muted-foreground) 6%, transparent)", color: "var(--muted-foreground)" }}>
                <Icon className="w-3.5 h-3.5" />
                <span className="text-[11px] font-semibold whitespace-nowrap">{s.label}</span>
                {done && <Check className="w-3 h-3" />}
              </div>
              {i < steps.length - 1 && (
                <div className="w-6 h-px mx-0.5" style={{
                  background: done
                    ? "var(--moss)"
                    : active
                      ? "linear-gradient(90deg, var(--gold), color-mix(in srgb, var(--gold) 30%, transparent))"
                      : "color-mix(in srgb, var(--muted-foreground) 15%, transparent)"
                }} />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

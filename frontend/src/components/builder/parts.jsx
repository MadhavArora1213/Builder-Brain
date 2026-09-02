import React, { useState } from "react";
import { toast } from "sonner";
import { Check, HelpCircle, ClipboardList, Bot, Wrench, TestTube2, Compass, FileText, FileCode2, X } from "lucide-react";

const AGENT_META = {
  manager: { icon: Compass, label: "Manager", colorVar: "var(--forest)" },
  question: { icon: HelpCircle, label: "Question", colorVar: "var(--gold)" },
  planner: { icon: ClipboardList, label: "Planner", colorVar: "var(--forest)" },
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
        <div className="max-w-[85%] text-white rounded-sm px-3.5 py-2.5 text-sm font-mono whitespace-pre-wrap"
          style={{ backgroundColor: "var(--forest)" }}>{m.content}</div>
      </div>
    );
  }

  const meta = AGENT_META[m.agent] || { icon: Bot, label: "Agent", colorVar: "var(--muted-foreground)" };
  const Icon = meta.icon;

  if (m.type === "file") {
    return (
      <button data-testid="chat-file" onClick={() => onOpenFile?.(m.data?.path)}
        className="flex items-center gap-2 font-mono text-[11px] hover:opacity-70 pl-1 animate-fade-up group"
        style={{ color: "var(--moss)" }}>
        <FileCode2 className="w-3.5 h-3.5" />
        <span className="underline decoration-dotted group-hover:decoration-solid">{m.content}</span>
      </button>
    );
  }

  if (m.type === "status") {
    return (
      <div className="flex items-center gap-2 font-mono text-[11px] pl-1 animate-fade-up" data-testid="chat-status"
        style={{ color: "var(--muted-foreground)" }}>
        <Icon className="w-3.5 h-3.5" style={{ color: meta.colorVar }} />
        <span>{m.content}</span>
      </div>
    );
  }

  if (m.type === "log") {
    return (
      <pre data-testid="chat-log" className="rounded-sm p-3 text-[11px] font-mono overflow-x-auto whitespace-pre-wrap max-h-52 overflow-y-auto animate-fade-up"
        style={{ backgroundColor: "var(--ink)", color: "var(--parchment)" }}>{m.content}</pre>
    );
  }

  if (m.type === "prd") {
    return (
      <div data-testid="chat-prd" className="border rounded-sm p-4 animate-fade-up"
        style={{ backgroundColor: "var(--card)", borderColor: "var(--border)" }}>
        <div className="flex items-center gap-2 mb-2 font-mono text-xs uppercase tracking-wide" style={{ color: "var(--forest)" }}>
          <FileText className="w-4 h-4" /> Product Requirements
        </div>
        <div className="md-body text-sm" style={{ color: "var(--foreground)" }}>{tinyMarkdown(m.content)}</div>
      </div>
    );
  }

  const fileChips = m.data?.files;
  return (
    <div className="flex gap-2 animate-fade-up" data-testid="chat-message-agent">
      <div className="w-6 h-6 shrink-0 rounded-sm flex items-center justify-center mt-0.5"
        style={{ backgroundColor: "var(--sand)" }}>
        <Icon className="w-3.5 h-3.5" style={{ color: meta.colorVar }} />
      </div>
      <div className="max-w-[85%]">
        <div className="font-mono text-[10px] uppercase tracking-wide mb-0.5" style={{ color: "var(--muted-foreground)" }}>{meta.label}</div>
        <div className="border rounded-sm px-3.5 py-2.5 text-sm font-mono"
          style={{ backgroundColor: "var(--card)", borderColor: "var(--border)", color: "var(--foreground)" }}>{m.content}</div>
        {Array.isArray(fileChips) && fileChips.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {fileChips.map((f, i) => (
              <button key={i} data-testid="file-chip" onClick={() => onOpenFile?.(f)}
                className="flex items-center gap-1 font-mono text-[10px] px-2 py-0.5 rounded-sm transition-colors"
                style={{ backgroundColor: "var(--sand)", color: "var(--foreground)" }}>
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
    <div className="border rounded-sm p-4 animate-fade-up" data-testid="question-card"
      style={{ backgroundColor: "var(--card)", borderColor: "color-mix(in srgb, var(--gold) 40%, var(--border))" }}>
      <div className="flex items-center gap-2 mb-3 font-mono text-xs uppercase tracking-wide" style={{ color: "var(--gold)" }}>
        <HelpCircle className="w-4 h-4" /> A few questions
      </div>
      <div className="space-y-4">
        {qs.map((q, i) => (
          <div key={i}>
            <div className="text-sm mb-1.5" style={{ color: "var(--foreground)" }}>
              {q.question}{q.required ? <span style={{ color: "var(--danger)" }}> *</span> : <span style={{ color: "var(--muted-foreground)" }}> (optional)</span>}
            </div>
            {q.type === "choice" ? (
              <div className="flex flex-wrap gap-1.5">
                {(q.options || ["Yes", "No"]).map((opt) => (
                  <button key={opt} disabled={locked} data-testid={`q-opt-${i}`} onClick={() => set(i, opt)}
                    className="font-mono text-xs px-3 py-1.5 rounded-sm border transition-colors"
                    style={ans[i] === opt
                      ? { backgroundColor: "var(--forest)", color: "white", borderColor: "var(--forest)" }
                      : { backgroundColor: "var(--card)", borderColor: "var(--border)", color: "var(--foreground)" }}>
                    {opt}
                  </button>
                ))}
              </div>
            ) : (
              <input disabled={locked} type={q.type === "secret" ? "password" : "text"} value={ans[i] ?? ""}
                onChange={(e) => set(i, e.target.value)} data-testid={`q-input-${i}`}
                placeholder={q.type === "secret" ? "Paste your API key (stored securely)" : "Type your answer"}
                className="w-full border rounded-sm px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2"
                style={{ backgroundColor: "var(--card)", borderColor: "var(--border)", color: "var(--foreground)" }} />
            )}
          </div>
        ))}
      </div>
      {!locked && (
        <button data-testid="submit-answers-btn" onClick={submit} disabled={submitting}
          className="mt-4 text-white rounded-sm px-4 py-2 text-sm font-medium transition-transform hover:-translate-y-px disabled:opacity-50"
          style={{ backgroundColor: "var(--forest)" }}>
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
      <div className="border rounded-sm p-4 animate-fade-up" data-testid="plan-card"
        style={{ backgroundColor: "var(--card)", borderColor: "color-mix(in srgb, var(--forest) 30%, var(--border))" }}>
        <div className="flex items-center gap-2 mb-1 font-mono text-xs uppercase tracking-wide" style={{ color: "var(--forest)" }}>
          <ClipboardList className="w-4 h-4" /> Implementation Plan
        </div>
        <h3 className="font-heading text-xl mb-1" style={{ color: "var(--ink)" }}>{plan.goal}</h3>
        {plan.technology?.length > 0 && (
          <div className="flex flex-wrap gap-1.5 my-2">
            {plan.technology.map((t, i) => (
              <span key={i} className="font-mono text-[10px] px-2 py-0.5 rounded-sm"
                style={{ backgroundColor: "var(--sand)", color: "var(--foreground)" }}>{t}</span>
            ))}
          </div>
        )}
        <ul className="space-y-1.5 my-3">
          {todo.map((t, i) => (
            <li key={i} className="flex items-start gap-2 text-sm" style={{ color: "var(--foreground)" }}>
              <Check className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "var(--moss)" }} /> <span>{t.title}</span>
            </li>
          ))}
        </ul>
        {data?.auto ? (
          <p className="font-mono text-[11px]" style={{ color: "var(--muted-foreground)" }}>Auto-approved modification — building now.</p>
        ) : (
          <div className="flex gap-2 mt-3">
            <button data-testid="approve-build-btn" onClick={onApprove} disabled={busy}
              className="text-white rounded-sm px-4 py-2 text-sm font-medium transition-transform hover:-translate-y-px disabled:opacity-50"
              style={{ backgroundColor: "var(--forest)" }}>Approve & Build</button>
            <button data-testid="request-changes-btn" onClick={() => setShowChangesModal(true)} disabled={busy}
              className="border rounded-sm px-4 py-2 text-sm transition-colors hover:opacity-80"
              style={{ borderColor: "var(--border)", color: "var(--foreground)" }}>Request Changes</button>
          </div>
        )}
      </div>

      {showChangesModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" data-testid="request-changes-modal">
          <div className="absolute inset-0 bg-black/50" onClick={() => !submittingChanges && setShowChangesModal(false)} />
          <div className="relative border rounded-sm shadow-lg w-full max-w-lg mx-4 p-0"
            style={{ backgroundColor: "#ffffff", borderColor: "var(--border)" }}>
            <div className="flex items-center justify-between px-4 py-3 border-b"
              style={{ borderColor: "var(--border)", backgroundColor: "#ffffff" }}>
              <h3 className="font-heading text-lg" style={{ color: "var(--ink)" }}>Request Changes</h3>
              <button onClick={() => !submittingChanges && setShowChangesModal(false)}
                style={{ color: "var(--muted-foreground)" }} className="hover:opacity-70">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4" style={{ backgroundColor: "#ffffff" }}>
              <p className="text-sm mb-3" style={{ color: "var(--muted-foreground)" }}>
                Describe what you'd like to change in the plan. The planner will regenerate a new plan based on your feedback.
              </p>
              <textarea
                data-testid="changes-input"
                value={changesText}
                onChange={(e) => setChangesText(e.target.value)}
                placeholder="e.g. Add user authentication, change the color scheme to dark mode, use PostgreSQL instead of SQLite..."
                rows={5}
                className="w-full border rounded-sm px-3 py-2 text-sm font-mono resize-none focus:outline-none focus:ring-2"
                style={{ backgroundColor: "#fff", borderColor: "var(--border)", color: "var(--ink)" }}
              />
              <div className="flex justify-end gap-2 mt-4">
                <button onClick={() => !submittingChanges && setShowChangesModal(false)}
                  disabled={submittingChanges}
                  className="border rounded-sm px-4 py-2 text-sm transition-colors hover:opacity-80 disabled:opacity-50"
                  style={{ borderColor: "var(--border)", color: "var(--foreground)" }}>
                  Cancel
                </button>
                <button
                  data-testid="submit-changes-btn"
                  onClick={handleRequestChanges}
                  disabled={submittingChanges || !changesText.trim()}
                  className="text-white rounded-sm px-4 py-2 text-sm font-medium transition-transform hover:-translate-y-px disabled:opacity-50"
                  style={{ backgroundColor: "var(--forest)" }}>
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
    { key: "manager", label: "Manager", states: ["planning", "asking"] },
    { key: "planner", label: "Planner", states: ["planning", "awaiting_approval"] },
    { key: "coding", label: "Coding", states: ["building"] },
    { key: "testing", label: "Testing", states: ["testing"] },
    { key: "done", label: "Preview", states: ["complete"] },
  ];
  const order = ["asking", "planning", "awaiting_approval", "building", "testing", "complete"];
  const idx = order.indexOf(status);
  return (
    <div className="flex items-center gap-1 px-4 py-2 border-b overflow-x-auto"
      data-testid="agent-timeline"
      style={{ borderColor: "var(--border)", backgroundColor: "color-mix(in srgb, var(--parchment) 60%, transparent)" }}>
      {steps.map((s, i) => {
        const active = s.states.includes(status);
        const done = idx > order.indexOf(s.states[s.states.length - 1]);
        return (
          <React.Fragment key={s.key}>
            <div className="font-mono text-[10px] uppercase px-2 py-1 rounded-sm border whitespace-nowrap"
              style={active
                ? { borderColor: "var(--gold)", color: "var(--forest)", backgroundColor: "var(--card)" }
                : done
                  ? { borderColor: "color-mix(in srgb, var(--moss) 30%, transparent)", color: "var(--moss)" }
                  : { borderColor: "var(--border)", color: "var(--muted-foreground)" }}>
              {s.label}
            </div>
            {i < steps.length - 1 && <div className="w-3 h-px" style={{ backgroundColor: "var(--border)" }} />}
          </React.Fragment>
        );
      })}
    </div>
  );
}

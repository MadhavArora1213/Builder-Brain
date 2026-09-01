import React, { useState } from "react";
import { toast } from "sonner";
import { Check, HelpCircle, ClipboardList, Bot, Wrench, TestTube2, Compass, FileText, FileCode2 } from "lucide-react";

const AGENT_META = {
  manager: { icon: Compass, label: "Manager", color: "#2a433d" },
  question: { icon: HelpCircle, label: "Question", color: "#9c8152" },
  planner: { icon: ClipboardList, label: "Planner", color: "#2a433d" },
  coding: { icon: Wrench, label: "Coding", color: "#4b6c56" },
  testing: { icon: TestTube2, label: "Testing", color: "#b34d3e" },
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
        <div className="max-w-[85%] bg-forest text-white rounded-sm px-3.5 py-2.5 text-sm font-mono whitespace-pre-wrap">{m.content}</div>
      </div>
    );
  }

  const meta = AGENT_META[m.agent] || { icon: Bot, label: "Agent", color: "#57534e" };
  const Icon = meta.icon;

  if (m.type === "file") {
    return (
      <button data-testid="chat-file" onClick={() => onOpenFile?.(m.data?.path)}
        className="flex items-center gap-2 font-mono text-[11px] text-moss hover:text-forest pl-1 animate-fade-up group">
        <FileCode2 className="w-3.5 h-3.5" />
        <span className="underline decoration-dotted group-hover:decoration-solid">{m.content}</span>
      </button>
    );
  }

  if (m.type === "status") {
    return (
      <div className="flex items-center gap-2 font-mono text-[11px] text-ink/50 pl-1 animate-fade-up" data-testid="chat-status">
        <Icon className="w-3.5 h-3.5" style={{ color: meta.color }} />
        <span>{m.content}</span>
      </div>
    );
  }

  if (m.type === "log") {
    return (
      <pre data-testid="chat-log" className="bg-ink text-parchment/90 rounded-sm p-3 text-[11px] font-mono overflow-x-auto whitespace-pre-wrap max-h-52 overflow-y-auto animate-fade-up">{m.content}</pre>
    );
  }

  if (m.type === "prd") {
    return (
      <div data-testid="chat-prd" className="bg-white border border-[#cecac8] rounded-sm p-4 animate-fade-up">
        <div className="flex items-center gap-2 mb-2 text-forest font-mono text-xs uppercase tracking-wide"><FileText className="w-4 h-4" /> Product Requirements</div>
        <div className="md-body text-sm text-ink/80">{tinyMarkdown(m.content)}</div>
      </div>
    );
  }

  const fileChips = m.data?.files;
  return (
    <div className="flex gap-2 animate-fade-up" data-testid="chat-message-agent">
      <div className="w-6 h-6 shrink-0 rounded-sm bg-sand flex items-center justify-center mt-0.5">
        <Icon className="w-3.5 h-3.5" style={{ color: meta.color }} />
      </div>
      <div className="max-w-[85%]">
        <div className="font-mono text-[10px] uppercase tracking-wide text-ink/40 mb-0.5">{meta.label}</div>
        <div className="bg-white border border-[#cecac8] rounded-sm px-3.5 py-2.5 text-sm text-ink/90 font-mono">{m.content}</div>
        {Array.isArray(fileChips) && fileChips.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {fileChips.map((f, i) => (
              <button key={i} data-testid="file-chip" onClick={() => onOpenFile?.(f)}
                className="flex items-center gap-1 font-mono text-[10px] bg-sand hover:bg-forest hover:text-white px-2 py-0.5 rounded-sm text-ink/70 transition-colors">
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
    <div className="bg-white border border-gold/40 rounded-sm p-4 animate-fade-up" data-testid="question-card">
      <div className="flex items-center gap-2 mb-3 text-gold font-mono text-xs uppercase tracking-wide">
        <HelpCircle className="w-4 h-4" /> A few questions
      </div>
      <div className="space-y-4">
        {qs.map((q, i) => (
          <div key={i}>
            <div className="text-sm text-ink/90 mb-1.5">
              {q.question}{q.required ? <span className="text-danger"> *</span> : <span className="text-ink/40"> (optional)</span>}
            </div>
            {q.type === "choice" ? (
              <div className="flex flex-wrap gap-1.5">
                {(q.options || ["Yes", "No"]).map((opt) => (
                  <button key={opt} disabled={locked} data-testid={`q-opt-${i}`} onClick={() => set(i, opt)}
                    className={`font-mono text-xs px-3 py-1.5 rounded-sm border transition-colors ${ans[i] === opt ? "bg-forest text-white border-forest" : "bg-white border-[#cecac8] hover:bg-sand text-ink/80"}`}>
                    {opt}
                  </button>
                ))}
              </div>
            ) : (
              <input disabled={locked} type={q.type === "secret" ? "password" : "text"} value={ans[i] ?? ""}
                onChange={(e) => set(i, e.target.value)} data-testid={`q-input-${i}`}
                placeholder={q.type === "secret" ? "Paste your API key (stored securely)" : "Type your answer"}
                className="w-full bg-white border border-[#cecac8] rounded-sm px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-forest" />
            )}
          </div>
        ))}
      </div>
      {!locked && (
        <button data-testid="submit-answers-btn" onClick={submit} disabled={submitting}
          className="mt-4 bg-forest hover:bg-forest-dark text-white rounded-sm px-4 py-2 text-sm font-medium transition-transform hover:-translate-y-px disabled:opacity-50">
          {submitting ? "Submitting…" : "Submit Answers"}
        </button>
      )}
    </div>
  );
}

export function PlanCard({ data, onApprove, onRequestChanges, busy }) {
  const plan = data?.plan || {};
  const todo = data?.todo || [];
  return (
    <div className="bg-white border border-forest/30 rounded-sm p-4 animate-fade-up" data-testid="plan-card">
      <div className="flex items-center gap-2 mb-1 text-forest font-mono text-xs uppercase tracking-wide">
        <ClipboardList className="w-4 h-4" /> Implementation Plan
      </div>
      <h3 className="font-heading text-xl text-ink mb-1">{plan.goal}</h3>
      {plan.technology?.length > 0 && (
        <div className="flex flex-wrap gap-1.5 my-2">
          {plan.technology.map((t, i) => <span key={i} className="font-mono text-[10px] bg-sand px-2 py-0.5 rounded-sm text-ink/70">{t}</span>)}
        </div>
      )}
      <ul className="space-y-1.5 my-3">
        {todo.map((t, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-ink/80">
            <Check className="w-4 h-4 text-moss shrink-0 mt-0.5" /> <span>{t.title}</span>
          </li>
        ))}
      </ul>
      {data?.auto ? (
        <p className="font-mono text-[11px] text-ink/40">Auto-approved modification — building now.</p>
      ) : (
        <div className="flex gap-2 mt-3">
          <button data-testid="approve-build-btn" onClick={onApprove} disabled={busy}
            className="bg-forest hover:bg-forest-dark text-white rounded-sm px-4 py-2 text-sm font-medium transition-transform hover:-translate-y-px disabled:opacity-50">Approve & Build</button>
          <button data-testid="request-changes-btn" onClick={onRequestChanges} disabled={busy}
            className="border border-[#cecac8] rounded-sm px-4 py-2 text-sm hover:bg-sand transition-colors">Request Changes</button>
        </div>
      )}
    </div>
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
    <div className="flex items-center gap-1 px-4 py-2 border-b border-[#cecac8] bg-parchment/60 overflow-x-auto" data-testid="agent-timeline">
      {steps.map((s, i) => {
        const active = s.states.includes(status);
        const done = idx > order.indexOf(s.states[s.states.length - 1]);
        return (
          <React.Fragment key={s.key}>
            <div className={`font-mono text-[10px] uppercase px-2 py-1 rounded-sm border whitespace-nowrap ${active ? "active-agent border-gold text-forest bg-white" : done ? "border-moss/30 text-moss" : "border-[#cecac8] text-ink/40"}`}>{s.label}</div>
            {i < steps.length - 1 && <div className="w-3 h-px bg-[#cecac8]" />}
          </React.Fragment>
        );
      })}
    </div>
  );
}

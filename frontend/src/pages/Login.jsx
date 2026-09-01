import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Hammer } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

export default function Login() {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const { setUser } = useAuth();
  const navigate = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const path = mode === "login" ? "/auth/login" : "/auth/register";
      const { data } = await api.post(path, { email, password, name });
      setUser(data.user);
      toast.success(mode === "login" ? "Welcome back" : "Account created");
      navigate("/");
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || err.message);
    } finally {
      setBusy(false);
    }
  };

  const google = () => {
    const redirectUrl = window.location.origin + "/";
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="hidden lg:flex flex-col justify-between p-12 relative overflow-hidden" style={{ backgroundColor: "var(--forest)", color: "var(--parchment)" }}>
        <div className="flex items-center gap-2 font-heading text-2xl"><Hammer className="w-6 h-6" /> Grizon AI</div>
        <div>
          <h1 className="font-heading text-6xl leading-none mb-4">Build software<br/>by describing it.</h1>
          <p className="font-mono text-sm max-w-md" style={{ opacity: 0.7 }}>Prompt an idea. Watch autonomous agents plan, code, run it in a sandbox, and hand you a live preview.</p>
        </div>
        <div className="font-mono text-xs" style={{ opacity: 0.5 }}>Manager · Question · Planner · Coding · Testing</div>
      </div>

      <div className="flex items-center justify-center p-8" style={{ backgroundColor: "var(--parchment)" }}>
        <div className="w-full max-w-sm">
          <h2 className="font-heading text-4xl mb-1" style={{ color: "var(--ink)" }}>{mode === "login" ? "Welcome back" : "Create account"}</h2>
          <p className="font-mono text-xs mb-6" style={{ color: "var(--muted-foreground)" }}>Grizon AI — full-stack app builder</p>

          <form onSubmit={submit} className="space-y-3">
            {mode === "register" && (
              <input data-testid="name-input" value={name} onChange={(e)=>setName(e.target.value)} placeholder="Name"
                className="w-full border rounded-sm px-3 py-2.5 text-sm focus:outline-none focus:ring-2"
                style={{ backgroundColor: "var(--card)", borderColor: "var(--border)", color: "var(--foreground)", focusRingColor: "var(--forest)" }} />
            )}
            <input data-testid="email-input" type="email" required value={email} onChange={(e)=>setEmail(e.target.value)} placeholder="Email"
              className="w-full border rounded-sm px-3 py-2.5 text-sm focus:outline-none focus:ring-2"
              style={{ backgroundColor: "var(--card)", borderColor: "var(--border)", color: "var(--foreground)" }} />
            <input data-testid="password-input" type="password" required value={password} onChange={(e)=>setPassword(e.target.value)} placeholder="Password"
              className="w-full border rounded-sm px-3 py-2.5 text-sm focus:outline-none focus:ring-2"
              style={{ backgroundColor: "var(--card)", borderColor: "var(--border)", color: "var(--foreground)" }} />
            <button data-testid="submit-auth-btn" disabled={busy} type="submit"
              className="w-full text-white rounded-sm py-2.5 text-sm font-medium transition-transform hover:-translate-y-px disabled:opacity-60"
              style={{ backgroundColor: "var(--forest)" }}>
              {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Sign up"}
            </button>
          </form>

          <p className="text-center text-xs mt-6 font-mono" style={{ color: "var(--muted-foreground)" }}>
            {mode === "login" ? "No account?" : "Have an account?"}{" "}
            <button data-testid="toggle-mode-btn" onClick={()=>setMode(mode==="login"?"register":"login")} style={{ color: "var(--forest)" }} className="underline">
              {mode === "login" ? "Register" : "Sign in"}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}

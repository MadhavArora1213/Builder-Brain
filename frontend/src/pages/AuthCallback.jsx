import React, { useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

export default function AuthCallback() {
  const navigate = useNavigate();
  const location = useLocation();
  const { setUser } = useAuth();
  const processed = useRef(false);

  useEffect(() => {
    if (processed.current) return;
    processed.current = true;
    const hash = location.hash || window.location.hash;
    const sid = new URLSearchParams(hash.replace("#", "")).get("session_id");
    if (!sid) { navigate("/login"); return; }
    (async () => {
      try {
        const { data } = await api.post("/auth/google", { session_id: sid });
        setUser(data.user);
        window.history.replaceState(null, "", "/");
        navigate("/");
      } catch {
        navigate("/login");
      }
    })();
  }, [location, navigate, setUser]);

  return <div className="min-h-screen flex items-center justify-center font-mono text-ink/60">Signing you in…</div>;
}

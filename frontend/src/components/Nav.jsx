import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { LogOut, Shield, Settings } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

export default function Nav() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  return (
    <header className="h-14 border-b backdrop-blur flex items-center justify-between px-6 sticky top-0 z-30"
      style={{ borderColor: "var(--border)", backgroundColor: "color-mix(in srgb, var(--parchment) 80%, transparent)" }}>
      <Link to="/" data-testid="nav-logo" className="flex items-center gap-2 font-heading text-xl" style={{ color: "var(--ink)" }}>
        <img src="/Logo.svg" alt="Grizon AI" className="w-8 h-8" /> Grizon AI
      </Link>
      <div className="flex items-center gap-3">
        {user?.role === "admin" && (
          <button data-testid="nav-admin-btn" onClick={()=>navigate("/admin")}
            className="flex items-center gap-1.5 text-sm font-mono hover:underline" style={{ color: "var(--forest)" }}>
            <Shield className="w-4 h-4" /> Admin
          </button>
        )}
        <button data-testid="nav-settings-btn" onClick={()=>navigate("/settings")}
          className="flex items-center gap-1.5 text-sm font-mono hover:underline" style={{ color: "var(--muted-foreground)" }}>
          <Settings className="w-4 h-4" /> Settings
        </button>
        <span className="font-mono text-xs hidden sm:inline" style={{ color: "var(--muted-foreground)" }}>{user?.email}</span>
        <button data-testid="logout-btn" onClick={logout}
          className="flex items-center gap-1.5 text-sm border rounded-sm px-3 py-1.5 transition-colors hover:opacity-80"
          style={{ borderColor: "var(--border)", color: "var(--foreground)" }}>
          <LogOut className="w-4 h-4" /> Logout
        </button>
      </div>
    </header>
  );
}

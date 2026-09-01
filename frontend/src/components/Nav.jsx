import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { Hammer, LogOut, Shield } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

export default function Nav() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  return (
    <header className="h-14 border-b border-[#cecac8] bg-parchment/80 backdrop-blur flex items-center justify-between px-6 sticky top-0 z-30">
      <Link to="/" data-testid="nav-logo" className="flex items-center gap-2 font-heading text-xl text-ink">
        <Hammer className="w-5 h-5 text-forest" /> Grizon AI
      </Link>
      <div className="flex items-center gap-3">
        {user?.role === "admin" && (
          <button data-testid="nav-admin-btn" onClick={()=>navigate("/admin")}
            className="flex items-center gap-1.5 text-sm font-mono text-forest hover:underline">
            <Shield className="w-4 h-4" /> Admin
          </button>
        )}
        <span className="font-mono text-xs text-ink/60 hidden sm:inline">{user?.email}</span>
        <button data-testid="logout-btn" onClick={logout}
          className="flex items-center gap-1.5 text-sm border border-[#cecac8] rounded-sm px-3 py-1.5 hover:bg-sand transition-colors">
          <LogOut className="w-4 h-4" /> Logout
        </button>
      </div>
    </header>
  );
}

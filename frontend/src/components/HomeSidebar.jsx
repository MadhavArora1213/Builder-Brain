import React from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { PenLine, Search, MessageSquare, Layers, Settings } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

const NAV_ITEMS = [
  { icon: PenLine, label: "New chat", to: "/" },
  { icon: Search, label: "Search", to: "/" },
  { icon: MessageSquare, label: "Chats", to: "/" },
  { icon: Layers, label: "Projects", to: "/" },
];

export default function HomeSidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <aside
      className="fixed inset-y-0 left-0 z-30 flex w-16 flex-col items-center py-4 md:relative md:w-16"
      style={{
        background: "transparent",
      }}
    >
      {/* Logo */}
      <Link to="/" className="mb-6 flex items-center justify-center" data-testid="sidebar-logo">
        <div
          className="flex h-8 w-8 items-center justify-center rounded-lg font-heading text-sm font-bold"
          style={{ backgroundColor: "var(--gold)", color: "white" }}
        >
          G
        </div>
      </Link>

      {/* Nav items */}
      <nav className="flex flex-1 flex-col items-center gap-1">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.label}
            to={item.to}
            title={item.label}
            className="flex h-10 w-10 items-center justify-center rounded-lg transition-colors duration-150"
            style={{
              color: location.pathname === item.to ? "var(--gold)" : "var(--muted-foreground)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "color-mix(in srgb, var(--gold) 10%, transparent)";
              e.currentTarget.style.color = "var(--gold)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
              e.currentTarget.style.color = location.pathname === item.to ? "var(--gold)" : "var(--muted-foreground)";
            }}
          >
            <item.icon className="h-5 w-5" />
          </Link>
        ))}
      </nav>

      {/* Bottom section */}
      <div className="mt-auto flex flex-col items-center gap-2">
        <button
          onClick={() => navigate("/settings", { state: { returnTo: location.pathname } })}
          title="Settings"
          className="flex h-10 w-10 items-center justify-center rounded-lg transition-colors duration-150"
          style={{ color: "var(--muted-foreground)" }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "color-mix(in srgb, var(--gold) 10%, transparent)";
            e.currentTarget.style.color = "var(--gold)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "transparent";
            e.currentTarget.style.color = "var(--muted-foreground)";
          }}
        >
          <Settings className="h-5 w-5" />
        </button>

        {/* Divider */}
        <div className="h-px w-7" style={{ backgroundColor: "var(--border)" }} />

        {/* User avatar */}
        <button
          onClick={logout}
          title={user?.email || "Account"}
          className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-opacity hover:opacity-80"
          style={{
            backgroundColor: "color-mix(in srgb, var(--gold) 20%, transparent)",
            color: "var(--gold)",
          }}
        >
          {user?.email?.charAt(0).toUpperCase() || "U"}
        </button>
      </div>
    </aside>
  );
}

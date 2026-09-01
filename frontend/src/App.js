import "@/index.css";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { ThemeProvider } from "@/context/ThemeContext";
import Login from "@/pages/Login";
import AuthCallback from "@/pages/AuthCallback";
import Home from "@/pages/Home";
import Builder from "@/pages/Builder";
import Admin from "@/pages/Admin";
import Settings from "@/pages/Settings";

function Protected({ children, admin }) {
  const { user } = useAuth();
  if (user === undefined)
    return <div className="min-h-screen flex items-center justify-center font-mono text-ink/60" data-testid="auth-loading">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (admin && user.role !== "admin") return <Navigate to="/" replace />;
  return children;
}

function Router() {
  const location = useLocation();
  if (location.hash?.includes("session_id=")) return <AuthCallback />;
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Protected><Home /></Protected>} />
      <Route path="/builder/:projectId" element={<Protected><Builder /></Protected>} />
      <Route path="/admin" element={<Protected admin><Admin /></Protected>} />
      <Route path="/settings" element={<Protected><Settings /></Protected>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ThemeProvider>
          <Toaster position="bottom-right" richColors />
          <Router />
        </ThemeProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;

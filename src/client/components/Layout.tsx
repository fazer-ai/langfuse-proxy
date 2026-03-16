import { LayoutDashboard, LogOut, Shield } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useNavigate } from "react-router";
import { useAuth } from "@/client/contexts/AuthContext";
import { getAssetUrl } from "@/client/lib/utils";
import { LanguagePicker } from "./LanguagePicker";

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isAdminPage = location.pathname === "/admin";

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-bg-primary">
      <header className="flex shrink-0 items-center justify-between border-border border-b bg-bg-secondary px-6 py-4">
        <Link to="/" className="flex items-center gap-3">
          <img
            src={getAssetUrl("/assets/logo.png")}
            alt="Logo"
            className="h-8 w-auto"
          />
        </Link>

        <nav className="flex items-center gap-4">
          {user?.role === "ADMIN" &&
            (isAdminPage ? (
              <Link
                to="/"
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-bg-tertiary px-3 py-1.5 font-medium text-sm text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
              >
                <LayoutDashboard className="h-4 w-4" />
                <span className="hidden sm:inline">
                  {t("nav.home", "Home")}
                </span>
              </Link>
            ) : (
              <Link
                to="/admin"
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-bg-tertiary px-3 py-1.5 font-medium text-sm text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
              >
                <Shield className="h-4 w-4" />
                <span className="hidden sm:inline">
                  {t("nav.admin", "Admin")}
                </span>
              </Link>
            ))}

          <LanguagePicker />

          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-text-secondary sm:inline">
              {user?.email}
            </span>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-bg-tertiary px-3 py-1.5 font-medium text-sm text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
              aria-label={t("auth.logout", "Logout")}
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">
                {t("auth.logout", "Logout")}
              </span>
            </button>
          </div>
        </nav>
      </header>

      <main className="flex-1 overflow-y-auto p-6">{children}</main>
    </div>
  );
}

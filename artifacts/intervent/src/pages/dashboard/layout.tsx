import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import {
  Briefcase, CalendarPlus, ClipboardList, LogOut,
  ChevronLeft, ChevronRight, Menu, Sun, Moon, Bell, X
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/theme";

const navItems = [
  { path: "/dashboard/scheduler", label: "Interview Scheduler", icon: CalendarPlus },
  { path: "/dashboard/manager",   label: "Interview Manager",   icon: ClipboardList },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { theme, toggle } = useTheme();
  const [location, setLocation] = useLocation();
  const [collapsed, setCollapsed] = useState(() =>
    localStorage.getItem("iv-sidebar-collapsed") === "true"
  );
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem("iv-sidebar-collapsed", collapsed.toString());
  }, [collapsed]);

  const pageTitle = navItems.find((n) => n.path === location)?.label ?? "Dashboard";

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">

      {/* ── Mobile overlay ── */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* ── Sidebar ── */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex flex-col bg-card border-r border-card-border transition-all duration-300 shrink-0",
          /* mobile: slide in/out */
          "md:relative md:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
          /* desktop: wide or icon-only */
          collapsed ? "md:w-[72px]" : "md:w-[240px]",
          "w-[240px]"
        )}
      >
        {/* Logo row */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-card-border shrink-0">
          <div className={cn("flex items-center gap-3 overflow-hidden min-w-0", collapsed && "md:justify-center")}>
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#667eea] to-[#764ba2] flex items-center justify-center text-white shrink-0">
              <Briefcase size={16} />
            </div>
            <span className={cn(
              "font-bold text-lg tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/70 whitespace-nowrap transition-all duration-300",
              collapsed && "md:hidden"
            )}>
              InterVent
            </span>
          </div>
          {/* Close btn — mobile only */}
          <button
            className="md:hidden text-muted-foreground hover:text-foreground"
            onClick={() => setMobileOpen(false)}
            data-testid="button-close-mobile-menu"
          >
            <X size={18} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 px-3 flex flex-col gap-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = location === item.path;
            return (
              <Link key={item.path} href={item.path}>
                <button
                  onClick={() => setMobileOpen(false)}
                  data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
                  title={collapsed ? item.label : undefined}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors",
                    collapsed && "md:justify-center",
                    active
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <Icon size={20} className="shrink-0" />
                  <span className={cn("whitespace-nowrap", collapsed && "md:hidden")}>
                    {item.label}
                  </span>
                </button>
              </Link>
            );
          })}
        </nav>

        {/* User + logout */}
        <div className="p-4 border-t border-card-border shrink-0 space-y-3">
          <div className={cn("flex items-center gap-3 min-w-0", collapsed && "md:justify-center")}>
            <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center font-semibold text-sm shrink-0">
              HR
            </div>
            <div className={cn("flex flex-col min-w-0 overflow-hidden", collapsed && "md:hidden")}>
              <span className="text-sm font-semibold truncate">HR Manager</span>
              <span className="text-xs text-muted-foreground truncate">hr@company.com</span>
            </div>
          </div>
          <button
            onClick={() => setLocation("/")}
            data-testid="button-logout"
            title={collapsed ? "Log out" : undefined}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors",
              collapsed && "md:justify-center"
            )}
          >
            <LogOut size={18} className="shrink-0" />
            <span className={cn(collapsed && "md:hidden")}>Log out</span>
          </button>
        </div>

        {/* Desktop collapse toggle */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          data-testid="button-toggle-sidebar"
          className="absolute -right-3 top-[4.5rem] w-6 h-6 rounded-full bg-card border border-card-border text-muted-foreground hover:text-foreground flex items-center justify-center shadow-sm z-50 hidden md:flex"
        >
          {collapsed ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
        </button>
      </aside>

      {/* ── Main area ── */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">

        {/* Topbar */}
        <header className="h-16 bg-card border-b border-card-border flex items-center justify-between px-4 lg:px-8 shrink-0 z-10">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileOpen(true)}
              className="md:hidden w-9 h-9 flex items-center justify-center rounded-xl bg-muted text-foreground"
              data-testid="button-mobile-menu"
            >
              <Menu size={18} />
            </button>
            <h1 className="text-lg font-semibold">{pageTitle}</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              data-testid="button-notifications"
              className="w-9 h-9 rounded-full flex items-center justify-center bg-muted text-muted-foreground hover:text-foreground transition-colors"
            >
              <Bell size={17} />
            </button>
            <button
              onClick={toggle}
              data-testid="button-theme-toggle"
              className="w-9 h-9 rounded-full flex items-center justify-center bg-muted text-muted-foreground hover:text-foreground transition-colors"
            >
              {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
            </button>
          </div>
        </header>

        {/* Page content — single scroll zone */}
        <main className="flex-1 overflow-y-auto bg-background p-4 lg:p-8">
          <div className="max-w-5xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

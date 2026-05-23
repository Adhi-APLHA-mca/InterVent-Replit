import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import {
  Briefcase, BriefcaseBusiness, PhoneIncoming,
  LogOut, ChevronLeft, ChevronRight, Menu, Sun, Moon, Bell, X
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/theme";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

const navItems = [
  { path: "/student/jobs",  label: "Job Openings",   icon: BriefcaseBusiness },
  { path: "/student/calls", label: "Interview Calls", icon: PhoneIncoming },
];

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  const { theme, toggle } = useTheme();
  const [location, setLocation] = useLocation();
  const [collapsed, setCollapsed] = useState(() =>
    localStorage.getItem("iv-student-sidebar-collapsed") === "true"
  );
  const [mobileOpen, setMobileOpen] = useState(false);
  const [studentName, setStudentName] = useState("Student");
  const [studentEmail, setStudentEmail] = useState("");

  useEffect(() => {
    localStorage.setItem("iv-student-sidebar-collapsed", collapsed.toString());
  }, [collapsed]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setLocation("/");
        return;
      }
      setStudentEmail(user.email ?? "");
      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        if (snap.exists()) {
          setStudentName(snap.data().fullName ?? user.email ?? "Student");
        } else {
          setStudentName(user.email ?? "Student");
        }
      } catch {
        setStudentName(user.email ?? "Student");
      }
    });
    return () => unsub();
  }, [setLocation]);

  const handleLogout = async () => {
    await auth.signOut();
    setLocation("/");
  };

  const initials = studentName
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  const pageTitle = navItems.find((n) => n.path === location)?.label ?? "Student Portal";

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">

      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex flex-col bg-card border-r border-card-border transition-all duration-300 shrink-0",
          "md:relative md:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
          collapsed ? "md:w-[72px]" : "md:w-[240px]",
          "w-[240px]"
        )}
      >
        {/* Logo */}
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
          <button
            className="md:hidden text-muted-foreground hover:text-foreground"
            onClick={() => setMobileOpen(false)}
          >
            <X size={18} />
          </button>
        </div>

        {/* Role badge */}
        <div className={cn(
          "px-4 py-2 border-b border-card-border",
          collapsed && "md:hidden"
        )}>
          <span className="text-[11px] font-semibold uppercase tracking-widest text-purple-500">
            Student Portal
          </span>
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
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#667eea] to-[#764ba2] text-white flex items-center justify-center font-semibold text-sm shrink-0">
              {initials || "S"}
            </div>
            <div className={cn("flex flex-col min-w-0 overflow-hidden", collapsed && "md:hidden")}>
              <span className="text-sm font-semibold truncate">{studentName}</span>
              <span className="text-xs text-muted-foreground truncate">{studentEmail}</span>
            </div>
          </div>
          <button
            onClick={handleLogout}
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

        <button
          onClick={() => setCollapsed(!collapsed)}
          className="absolute -right-3 top-[4.5rem] w-6 h-6 rounded-full bg-card border border-card-border text-muted-foreground hover:text-foreground flex items-center justify-center shadow-sm z-50 hidden md:flex"
        >
          {collapsed ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
        </button>
      </aside>

      {/* Main area */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <header className="h-16 bg-card border-b border-card-border flex items-center justify-between px-4 lg:px-8 shrink-0 z-10">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileOpen(true)}
              className="md:hidden w-9 h-9 flex items-center justify-center rounded-xl bg-muted text-foreground"
            >
              <Menu size={18} />
            </button>
            <h1 className="text-lg font-semibold">{pageTitle}</h1>
          </div>
          <div className="flex items-center gap-2">
            <button className="w-9 h-9 rounded-full flex items-center justify-center bg-muted text-muted-foreground hover:text-foreground transition-colors">
              <Bell size={17} />
            </button>
            <button
              onClick={toggle}
              className="w-9 h-9 rounded-full flex items-center justify-center bg-muted text-muted-foreground hover:text-foreground transition-colors"
            >
              {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto bg-background p-4 lg:p-8">
          <div className="max-w-5xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

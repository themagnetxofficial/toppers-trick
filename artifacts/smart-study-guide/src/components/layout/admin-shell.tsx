import { Link, useLocation } from "wouter";
import {
  BookOpen, LayoutDashboard, Users, CreditCard, FileText,
  MessageSquare, PenTool, LogOut, Menu, X, ChevronRight,
} from "lucide-react";
import { useClerk } from "@clerk/react";
import { Button } from "@/components/ui/button";
import { useState } from "react";

const nav = [
  { name: "Dashboard", href: "/admin", icon: LayoutDashboard },
  { name: "Users", href: "/admin/users", icon: Users },
  { name: "Payments", href: "/admin/payments", icon: CreditCard },
  { name: "Analyses", href: "/admin/analyses", icon: FileText },
  { name: "Contact", href: "/admin/contact", icon: MessageSquare },
  { name: "Blog", href: "/admin/blog", icon: PenTool },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { signOut } = useClerk();
  const [open, setOpen] = useState(false);

  const isActive = (href: string) =>
    href === "/admin" ? location === "/admin" : location.startsWith(href);

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar */}
      <aside className="hidden md:flex w-60 flex-col bg-card border-r border-border shrink-0">
        <div className="h-14 flex items-center px-5 border-b border-border gap-2">
          <BookOpen className="h-5 w-5 text-primary" />
          <span className="font-serif font-bold">Admin</span>
          <span className="ml-auto text-xs bg-destructive/10 text-destructive px-1.5 py-0.5 rounded font-semibold">ADMIN</span>
        </div>
        <nav className="flex-1 py-4 px-3 space-y-0.5 overflow-y-auto">
          {nav.map((item) => (
            <Link key={item.href} href={item.href}>
              <div className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive(item.href)
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`}>
                <item.icon className={`h-4 w-4 ${isActive(item.href) ? "text-primary" : "text-muted-foreground"}`} />
                {item.name}
                {isActive(item.href) && <ChevronRight className="h-3 w-3 ml-auto text-primary" />}
              </div>
            </Link>
          ))}
        </nav>
        <div className="p-3 border-t border-border space-y-1">
          <Link href="/">
            <div className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-secondary transition-colors">
              <BookOpen className="h-4 w-4" />
              Back to App
            </div>
          </Link>
          <button
            onClick={() => signOut({ redirectUrl: "/" })}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Mobile */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="md:hidden h-14 flex items-center justify-between px-4 bg-card border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            <span className="font-serif font-bold">Admin</span>
          </div>
          <Button variant="ghost" size="icon" onClick={() => setOpen(!open)}>
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </header>
        {open && (
          <div className="md:hidden absolute inset-x-0 top-14 z-50 bg-card border-b border-border shadow-lg">
            <nav className="p-3 space-y-0.5">
              {nav.map((item) => (
                <Link key={item.href} href={item.href} onClick={() => setOpen(false)}>
                  <div className={`flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium ${
                    isActive(item.href) ? "bg-primary/10 text-primary" : "text-muted-foreground"
                  }`}>
                    <item.icon className="h-4 w-4" />
                    {item.name}
                  </div>
                </Link>
              ))}
            </nav>
          </div>
        )}
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <div className="max-w-7xl mx-auto">{children}</div>
        </main>
      </div>
    </div>
  );
}

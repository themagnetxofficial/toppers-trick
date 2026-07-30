import React from "react";
import { Link, useLocation } from "wouter";
import { 
  BookOpen, 
  LayoutDashboard, 
  FilePlus2, 
  History, 
  CreditCard, 
  User as UserIcon,
  LogOut,
  Menu
} from "lucide-react";
import { useUser, useClerk } from "@clerk/react";
import { Button } from "@/components/ui/button";

export function Shell({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user } = useUser();
  const { signOut } = useClerk();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);

  const navigation = [
    { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { name: "New Analysis", href: "/analyze", icon: FilePlus2 },
    { name: "History", href: "/history", icon: History },
    { name: "Pricing", href: "/pricing", icon: CreditCard },
  ];

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar for desktop */}
      <aside className="hidden md:flex w-64 flex-col bg-card border-r border-border">
        <div className="h-16 flex items-center px-6 border-b border-border">
          <BookOpen className="h-6 w-6 text-primary mr-2" />
          <span className="font-serif text-lg font-bold">Smart Study</span>
        </div>

        <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
          {navigation.map((item) => {
            const isActive = location === item.href;
            return (
              <Link key={item.name} href={item.href} className="block">
                <div
                  className={`flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                  }`}
                >
                  <item.icon className={`h-5 w-5 mr-3 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                  {item.name}
                </div>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-border">
          <Link href="/profile" className="block mb-2">
            <div className={`flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              location === '/profile' ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-secondary"
            }`}>
              <UserIcon className="h-5 w-5 mr-3" />
              Profile
            </div>
          </Link>
          <button
            onClick={() => signOut({ redirectUrl: "/" })}
            className="w-full flex items-center px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
          >
            <LogOut className="h-5 w-5 mr-3" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Mobile Header & Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="md:hidden h-16 flex items-center justify-between px-4 bg-card border-b border-border">
          <div className="flex items-center">
            <BookOpen className="h-6 w-6 text-primary mr-2" />
            <span className="font-serif text-lg font-bold">Smart Study</span>
          </div>
          <Button variant="ghost" size="icon" onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}>
            <Menu className="h-6 w-6" />
          </Button>
        </header>

        {/* Mobile Menu */}
        {isMobileMenuOpen && (
          <div className="md:hidden absolute top-16 left-0 w-full bg-card border-b border-border z-50 shadow-lg">
            <nav className="px-4 py-2 space-y-1">
              {navigation.map((item) => {
                const isActive = location === item.href;
                return (
                  <Link key={item.name} href={item.href} className="block" onClick={() => setIsMobileMenuOpen(false)}>
                    <div
                      className={`flex items-center px-3 py-3 rounded-lg text-base font-medium ${
                        isActive
                          ? "bg-primary/10 text-primary"
                          : "text-muted-foreground"
                      }`}
                    >
                      <item.icon className="h-5 w-5 mr-3" />
                      {item.name}
                    </div>
                  </Link>
                );
              })}
              <Link href="/profile" className="block" onClick={() => setIsMobileMenuOpen(false)}>
                <div className="flex items-center px-3 py-3 rounded-lg text-base font-medium text-muted-foreground">
                  <UserIcon className="h-5 w-5 mr-3" />
                  Profile
                </div>
              </Link>
              <button
                onClick={() => signOut({ redirectUrl: "/" })}
                className="w-full flex items-center px-3 py-3 rounded-lg text-base font-medium text-muted-foreground hover:text-destructive"
              >
                <LogOut className="h-5 w-5 mr-3" />
                Sign Out
              </button>
            </nav>
          </div>
        )}

        <main className="flex-1 overflow-y-auto bg-background p-4 md:p-8">
          <div className="max-w-5xl mx-auto h-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

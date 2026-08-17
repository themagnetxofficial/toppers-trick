import { Link } from "wouter";

const footerLinks = [
  { label: "About Us", href: "/about" },
  { label: "Contact Us", href: "/contact" },
  { label: "Terms & Conditions", href: "/terms" },
  { label: "Privacy Policy", href: "/privacy" },
  { label: "Refund & Cancellation", href: "/refund" },
];

export function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur border-b border-border">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-foreground hover:opacity-80 transition-opacity">
            <img src="/icon.png" alt="ToppersTrick" className="h-8 w-8 rounded-md" />
            <span className="font-serif text-lg font-bold">ToppersTrick</span>
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/sign-in" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Log in
            </Link>
            <Link href="/sign-up" className="text-sm font-semibold bg-primary text-primary-foreground px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors">
              Get Started
            </Link>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t border-border bg-card">
        <div className="max-w-5xl mx-auto px-6 py-10">
          <div className="flex flex-col md:flex-row justify-between gap-8">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <img src="/icon.png" alt="ToppersTrick" className="h-6 w-6 rounded-sm" />
                <span className="font-serif font-bold">ToppersTrick</span>
              </div>
              <p className="text-sm text-muted-foreground max-w-xs">
                AI-powered study guides for Indian students. Padhai karo, panic nahi.
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">Quick links</p>
              <ul className="space-y-2">
                {footerLinks.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="mt-8 pt-6 border-t border-border text-center">
            <p className="text-xs text-muted-foreground">
              © {new Date().getFullYear()} ToppersTrick. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

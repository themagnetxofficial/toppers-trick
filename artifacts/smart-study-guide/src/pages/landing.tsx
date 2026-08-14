import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { BookOpen, Sparkles, Target, Zap, Clock, ShieldCheck } from "lucide-react";

export default function LandingPage() {
  return (
    <div className="min-h-[100dvh] flex flex-col bg-background selection:bg-primary/20">
      <header className="px-6 h-20 flex items-center justify-between border-b border-border/50 sticky top-0 bg-background/80 backdrop-blur-md z-50">
        <div className="flex items-center gap-2">
          <BookOpen className="h-7 w-7 text-primary" />
          <span className="font-serif text-xl font-bold tracking-tight">Smart Study</span>
        </div>
        <nav className="hidden md:flex items-center gap-8">
          <a href="#how-it-works" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">How it works</a>
          <a href="#features" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Features</a>
          <a href="#pricing" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Pricing</a>
        </nav>
        <div className="flex items-center gap-4">
          <Link href="/sign-in" className="text-sm font-semibold hover:text-primary transition-colors hidden sm:block">Log in</Link>
          <Link href="/sign-up">
            <Button className="rounded-full shadow-md shadow-primary/20 hover:shadow-primary/40 transition-all font-semibold">
              Get Started
            </Button>
          </Link>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative overflow-hidden py-20 sm:py-32 px-6">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/10 via-background to-background -z-10" />
          <div className="absolute top-0 right-0 -translate-y-12 translate-x-1/3 blur-3xl opacity-30 pointer-events-none">
            <div className="w-[500px] h-[500px] rounded-full bg-primary/40" />
          </div>
          
          <div className="max-w-4xl mx-auto text-center space-y-8 relative z-10">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-secondary text-secondary-foreground text-sm font-medium mb-4 ring-1 ring-secondary-foreground/10">
              <Sparkles className="h-4 w-4" />
              <span>Free analyses for new students</span>
            </div>
            <h1 className="text-5xl sm:text-6xl md:text-7xl font-serif font-bold tracking-tight text-foreground leading-[1.1]">
              Crush your exams, <br className="hidden sm:block" />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-orange-400">minus the stress.</span>
            </h1>
            <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              Upload your previous year question papers. Our AI analyzes the patterns and tells you exactly what chapters to study first, complete with Hinglish notes and a downloadable strategy PDF.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
              <Link href="/sign-up">
                <Button size="lg" className="h-14 px-8 text-base rounded-full shadow-lg shadow-primary/20 w-full sm:w-auto font-semibold">
                  Start Analyzing Papers
                </Button>
              </Link>
              <p className="text-sm text-muted-foreground sm:hidden">Takes 2 minutes. No credit card required.</p>
            </div>
          </div>
        </section>

        {/* 3 Steps Section */}
        <section id="how-it-works" className="py-24 px-6 bg-card border-y border-border/50 relative">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-16 space-y-4">
              <h2 className="text-3xl sm:text-4xl font-serif font-bold">From panic to prepared in 3 steps</h2>
              <p className="text-muted-foreground max-w-xl mx-auto text-lg">Don't study everything blindly. Study smart like a topper.</p>
            </div>

            <div className="grid md:grid-cols-3 gap-12 relative">
              <div className="hidden md:block absolute top-12 left-[15%] right-[15%] h-[2px] bg-gradient-to-r from-transparent via-border to-transparent -z-10" />
              
              {[
                {
                  icon: FilePlus2,
                  title: "1. Upload Papers",
                  desc: "Drop 3-5 previous year question papers (PDF or images) for any subject."
                },
                {
                  icon: Zap,
                  title: "2. AI Magic",
                  desc: "We analyze weightage, frequency, and patterns to find what's guaranteed to come."
                },
                {
                  icon: Target,
                  title: "3. Get Your Strategy",
                  desc: "Get chapter priorities, short Hinglish notes, and a PDF guide to keep."
                }
              ].map((step, i) => (
                <div key={i} className="relative flex flex-col items-center text-center space-y-4 group">
                  <div className="w-24 h-24 rounded-3xl bg-background border-2 border-border shadow-sm flex items-center justify-center relative z-10 group-hover:border-primary group-hover:shadow-md group-hover:shadow-primary/10 transition-all duration-300">
                    <step.icon className="h-10 w-10 text-primary" />
                  </div>
                  <h3 className="text-xl font-bold font-serif">{step.title}</h3>
                  <p className="text-muted-foreground leading-relaxed">{step.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Value Props */}
        <section id="features" className="py-24 px-6 relative">
          <div className="max-w-5xl mx-auto grid sm:grid-cols-2 gap-12 sm:gap-x-16 sm:gap-y-20">
            <div className="flex gap-4">
              <div className="w-12 h-12 shrink-0 rounded-2xl bg-secondary flex items-center justify-center text-secondary-foreground">
                <Clock className="h-6 w-6" />
              </div>
              <div className="space-y-2">
                <h4 className="text-xl font-bold font-serif">Save 100+ Hours</h4>
                <p className="text-muted-foreground">Stop flipping through 10 years of papers manually trying to guess the weightage. Let AI do the heavy lifting in seconds.</p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="w-12 h-12 shrink-0 rounded-2xl bg-secondary flex items-center justify-center text-secondary-foreground">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <div className="space-y-2">
                <h4 className="text-xl font-bold font-serif">Exam Confidence</h4>
                <p className="text-muted-foreground">Knowing what to study first eliminates pre-exam anxiety. You'll walk in knowing you covered the high-yield topics.</p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="w-12 h-12 shrink-0 rounded-2xl bg-secondary flex items-center justify-center text-secondary-foreground">
                <Sparkles className="h-6 w-6" />
              </div>
              <div className="space-y-2">
                <h4 className="text-xl font-bold font-serif">Hinglish Notes</h4>
                <p className="text-muted-foreground">Complex topics summarized in easy-to-understand Hinglish tips — exactly how a brilliant senior would explain it to you.</p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="w-12 h-12 shrink-0 rounded-2xl bg-secondary flex items-center justify-center text-secondary-foreground">
                <BookOpen className="h-6 w-6" />
              </div>
              <div className="space-y-2">
                <h4 className="text-xl font-bold font-serif">PDF Study Guide</h4>
                <p className="text-muted-foreground">Download your personalized strategy as a neat PDF to stick on your wall or keep on your phone.</p>
              </div>
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="py-24 px-6 bg-card border-t border-border/50">
          <div className="max-w-3xl mx-auto text-center space-y-12">
            <div className="space-y-4">
              <h2 className="text-3xl sm:text-4xl font-serif font-bold">Simple, honest pricing</h2>
              <p className="text-muted-foreground text-lg">Cheaper than a good coffee. Way better for your grades.</p>
            </div>
            
            <div className="bg-background rounded-3xl p-8 sm:p-12 border border-border shadow-xl shadow-primary/5 max-w-lg mx-auto relative overflow-hidden">
              <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
                <BookOpen className="w-32 h-32" />
              </div>
              <div className="relative z-10 text-left space-y-8">
                <div>
                  <h3 className="text-2xl font-bold font-serif mb-2">Exam Season Pack</h3>
                  <div className="flex items-baseline gap-2">
                    <span className="text-5xl font-bold">₹129</span>
                  </div>
                  <p className="text-muted-foreground mt-2">10 AI paper analyses.</p>
                </div>
                
                <ul className="space-y-4">
                  {[
                    "10 Full subject analyses",
                    "Unlimited paper uploads per analysis",
                    "High/Medium/Low priority breakdowns",
                    "Hinglish strategy tips",
                    "Downloadable PDF guides",
                    "Never expires"
                  ].map((feature, i) => (
                    <li key={i} className="flex items-center gap-3">
                      <div className="w-6 h-6 rounded-full bg-secondary flex items-center justify-center shrink-0">
                        <Check className="h-4 w-4 text-secondary-foreground" />
                      </div>
                      <span className="font-medium text-foreground/90">{feature}</span>
                    </li>
                  ))}
                </ul>
                
                <Link href="/sign-up" className="block">
                  <Button className="w-full h-12 text-base rounded-xl font-bold shadow-md shadow-primary/20">
                    Get Started Now
                  </Button>
                </Link>
                <p className="text-center text-sm text-muted-foreground">You get 1 free analysis when you sign up.</p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="py-12 px-6 border-t border-border bg-background text-center">
        <div className="max-w-4xl mx-auto flex flex-col items-center justify-center space-y-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <BookOpen className="h-5 w-5" />
            <span className="font-serif font-bold">Smart Study</span>
          </div>
          <p className="text-sm text-muted-foreground">© {new Date().getFullYear()} Smart Study Guide. All rights reserved.</p>
          <p className="text-xs text-muted-foreground/60 max-w-sm">Built to help Indian students crush their exams with confidence. Padhai karo, panic nahi.</p>
        </div>
      </footer>
    </div>
  );
}

function Check(props: React.ComponentProps<"svg">) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function FilePlus2(props: React.ComponentProps<"svg">) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M4 22h14a2 2 0 0 0 2-2V7l-5-5H6a2 2 0 0 0-2 2v4" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <path d="M3 15h6" />
      <path d="M6 12v6" />
    </svg>
  );
}

import { useState } from "react";
import { PublicLayout } from "@/components/layout/public-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Mail, MapPin, Clock, CheckCircle2 } from "lucide-react";

export default function ContactPage() {
  const [form, setForm] = useState({ name: "", email: "", subject: "", message: "" });
  const [submitted, setSubmitted] = useState(false);
  const [sending, setSending] = useState(false);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setError("");
    try {
      const base = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
      const res = await fetch(`${base}/api/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error("Failed to send");
      setSubmitted(true);
    } catch {
      setError("Failed to send message. Please email us directly at support@smartstudy.app");
    }
    setSending(false);
  }

  return (
    <PublicLayout>
      <div className="max-w-5xl mx-auto px-6 py-16">
        <div className="space-y-3 mb-12">
          <p className="text-sm font-semibold uppercase tracking-widest text-primary">Contact Us</p>
          <h1 className="text-4xl font-bold font-serif">We're here to help</h1>
          <p className="text-muted-foreground text-lg">
            Have a question or running into an issue? Reach out — we respond quickly.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-12">
          {/* Info cards */}
          <div className="space-y-6">
            <div className="bg-card border border-border rounded-2xl p-6 flex gap-4">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Mail className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-semibold">Email Support</p>
                <a
                  href="mailto:support@smartstudy.app"
                  className="text-primary hover:underline text-sm"
                >
                  support@smartstudy.app
                </a>
                <p className="text-xs text-muted-foreground mt-1">
                  Best for account issues, billing, and feedback
                </p>
              </div>
            </div>

            <div className="bg-card border border-border rounded-2xl p-6 flex gap-4">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Clock className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-semibold">Response Time</p>
                <p className="text-sm text-muted-foreground mt-1">
                  We typically respond within <strong className="text-foreground">24–48 hours</strong> on business days (Monday–Friday, IST).
                </p>
              </div>
            </div>

            <div className="bg-card border border-border rounded-2xl p-6 flex gap-4">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <MapPin className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-semibold">Registered Address</p>
                <p className="text-sm text-muted-foreground mt-1">[Business Address]</p>
              </div>
            </div>
          </div>

          {/* Contact form */}
          <div className="bg-card border border-border rounded-2xl p-8">
            {submitted ? (
              <div className="flex flex-col items-center justify-center h-full text-center py-12 space-y-4">
                <CheckCircle2 className="h-12 w-12 text-green-500" />
                <h3 className="text-xl font-bold font-serif">Message sent!</h3>
                <p className="text-muted-foreground text-sm">
                  We've received your message and will get back to you at <strong>{form.email}</strong> within 24–48 hours.
                </p>
                <button
                  onClick={() => { setSubmitted(false); setForm({ name: "", email: "", subject: "", message: "" }); }}
                  className="text-sm text-primary hover:underline"
                >
                  Send another message
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                <h2 className="text-xl font-bold font-serif">Send us a message</h2>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Name</Label>
                    <Input id="name" name="name" placeholder="Your name" value={form.name} onChange={handleChange} required className="rounded-xl h-11" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" name="email" type="email" placeholder="you@email.com" value={form.email} onChange={handleChange} required className="rounded-xl h-11" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="subject">Subject</Label>
                  <Input id="subject" name="subject" placeholder="What's this about?" value={form.subject} onChange={handleChange} required className="rounded-xl h-11" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="message">Message</Label>
                  <Textarea
                    id="message"
                    name="message"
                    placeholder="Describe your issue or question in detail..."
                    rows={5}
                    value={form.message}
                    onChange={handleChange}
                    required
                    className="rounded-xl resize-none"
                  />
                </div>
                <Button type="submit" disabled={sending} className="w-full h-11 rounded-xl font-bold">
                  {sending ? "Sending…" : "Send Message"}
                </Button>
                {error && <p className="text-xs text-destructive text-center">{error}</p>}
              </form>
            )}
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}

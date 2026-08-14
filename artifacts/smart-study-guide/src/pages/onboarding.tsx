import { useState } from "react";
import { useUser } from "@clerk/react";
import { useLocation } from "wouter";
import { BookOpen, User, Phone, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function OnboardingPage() {
  const { user, isLoaded } = useUser();
  const [, setLocation] = useLocation();

  const [fullName, setFullName] = useState(
    user ? [user.firstName, user.lastName].filter(Boolean).join(" ") : ""
  );
  const [phone, setPhone] = useState(
    (user?.unsafeMetadata?.phone as string) ?? ""
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  if (!isLoaded) return null;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    if (!fullName.trim()) {
      setError("Please enter your name.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const parts = fullName.trim().split(/\s+/);
      const firstName = parts[0];
      const lastName = parts.slice(1).join(" ");
      await user.update({
        firstName,
        lastName,
        unsafeMetadata: {
          ...user.unsafeMetadata,
          phone: phone.trim(),
          onboardingComplete: true,
        },
      });
      setLocation("/dashboard");
    } catch (err: any) {
      setError(err?.message ?? "Something went wrong. Please try again.");
      setSaving(false);
    }
  }

  async function handleSkip() {
    if (!user) return;
    await user.update({
      unsafeMetadata: {
        ...user.unsafeMetadata,
        onboardingComplete: true,
      },
    });
    setLocation("/dashboard");
  }

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-8">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="flex justify-center">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
              <BookOpen className="w-6 h-6 text-primary" />
            </div>
          </div>
          <h1 className="text-2xl font-bold font-serif text-foreground">
            One last step 👋
          </h1>
          <p className="text-muted-foreground text-sm">
            Tell us a bit about yourself so we can personalise your experience.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSave} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="fullName" className="flex items-center gap-1.5 font-medium">
              <User className="w-3.5 h-3.5 text-muted-foreground" />
              Full name
            </Label>
            <Input
              id="fullName"
              type="text"
              placeholder="e.g. Priya Sharma"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              autoComplete="name"
              autoFocus
              className="h-11 rounded-xl"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone" className="flex items-center gap-1.5 font-medium">
              <Phone className="w-3.5 h-3.5 text-muted-foreground" />
              Phone number
              <span className="text-muted-foreground font-normal text-xs">(optional)</span>
            </Label>
            <Input
              id="phone"
              type="tel"
              placeholder="e.g. +91 98765 43210"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              autoComplete="tel"
              className="h-11 rounded-xl"
            />
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <Button
            type="submit"
            disabled={saving}
            className="w-full h-11 rounded-xl font-bold text-base gap-2"
          >
            {saving ? "Saving…" : "Continue"}
            {!saving && <ArrowRight className="w-4 h-4" />}
          </Button>
        </form>

        <p className="text-center">
          <button
            type="button"
            onClick={handleSkip}
            className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-4 transition-colors"
          >
            Skip for now
          </button>
        </p>
      </div>
    </div>
  );
}

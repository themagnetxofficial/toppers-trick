import { useEffect, useState } from "react";
import { adminApi, ContactSubmission } from "@/lib/admin-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronDown, ChevronUp, CheckCircle2, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function AdminContact() {
  const [submissions, setSubmissions] = useState<ContactSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);
  const { toast } = useToast();

  const load = () => {
    setLoading(true);
    adminApi.getContact().then(setSubmissions).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const toggleStatus = async (id: number, current: string) => {
    const next = current === "pending" ? "resolved" : "pending";
    try {
      await adminApi.updateContactStatus(id, next);
      setSubmissions((prev) => prev.map((s) => s.id === id ? { ...s, status: next } : s));
      toast({ title: `Marked as ${next}` });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const pending = submissions.filter(s => s.status === "pending").length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold font-serif">Contact Submissions</h1>
        <p className="text-muted-foreground text-sm">
          {submissions.length} total · {pending} pending
        </p>
      </div>

      <div className="space-y-2">
        {loading
          ? Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-2xl" />)
          : submissions.length === 0
          ? <p className="text-center text-muted-foreground py-10 text-sm">No submissions yet</p>
          : submissions.map((s) => (
              <div key={s.id} className="border border-border rounded-2xl bg-card overflow-hidden">
                <div className="flex items-center gap-3 px-5 py-4">
                  {s.status === "resolved"
                    ? <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                    : <Clock className="h-4 w-4 text-amber-500 shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm">{s.name}</span>
                      <span className="text-muted-foreground text-xs">·</span>
                      <span className="text-muted-foreground text-xs">{s.email}</span>
                    </div>
                    <p className="text-sm text-muted-foreground truncate">{s.subject}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-muted-foreground">{new Date(s.createdAt).toLocaleDateString("en-IN")}</span>
                    <Badge variant={s.status === "resolved" ? "secondary" : "default"} className="text-xs">
                      {s.status}
                    </Badge>
                    <Button variant="outline" size="sm" className="h-7 gap-1 text-xs"
                      onClick={() => toggleStatus(s.id, s.status)}>
                      {s.status === "pending" ? <><CheckCircle2 className="h-3 w-3" /> Resolve</> : "Reopen"}
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7"
                      onClick={() => setExpanded(expanded === s.id ? null : s.id)}>
                      {expanded === s.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
                {expanded === s.id && (
                  <div className="px-5 pb-4 border-t border-border bg-muted/20">
                    <p className="text-sm whitespace-pre-wrap pt-3 text-foreground/80">{s.message}</p>
                    <a href={`mailto:${s.email}?subject=Re: ${encodeURIComponent(s.subject)}`}
                      className="inline-block mt-3 text-xs text-primary hover:underline">
                      Reply via email →
                    </a>
                  </div>
                )}
              </div>
            ))}
      </div>
    </div>
  );
}

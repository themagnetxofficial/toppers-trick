import { useEffect, useState } from "react";
import { Link } from "wouter";
import { adminApi, AdminUser } from "@/lib/admin-api";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Search, ChevronLeft, ChevronRight, ExternalLink, RefreshCw } from "lucide-react";

function useDebounce<T>(value: T, delay = 400) {
  const [dv, setDv] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDv(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return dv;
}

export default function AdminUsers() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [backfilling, setBackfilling] = useState(false);
  const dSearch = useDebounce(search);
  const pageSize = 25;
  const { toast } = useToast();

  useEffect(() => {
    setLoading(true);
    setPage(1);
  }, [dSearch]);

  useEffect(() => {
    setLoading(true);
    adminApi.getUsers(page, dSearch)
      .then((r) => { setUsers(r.users); setTotal(r.total); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [page, dSearch]);

  const totalPages = Math.ceil(total / pageSize);

  const handleBackfill = async () => {
    setBackfilling(true);
    try {
      const result = await adminApi.backfillMissingEmails();
      toast({
        title: "Email backfill complete",
        description: `${result.updated} updated, ${result.failed} failed.`,
        variant: result.failed > 0 ? "destructive" : "default",
      });
      const refreshed = await adminApi.getUsers(page, dSearch);
      setUsers(refreshed.users);
      setTotal(refreshed.total);
    } catch (error) {
      toast({
        title: "Email backfill failed",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setBackfilling(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-serif">Users</h1>
          <p className="text-muted-foreground text-sm">{total.toLocaleString()} total users</p>
        </div>
        <Button
          variant="outline"
          className="gap-2"
          onClick={handleBackfill}
          disabled={backfilling}
        >
          <RefreshCw className={`h-4 w-4 ${backfilling ? "animate-spin" : ""}`} />
          {backfilling ? "Backfilling…" : "Backfill missing emails"}
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by name or email…"
          className="pl-9 rounded-xl"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="rounded-2xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 border-b border-border">
            <tr>
              {["ID", "Name / Email", "Signed up", "Credits", "Total Spent", "Analyses", "Status", ""].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-card">
            {loading
              ? Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}><td colSpan={8} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td></tr>
                ))
              : users.map((u) => (
                  <tr key={u.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 text-muted-foreground font-mono text-xs">#{u.id}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground">{u.name ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">{u.email ?? u.clerkUserId}</div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {new Date(u.createdAt).toLocaleDateString("en-IN")}
                    </td>
                    <td className="px-4 py-3 font-semibold">{u.creditsRemaining}</td>
                    <td className="px-4 py-3">₹{(u.totalSpentPaise / 100).toFixed(0)}</td>
                    <td className="px-4 py-3">{u.analysesCount}</td>
                    <td className="px-4 py-3">
                      {u.isSuspended
                        ? <Badge variant="destructive" className="text-xs">Suspended</Badge>
                        : u.isAdmin
                        ? <Badge className="text-xs bg-amber-500">Admin</Badge>
                        : <Badge variant="secondary" className="text-xs">Active</Badge>}
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/admin/users/${u.id}`}>
                        <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs">
                          View <ExternalLink className="h-3 w-3" />
                        </Button>
                      </Link>
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>Page {page} of {totalPages}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

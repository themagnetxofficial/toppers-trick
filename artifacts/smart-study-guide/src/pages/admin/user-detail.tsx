import { useEffect, useState } from "react";
import { useParams, Link } from "wouter";
import { adminApi, AdminUserDetail as AdminUserDetailData } from "@/lib/admin-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, ShieldAlert, ShieldCheck, PlusCircle, UserCog } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function AdminUserDetail() {
  const params = useParams<{ id: string }>();
  const userId = parseInt(params.id, 10);
  const [data, setData] = useState<AdminUserDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [creditAmt, setCreditAmt] = useState("1");
  const [adding, setAdding] = useState(false);
  const { toast } = useToast();

  const load = () => {
    setLoading(true);
    adminApi.getUserDetail(userId).then(setData).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [userId]);

  const handleAddCredits = async () => {
    const amount = parseInt(creditAmt, 10);
    if (!amount || amount < 1) return;
    setAdding(true);
    try {
      await adminApi.addCredits(userId, amount);
      toast({ title: `Added ${amount} credit${amount > 1 ? "s" : ""}` });
      load();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setAdding(false);
  };

  const handleToggleSuspend = async () => {
    try {
      const r = await adminApi.toggleSuspend(userId);
      toast({ title: r.isSuspended ? "User suspended" : "User unsuspended" });
      load();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const handleToggleAdmin = async () => {
    try {
      const r = await adminApi.toggleAdmin(userId);
      toast({ title: r.isAdmin ? "Admin granted" : "Admin revoked" });
      load();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  if (loading) return <Skeleton className="h-96 rounded-2xl" />;
  if (!data) return <p className="text-destructive">User not found</p>;

  const { user, batches, payments, analyses } = data;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <Link href="/admin/users">
          <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-1" />Users</Button>
        </Link>
        <div>
          <h1 className="text-xl font-bold font-serif">{user.name ?? user.email ?? `User #${user.id}`}</h1>
          <p className="text-muted-foreground text-sm">{user.clerkUserId}</p>
        </div>
        {user.isSuspended && <Badge variant="destructive">Suspended</Badge>}
        {user.isAdmin && <Badge className="bg-amber-500">Admin</Badge>}
      </div>

      {/* Info + Actions */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-sm">Account Info</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Email</span><span>{user.email ?? "—"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Name</span><span>{user.name ?? "—"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Joined</span><span>{new Date(user.createdAt).toLocaleDateString("en-IN")}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Total spent</span><span>₹{payments.filter(p => p.status === "success").reduce((s, p) => s + p.amount, 0) / 100}</span></div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Actions</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2 items-center">
              <Input
                type="number" min={1} max={100} value={creditAmt}
                onChange={(e) => setCreditAmt(e.target.value)}
                className="h-9 w-24 rounded-lg"
              />
              <Button size="sm" onClick={handleAddCredits} disabled={adding} className="gap-1">
                <PlusCircle className="h-4 w-4" />
                Add Credits
              </Button>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant={user.isSuspended ? "default" : "destructive"} onClick={handleToggleSuspend} className="gap-1">
                {user.isSuspended ? <><ShieldCheck className="h-4 w-4" />Unsuspend</> : <><ShieldAlert className="h-4 w-4" />Suspend</>}
              </Button>
              <Button size="sm" variant="outline" onClick={handleToggleAdmin} className="gap-1">
                <UserCog className="h-4 w-4" />
                {user.isAdmin ? "Revoke Admin" : "Grant Admin"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Credit Batches */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Credit Batches ({batches.length})</CardTitle></CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead><tr>{["Type", "Total", "Remaining", "Purchased", "Expires"].map(h => <th key={h} className="text-left text-xs text-muted-foreground pb-2 pr-4">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-border">
              {batches.map(b => (
                <tr key={b.id}>
                  <td className="py-2 pr-4"><Badge variant={b.isPaid ? "default" : "secondary"} className="text-xs">{b.isPaid ? "Paid" : "Free"}</Badge></td>
                  <td className="py-2 pr-4">{b.creditsTotal}</td>
                  <td className="py-2 pr-4">{b.creditsRemaining}</td>
                  <td className="py-2 pr-4 text-xs text-muted-foreground">{new Date(b.purchasedAt).toLocaleDateString("en-IN")}</td>
                  <td className="py-2 text-xs text-muted-foreground">{b.expiresAt ? new Date(b.expiresAt).toLocaleDateString("en-IN") : "Never"}</td>
                </tr>
              ))}
              {batches.length === 0 && <tr><td colSpan={5} className="py-4 text-center text-muted-foreground text-xs">No batches</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Payment History */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Payments ({payments.length})</CardTitle></CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead><tr>{["Date", "Package", "Amount", "Razorpay ID", "Status"].map(h => <th key={h} className="text-left text-xs text-muted-foreground pb-2 pr-4">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-border">
              {payments.map(p => (
                <tr key={p.id}>
                  <td className="py-2 pr-4 text-xs text-muted-foreground">{new Date(p.createdAt).toLocaleDateString("en-IN")}</td>
                  <td className="py-2 pr-4 capitalize">{p.packageName ?? (p.amount === 6900 ? "Starter" : "Value")}</td>
                  <td className="py-2 pr-4">₹{p.amount / 100}</td>
                  <td className="py-2 pr-4 text-xs font-mono text-muted-foreground">{p.razorpayPaymentId ?? "—"}</td>
                  <td className="py-2"><Badge variant={p.status === "success" ? "default" : "secondary"} className="text-xs">{p.status}</Badge></td>
                </tr>
              ))}
              {payments.length === 0 && <tr><td colSpan={5} className="py-4 text-center text-muted-foreground text-xs">No payments</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Analyses */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Recent Analyses ({analyses.length})</CardTitle></CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead><tr>{["Date", "Subject", "Category", "Status"].map(h => <th key={h} className="text-left text-xs text-muted-foreground pb-2 pr-4">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-border">
              {analyses.map(a => (
                <tr key={a.id}>
                  <td className="py-2 pr-4 text-xs text-muted-foreground">{new Date(a.createdAt).toLocaleDateString("en-IN")}</td>
                  <td className="py-2 pr-4">{a.subject}</td>
                  <td className="py-2 pr-4 capitalize">{a.category}</td>
                  <td className="py-2"><Badge variant={a.status === "completed" ? "default" : a.status === "failed" ? "destructive" : "secondary"} className="text-xs">{a.status}</Badge></td>
                </tr>
              ))}
              {analyses.length === 0 && <tr><td colSpan={4} className="py-4 text-center text-muted-foreground text-xs">No analyses</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

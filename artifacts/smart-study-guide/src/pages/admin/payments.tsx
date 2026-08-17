import { useEffect, useState } from "react";
import { adminApi, AdminPayment } from "@/lib/admin-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Download } from "lucide-react";

function exportCsv(payments: AdminPayment[]) {
  const headers = ["ID", "Date", "User Email", "Package", "Amount (INR)", "Razorpay ID", "Status"];
  const rows = payments.map((p) => [
    p.id,
    new Date(p.createdAt).toLocaleDateString("en-IN"),
    p.userEmail ?? "",
    p.packageName ?? (p.amount === 6900 ? "starter" : "value"),
    (p.amount / 100).toFixed(2),
    p.razorpayPaymentId ?? "",
    p.status,
  ]);
  const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `payments-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AdminPayments() {
  const [payments, setPayments] = useState<AdminPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const load = () => {
    setLoading(true);
    adminApi.getPayments({ status, from: from || undefined, to: to || undefined })
      .then(setPayments)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [status, from, to]);

  const total = payments.filter(p => p.status === "success").reduce((s, p) => s + p.amount, 0);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-serif">Payments</h1>
          <p className="text-muted-foreground text-sm">
            {payments.length} transactions · ₹{(total / 100).toLocaleString("en-IN")} collected
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => exportCsv(payments)}>
          <Download className="h-4 w-4" /> Export CSV
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-36 rounded-xl">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="success">Success</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40 rounded-xl" placeholder="From" />
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40 rounded-xl" placeholder="To" />
        {(from || to) && (
          <Button variant="ghost" size="sm" onClick={() => { setFrom(""); setTo(""); }}>Clear</Button>
        )}
      </div>

      <div className="rounded-2xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 border-b border-border">
            <tr>
              {["Date", "User", "Package", "Amount", "Razorpay ID", "Status"].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-card">
            {loading
              ? Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}><td colSpan={6} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td></tr>
                ))
              : payments.map((p) => (
                  <tr key={p.id}>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(p.createdAt).toLocaleDateString("en-IN")}</td>
                    <td className="px-4 py-3">
                      <div className="text-sm">{p.userEmail ?? p.userName ?? `User #${p.userId}`}</div>
                    </td>
                    <td className="px-4 py-3 capitalize text-sm">
                      {p.packageName ?? (p.amount === 6900 ? "Starter" : p.amount === 12900 ? "Value" : "—")}
                    </td>
                    <td className="px-4 py-3 font-semibold">₹{(p.amount / 100).toFixed(0)}</td>
                    <td className="px-4 py-3 text-xs font-mono text-muted-foreground">{p.razorpayPaymentId ?? "—"}</td>
                    <td className="px-4 py-3">
                      <Badge
                        variant={p.status === "success" ? "default" : p.status === "failed" ? "destructive" : "secondary"}
                        className="text-xs"
                      >
                        {p.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
        {!loading && payments.length === 0 && (
          <p className="text-center text-muted-foreground py-10 text-sm">No payments found</p>
        )}
      </div>
    </div>
  );
}

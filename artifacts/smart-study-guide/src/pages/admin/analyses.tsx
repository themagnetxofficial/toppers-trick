import { useEffect, useState } from "react";
import { adminApi, AdminAnalysis, AdminAnalysisDetail } from "@/lib/admin-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Eye, X } from "lucide-react";

function DetailModal({ id, onClose }: { id: number; onClose: () => void }) {
  const [detail, setDetail] = useState<AdminAnalysisDetail | null>(null);
  useEffect(() => {
    adminApi.getAnalysisDetail(id).then(setDetail).catch(console.error);
  }, [id]);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Analysis #{id}</DialogTitle>
        </DialogHeader>
        {!detail ? (
          <Skeleton className="h-40 rounded-xl" />
        ) : (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div><span className="text-muted-foreground">Subject: </span>{detail.analysis.subject}</div>
              <div><span className="text-muted-foreground">Category: </span>{detail.analysis.category}</div>
              <div><span className="text-muted-foreground">Status: </span>
                <Badge variant={detail.analysis.status === "completed" ? "default" : "destructive"} className="text-xs">
                  {detail.analysis.status}
                </Badge>
              </div>
              <div><span className="text-muted-foreground">User: </span>{detail.user?.email ?? detail.user?.name ?? "—"}</div>
              {detail.tokens.length > 0 && (
                <div className="col-span-2">
                  <span className="text-muted-foreground">Tokens: </span>
                  {detail.tokens.reduce((s, t) => s + t.inputTokens + t.outputTokens, 0).toLocaleString()} total
                  ({detail.tokens.reduce((s, t) => s + t.inputTokens, 0).toLocaleString()} in /
                  {detail.tokens.reduce((s, t) => s + t.outputTokens, 0).toLocaleString()} out)
                </div>
              )}
            </div>
            {detail.analysis.errorMessage && (
              <div className="rounded-lg bg-destructive/10 text-destructive p-3 text-xs">
                <strong>Error:</strong> {detail.analysis.errorMessage}
              </div>
            )}
            {detail.analysis.aiResponseJson && (
              <div>
                <p className="font-semibold mb-2 text-muted-foreground uppercase text-xs tracking-widest">AI Response JSON</p>
                <pre className="text-xs bg-muted p-3 rounded-xl overflow-auto max-h-60 whitespace-pre-wrap">
                  {JSON.stringify(detail.analysis.aiResponseJson, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function AdminAnalyses() {
  const [analyses, setAnalyses] = useState<AdminAnalysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [detailId, setDetailId] = useState<number | null>(null);

  useEffect(() => {
    setLoading(true);
    adminApi.getAnalyses(statusFilter)
      .then(setAnalyses)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [statusFilter]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-serif">Analyses</h1>
          <p className="text-muted-foreground text-sm">{analyses.length} records</p>
        </div>
      </div>

      <div className="flex gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44 rounded-xl">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="processing">Processing</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-2xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 border-b border-border">
            <tr>
              {["Date", "User", "Subject", "Category", "Status", "Tokens", ""].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-card">
            {loading
              ? Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}><td colSpan={7} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td></tr>
                ))
              : analyses.map((a) => (
                  <tr key={a.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(a.createdAt).toLocaleDateString("en-IN")}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{a.userEmail ?? a.userName ?? `#${a.userId}`}</td>
                    <td className="px-4 py-3 font-medium">{a.subject}</td>
                    <td className="px-4 py-3 capitalize text-sm">{a.category}</td>
                    <td className="px-4 py-3">
                      <Badge
                        variant={a.status === "completed" ? "default" : a.status === "failed" ? "destructive" : "secondary"}
                        className="text-xs"
                      >
                        {a.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{a.tokensUsed.toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => setDetailId(a.id)}>
                        <Eye className="h-3 w-3" /> View
                      </Button>
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
        {!loading && analyses.length === 0 && (
          <p className="text-center text-muted-foreground py-10 text-sm">No analyses found</p>
        )}
      </div>

      {detailId !== null && <DetailModal id={detailId} onClose={() => setDetailId(null)} />}
    </div>
  );
}

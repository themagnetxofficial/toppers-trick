import { useEffect, useState } from "react";
import { adminApi, AdminStats } from "@/lib/admin-api";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { Users, TrendingUp, FileText, Cpu, Package, Star } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

function fmt(paise: number) {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

function StatCard({ title, value, sub, icon: Icon, accent }: {
  title: string; value: string; sub?: string; icon: React.ElementType; accent?: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest">{title}</p>
            <p className={`text-3xl font-bold mt-1 ${accent ? "text-primary" : "text-foreground"}`}>{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
          </div>
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <Icon className="h-4 w-4 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    adminApi.getStats()
      .then(setStats)
      .catch(() => setError("Failed to load stats"));
  }, []);

  if (error) return <p className="text-destructive">{error}</p>;
  if (!stats) return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
      </div>
      <Skeleton className="h-64 rounded-2xl" />
    </div>
  );

  const chartData = stats.chart.map((d) => ({
    date: new Date(d.date).toLocaleDateString("en-IN", { month: "short", day: "numeric" }),
    Signups: d.signups,
    "Revenue (₹)": Math.round(d.revenuePaise / 100),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-serif">Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Overview of ToppersTrick</p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Users"
          value={stats.users.total.toLocaleString()}
          sub={`+${stats.users.thisMonth} this month · +${stats.users.today} today`}
          icon={Users}
        />
        <StatCard
          title="Total Revenue"
          value={fmt(stats.revenue.totalPaise)}
          sub={`${fmt(stats.revenue.thisMonthPaise)} this month · ${fmt(stats.revenue.todayPaise)} today`}
          icon={TrendingUp}
          accent
        />
        <StatCard
          title="Analyses Run"
          value={stats.analyses.total.toLocaleString()}
          sub={`${stats.analyses.thisMonth} this month · ${stats.analyses.today} today`}
          icon={FileText}
        />
        <StatCard
          title="AI Cost (est.)"
          value={`$${(stats.tokens.estimatedCostUsdCents / 100).toFixed(2)}`}
          sub={`${(stats.tokens.total / 1000).toFixed(0)}K total tokens · ${(stats.tokens.thisMonth / 1000).toFixed(0)}K this month`}
          icon={Cpu}
        />
      </div>

      {/* Pack breakdown */}
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <Package className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-widest">Starter Packs Sold</p>
              <p className="text-2xl font-bold">{stats.packs.starter}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <Star className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-widest">Value Packs Sold</p>
              <p className="text-2xl font-bold">{stats.packs.value}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 30-day chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Last 30 Days</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(35 20% 88%)" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} interval={4} />
              <YAxis yAxisId="left" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v) => `₹${v}`} />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(35 20% 88%)" }}
                formatter={(value, name) => name === "Revenue (₹)" ? [`₹${value}`, name] : [value, name]}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line yAxisId="left" type="monotone" dataKey="Signups" stroke="hsl(32 95% 55%)" strokeWidth={2} dot={false} />
              <Line yAxisId="right" type="monotone" dataKey="Revenue (₹)" stroke="hsl(180 50% 45%)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}

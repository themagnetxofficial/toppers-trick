import { useEffect, useState } from "react";
import { Switch, Route, Redirect } from "wouter";
import { useUser } from "@clerk/react";
import { AdminShell } from "@/components/layout/admin-shell";
import { adminApi } from "@/lib/admin-api";
import { Loader2 } from "lucide-react";

import AdminDashboard from "./dashboard";
import AdminUsers from "./users";
import AdminUserDetail from "./user-detail";
import AdminPayments from "./payments";
import AdminAnalyses from "./analyses";
import AdminContact from "./contact";
import AdminBlogList from "./blog-list";
import AdminBlogEditor from "./blog-editor";

function AdminGuard({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn } = useUser();
  const [status, setStatus] = useState<"loading" | "ok" | "denied">("loading");

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) { setStatus("denied"); return; }
    adminApi.check()
      .then(() => setStatus("ok"))
      .catch(() => setStatus("denied"));
  }, [isLoaded, isSignedIn]);

  if (!isLoaded || status === "loading") {
    return (
      <div className="flex items-center justify-center h-screen text-muted-foreground gap-2">
        <Loader2 className="h-5 w-5 animate-spin" /> Checking access…
      </div>
    );
  }
  if (!isSignedIn) return <Redirect to="/sign-in" />;
  if (status === "denied") {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4">
        <h1 className="text-2xl font-bold font-serif">Access Denied</h1>
        <p className="text-muted-foreground">You don't have admin privileges for this app.</p>
        <a href="/" className="text-sm text-primary hover:underline">← Back to app</a>
      </div>
    );
  }
  return <AdminShell>{children}</AdminShell>;
}

export function AdminArea() {
  return (
    <AdminGuard>
      <Switch>
        <Route path="/admin/users/:id" component={AdminUserDetail} />
        <Route path="/admin/users" component={AdminUsers} />
        <Route path="/admin/payments" component={AdminPayments} />
        <Route path="/admin/analyses" component={AdminAnalyses} />
        <Route path="/admin/contact" component={AdminContact} />
        <Route path="/admin/blog/new" component={AdminBlogEditor} />
        <Route path="/admin/blog/:id/edit" component={AdminBlogEditor} />
        <Route path="/admin/blog" component={AdminBlogList} />
        <Route path="/admin" component={AdminDashboard} />
      </Switch>
    </AdminGuard>
  );
}

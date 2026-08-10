import { useGetMe, useGetMyCredits, useGetMyStats } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { User, Mail, Calendar, Coins, FileText, Settings, ArrowRight } from "lucide-react";
import { format } from "date-fns";
import { Link } from "wouter";

export default function ProfilePage() {
  const { data: user, isLoading: userLoading } = useGetMe();
  const { data: credits, isLoading: creditsLoading } = useGetMyCredits();
  const { data: stats, isLoading: statsLoading } = useGetMyStats();

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-12">
      <div>
        <h1 className="text-3xl font-bold font-serif text-foreground">Your Profile</h1>
        <p className="text-muted-foreground mt-1 text-lg">Manage your account and view stats.</p>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {/* User Info */}
        <Card className="md:col-span-2 shadow-sm border-border">
          <CardHeader className="border-b border-border bg-secondary/20 pb-4">
            <CardTitle className="text-lg font-bold flex items-center gap-2">
              <User className="w-5 h-5 text-primary" />
              Account Details
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-6">
            {userLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-6 w-1/2" />
                <Skeleton className="h-6 w-2/3" />
                <Skeleton className="h-6 w-1/3" />
              </div>
            ) : (
              <div className="space-y-6">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xl font-bold uppercase">
                    {user?.name?.charAt(0) || user?.email?.charAt(0) || "U"}
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-foreground">{user?.name || "Student"}</h3>
                    <div className="flex items-center gap-2 text-muted-foreground mt-1">
                      <Mail className="w-4 h-4" />
                      <span>{user?.email || "No email provided"}</span>
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-border flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="w-4 h-4" />
                  <span>Member since {user?.createdAt ? format(new Date(user.createdAt), 'MMMM yyyy') : 'Recently'}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Stats */}
        <div className="space-y-6">
          <Card className="shadow-sm border-primary/20 bg-primary/5">
            <CardContent className="p-6 text-center">
              <div className="mx-auto w-12 h-12 bg-primary/20 rounded-full flex items-center justify-center mb-3">
                <Coins className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-1">Credits</h3>
              {creditsLoading ? (
                <Skeleton className="h-8 w-16 mx-auto" />
              ) : (
                <>
                  <div className="text-3xl font-bold text-foreground mb-1">{credits?.creditsRemaining || 0}</div>
                  {credits?.nextExpiresAt && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 mb-2">
                      Expires {format(new Date(credits.nextExpiresAt), 'dd MMM yyyy')}
                    </p>
                  )}
                </>
              )}
              <Link href="/pricing" className="block w-full">
                <Button variant="outline" size="sm" className="w-full font-semibold border-primary/20 hover:bg-primary/10 text-primary">
                  Buy More
                </Button>
              </Link>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardContent className="p-6 text-center">
              <div className="mx-auto w-12 h-12 bg-secondary rounded-full flex items-center justify-center mb-3">
                <FileText className="w-6 h-6 text-secondary-foreground" />
              </div>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-1">Total Analyses</h3>
              {statsLoading ? (
                <Skeleton className="h-8 w-16 mx-auto" />
              ) : (
                <div className="text-3xl font-bold text-foreground">{stats?.totalAnalyses || 0}</div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Account Settings Placeholder */}
      <Card className="shadow-sm border-border">
        <CardHeader className="border-b border-border bg-secondary/20 pb-4">
          <CardTitle className="text-lg font-bold flex items-center gap-2">
            <Settings className="w-5 h-5 text-primary" />
            Preferences
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <p className="text-muted-foreground mb-4">
            Security and authentication settings are managed securely by Clerk.
          </p>
          <Button variant="outline" className="font-semibold" onClick={() => window.open(window.location.origin + '/profile', '_blank')}>
            Manage Account Security <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

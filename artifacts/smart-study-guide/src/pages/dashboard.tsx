import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { BookOpen, Coins, FileText, PlusCircle, ArrowRight, Clock, AlertTriangle } from "lucide-react";
import { useGetMyStats, useGetMyCredits, useListAnalyses } from "@workspace/api-client-react";
import { formatDistanceToNow } from "date-fns";

export default function DashboardPage() {
  const { data: stats, isLoading: statsLoading } = useGetMyStats();
  const { data: credits, isLoading: creditsLoading } = useGetMyCredits();
  const { data: analyses, isLoading: analysesLoading } = useListAnalyses();

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold font-serif text-foreground">Welcome back!</h1>
          <p className="text-muted-foreground mt-1 text-lg">Ready to decode some more papers?</p>
        </div>
        <Link href="/analyze">
          <Button size="lg" className="rounded-full shadow-md font-semibold gap-2">
            <PlusCircle className="h-5 w-5" />
            Start New Analysis
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Credits Card */}
        <Card className="border-primary/20 shadow-sm relative overflow-hidden bg-primary/5">
          <div className="absolute -right-6 -top-6 text-primary/10">
            <Coins className="w-32 h-32" />
          </div>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <Coins className="w-4 h-4 text-primary" />
              Credits Available
            </CardTitle>
          </CardHeader>
          <CardContent>
            {creditsLoading ? (
              <Skeleton className="h-10 w-24" />
            ) : (
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-bold text-foreground">{credits?.creditsRemaining || 0}</span>
                <span className="text-sm text-muted-foreground font-medium">left</span>
              </div>
            )}
          </CardContent>
          <CardFooter className="pt-0 relative z-10">
            <Link href="/pricing" className="text-sm font-medium text-primary hover:underline flex items-center">
              Get more credits <ArrowRight className="w-4 h-4 ml-1" />
            </Link>
          </CardFooter>
        </Card>

        {/* Stats Card 1 */}
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <FileText className="w-4 h-4 text-muted-foreground" />
              Total Analyses
            </CardTitle>
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-10 w-16" />
            ) : (
              <span className="text-4xl font-bold text-foreground">{stats?.totalAnalyses || 0}</span>
            )}
          </CardContent>
        </Card>

        {/* Stats Card 2 */}
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-muted-foreground" />
              Subjects Decoded
            </CardTitle>
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-10 w-16" />
            ) : (
              <span className="text-4xl font-bold text-foreground">{stats?.subjectsAnalyzed?.length || 0}</span>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4 pt-4">
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-bold font-serif text-foreground">Recent Analyses</h2>
          {analyses && analyses.length > 3 && (
            <Link href="/history">
              <Button variant="ghost" size="sm" className="text-muted-foreground">View all</Button>
            </Link>
          )}
        </div>

        {analysesLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <Card key={i} className="shadow-sm"><CardContent className="p-6"><Skeleton className="h-12 w-full" /></CardContent></Card>
            ))}
          </div>
        ) : analyses && analyses.length > 0 ? (
          <div className="grid gap-4">
            {analyses.slice(0, 5).map((analysis) => (
              <Link key={analysis.id} href={`/analyses/${analysis.id}`}>
                <Card className="shadow-sm hover:shadow-md transition-shadow cursor-pointer border-border hover:border-primary/30 group">
                  <CardContent className="p-4 sm:p-6 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
                        analysis.status === 'completed' ? 'bg-green-100 text-green-700' :
                        analysis.status === 'processing' ? 'bg-secondary text-secondary-foreground animate-pulse' :
                        analysis.status === 'failed' ? 'bg-red-100 text-red-700' :
                        'bg-gray-100 text-gray-500'
                      }`}>
                        {analysis.status === 'completed' ? <BookOpen className="w-6 h-6" /> :
                         analysis.status === 'processing' ? <Clock className="w-6 h-6" /> :
                         analysis.status === 'failed' ? <AlertTriangle className="w-6 h-6" /> :
                         <FileText className="w-6 h-6" />}
                      </div>
                      <div>
                        <h3 className="font-bold text-lg text-foreground group-hover:text-primary transition-colors">{analysis.subject}</h3>
                        <p className="text-sm text-muted-foreground font-medium">
                          {analysis.category === 'college' ? 'College / Uni' : 'School'} 
                          {analysis.classOrCourse && ` • ${analysis.classOrCourse}`}
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex flex-col items-end gap-2">
                      <Badge variant={
                        analysis.status === 'completed' ? 'success' :
                        analysis.status === 'processing' ? 'warning' :
                        analysis.status === 'failed' ? 'destructive' : 'secondary'
                      } className="capitalize px-3 py-1">
                        {analysis.status}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(analysis.createdAt), { addSuffix: true })}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        ) : (
          <Card className="border-dashed border-2 bg-transparent shadow-none">
            <CardContent className="p-12 flex flex-col items-center justify-center text-center">
              <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
                <FileText className="w-8 h-8 text-muted-foreground opacity-50" />
              </div>
              <h3 className="text-xl font-bold font-serif mb-2">No analyses yet</h3>
              <p className="text-muted-foreground max-w-sm mb-6">You haven't uploaded any papers yet. Start your first analysis to get your smart study guide!</p>
              <Link href="/analyze">
                <Button className="rounded-full shadow-md font-semibold">Start First Analysis</Button>
              </Link>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

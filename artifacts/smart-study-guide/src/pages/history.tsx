import { Link } from "wouter";
import {
  getListAnalysesQueryKey,
  useListAnalyses,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, Clock, AlertTriangle, BookOpen, ChevronRight, Calendar, Layers, History } from "lucide-react";
import { format } from "date-fns";
import { getAnalysisProcessingSummary } from "@/components/analysis-processing-status";

export default function HistoryPage() {
  const { data: analyses, isLoading } = useListAnalyses({
    query: {
      queryKey: getListAnalysesQueryKey(),
      refetchInterval: (query) =>
        query.state.data?.some(
          (analysis) =>
            analysis.status === "processing" || analysis.status === "pending",
        )
          ? 2000
          : false,
      refetchOnMount: "always",
    },
  });

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-6">
        <div>
          <h1 className="text-3xl font-bold font-serif text-foreground">Analysis History</h1>
          <p className="text-muted-foreground mt-1 text-lg">Your past decoded subjects.</p>
        </div>
        <Link href="/analyze">
          <Button className="rounded-full shadow-md font-semibold">New Analysis</Button>
        </Link>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3, 4].map(i => (
            <Card key={i} className="shadow-sm"><CardContent className="p-6"><Skeleton className="h-16 w-full" /></CardContent></Card>
          ))}
        </div>
      ) : analyses && analyses.length > 0 ? (
        <div className="space-y-4">
          {analyses.map((analysis) => (
            <Link key={analysis.id} href={`/analyses/${analysis.id}`} className="block">
              <Card className="shadow-sm hover:shadow-md transition-all cursor-pointer border-border hover:border-primary/40 group">
                <CardContent className="p-4 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6">
                  {/* Status Icon */}
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 ${
                    analysis.status === 'completed' ? 'bg-green-100 text-green-700' :
                    analysis.status === 'processing' ? 'bg-secondary text-secondary-foreground animate-pulse' :
                    analysis.status === 'failed' ? 'bg-red-100 text-red-700' :
                    'bg-gray-100 text-gray-500'
                  }`}>
                    {analysis.status === 'completed' ? <BookOpen className="w-7 h-7" /> :
                     analysis.status === 'processing' ? <Clock className="w-7 h-7" /> :
                     analysis.status === 'failed' ? <AlertTriangle className="w-7 h-7" /> :
                     <FileText className="w-7 h-7" />}
                  </div>
                  
                  {/* Details */}
                  <div className="flex-1 space-y-1 w-full">
                    <div className="flex items-start justify-between">
                      <h3 className="font-bold text-xl text-foreground group-hover:text-primary transition-colors">{analysis.subject}</h3>
                      <Badge variant={
                        analysis.status === 'completed' ? 'success' :
                        analysis.status === 'processing' ? 'warning' :
                        analysis.status === 'failed' ? 'destructive' : 'secondary'
                      } className="capitalize px-3 py-0.5 whitespace-nowrap hidden sm:flex">
                        {analysis.status}
                      </Badge>
                    </div>
                    
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground mt-2">
                      <span className="flex items-center gap-1.5">
                        <Layers className="w-4 h-4" />
                        <span className="capitalize">{analysis.category}</span>
                        {analysis.classOrCourse && ` • ${analysis.classOrCourse}`}
                      </span>
                      <span className="hidden sm:inline text-border">•</span>
                      <span className="flex items-center gap-1.5">
                        <Calendar className="w-4 h-4" />
                        {format(new Date(analysis.createdAt), 'MMM d, yyyy')}
                      </span>
                      <Badge variant={
                        analysis.status === 'completed' ? 'success' :
                        analysis.status === 'processing' ? 'warning' :
                        analysis.status === 'failed' ? 'destructive' : 'secondary'
                      } className="capitalize px-3 py-0.5 whitespace-nowrap sm:hidden mt-2 w-fit">
                        {analysis.status}
                      </Badge>
                    </div>
                    {(analysis.status === "processing" ||
                      analysis.status === "pending") && (
                      <p className="text-sm text-primary font-medium pt-1">
                        {getAnalysisProcessingSummary(analysis)}
                      </p>
                    )}
                  </div>

                  {/* Arrow */}
                  <div className="hidden sm:flex items-center justify-center w-10 h-10 rounded-full bg-secondary/50 group-hover:bg-primary/10 text-muted-foreground group-hover:text-primary transition-colors">
                    <ChevronRight className="w-5 h-5" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <Card className="border-dashed border-2 bg-transparent shadow-none">
          <CardContent className="p-16 flex flex-col items-center justify-center text-center">
            <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mb-6">
              <History className="w-10 h-10 text-muted-foreground opacity-50" />
            </div>
            <h3 className="text-2xl font-bold font-serif mb-2">No history yet</h3>
            <p className="text-muted-foreground max-w-md mx-auto mb-8 text-lg">
              You haven't requested any study guides. Once you upload papers and generate an analysis, it will appear here forever.
            </p>
            <Link href="/analyze">
              <Button size="lg" className="rounded-full shadow-md font-semibold px-8">Start First Analysis</Button>
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}


import { useParams } from "wouter";
import { useGetAnalysis, useDownloadAnalysisPdf, useRetryAnalysis } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Download, FileText, AlertCircle, Lightbulb, Target, Sparkles, AlertTriangle, Info, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function AnalysisResultPage() {
  const params = useParams();
  const id = parseInt(params.id || "0", 10);

  const { data: analysis, isLoading, error } = useGetAnalysis(id, {
    query: { enabled: !!id }
  });

  const { refetch: getPdfUrl } = useDownloadAnalysisPdf(id, {
    query: { enabled: false } // only fetch when clicked
  });

  const { mutate: retryAnalysis, isPending: isRetrying } = useRetryAnalysis({
    mutation: {
      onSuccess: () => {
        toast.success("Retry started! Your credit has been deducted. Refreshing shortly…");
      },
      onError: (err: unknown) => {
        const msg =
          err && typeof err === "object" && "message" in err
            ? String((err as { message: string }).message)
            : "Failed to start retry. Please try again.";
        toast.error(msg);
      },
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-4xl mx-auto">
        <Skeleton className="h-12 w-3/4" />
        <Skeleton className="h-32 w-full" />
        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-48 w-full" />)}
        </div>
      </div>
    );
  }

  if (error || !analysis) {
    return (
      <Card className="max-w-2xl mx-auto border-destructive">
        <CardContent className="p-12 text-center flex flex-col items-center">
          <AlertCircle className="h-12 w-12 text-destructive mb-4" />
          <h2 className="text-xl font-bold font-serif mb-2">Analysis Not Found</h2>
          <p className="text-muted-foreground">We couldn't load this analysis. It might have been deleted or there was an error.</p>
        </CardContent>
      </Card>
    );
  }

  if (analysis.status === 'processing') {
    return (
      <Card className="max-w-2xl mx-auto border-primary/20 bg-primary/5">
        <CardContent className="p-12 text-center flex flex-col items-center">
          <div className="w-16 h-16 border-4 border-primary/20 border-t-primary rounded-full animate-spin mb-4" />
          <h2 className="text-xl font-bold font-serif mb-2">Still Processing...</h2>
          <p className="text-muted-foreground">Your study guide is currently being generated. Please wait.</p>
        </CardContent>
      </Card>
    );
  }

  if (analysis.status === 'failed') {
    return (
      <Card className="max-w-2xl mx-auto border-destructive bg-destructive/5">
        <CardContent className="p-12 text-center flex flex-col items-center gap-4">
          <AlertTriangle className="h-12 w-12 text-destructive mb-2" />
          <h2 className="text-xl font-bold font-serif text-destructive">Analysis Failed</h2>
          <p className="text-muted-foreground">
            {analysis.errorMessage || "Something went wrong while analyzing your papers."}
          </p>
          <Button
            onClick={() => retryAnalysis({ id })}
            disabled={isRetrying}
            className="mt-2 rounded-full gap-2"
          >
            <RefreshCw className={cn("w-4 h-4", isRetrying && "animate-spin")} />
            {isRetrying ? "Starting retry…" : "Retry Analysis"}
          </Button>
          <p className="text-xs text-muted-foreground">
            Retrying will deduct 1 credit from your balance.
          </p>
        </CardContent>
      </Card>
    );
  }

  const ai = analysis.aiResponse;

  const handleDownloadPdf = async () => {
    try {
      const { data } = await getPdfUrl();
      if (data?.url) {
        window.open(data.url, '_blank');
      } else {
        toast.error("PDF is not ready yet.");
      }
    } catch (e) {
      toast.error("Failed to generate PDF download link.");
    }
  };

  const getPriorityColor = (priority: string) => {
    switch(priority.toLowerCase()) {
      case 'high': return 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-900/50';
      case 'medium': return 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-900/50';
      case 'low': return 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-900/50';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 bg-card border border-border p-6 sm:p-8 rounded-2xl shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="relative z-10 space-y-2">
          <div className="flex items-center gap-2 mb-4">
            <Badge variant="secondary" className="uppercase tracking-wider">{analysis.category}</Badge>
            {analysis.classOrCourse && <span className="text-sm font-medium text-muted-foreground">• {analysis.classOrCourse}</span>}
          </div>
          <h1 className="text-4xl font-bold font-serif text-foreground">{analysis.subject}</h1>
          <p className="text-muted-foreground flex items-center gap-2">
            <FileText className="w-4 h-4" /> Analyzed from {ai?.years_analyzed || analysis.yearsAnalyzed || '?'} years of past papers
          </p>
        </div>
        <div className="relative z-10 w-full md:w-auto">
          {analysis.hasPdf ? (
            <Button onClick={handleDownloadPdf} size="lg" className="w-full md:w-auto rounded-full font-semibold shadow-md gap-2">
              <Download className="w-5 h-5" /> Download Study Guide PDF
            </Button>
          ) : (
            <Button disabled size="lg" className="w-full md:w-auto rounded-full font-semibold bg-muted text-muted-foreground gap-2">
              <Download className="w-5 h-5" /> PDF Not Available
            </Button>
          )}
        </div>
      </div>

      {/* Overall Strategy Tip */}
      {ai?.overall_strategy_tip && (
        <Card className="border-primary/30 shadow-sm bg-gradient-to-br from-primary/10 to-background overflow-hidden relative">
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary" />
          <CardContent className="p-6 sm:p-8">
            <div className="flex gap-4">
              <div className="w-12 h-12 bg-primary/20 rounded-full flex items-center justify-center shrink-0">
                <Lightbulb className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h3 className="text-xl font-bold font-serif mb-2 text-foreground">Top Strategy</h3>
                <p className="text-foreground/80 leading-relaxed text-lg">{ai.overall_strategy_tip}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Chapters Grid */}
      <div className="space-y-6">
        <div className="flex items-center gap-2 px-2">
          <Target className="w-6 h-6 text-primary" />
          <h2 className="text-2xl font-bold font-serif">Chapter Priority List</h2>
        </div>
        
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {ai?.chapters?.map((chapter, index) => (
            <Card key={index} className="flex flex-col h-full border-border/60 hover:shadow-md transition-all duration-300 hover:border-primary/30 relative overflow-hidden group">
              <div className={cn("absolute top-0 left-0 w-full h-1", getPriorityColor(chapter.priority).split(' ')[0])} />
              <CardHeader className="pb-3 pt-6">
                <div className="flex justify-between items-start mb-2 gap-4">
                  <Badge variant="outline" className={cn("border px-2 py-0.5 shadow-sm", getPriorityColor(chapter.priority))}>
                    {chapter.priority} Priority
                  </Badge>
                  <div className="flex flex-col items-end text-xs font-medium text-muted-foreground whitespace-nowrap bg-secondary/50 px-2 py-1 rounded-md">
                    <span>{chapter.marks_weightage} marks</span>
                    <span>{chapter.frequency}x asked</span>
                  </div>
                </div>
                <CardTitle className="text-xl font-bold font-serif leading-tight group-hover:text-primary transition-colors">
                  {chapter.chapter_name}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex-1 pb-6 space-y-3">
                {chapter.study_note ? (
                  <div className="bg-muted/50 rounded-lg p-4 border border-border/50">
                    <div className="flex items-start gap-2">
                      <Sparkles className="w-4 h-4 text-primary mt-1 shrink-0" />
                      <p className="text-sm text-foreground/80 leading-relaxed">{chapter.study_note}</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground italic p-2">
                    <Info className="w-4 h-4" /> Study notes not available.
                  </div>
                )}
                {Array.isArray((chapter as { key_terms?: string[] }).key_terms) && (chapter as { key_terms?: string[] }).key_terms!.length > 0 && (
                  <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
                    <p className="text-xs font-semibold text-primary mb-2 uppercase tracking-wider">Key Terms</p>
                    <div className="flex flex-wrap gap-1.5">
                      {(chapter as { key_terms?: string[] }).key_terms!.map((term, ti) => (
                        <span key={ti} className="inline-block bg-background border border-border/60 rounded-full px-2.5 py-0.5 text-xs text-foreground/80 font-medium">
                          {term}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

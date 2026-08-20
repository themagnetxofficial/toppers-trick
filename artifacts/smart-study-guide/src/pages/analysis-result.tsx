import { useState } from "react";
import { useParams } from "wouter";
import { useGetAnalysis, useDownloadAnalysisPdf, useRetryAnalysis } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Download, FileText, AlertCircle, Lightbulb, Target, Sparkles, AlertTriangle, Info, RefreshCw, Layers, Link } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ─── Type helpers for both old and new schema ────────────────────────────────

interface QuestionTypeBreakdown {
  // new schema field names
  mcq?: string;
  short?: string;
  long?: string;
  case_study?: string;
  // old schema field names (backward compat)
  short_answer?: string;
  long_answer?: string;
  numerical_or_case_study?: string;
}

interface StudyNoteObj {
  kya_padhna_hai?: string;
  kaise_poochha_jaata_hai?: string;
  repeat_pattern?: string;
}

interface TopicData {
  // new schema
  topic_name?: string;
  priority?: "High" | "Medium" | "Low";
  frequency?: number;
  years_appeared?: string[];
  confidence_level?: "High" | "Medium" | "Low";
  question_type_breakdown?: QuestionTypeBreakdown;
  study_note?: string | StudyNoteObj;
  key_terms?: string[];
  marks_weightage?: string;
  // old schema compat
  chapter_name?: string;
  overall_priority?: "High" | "Medium" | "Low";
  total_frequency?: number;
}

interface PaperSummaryData {
  paper?: string;
  summary?: string;
  question_count?: number;
  distinctive_topics?: string[];
}

function getTopicName(t: TopicData): string {
  return t.topic_name ?? t.chapter_name ?? "—";
}
function getPriority(t: TopicData): "High" | "Medium" | "Low" {
  return t.priority ?? t.overall_priority ?? "Low";
}
function getFrequency(t: TopicData): number {
  return t.frequency ?? t.total_frequency ?? 0;
}

// ─── Color helpers ────────────────────────────────────────────────────────────

function priorityBadgeClass(p: string) {
  switch (p.toLowerCase()) {
    case "high": return "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400";
    case "medium": return "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400";
    case "low": return "bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-400";
    default: return "bg-gray-100 text-gray-800";
  }
}

function priorityLabel(p: string): string {
  switch (p.toLowerCase()) {
    case "high": return "Must Do";
    case "medium": return "Should Do";
    case "low": return "If Time";
    default: return p;
  }
}

function confidenceBadgeClass(c: string) {
  switch (c.toLowerCase()) {
    case "high": return "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400";
    case "medium": return "bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400";
    case "low": return "bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-900/30 dark:text-rose-400";
    default: return "bg-gray-100 text-gray-800";
  }
}

function confidenceLabel(c: string): string {
  switch (c.toLowerCase()) {
    case "high": return "✓ High Confidence";
    case "medium": return "~ Medium Confidence";
    case "low": return "? Low Confidence";
    default: return c;
  }
}

function priorityAccentClass(p: string) {
  switch (p.toLowerCase()) {
    case "high": return "bg-red-500";
    case "medium": return "bg-amber-500";
    case "low": return "bg-green-500";
    default: return "bg-gray-400";
  }
}

export default function AnalysisResultPage() {
  const params = useParams();
  const id = parseInt(params.id || "0", 10);

  const { data: analysis, isLoading, error } = useGetAnalysis(id, {
    query: { enabled: !!id }
  });

  const { refetch: getPdfUrl } = useDownloadAnalysisPdf(id, {
    query: { enabled: false }
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

  const ai = analysis.aiResponse as {
    subject?: string;
    years_analyzed?: string[] | number;
    paper_summaries?: PaperSummaryData[];
    // new schema
    topics?: TopicData[];
    related_topic_pairs?: string[];
    // old schema compat
    chapters?: TopicData[];
    cross_chapter_patterns?: string[];
    overall_strategy_tip?: string;
  } | undefined;

  const handleDownloadPdf = async () => {
    try {
      const { data } = await getPdfUrl();
      if (data?.url) {
        window.open(data.url, '_blank');
      } else {
        toast.error("PDF is not ready yet.");
      }
    } catch {
      toast.error("Failed to generate PDF download link.");
    }
  };

  const yearsDisplay = (() => {
    const ya = ai?.years_analyzed;
    if (Array.isArray(ya)) return `${ya.length} year(s)`;
    if (typeof ya === "number") return `${ya} year(s)`;
    return `${analysis.yearsAnalyzed ?? "?"} year(s)`;
  })();

  const allYears: string[] = Array.isArray(ai?.years_analyzed)
    ? ai!.years_analyzed as string[]
    : Array.from({ length: analysis.yearsAnalyzed ?? 0 }, (_, i) => `Paper ${i + 1}`);
  const paperSummaries: PaperSummaryData[] = Array.isArray(ai?.paper_summaries)
    ? ai.paper_summaries
    : [];

  // Support both new (topics) and old (chapters) schema
  const allTopics: TopicData[] = (ai?.topics ?? ai?.chapters ?? []) as TopicData[];
  const relatedPairs: string[] = ai?.related_topic_pairs ?? ai?.cross_chapter_patterns ?? [];

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
            <FileText className="w-4 h-4" /> Analyzed from {yearsDisplay} of past papers
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

      {/* Coverage across every uploaded paper */}
      {allYears.length > 0 && (
        <Card className="border-primary/20 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-xl font-bold font-serif">Papers Covered</CardTitle>
            <p className="text-sm text-muted-foreground">
              Har uploaded previous-year paper ko alag se read karke compare kiya gaya hai.
            </p>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {allYears.map((paper) => {
              const summary = paperSummaries.find((item) => item.paper === paper);
              return (
                <div key={paper} className="rounded-xl border border-border bg-muted/20 p-4">
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <span className="font-semibold">{paper}</span>
                    <Badge variant="secondary">✓ Included</Badge>
                  </div>
                  {summary?.question_count !== undefined && summary.question_count > 0 && (
                    <p className="text-xs text-muted-foreground mb-2">
                      About {summary.question_count} questions identified
                    </p>
                  )}
                  {summary?.summary ? (
                    <p className="text-sm text-foreground/80 leading-relaxed">{summary.summary}</p>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Is paper ke questions ko combined pattern analysis mein include kiya gaya hai.
                    </p>
                  )}
                  {summary?.distinctive_topics && summary.distinctive_topics.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {summary.distinctive_topics.map((topic, index) => (
                        <span key={`${topic}-${index}`} className="text-xs rounded-full bg-background border border-border px-2 py-1">
                          {topic}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

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

      {/* Related Topic Pairs */}
      {relatedPairs.length > 0 && (
        <Card className="border-indigo-200 dark:border-indigo-900/30 bg-indigo-50/50 dark:bg-indigo-900/10">
          <CardContent className="p-6">
            <div className="flex items-center gap-2 mb-3">
              <Link className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              <h3 className="text-lg font-bold font-serif text-indigo-800 dark:text-indigo-300">Related Topic Pairs</h3>
            </div>
            <p className="text-xs text-muted-foreground mb-3">Yeh topics exam mein aksar ek saath poochhe jaate hain — inhe milake padho.</p>
            <ul className="space-y-2">
              {relatedPairs.map((pair, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-foreground/80 bg-white dark:bg-indigo-900/20 rounded-lg p-3 border border-indigo-100 dark:border-indigo-900/30">
                  <span className="text-indigo-500 font-bold shrink-0">{i + 1}.</span>
                  {pair}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Strategy Tiers */}
      {allTopics.length > 0 && (() => {
        const high = allTopics.filter(t => getPriority(t) === 'High').sort((a, b) => getFrequency(b) - getFrequency(a));
        const medium = allTopics.filter(t => getPriority(t) === 'Medium').sort((a, b) => getFrequency(b) - getFrequency(a));
        const low = allTopics.filter(t => getPriority(t) === 'Low').sort((a, b) => getFrequency(b) - getFrequency(a));
        const total = allTopics.length;
        const totalFreq = allTopics.reduce((s, t) => s + getFrequency(t), 0) || 1;
        const freqCov = (ts: TopicData[]) => Math.round(ts.reduce((s, t) => s + getFrequency(t), 0) / totalFreq * 100);

        const tiers = [
          {
            emoji: '🎯', title: 'Bas Pass Hona Hai', subtitle: 'Just want to pass',
            topics: high, count: high.length, coverage: freqCov(high),
            color: 'border-red-200 bg-red-50 dark:bg-red-900/10 dark:border-red-900/30',
            badge: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
            dot: 'bg-red-500',
          },
          {
            emoji: '📈', title: 'Average Score Chahiye', subtitle: 'Want a decent score',
            topics: [...high, ...medium], count: high.length + medium.length, coverage: freqCov([...high, ...medium]),
            color: 'border-amber-200 bg-amber-50 dark:bg-amber-900/10 dark:border-amber-900/30',
            badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
            dot: 'bg-amber-500',
          },
          {
            emoji: '🏆', title: 'Top Karna Hai', subtitle: 'Want to top the exam',
            topics: [...high, ...medium, ...low], count: total, coverage: 100,
            color: 'border-green-200 bg-green-50 dark:bg-green-900/10 dark:border-green-900/30',
            badge: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
            dot: 'bg-green-500',
          },
        ];

        return (
          <div className="space-y-4">
            <div className="flex items-center gap-2 px-2">
              <Layers className="w-6 h-6 text-primary" />
              <h2 className="text-2xl font-bold font-serif">Apni Strategy Chuno</h2>
            </div>
            <p className="text-sm text-muted-foreground px-2">Pick your goal — here's exactly which topics to study based on past paper patterns.</p>
            <div className="grid md:grid-cols-3 gap-4">
              {tiers.map((tier) => (
                <Card key={tier.title} className={`border-2 ${tier.color} flex flex-col`}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-2xl">{tier.emoji}</span>
                      <span className={`text-xs font-semibold px-2 py-1 rounded-full ${tier.badge}`}>
                        {tier.count}/{total} topics · ~{tier.coverage}%
                      </span>
                    </div>
                    <CardTitle className="text-base font-bold font-serif mt-1">{tier.title}</CardTitle>
                    <p className="text-xs text-muted-foreground">{tier.subtitle}</p>
                  </CardHeader>
                  <CardContent className="flex-1 pt-0">
                    <ol className="space-y-1">
                      {tier.topics.map((t, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm">
                          <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${tier.dot}`} />
                          <span className="text-foreground/80">{getTopicName(t)}</span>
                        </li>
                      ))}
                    </ol>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Topic list */}
      <div className="space-y-6">
        <div className="flex items-center gap-2 px-2">
          <Target className="w-6 h-6 text-primary" />
          <h2 className="text-2xl font-bold font-serif">Topic Priority List</h2>
        </div>

        <div className="space-y-4">
          {allTopics.length > 0 ? allTopics.map((topic, index) => {
            const priority = getPriority(topic);
            const frequency = getFrequency(topic);
            const confidence = topic.confidence_level;
            const studyNote = topic.study_note;
            const isNoteObj = studyNote && typeof studyNote === "object";
            const isNoteStr = studyNote && typeof studyNote === "string";

            // Year-wise presence dots
            const yearDots = allYears.length > 0
              ? allYears.map(y => ({
                  year: y,
                  present: (topic.years_appeared ?? []).includes(y),
                }))
              : (topic.years_appeared ?? []).map(y => ({ year: y, present: true }));

            const qt = topic.question_type_breakdown;
            const qtParts = qt
              ? [
                  qt.mcq && qt.mcq !== "None" ? `MCQ: ${qt.mcq}` : null,
                  // new schema
                  qt.short && qt.short !== "None" ? `Short: ${qt.short}` : null,
                  qt.long && qt.long !== "None" ? `Long: ${qt.long}` : null,
                  qt.case_study && qt.case_study !== "None" ? `Case Study: ${qt.case_study}` : null,
                  // old schema compat
                  qt.short_answer && qt.short_answer !== "None" && !qt.short ? `Short: ${qt.short_answer}` : null,
                  qt.long_answer && qt.long_answer !== "None" && !qt.long ? `Long: ${qt.long_answer}` : null,
                  qt.numerical_or_case_study && qt.numerical_or_case_study !== "None" && !qt.case_study ? `Case/Num: ${qt.numerical_or_case_study}` : null,
                ].filter(Boolean)
              : [];

            return (
              <Card key={index} className="border-border/60 hover:shadow-md transition-all duration-300 hover:border-primary/30 relative overflow-hidden">
                <div className={cn("absolute top-0 left-0 w-1 h-full", priorityAccentClass(priority))} />

                <CardContent className="p-5 pl-6">
                  {/* Top row: name + badges + freq */}
                  <div className="flex flex-wrap items-start gap-2 mb-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-bold font-serif leading-tight">{getTopicName(topic)}</h3>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 flex-wrap">
                      <Badge variant="outline" className={cn("border text-xs px-2 py-0.5", priorityBadgeClass(priority))}>
                        {priorityLabel(priority)}
                      </Badge>
                      {confidence && (
                        <Badge variant="outline" className={cn("border text-xs px-2 py-0.5", confidenceBadgeClass(confidence))}>
                          {confidenceLabel(confidence)}
                        </Badge>
                      )}
                      <div className="text-xs font-medium text-muted-foreground bg-secondary/50 px-2 py-1 rounded-md whitespace-nowrap">
                        {topic.marks_weightage && <span>{topic.marks_weightage} · </span>}
                        {frequency}× asked
                      </div>
                    </div>
                  </div>

                  {/* Year-wise presence */}
                  {yearDots.length > 0 && (
                    <div className="flex items-center gap-1.5 mb-3 flex-wrap">
                      <span className="text-xs text-muted-foreground">Years:</span>
                      {yearDots.map(({ year, present }) => (
                        <span
                          key={year}
                          className={cn(
                            "inline-flex items-center gap-0.5 text-xs font-medium px-1.5 py-0.5 rounded",
                            present
                              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                              : "bg-muted text-muted-foreground line-through opacity-60"
                          )}
                        >
                          {present ? "✓" : "✗"} {year}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Question-type breakdown */}
                  {qtParts.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {qtParts.map((part, pi) => (
                        <span key={pi} className="text-xs bg-muted px-2 py-0.5 rounded-full text-muted-foreground">
                          {part}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Study note */}
                  {isNoteObj && (
                    <div className="bg-muted/50 rounded-lg p-3 border border-border/50 space-y-2 mb-3">
                      {(studyNote as StudyNoteObj).kya_padhna_hai && (
                        <div>
                          <p className="text-xs font-bold text-primary uppercase tracking-wider mb-0.5">Kya Padhna Hai</p>
                          <p className="text-sm text-foreground/80 leading-relaxed">{(studyNote as StudyNoteObj).kya_padhna_hai}</p>
                        </div>
                      )}
                      {(studyNote as StudyNoteObj).kaise_poochha_jaata_hai && (
                        <div>
                          <p className="text-xs font-bold text-amber-600 uppercase tracking-wider mb-0.5">Kaise Poochha Jaata Hai</p>
                          <p className="text-sm text-foreground/80 leading-relaxed">{(studyNote as StudyNoteObj).kaise_poochha_jaata_hai}</p>
                        </div>
                      )}
                      {(studyNote as StudyNoteObj).repeat_pattern && (
                        <div>
                          <p className="text-xs font-bold text-red-600 uppercase tracking-wider mb-0.5">Repeat Pattern</p>
                          <p className="text-sm text-foreground/80 leading-relaxed">{(studyNote as StudyNoteObj).repeat_pattern}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {isNoteStr && (
                    <div className="bg-muted/50 rounded-lg p-3 border border-border/50 mb-3">
                      <div className="flex items-start gap-2">
                        <Sparkles className="w-4 h-4 text-primary mt-1 shrink-0" />
                        <p className="text-sm text-foreground/80 leading-relaxed">{studyNote as string}</p>
                      </div>
                    </div>
                  )}

                  {!studyNote && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground italic p-2 mb-3">
                      <Info className="w-4 h-4" /> Study notes not available.
                    </div>
                  )}

                  {/* Key terms */}
                  {Array.isArray(topic.key_terms) && topic.key_terms.length > 0 && (
                    <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
                      <p className="text-xs font-semibold text-primary mb-1.5 uppercase tracking-wider">Key Terms</p>
                      <div className="flex flex-wrap gap-1.5">
                        {topic.key_terms.map((term, ti) => (
                          <span key={ti} className="inline-block bg-background border border-border/60 rounded-full px-2.5 py-0.5 text-xs text-foreground/80 font-medium">
                            {term}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          }) : (
            <Card className="border-amber-300 bg-amber-50/70 dark:border-amber-900/50 dark:bg-amber-950/20">
              <CardContent className="p-6 flex gap-4">
                <AlertTriangle className="w-6 h-6 shrink-0 text-amber-600 dark:text-amber-400" />
                <div>
                  <h3 className="font-bold text-foreground">Topic details are unavailable</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    This saved analysis did not contain a topic list. Please create a new analysis with the same papers; new analyses now stop safely instead of showing an incomplete guide.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

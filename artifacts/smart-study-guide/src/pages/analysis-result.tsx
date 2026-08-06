import { useState } from "react";
import { useParams } from "wouter";
import { useGetAnalysis, useDownloadAnalysisPdf, useRetryAnalysis } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Download, FileText, AlertCircle, Lightbulb, Target, Sparkles, AlertTriangle, Info, RefreshCw, Layers, ChevronDown, ChevronUp, Link } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ─── Type helpers for both old and new schema ────────────────────────────────

interface SubTopic {
  sub_topic_name: string;
  frequency: number;
  years_appeared?: string[];
  note?: string;
}

interface QuestionTypeBreakdown {
  mcq?: string;
  short_answer?: string;
  long_answer?: string;
  numerical_or_case_study?: string;
}

interface StudyNoteObj {
  kya_padhna_hai?: string;
  kaise_poochha_jaata_hai?: string;
  repeat_pattern?: string;
}

interface ChapterData {
  chapter_name: string;
  // new schema
  overall_priority?: "High" | "Medium" | "Low";
  total_frequency?: number;
  years_appeared?: string[];
  confidence_level?: "High" | "Medium" | "Low";
  question_type_breakdown?: QuestionTypeBreakdown;
  sub_topics?: SubTopic[];
  study_note?: string | StudyNoteObj;
  key_terms?: string[];
  marks_weightage?: string;
  // old schema compat
  priority?: "High" | "Medium" | "Low";
  frequency?: number;
}

function getPriority(ch: ChapterData): "High" | "Medium" | "Low" {
  return ch.overall_priority ?? ch.priority ?? "Low";
}
function getFrequency(ch: ChapterData): number {
  return ch.total_frequency ?? ch.frequency ?? 0;
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

function confidenceBadgeClass(c: string) {
  switch (c.toLowerCase()) {
    case "high": return "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400";
    case "medium": return "bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400";
    case "low": return "bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-900/30 dark:text-rose-400";
    default: return "bg-gray-100 text-gray-800";
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

  const [expandedSubTopics, setExpandedSubTopics] = useState<Set<number>>(new Set());
  const toggleSubTopics = (i: number) =>
    setExpandedSubTopics((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });

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
    chapters?: ChapterData[];
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
    : [];

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

      {/* Cross-chapter patterns */}
      {ai?.cross_chapter_patterns && ai.cross_chapter_patterns.length > 0 && (
        <Card className="border-indigo-200 dark:border-indigo-900/30 bg-indigo-50/50 dark:bg-indigo-900/10">
          <CardContent className="p-6">
            <div className="flex items-center gap-2 mb-3">
              <Link className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              <h3 className="text-lg font-bold font-serif text-indigo-800 dark:text-indigo-300">Cross-Chapter Patterns</h3>
            </div>
            <p className="text-xs text-muted-foreground mb-3">Yeh chapters exam mein aksar ek saath poochhe jaate hain — inhe milake padho.</p>
            <ul className="space-y-2">
              {ai.cross_chapter_patterns.map((pattern, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-foreground/80 bg-white dark:bg-indigo-900/20 rounded-lg p-3 border border-indigo-100 dark:border-indigo-900/30">
                  <span className="text-indigo-500 font-bold shrink-0">{i + 1}.</span>
                  {pattern}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Strategy Tiers */}
      {ai?.chapters && ai.chapters.length > 0 && (() => {
        const chapters = ai.chapters as ChapterData[];
        const high = chapters.filter(c => getPriority(c) === 'High').sort((a, b) => getFrequency(b) - getFrequency(a));
        const medium = chapters.filter(c => getPriority(c) === 'Medium').sort((a, b) => getFrequency(b) - getFrequency(a));
        const low = chapters.filter(c => getPriority(c) === 'Low').sort((a, b) => getFrequency(b) - getFrequency(a));
        const total = chapters.length;
        const totalFreq = chapters.reduce((s, c) => s + getFrequency(c), 0) || 1;
        const freqCov = (chs: ChapterData[]) => Math.round(chs.reduce((s, c) => s + getFrequency(c), 0) / totalFreq * 100);

        const tiers = [
          {
            emoji: '🎯', title: 'Bas Pass Hona Hai', subtitle: 'Just want to pass',
            chapters: high, count: high.length, coverage: freqCov(high),
            color: 'border-red-200 bg-red-50 dark:bg-red-900/10 dark:border-red-900/30',
            badge: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
            dot: 'bg-red-500',
          },
          {
            emoji: '📈', title: 'Average Score Chahiye', subtitle: 'Want a decent score',
            chapters: [...high, ...medium], count: high.length + medium.length, coverage: freqCov([...high, ...medium]),
            color: 'border-amber-200 bg-amber-50 dark:bg-amber-900/10 dark:border-amber-900/30',
            badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
            dot: 'bg-amber-500',
          },
          {
            emoji: '🏆', title: 'Top Karna Hai', subtitle: 'Want to top the exam',
            chapters: [...high, ...medium, ...low], count: total, coverage: 100,
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
            <p className="text-sm text-muted-foreground px-2">Pick your goal — here's exactly which chapters to study based on past paper patterns.</p>
            <div className="grid md:grid-cols-3 gap-4">
              {tiers.map((tier) => (
                <Card key={tier.title} className={`border-2 ${tier.color} flex flex-col`}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-2xl">{tier.emoji}</span>
                      <span className={`text-xs font-semibold px-2 py-1 rounded-full ${tier.badge}`}>
                        {tier.count}/{total} chapters · ~{tier.coverage}%
                      </span>
                    </div>
                    <CardTitle className="text-base font-bold font-serif mt-1">{tier.title}</CardTitle>
                    <p className="text-xs text-muted-foreground">{tier.subtitle}</p>
                  </CardHeader>
                  <CardContent className="flex-1 pt-0">
                    <ol className="space-y-1">
                      {tier.chapters.map((ch, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm">
                          <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${tier.dot}`} />
                          <span className="text-foreground/80">{ch.chapter_name}</span>
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

      {/* Chapter list */}
      <div className="space-y-6">
        <div className="flex items-center gap-2 px-2">
          <Target className="w-6 h-6 text-primary" />
          <h2 className="text-2xl font-bold font-serif">Chapter Priority List</h2>
        </div>

        <div className="space-y-4">
          {(ai?.chapters as ChapterData[] | undefined)?.map((chapter, index) => {
            const priority = getPriority(chapter);
            const frequency = getFrequency(chapter);
            const confidence = chapter.confidence_level;
            const hasSubTopics = Array.isArray(chapter.sub_topics) && chapter.sub_topics.length > 0;
            const subTopicsOpen = expandedSubTopics.has(index);
            const studyNote = chapter.study_note;
            const isNoteObj = studyNote && typeof studyNote === "object";
            const isNoteStr = studyNote && typeof studyNote === "string";

            // Year-wise presence dots
            const yearDots = allYears.length > 0
              ? allYears.map(y => ({
                  year: y,
                  present: (chapter.years_appeared ?? []).includes(y),
                }))
              : (chapter.years_appeared ?? []).map(y => ({ year: y, present: true }));

            const qtBreakdown = chapter.question_type_breakdown;
            const qtParts = qtBreakdown
              ? [
                  qtBreakdown.mcq && qtBreakdown.mcq !== "None" ? `MCQ: ${qtBreakdown.mcq}` : null,
                  qtBreakdown.short_answer && qtBreakdown.short_answer !== "None" ? `Short: ${qtBreakdown.short_answer}` : null,
                  qtBreakdown.long_answer && qtBreakdown.long_answer !== "None" ? `Long: ${qtBreakdown.long_answer}` : null,
                  qtBreakdown.numerical_or_case_study && qtBreakdown.numerical_or_case_study !== "None" ? `Case/Num: ${qtBreakdown.numerical_or_case_study}` : null,
                ].filter(Boolean)
              : [];

            return (
              <Card key={index} className="border-border/60 hover:shadow-md transition-all duration-300 hover:border-primary/30 relative overflow-hidden">
                <div className={cn("absolute top-0 left-0 w-1 h-full", priorityAccentClass(priority))} />

                <CardContent className="p-5 pl-6">
                  {/* Top row: name + badges + freq */}
                  <div className="flex flex-wrap items-start gap-2 mb-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-bold font-serif leading-tight">{chapter.chapter_name}</h3>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 flex-wrap">
                      <Badge variant="outline" className={cn("border text-xs px-2 py-0.5", priorityBadgeClass(priority))}>
                        {priority} Priority
                      </Badge>
                      {confidence && (
                        <Badge variant="outline" className={cn("border text-xs px-2 py-0.5", confidenceBadgeClass(confidence))}>
                          {confidence} Confidence
                        </Badge>
                      )}
                      <div className="text-xs font-medium text-muted-foreground bg-secondary/50 px-2 py-1 rounded-md whitespace-nowrap">
                        {chapter.marks_weightage && <span>{chapter.marks_weightage} · </span>}
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
                  {Array.isArray(chapter.key_terms) && chapter.key_terms.length > 0 && (
                    <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 mb-3">
                      <p className="text-xs font-semibold text-primary mb-1.5 uppercase tracking-wider">Key Terms</p>
                      <div className="flex flex-wrap gap-1.5">
                        {chapter.key_terms.map((term, ti) => (
                          <span key={ti} className="inline-block bg-background border border-border/60 rounded-full px-2.5 py-0.5 text-xs text-foreground/80 font-medium">
                            {term}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Sub-topics toggle */}
                  {hasSubTopics && (
                    <div>
                      <button
                        onClick={() => toggleSubTopics(index)}
                        className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary/80 transition-colors mb-2"
                      >
                        {subTopicsOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        {subTopicsOpen ? "Hide" : "Show"} Sub-topics ({chapter.sub_topics!.length})
                      </button>

                      {subTopicsOpen && (
                        <div className="space-y-2 mt-1">
                          {chapter.sub_topics!.map((st, si) => (
                            <div key={si} className="border border-amber-200 dark:border-amber-900/30 bg-amber-50/60 dark:bg-amber-900/10 rounded-lg p-3">
                              <div className="flex items-start justify-between gap-2 mb-1">
                                <p className="text-sm font-bold text-amber-800 dark:text-amber-300">{st.sub_topic_name}</p>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <span className="text-xs text-muted-foreground">{st.frequency}×</span>
                                  {(st.years_appeared ?? []).map(y => (
                                    <span key={y} className="text-xs bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 px-1.5 py-0.5 rounded font-medium">
                                      {y}
                                    </span>
                                  ))}
                                </div>
                              </div>
                              {st.note && (
                                <p className="text-xs text-foreground/70 leading-relaxed">{st.note}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}

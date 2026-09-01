import { useEffect, useState } from "react";
import type { Analysis, AnalysisSummary } from "@workspace/api-client-react";
import { BrainCircuit, Check, FileOutput, FileSearch, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { getEstimatedTimeLabel } from "@/lib/analysis-estimate";

type ProcessingAnalysis = Pick<
  Analysis,
  "status" | "processingStage" | "processingCurrent" | "processingTotal"
>;

type ProcessingSummaryAnalysis = Pick<
  AnalysisSummary,
  "status" | "processingStage" | "processingCurrent" | "processingTotal"
>;

const PROCESSING_STAGES = [
  { key: "text_extraction", label: "Read papers", icon: FileSearch },
  { key: "ai_analysis", label: "Find patterns", icon: BrainCircuit },
  { key: "pdf_generation", label: "Create PDF", icon: FileOutput },
] as const;

const ENCOURAGEMENT_LINES = [
  "Chai bana lo, tab tak paper padh liya jayega",
  "Apna favorite gaana laga lo, analysis chalti rahegi",
  "Doston ko bata do 'bas 5 minute mein aata hoon'",
  "Jitni der analysis chalegi, utni der tum reel chala sakte ho",
  "Itni der mein utna hi padh lete jitna last night socha tha padhoge",
  "Relax, itna time toh tumne bhi last-minute revision ko diya hoga",
];

function getStageIndex(stage: string | null | undefined): number {
  const index = PROCESSING_STAGES.findIndex((item) => item.key === stage);
  return index >= 0 ? index : 0;
}

function getProgressText(
  analysis: ProcessingSummaryAnalysis | undefined,
): string {
  if (!analysis || analysis.status === "pending") {
    return "Starting your analysis…";
  }

  if (analysis.status !== "processing") {
    return "";
  }

  if (analysis.processingStage === "text_extraction") {
    if (
      typeof analysis.processingCurrent === "number" &&
      typeof analysis.processingTotal === "number" &&
      analysis.processingTotal > 0
    ) {
      return `Reading pages · ${analysis.processingCurrent} of ${analysis.processingTotal} pages read`;
    }
    return "Preparing your papers for reading…";
  }

  if (analysis.processingStage === "ai_analysis") {
    return "Your papers have been read. AI is comparing questions and patterns…";
  }

  if (analysis.processingStage === "pdf_generation") {
    return "Your insights are ready. Formatting the final study guide PDF…";
  }

  return "Working through your papers…";
}

export function getAnalysisProcessingSummary(
  analysis: ProcessingSummaryAnalysis,
): string {
  return getProgressText(analysis);
}

export function AnalysisProcessingStatus({
  analysis,
  estimatedPages,
}: {
  analysis?: ProcessingAnalysis;
  estimatedPages?: number;
}) {
  const [currentLineIndex, setCurrentLineIndex] = useState(0);
  const stageIndex = getStageIndex(analysis?.processingStage);
  const progressText = getProgressText(analysis);
  const isProcessing =
    analysis?.status === "processing" || analysis?.status === "pending";
  const hasPageProgress =
    analysis?.processingStage === "text_extraction" &&
    typeof analysis.processingCurrent === "number" &&
    typeof analysis.processingTotal === "number" &&
    analysis.processingTotal > 0;
  const progressPercent = hasPageProgress
    ? Math.min(
        100,
        Math.max(
          0,
          (analysis.processingCurrent! / analysis.processingTotal!) * 100,
        ),
      )
    : 0;

  return (
    <Card className="max-w-2xl mx-auto border-primary/20 bg-primary/5">
      <CardContent className="p-8 sm:p-12 text-center flex flex-col items-center">
        <div className="relative w-16 h-16 mb-5">
          <div className="absolute inset-0 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
          <div className="absolute inset-2 rounded-full bg-primary/10 flex items-center justify-center">
            <Loader2 className="w-6 h-6 text-primary" />
          </div>
        </div>

        <h2 className="text-xl sm:text-2xl font-bold font-serif mb-2">
          {analysis?.processingStage === "text_extraction"
            ? "Reading your papers…"
            : analysis?.processingStage === "ai_analysis"
              ? "Finding the important patterns…"
              : analysis?.processingStage === "pdf_generation"
                ? "Finishing your study guide…"
                : "Your study guide is in progress…"}
        </h2>
        <p className="text-sm text-muted-foreground mb-1" data-testid="text-estimated-analysis-time">
          {estimatedPages !== undefined
            ? `Analysis mein approx ${getEstimatedTimeLabel(estimatedPages)} lag sakte hain. Kripya page band na karein.`
            : "Analysis mein thoda samay lag sakta hai. Kripya page band na karein."}
        </p>
        <p className="text-muted-foreground max-w-lg">{progressText}</p>
        {isProcessing && (
          <p
            className="text-xs text-muted-foreground/70 italic mt-3"
            data-testid="text-analysis-encouragement"
          >
            {ENCOURAGEMENT_LINES[currentLineIndex]}
          </p>
        )}

        {hasPageProgress && (
          <div className="w-full max-w-md mt-6" aria-label={progressText}>
            <div className="h-2 rounded-full bg-primary/10 overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-500"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        )}

        <div className="w-full max-w-lg grid grid-cols-3 gap-2 mt-8">
          {PROCESSING_STAGES.map((item, index) => {
            const Icon = item.icon;
            const isDone = index < stageIndex;
            const isCurrent = index === stageIndex;

            return (
              <div
                key={item.key}
                className={cn(
                  "flex flex-col items-center gap-2 text-xs sm:text-sm",
                  isCurrent
                    ? "text-primary font-semibold"
                    : isDone
                      ? "text-foreground"
                      : "text-muted-foreground",
                )}
              >
                <div
                  className={cn(
                    "w-9 h-9 rounded-full flex items-center justify-center border",
                    isCurrent
                      ? "border-primary bg-primary/10"
                      : isDone
                        ? "border-primary/40 bg-primary/5"
                        : "border-border bg-background",
                  )}
                >
                  {isDone ? (
                    <Check className="w-4 h-4" />
                  ) : (
                    <Icon className={cn("w-4 h-4", isCurrent && "animate-pulse")} />
                  )}
                </div>
                <span>{item.label}</span>
              </div>
            );
          })}
        </div>

        <p className="text-xs text-muted-foreground mt-7">
          Progress is saved automatically. You can safely leave this page and
          return from your analysis history.
        </p>
      </CardContent>
    </Card>
  );
}
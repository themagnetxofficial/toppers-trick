import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCreateAnalysis, useGetAnalysis } from "@workspace/api-client-react";
import { UploadCloud, File, X, ChevronRight, ArrowLeft, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const HINGLISH_MESSAGES = [
  "Aapke papers padhe ja rahe hain... 📖",
  "Patterns dhundhe ja rahe hain... 🔍",
  "AI analysis chal raha hai... 🤖",
  "Important topics nikaale ja rahe hain... 🎯",
  "Study guide ban raha hai... ✨",
  "Bas thoda aur intezaar... ⏳"
];

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
const API_BASE_URL = `${basePath}/api`;

function getServerErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === "object") {
    const data = (error as { data?: unknown }).data;
    if (data && typeof data === "object") {
      const message = (data as { error?: unknown }).error;
      if (typeof message === "string" && message.trim()) return message;
    }
  }

  return fallback;
}

async function getUploadErrorMessage(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as { error?: unknown };
    if (typeof data.error === "string" && data.error.trim()) return data.error;
  } catch {
    // The server may not have returned JSON. Keep the message safe and useful.
  }

  return response.status === 503
    ? "Our service is temporarily unavailable. Your files are still selected, so please try again in a few minutes."
    : "We couldn't upload your papers. Your selected files are still here, so please try again.";
}

export default function AnalyzePage() {
  const [, setLocation] = useLocation();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  
  // Step 1 State
  const [category, setCategory] = useState<'school' | 'college'>('school');
  const [classOrCourse, setClassOrCourse] = useState("");
  const [boardOrUniversity, setBoardOrUniversity] = useState("");
  const [subject, setSubject] = useState("");

  // Step 2 State
  const [files, setFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  
  // Step 3 State
  const [analysisId, setAnalysisId] = useState<number | null>(null);
  const [messageIndex, setMessageIndex] = useState(0);

  const createAnalysis = useCreateAnalysis();
  
  // Polling analysis status
  const { data: analysisData } = useGetAnalysis(analysisId as number, { 
    query: { 
      enabled: !!analysisId,
      refetchInterval: (query) => {
        const data = query.state.data;
        return data?.status === 'processing' || data?.status === 'pending' ? 2000 : false;
      }
    } 
  });

  // Cycle messages
  useEffect(() => {
    if (step === 3) {
      const interval = setInterval(() => {
        setMessageIndex(prev => (prev + 1) % HINGLISH_MESSAGES.length);
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [step]);

  // Check completion
  useEffect(() => {
    if (analysisData?.status === 'completed') {
      setLocation(`/analyses/${analysisData.id}`);
    } else if (analysisData?.status === 'failed') {
      const errMsg = (analysisData as any).errorMessage;
      const message =
        typeof errMsg === "string" && errMsg.trim()
          ? errMsg
          : "Analysis failed. Your files are still selected, so please try again.";
      setSubmissionError(message);
      toast.error(message);
      setStep(2); // Go back to upload step, not step 1 — user keeps their subject details
      setAnalysisId(null);
    }
  }, [analysisData, setLocation]);

  const handleFileDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const droppedFiles = Array.from(e.dataTransfer.files);
    addFiles(droppedFiles);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      addFiles(Array.from(e.target.files));
    }
  };

  const addFiles = (newFiles: File[]) => {
    const validFiles = newFiles.filter(f => 
      f.type === "application/pdf" || 
      f.type === "image/jpeg" || 
      f.type === "image/png"
    );
    
    if (validFiles.length !== newFiles.length) {
      toast.error("Only PDF, JPG, and PNG files are allowed.");
    }
    
    setFiles(prev => {
      const combined = [...prev, ...validFiles];
      if (combined.length > 5) {
        toast.warning("Maximum 5 files allowed. Keeping the first 5.");
        return combined.slice(0, 5);
      }
      return combined;
    });
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleStep1Next = () => {
    if (!subject.trim()) {
      toast.error("Please enter a subject name");
      return;
    }
    setStep(2);
  };

  const handleUploadAndAnalyze = async () => {
    if (files.length === 0) {
      toast.error("Please upload at least one paper");
      return;
    }

    setIsUploading(true);
    setSubmissionError(null);

    let filePaths: string[];
    try {
      const formData = new FormData();
      files.forEach(file => formData.append("files", file));

      const uploadRes = await fetch(`${API_BASE_URL}/upload`, {
        method: "POST",
        credentials: "include",
        body: formData
      });

      if (!uploadRes.ok) {
        const message = await getUploadErrorMessage(uploadRes);
        setSubmissionError(message);
        toast.error(message);
        return;
      }

      const uploadData = await uploadRes.json();
      if (!Array.isArray(uploadData.filePaths) || uploadData.filePaths.length === 0) {
        throw new Error("The upload did not return any files.");
      }
      filePaths = uploadData.filePaths;
    } catch (error) {
      const message =
        error instanceof Error && error.message === "The upload did not return any files."
          ? "We couldn't confirm your uploaded files. Please try again."
          : "We couldn't upload your papers. Your selected files are still here, so please try again.";
      setSubmissionError(message);
      toast.error(message);
      setIsUploading(false);
      return;
    }

    try {
      const analysis = await createAnalysis.mutateAsync({
        data: {
          category,
          classOrCourse: classOrCourse.trim() || undefined,
          boardOrUniversity: boardOrUniversity.trim() || undefined,
          subject: subject.trim(),
          filePaths
        }
      });
      setAnalysisId(analysis.id);
      setStep(3);
    } catch (error) {
      const message = getServerErrorMessage(
        error,
        "We couldn't start the analysis. Your files are still selected, so please try again.",
      );
      setSubmissionError(message);
      toast.error(message);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto py-8">
      {/* Progress Steps */}
      <div className="mb-8 relative">
        <div className="absolute top-1/2 left-0 right-0 h-1 bg-border -translate-y-1/2 rounded-full z-0" />
        <div 
          className="absolute top-1/2 left-0 h-1 bg-primary -translate-y-1/2 rounded-full z-0 transition-all duration-500 ease-in-out"
          style={{ width: step === 1 ? '0%' : step === 2 ? '50%' : '100%' }}
        />
        <div className="flex justify-between relative z-10">
          {[1, 2, 3].map((s) => (
            <div 
              key={s}
              className={cn(
                "w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-all duration-300 shadow-sm border-2",
                step >= s 
                  ? "bg-primary text-primary-foreground border-primary" 
                  : "bg-background text-muted-foreground border-border"
              )}
            >
              {s}
            </div>
          ))}
        </div>
        <div className="flex justify-between mt-2 px-1">
          <span className="text-xs font-medium text-foreground">Details</span>
          <span className="text-xs font-medium text-foreground text-center">Upload</span>
          <span className="text-xs font-medium text-foreground text-right">Process</span>
        </div>
      </div>

      {step === 1 && (
        <Card className="shadow-lg border-border animate-in fade-in slide-in-from-bottom-4 duration-500">
          <CardContent className="p-6 sm:p-8 space-y-6">
            <div>
              <h2 className="text-2xl font-bold font-serif mb-1">What are we studying?</h2>
              <p className="text-muted-foreground">Tell us about the subject you need help with.</p>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Education Level</Label>
                <div className="grid grid-cols-2 gap-4">
                  <Button
                    type="button"
                    variant={category === 'school' ? 'default' : 'outline'}
                    className={cn("h-12 font-semibold", category === 'school' && "ring-2 ring-primary ring-offset-2 ring-offset-background")}
                    onClick={() => setCategory('school')}
                  >
                    School / Board
                  </Button>
                  <Button
                    type="button"
                    variant={category === 'college' ? 'default' : 'outline'}
                    className={cn("h-12 font-semibold", category === 'college' && "ring-2 ring-primary ring-offset-2 ring-offset-background")}
                    onClick={() => setCategory('college')}
                  >
                    College / Uni
                  </Button>
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="class">
                    {category === 'school' ? 'Class (e.g. 10th, 12th)' : 'Course (e.g. B.Tech CS)'}
                  </Label>
                  <Input 
                    id="class" 
                    placeholder={category === 'school' ? '12th Science' : 'B.Tech Sem 3'}
                    value={classOrCourse}
                    onChange={(e) => setClassOrCourse(e.target.value)}
                    className="h-12 bg-background border-border focus-visible:ring-primary"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="board">
                    {category === 'school' ? 'Board (e.g. CBSE, State)' : 'University (e.g. DU, MU)'}
                  </Label>
                  <Input 
                    id="board" 
                    placeholder={category === 'school' ? 'CBSE' : 'Mumbai University'}
                    value={boardOrUniversity}
                    onChange={(e) => setBoardOrUniversity(e.target.value)}
                    className="h-12 bg-background border-border focus-visible:ring-primary"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="subject" className="text-foreground">Subject Name <span className="text-destructive">*</span></Label>
                <Input 
                  id="subject" 
                  placeholder="e.g. Physics, Data Structures, Economics"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="h-12 bg-background border-border focus-visible:ring-primary text-base font-medium"
                />
              </div>
            </div>

            <div className="pt-4 flex justify-end">
              <Button onClick={handleStep1Next} size="lg" className="rounded-full px-8 font-semibold group shadow-md shadow-primary/20 hover:shadow-primary/40">
                Next Step
                <ChevronRight className="w-5 h-5 ml-1 group-hover:translate-x-1 transition-transform" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card className="shadow-lg border-border animate-in fade-in slide-in-from-right-4 duration-500">
          <CardContent className="p-6 sm:p-8 space-y-6">
            <div className="flex items-center gap-4">
                <Button aria-label="Back to study details" variant="ghost" size="icon" onClick={() => setStep(1)} className="shrink-0 -ml-2 text-muted-foreground hover:text-foreground">
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div>
                <h2 className="text-2xl font-bold font-serif mb-1">Apna paper upload karein</h2>
                <p className="text-muted-foreground">Upload 1 to 5 previous year question papers.</p>
              </div>
            </div>

            {submissionError && (
              <div
                role="alert"
                className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
              >
                {submissionError}
              </div>
            )}

            <div 
              className={cn(
                "border-2 border-dashed rounded-2xl p-8 text-center transition-all duration-200 bg-secondary/30",
                "hover:bg-secondary/60 hover:border-primary/50"
              )}
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleFileDrop}
            >
              <div className="mx-auto w-16 h-16 bg-primary/10 text-primary rounded-full flex items-center justify-center mb-4">
                <UploadCloud className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-bold mb-2">Drag & Drop your PDFs or Images</h3>
              <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
                Make sure the questions are clearly visible. Max 5 files.
              </p>
              
              <div className="relative inline-block">
                <Input 
                  type="file" 
                  multiple 
                  accept=".pdf,image/jpeg,image/png" 
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" 
                  onChange={handleFileSelect}
                  disabled={isUploading || files.length >= 5}
                />
                <Button variant="outline" className="font-semibold rounded-full px-6 border-primary/20 text-primary hover:bg-primary/10">
                  Browse Files
                </Button>
              </div>
            </div>

            {files.length > 0 && (
              <div className="space-y-3">
                <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Selected Files ({files.length}/5)</h4>
                <div className="grid gap-2">
                  {files.map((file, i) => (
                    <div key={i} className="flex items-center justify-between p-3 rounded-lg border border-border bg-background shadow-sm group">
                      <div className="flex items-center gap-3 overflow-hidden">
                        <File className="w-5 h-5 text-primary shrink-0" />
                        <span className="text-sm font-medium truncate">{file.name}</span>
                      </div>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8 text-muted-foreground hover:text-destructive opacity-50 group-hover:opacity-100 transition-opacity"
                        onClick={() => removeFile(i)}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="pt-4 flex justify-between items-center border-t border-border">
              <span className="text-sm text-muted-foreground">
                Costs <strong className="text-foreground">1 credit</strong>
              </span>
              <Button 
                onClick={handleUploadAndAnalyze} 
                disabled={files.length === 0 || isUploading}
                size="lg" 
                className="rounded-full px-8 font-semibold shadow-md shadow-primary/20"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5 mr-2" />
                    Analyze Papers
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 3 && (
        <Card className="shadow-xl border-primary/20 bg-gradient-to-b from-card to-secondary/20 animate-in zoom-in-95 duration-500 overflow-hidden">
          <CardContent className="p-12 flex flex-col items-center justify-center text-center min-h-[400px]">
            <div className="relative w-32 h-32 mb-8">
              {/* Outer spinning ring */}
              <div className="absolute inset-0 rounded-full border-4 border-primary/20 border-t-primary animate-spin" style={{ animationDuration: '3s' }} />
              {/* Inner pulsing circle */}
              <div className="absolute inset-2 rounded-full bg-primary/10 animate-pulse flex items-center justify-center">
                <Sparkles className="w-10 h-10 text-primary animate-bounce" />
              </div>
            </div>
            
            <h2 className="text-3xl font-bold font-serif mb-4 transition-all duration-300">
              {HINGLISH_MESSAGES[messageIndex]}
            </h2>
            <p className="text-muted-foreground text-lg max-w-sm">
              Please don't close this window. Your personalized study strategy is being generated.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

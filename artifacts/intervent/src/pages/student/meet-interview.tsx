import { useEffect, useRef, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  Mic, MicOff, Volume2, CheckCircle2, XCircle, Loader2,
  ChevronRight, Trophy, AlertCircle, Video, Brain, MessageSquare,
  Clock, BarChart3, Sparkles
} from "lucide-react";
import { cn } from "@/lib/utils";

const FASTAPI_URL = import.meta.env.VITE_FASTAPI_URL || "http://localhost:8000";

interface Question {
  question: string;
  type: "hr" | "technical";
  index: number;
}

interface QuestionScore {
  index: number;
  score: number;
  feedback: string;
}

interface Evaluation {
  question_scores: QuestionScore[];
  overall_score: number;
  hr_score: number;
  technical_score: number;
  recommendation: "selected" | "not_selected";
  strengths: string[];
  improvements: string[];
  summary: string;
  passed: boolean;
}

type Phase = "loading" | "intro" | "interview" | "submitting" | "results";

declare global {
  interface Window {
    SpeechRecognition: typeof SpeechRecognition;
    webkitSpeechRecognition: typeof SpeechRecognition;
  }
}

function useSearchParams() {
  const search = window.location.search;
  const params = new URLSearchParams(search);
  return {
    job_id: params.get("job_id") || "",
    candidate_id: params.get("candidate_id") || "",
  };
}

function ScoreRing({ score, label, size = 80 }: { score: number; label: string; size?: number }) {
  const radius = (size - 12) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 70 ? "#22c55e" : score >= 50 ? "#f59e0b" : "#ef4444";

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="currentColor" strokeWidth={6} className="text-muted/30" />
        <circle
          cx={size / 2} cy={size / 2} r={radius} fill="none"
          stroke={color} strokeWidth={6}
          strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transform: "rotate(-90deg)", transformOrigin: "50% 50%", transition: "stroke-dashoffset 1s ease" }}
        />
        <text x="50%" y="50%" dominantBaseline="middle" textAnchor="middle" fontSize="14" fontWeight="700" fill={color}>
          {score}%
        </text>
      </svg>
      <span className="text-xs text-muted-foreground font-medium">{label}</span>
    </div>
  );
}

function AIAvatar({ speaking, listening }: { speaking: boolean; listening: boolean }) {
  return (
    <div className="relative flex items-center justify-center w-28 h-28">
      {/* Pulse rings */}
      {(speaking || listening) && (
        <>
          <motion.div
            className={cn("absolute inset-0 rounded-full border-2", speaking ? "border-purple-400" : "border-green-400")}
            animate={{ scale: [1, 1.3, 1], opacity: [0.7, 0, 0.7] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          />
          <motion.div
            className={cn("absolute inset-0 rounded-full border-2", speaking ? "border-purple-400" : "border-green-400")}
            animate={{ scale: [1, 1.6, 1], opacity: [0.4, 0, 0.4] }}
            transition={{ duration: 1.5, repeat: Infinity, delay: 0.3 }}
          />
        </>
      )}
      {/* Avatar circle */}
      <div className={cn(
        "w-24 h-24 rounded-full flex items-center justify-center text-white text-3xl font-bold transition-all duration-300",
        speaking
          ? "bg-gradient-to-br from-purple-500 to-indigo-600 shadow-lg shadow-purple-500/30"
          : listening
            ? "bg-gradient-to-br from-green-500 to-emerald-600 shadow-lg shadow-green-500/30"
            : "bg-gradient-to-br from-[#667eea] to-[#764ba2]"
      )}>
        <Brain size={36} />
      </div>
      {/* Status badge */}
      <div className={cn(
        "absolute -bottom-1 -right-1 rounded-full px-2 py-0.5 text-[10px] font-semibold text-white",
        speaking ? "bg-purple-500" : listening ? "bg-green-500" : "bg-slate-500"
      )}>
        {speaking ? "Speaking" : listening ? "Listening" : "Ready"}
      </div>
    </div>
  );
}

export default function MeetInterviewPage() {
  const { job_id, candidate_id } = useSearchParams();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [phase, setPhase] = useState<Phase>("loading");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<string[]>([]);
  const [currentAnswer, setCurrentAnswer] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [alreadyCompleted, setAlreadyCompleted] = useState(false);
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [timer, setTimer] = useState(0);
  const [interviewStartTime, setInterviewStartTime] = useState<number>(0);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tokenRef = useRef<string>("");

  useEffect(() => {
    synthRef.current = window.speechSynthesis;
    return () => {
      if (recognitionRef.current) recognitionRef.current.abort();
      if (synthRef.current) synthRef.current.cancel();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { setLocation("/"); return; }
      if (!job_id || !candidate_id) {
        toast({ title: "Missing parameters", variant: "destructive" });
        setLocation("/student/calls");
        return;
      }
      try {
        tokenRef.current = await user.getIdToken();
        const res = await fetch(`${FASTAPI_URL}/api/meet/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ job_id, candidate_id, student_token: tokenRef.current }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Failed to load questions");
        setQuestions(data.questions);
        setAlreadyCompleted(data.already_completed);
        setPhase(data.already_completed ? "results" : "intro");
        if (data.already_completed) {
          // Need to re-fetch evaluation if already done — it's not returned here
          // We'll show a "already completed" state
        }
      } catch (err: unknown) {
        toast({
          title: "Failed to load interview",
          description: err instanceof Error ? err.message : "Unknown error",
          variant: "destructive",
        });
        setPhase("intro");
      }
    });
    return () => unsub();
  }, []);

  const speak = useCallback((text: string): Promise<void> => {
    return new Promise((resolve) => {
      if (!synthRef.current) { resolve(); return; }
      synthRef.current.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.9;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;

      const voices = synthRef.current.getVoices();
      const preferred = voices.find(v =>
        v.name.includes("Google") || v.name.includes("Natural") || v.lang.startsWith("en")
      );
      if (preferred) utterance.voice = preferred;

      setIsSpeaking(true);
      utterance.onend = () => { setIsSpeaking(false); resolve(); };
      utterance.onerror = () => { setIsSpeaking(false); resolve(); };
      synthRef.current.speak(utterance);
    });
  }, []);

  const startListening = useCallback(() => {
    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) {
      toast({
        title: "Voice not supported",
        description: "Your browser doesn't support voice recognition. Please use Chrome.",
        variant: "destructive",
      });
      return;
    }

    const recognition = new SpeechRecognitionAPI();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((r) => r[0].transcript)
        .join("");
      setCurrentAnswer(transcript);
    };

    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, [toast]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsListening(false);
  }, []);

  const startInterview = useCallback(async () => {
    setPhase("interview");
    setCurrentIndex(0);
    setAnswers([]);
    setCurrentAnswer("");
    setInterviewStartTime(Date.now());

    timerRef.current = setInterval(() => {
      setTimer((t) => t + 1);
    }, 1000);

    await new Promise((r) => setTimeout(r, 500));
    await speak("Welcome to your AI-powered interview with InterVent. I will ask you 10 questions — 5 about your background and goals, and 5 technical questions. Please speak clearly when answering. Let's begin!");
    await new Promise((r) => setTimeout(r, 500));
    await speak(questions[0]?.question || "Tell me about yourself.");
  }, [questions, speak]);

  const handleNextQuestion = useCallback(async () => {
    stopListening();

    const savedAnswer = currentAnswer.trim() || "[No answer provided]";
    const newAnswers = [...answers, savedAnswer];
    setAnswers(newAnswers);
    setCurrentAnswer("");

    const nextIndex = currentIndex + 1;

    if (nextIndex >= questions.length) {
      // All questions done — submit
      if (timerRef.current) clearInterval(timerRef.current);
      setPhase("submitting");
      await speak("Thank you for completing the interview. Please wait while I evaluate your responses.");

      try {
        const res = await fetch(`${FASTAPI_URL}/api/meet/submit`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            job_id,
            candidate_id,
            student_token: tokenRef.current,
            answers: newAnswers,
            time_taken_seconds: Math.floor((Date.now() - interviewStartTime) / 1000),
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Evaluation failed");
        setEvaluation(data.evaluation);
        setPhase("results");

        const rec = data.evaluation.recommendation;
        if (rec === "selected") {
          await speak(`Congratulations! Based on your answers, you scored ${data.evaluation.overall_score} out of 100. You have been recommended for selection. The HR team will be in touch soon!`);
        } else {
          await speak(`Thank you for your time. You scored ${data.evaluation.overall_score} out of 100. Unfortunately, you did not meet the threshold for this round. Keep practicing and good luck!`);
        }
      } catch (err: unknown) {
        toast({
          title: "Submission failed",
          description: err instanceof Error ? err.message : "Unknown error",
          variant: "destructive",
        });
        setPhase("interview");
      }
      return;
    }

    setCurrentIndex(nextIndex);
    await new Promise((r) => setTimeout(r, 300));

    const questionType = questions[nextIndex]?.type;
    if (nextIndex === 5) {
      await speak("Great! Now let's move on to the technical questions.");
      await new Promise((r) => setTimeout(r, 300));
    }

    await speak(questions[nextIndex]?.question || "Next question.");
  }, [currentAnswer, answers, currentIndex, questions, speak, stopListening, job_id, candidate_id, interviewStartTime, toast]);

  const formatTime = (s: number) => `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;

  if (phase === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 size={32} className="animate-spin text-primary" />
          <p className="text-muted-foreground text-sm">Preparing your AI interview…</p>
        </div>
      </div>
    );
  }

  if (phase === "intro") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-lg"
        >
          <div className="bg-card border border-card-border rounded-2xl shadow-xl overflow-hidden">
            <div className="h-1.5 w-full bg-gradient-to-r from-[#667eea] to-[#764ba2]" />
            <div className="p-8 text-center space-y-6">
              <AIAvatar speaking={false} listening={false} />
              <div>
                <h1 className="text-2xl font-bold">AI Voice Interview</h1>
                <p className="text-muted-foreground text-sm mt-1">Stage 4 — Meet Agent</p>
              </div>
              <div className="text-left bg-muted/30 rounded-xl p-4 space-y-3">
                <p className="text-sm font-semibold">Before you begin:</p>
                <ul className="space-y-2">
                  {[
                    "You'll be asked 10 questions (5 HR + 5 Technical)",
                    "Click the Mic button and speak your answer clearly",
                    "Use Chrome browser for best voice recognition",
                    "Find a quiet place with no background noise",
                    "Each answer is automatically saved when you click Next",
                  ].map((tip, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <CheckCircle2 size={14} className="text-green-500 mt-0.5 shrink-0" />
                      {tip}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="grid grid-cols-3 gap-3 text-center">
                {[["10", "Questions"], ["5+5", "HR + Tech"], ["~20min", "Duration"]].map(([val, label]) => (
                  <div key={label} className="bg-muted/50 rounded-xl p-3">
                    <p className="text-lg font-bold text-primary">{val}</p>
                    <p className="text-xs text-muted-foreground">{label}</p>
                  </div>
                ))}
              </div>
              <Button
                onClick={startInterview}
                disabled={questions.length === 0}
                className="w-full bg-gradient-to-r from-[#667eea] to-[#764ba2] text-white hover:opacity-90 gap-2 h-12 text-base font-semibold"
              >
                <Video size={18} /> Start AI Interview
              </Button>
              <button
                onClick={() => setLocation("/student/calls")}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                ← Back to Interview Calls
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  if (phase === "interview") {
    const q = questions[currentIndex];
    const progress = ((currentIndex) / questions.length) * 100;

    return (
      <div className="min-h-screen bg-background flex flex-col">
        {/* Top Bar */}
        <div className="border-b border-border bg-card px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-[#667eea] to-[#764ba2] flex items-center justify-center">
              <Brain size={12} className="text-white" />
            </div>
            <span className="font-semibold text-sm">InterVent AI Interview</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">Question {currentIndex + 1} / {questions.length}</span>
            <div className="flex items-center gap-1.5 text-xs font-mono bg-muted/50 px-2 py-1 rounded-lg">
              <Clock size={12} className="text-muted-foreground" />
              {formatTime(timer)}
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-muted">
          <motion.div
            className="h-full bg-gradient-to-r from-[#667eea] to-[#764ba2]"
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.4 }}
          />
        </div>

        {/* Main interview area */}
        <div className="flex-1 flex flex-col items-center justify-center p-4 gap-6 max-w-2xl mx-auto w-full">
          {/* AI Avatar */}
          <AIAvatar speaking={isSpeaking} listening={isListening} />

          {/* Question Card */}
          <AnimatePresence mode="wait">
            <motion.div
              key={currentIndex}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="w-full bg-card border border-card-border rounded-2xl p-5 space-y-2"
            >
              <div className="flex items-center gap-2">
                <span className={cn(
                  "text-[10px] font-semibold px-2 py-0.5 rounded-full",
                  q?.type === "hr"
                    ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                    : "bg-purple-500/10 text-purple-600 dark:text-purple-400"
                )}>
                  {q?.type === "hr" ? "HR / Behavioural" : "Technical"}
                </span>
                <span className="text-xs text-muted-foreground">Q{currentIndex + 1}</span>
              </div>
              <p className="text-base font-medium leading-relaxed">{q?.question}</p>
              {isSpeaking && (
                <div className="flex items-center gap-2 text-xs text-purple-500">
                  <Volume2 size={12} className="animate-pulse" /> AI is reading the question…
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          {/* Answer area */}
          <div className="w-full bg-card border border-card-border rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Your Answer</p>
              {isListening && (
                <span className="flex items-center gap-1.5 text-xs text-green-600 animate-pulse">
                  <span className="w-2 h-2 rounded-full bg-green-500" /> Recording…
                </span>
              )}
            </div>

            <div className={cn(
              "min-h-[80px] rounded-xl p-3 text-sm border transition-colors",
              isListening
                ? "border-green-500/40 bg-green-500/5 text-foreground"
                : "border-border bg-muted/30 text-muted-foreground"
            )}>
              {currentAnswer || <span className="italic">Click the mic and speak your answer…</span>}
            </div>

            <div className="flex gap-3">
              <Button
                onClick={isListening ? stopListening : startListening}
                disabled={isSpeaking}
                variant={isListening ? "destructive" : "outline"}
                className={cn("flex-1 gap-2", isListening && "animate-pulse")}
              >
                {isListening ? <><MicOff size={16} /> Stop Recording</> : <><Mic size={16} /> Start Recording</>}
              </Button>
              <Button
                onClick={handleNextQuestion}
                disabled={isSpeaking}
                className="flex-1 bg-gradient-to-r from-[#667eea] to-[#764ba2] text-white hover:opacity-90 gap-2"
              >
                {currentIndex === questions.length - 1 ? (
                  <><CheckCircle2 size={16} /> Submit Interview</>
                ) : (
                  <><ChevronRight size={16} /> Next Question</>
                )}
              </Button>
            </div>

            {currentAnswer && (
              <button
                className="text-xs text-muted-foreground hover:text-foreground underline"
                onClick={() => setCurrentAnswer("")}
              >
                Clear answer
              </button>
            )}
          </div>

          {/* Question dots */}
          <div className="flex gap-2">
            {questions.map((_, i) => (
              <div
                key={i}
                className={cn(
                  "w-2 h-2 rounded-full transition-all",
                  i < currentIndex
                    ? "bg-green-500"
                    : i === currentIndex
                      ? "bg-primary w-4"
                      : "bg-muted"
                )}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (phase === "submitting") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-5 text-center p-8"
        >
          <div className="relative w-20 h-20">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#667eea] to-[#764ba2] flex items-center justify-center">
              <Sparkles size={32} className="text-white" />
            </div>
            <motion.div
              className="absolute inset-0 rounded-full border-2 border-primary"
              animate={{ scale: [1, 1.3, 1], opacity: [1, 0, 1] }}
              transition={{ duration: 1.4, repeat: Infinity }}
            />
          </div>
          <div>
            <h2 className="text-xl font-bold">Evaluating your answers…</h2>
            <p className="text-muted-foreground text-sm mt-1">AI is analyzing all 10 responses. This takes a few seconds.</p>
          </div>
          <div className="flex gap-1">
            {[0, 1, 2, 3, 4].map((i) => (
              <motion.div
                key={i}
                className="w-2 h-2 rounded-full bg-primary"
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 1, repeat: Infinity, delay: i * 0.18 }}
              />
            ))}
          </div>
        </motion.div>
      </div>
    );
  }

  if (phase === "results") {
    if (alreadyCompleted && !evaluation) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
          <div className="text-center space-y-4">
            <CheckCircle2 size={48} className="text-green-500 mx-auto" />
            <h2 className="text-xl font-bold">Interview Already Completed</h2>
            <p className="text-muted-foreground text-sm">You have already completed the AI voice interview. Results are visible on your interview calls page.</p>
            <Button onClick={() => setLocation("/student/calls")} className="gap-2">
              <ChevronRight size={16} /> Go to Interview Calls
            </Button>
          </div>
        </div>
      );
    }

    if (!evaluation) {
      return (
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 size={32} className="animate-spin text-primary" />
        </div>
      );
    }

    const isSelected = evaluation.recommendation === "selected";

    return (
      <div className="min-h-screen bg-background p-4 pb-16">
        <div className="max-w-2xl mx-auto space-y-5">
          {/* Result header */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
              "rounded-2xl p-6 text-center space-y-3 border",
              isSelected
                ? "bg-gradient-to-br from-green-500/10 to-emerald-500/10 border-green-500/30"
                : "bg-gradient-to-br from-red-500/10 to-rose-500/10 border-red-500/30"
            )}
          >
            <div className={cn(
              "w-16 h-16 rounded-full mx-auto flex items-center justify-center",
              isSelected ? "bg-green-500/20" : "bg-red-500/20"
            )}>
              {isSelected
                ? <Trophy size={28} className="text-green-500" />
                : <AlertCircle size={28} className="text-red-500" />
              }
            </div>
            <div>
              <h1 className="text-2xl font-bold">
                {isSelected ? "Congratulations! 🎉" : "Interview Complete"}
              </h1>
              <p className={cn("text-sm mt-1", isSelected ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400")}>
                {isSelected ? "You are recommended for selection!" : "You did not meet the threshold for this round."}
              </p>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">{evaluation.summary}</p>
          </motion.div>

          {/* Score rings */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-card border border-card-border rounded-2xl p-5"
          >
            <p className="font-semibold text-sm mb-4">Score Breakdown</p>
            <div className="flex justify-around">
              <ScoreRing score={evaluation.overall_score} label="Overall" size={88} />
              <ScoreRing score={evaluation.hr_score} label="HR / Behavioural" size={88} />
              <ScoreRing score={evaluation.technical_score} label="Technical" size={88} />
            </div>
          </motion.div>

          {/* Strengths & improvements */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="grid grid-cols-2 gap-4"
          >
            <div className="bg-card border border-green-500/20 rounded-2xl p-4 space-y-2">
              <p className="text-xs font-semibold text-green-600 dark:text-green-400">✓ Strengths</p>
              <ul className="space-y-1">
                {(evaluation.strengths || []).map((s, i) => (
                  <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                    <CheckCircle2 size={10} className="text-green-500 mt-0.5 shrink-0" /> {s}
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-card border border-amber-500/20 rounded-2xl p-4 space-y-2">
              <p className="text-xs font-semibold text-amber-600 dark:text-amber-400">↑ Improvements</p>
              <ul className="space-y-1">
                {(evaluation.improvements || []).map((s, i) => (
                  <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                    <ChevronRight size={10} className="text-amber-500 mt-0.5 shrink-0" /> {s}
                  </li>
                ))}
              </ul>
            </div>
          </motion.div>

          {/* Per-question breakdown */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-card border border-card-border rounded-2xl p-5 space-y-3"
          >
            <p className="font-semibold text-sm">Question-by-Question Feedback</p>
            <div className="space-y-2">
              {(evaluation.question_scores || []).map((qs, i) => {
                const q = questions[i];
                return (
                  <div key={i} className="rounded-xl bg-muted/30 p-3 space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs font-medium flex-1">Q{qs.index}: {q?.question}</p>
                      <span className={cn(
                        "text-xs font-bold shrink-0",
                        qs.score >= 7 ? "text-green-500" : qs.score >= 5 ? "text-amber-500" : "text-red-500"
                      )}>
                        {qs.score}/10
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground">{qs.feedback}</p>
                  </div>
                );
              })}
            </div>
          </motion.div>

          <Button
            onClick={() => setLocation("/student/calls")}
            className="w-full gap-2"
            variant="outline"
          >
            <ChevronRight size={16} /> Back to Interview Calls
          </Button>
        </div>
      </div>
    );
  }

  return null;
}

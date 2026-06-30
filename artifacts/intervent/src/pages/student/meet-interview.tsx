import { useEffect, useRef, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useToast } from "@/hooks/use-toast";
import {
  Mic, MicOff, Video, VideoOff, PhoneOff, Brain, Loader2,
  CheckCircle2, XCircle, Sparkles, Volume2, Clock, BarChart3
} from "lucide-react";
import { cn } from "@/lib/utils";

const FASTAPI_URL = import.meta.env.VITE_FASTAPI_URL || "";
const TOTAL_QUESTIONS = 10;

const REPEAT_PHRASES = [
  "repeat", "say again", "say that again", "can't hear", "cannot hear",
  "didn't hear", "one more time", "come again", "pardon", "what did you say",
  "could you repeat", "i couldn't hear", "please repeat", "can you repeat",
  "i can't hear you", "speak again", "say it again",
];

interface ConvItem { question: string; type: "hr" | "technical"; answer: string; }
interface Evaluation {
  question_scores: Array<{ index: number; score: number; feedback: string }>;
  overall_score: number; hr_score: number; technical_score: number;
  recommendation: "selected" | "not_selected";
  strengths: string[]; improvements: string[]; summary: string; passed: boolean;
}
type Phase = "loading" | "lobby" | "interview" | "submitting" | "results";

declare global {
  interface Window {
    SpeechRecognition: typeof SpeechRecognition;
    webkitSpeechRecognition: typeof SpeechRecognition;
  }
}

function useSearchParams() {
  const p = new URLSearchParams(window.location.search);
  return { job_id: p.get("job_id") || "", candidate_id: p.get("candidate_id") || "" };
}

function ScoreRing({ score, label, size = 80 }: { score: number; label: string; size?: number }) {
  const r = (size - 12) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  const color = score >= 70 ? "#22c55e" : score >= 50 ? "#f59e0b" : "#ef4444";
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="currentColor" strokeWidth={6} className="text-muted/40" />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={6}
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transform: "rotate(-90deg)", transformOrigin: "50% 50%", transition: "stroke-dashoffset 1s ease" }} />
        <text x="50%" y="50%" dominantBaseline="middle" textAnchor="middle" fontSize="14" fontWeight="700" fill={color}>{score}%</text>
      </svg>
      <span className="text-xs text-muted-foreground font-medium">{label}</span>
    </div>
  );
}

function SoundWave({ active }: { active: boolean }) {
  return (
    <div className="flex items-end gap-[3px] h-7">
      {[0.4, 0.7, 1, 0.8, 0.5, 0.9, 0.6, 1, 0.7, 0.4].map((h, i) => (
        <motion.div key={i} className="w-1 rounded-full bg-[#667eea]" style={{ minHeight: 3 }}
          animate={active ? { height: [3, h * 28, 3] } : { height: 3 }}
          transition={{ duration: 0.6, repeat: active ? Infinity : 0, delay: i * 0.06, ease: "easeInOut" }} />
      ))}
    </div>
  );
}

export default function MeetInterviewPage() {
  const { job_id, candidate_id } = useSearchParams();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [phase, setPhase] = useState<Phase>("loading");
  const [candidateCtx, setCandidateCtx] = useState<Record<string, unknown>>({});
  const [alreadyCompleted, setAlreadyCompleted] = useState(false);
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);

  const [history, setHistory] = useState<ConvItem[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState<{ question: string; type: "hr" | "technical" } | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0); // 0-based
  const [currentAnswer, setCurrentAnswer] = useState("");
  const [interimAnswer, setInterimAnswer] = useState("");

  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [aiStatus, setAiStatus] = useState<"idle" | "speaking" | "listening" | "thinking">("idle");

  const [transcript, setTranscript] = useState<Array<{ role: "ai" | "user"; text: string }>>([]);
  const [timer, setTimer] = useState(0);
  const [interviewStart, setInterviewStart] = useState(0);
  const [cameraOn, setCameraOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [cameraReady, setCameraReady] = useState(false);
  const [repeatFired, setRepeatFired] = useState(false);
  const [loadingNext, setLoadingNext] = useState(false);
  const [showEndDialog, setShowEndDialog] = useState(false);
  const [micBlocked, setMicBlocked] = useState(false);

  const tokenRef = useRef<string>("");
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const listeningRef = useRef(false);
  const repeatFiredRef = useRef(false);
  const currentAnswerRef = useRef("");
  const interimAnswerRef = useRef("");
  const currentQuestionRef = useRef<{ question: string; type: "hr" | "technical" } | null>(null);

  currentAnswerRef.current = currentAnswer;
  interimAnswerRef.current = interimAnswer;
  currentQuestionRef.current = currentQuestion;

  useEffect(() => {
    synthRef.current = window.speechSynthesis;
    navigator.mediaDevices.getUserMedia({ video: true, audio: false })
      .then(stream => { streamRef.current = stream; setCameraReady(true); })
      .catch(() => setCameraOn(false));
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(s => { s.getTracks().forEach(t => t.stop()); setMicBlocked(false); })
      .catch(() => setMicBlocked(true));
    return () => {
      streamRef.current?.getTracks().forEach(t => t.stop());
      synthRef.current?.cancel();
      recognitionRef.current?.abort();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // Attach stream to video whenever camera is ready or re-enabled
  useEffect(() => {
    if (cameraReady && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [cameraReady]);

  useEffect(() => {
    if (cameraOn && cameraReady && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [cameraOn, cameraReady]);

  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: "smooth" });
  }, [transcript]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { setLocation("/"); return; }
      if (!job_id || !candidate_id) {
        toast({ title: "Missing parameters", variant: "destructive" });
        setLocation("/student/calls"); return;
      }
      try {
        tokenRef.current = await user.getIdToken();
        const res = await fetch(`${FASTAPI_URL}/api/meet/generate`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ job_id, candidate_id, student_token: tokenRef.current }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Failed to load");
        setCandidateCtx(data.candidate_context || {});
        setAlreadyCompleted(data.already_completed);
        if (data.already_completed) {
          setEvaluation(data.evaluation || null);
          setPhase("results");
        } else {
          setPhase("lobby");
        }
      } catch (err: unknown) {
        toast({ title: "Failed to load interview", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
        setPhase("lobby");
      }
    });
    return () => unsub();
  }, []);

  const speak = useCallback((text: string): Promise<void> => {
    return new Promise((resolve) => {
      if (!synthRef.current) { resolve(); return; }
      synthRef.current.cancel();
      const utt = new SpeechSynthesisUtterance(text);
      utt.rate = 0.92; utt.pitch = 1.0; utt.volume = 1.0;
      const voices = synthRef.current.getVoices();
      const preferred = voices.find(v => v.name.includes("Google") || v.name.includes("Natural") || v.lang.startsWith("en"));
      if (preferred) utt.voice = preferred;
      setIsSpeaking(true); setAiStatus("speaking");
      utt.onend = () => { setIsSpeaking(false); setAiStatus("listening"); resolve(); };
      utt.onerror = () => { setIsSpeaking(false); setAiStatus("listening"); resolve(); };
      synthRef.current.speak(utt);
    });
  }, []);

  const addToTranscript = useCallback((role: "ai" | "user", text: string) => {
    setTranscript(prev => [...prev, { role, text }]);
  }, []);

  const stopListening = useCallback(() => {
    listeningRef.current = false;
    recognitionRef.current?.abort();
    recognitionRef.current = null;
    setIsListening(false); setInterimAnswer("");
  }, []);

  const startListening = useCallback(() => {
    if (!micOn) return;
    const SRA = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SRA) { toast({ title: "Use Chrome for voice support", variant: "destructive" }); return; }
    if (recognitionRef.current) { recognitionRef.current.abort(); recognitionRef.current = null; }

    const rec = new SRA();
    rec.continuous = true; rec.interimResults = true; rec.lang = "en-US";

    rec.onresult = (event) => {
      let interim = ""; let finalText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalText += t;
        else interim += t;
      }
      // Only check the MOST RECENT speech chunk — checking the whole accumulated answer
      // causes false positives (e.g. "repeatedly" matching "repeat" and wiping the answer).
      const recentText = (interim + " " + finalText).toLowerCase().trim();
      const hasRepeat = recentText.length > 0 && REPEAT_PHRASES.some(p => {
        const escaped = p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        try { return new RegExp(`\\b${escaped}\\b`).test(recentText); } catch { return recentText.includes(p); }
      });
      if (hasRepeat && !repeatFiredRef.current) {
        repeatFiredRef.current = true;
        setRepeatFired(true);
        rec.abort(); recognitionRef.current = null;
        setIsListening(false); setCurrentAnswer(""); setInterimAnswer("");
        currentAnswerRef.current = "";
        const q = currentQuestionRef.current;
        setTimeout(async () => {
          repeatFiredRef.current = false; setRepeatFired(false);
          await speak("Sure! Let me repeat that. " + (q?.question || ""));
          autoListenFn();
        }, 300);
        return;
      }
      if (finalText) { setCurrentAnswer(prev => (prev + " " + finalText).trim()); }
      setInterimAnswer(interim);
    };

    rec.onend = () => {
      if (listeningRef.current) setTimeout(() => { if (listeningRef.current) startListening(); }, 200);
      else { setIsListening(false); setInterimAnswer(""); }
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        setMicBlocked(true);
        listeningRef.current = false;
        setIsListening(false);
        toast({ title: "Microphone blocked", description: "Please allow microphone access in your browser then click the mic button.", variant: "destructive" });
        return;
      }
      if (e.error !== "aborted" && listeningRef.current) setTimeout(() => { if (listeningRef.current) startListening(); }, 500);
    };

    recognitionRef.current = rec;
    listeningRef.current = true;
    try { rec.start(); } catch (err) {
      console.error("SpeechRecognition start error:", err);
      listeningRef.current = false;
      setIsListening(false);
    }
    setIsListening(true); setAiStatus("listening");
  }, [micOn, speak, toast]);

  // Stable auto-listen ref to avoid stale closures
  const autoListenFn = useCallback(() => {
    if (!micOn) return;
    setTimeout(() => startListening(), 400);
  }, [micOn, startListening]);

  const fetchNextQuestion = useCallback(async (
    questionNumber: number,
    convHistory: ConvItem[],
  ): Promise<{ question: string; type: "hr" | "technical"; feedback?: string }> => {
    const res = await fetch(`${FASTAPI_URL}/api/meet/next`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        job_id, candidate_id, student_token: tokenRef.current,
        question_number: questionNumber,
        conversation_history: convHistory,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Failed to get next question");
    return data;
  }, [job_id, candidate_id]);

  const startInterview = useCallback(async () => {
    setPhase("interview");
    setCurrentIndex(0);
    setHistory([]);
    setCurrentAnswer(""); setInterimAnswer("");
    setTranscript([]);
    setInterviewStart(Date.now());
    timerRef.current = setInterval(() => setTimer(t => t + 1), 1000);

    await new Promise(r => setTimeout(r, 500));
    const greeting = "Welcome! I'm your AI interviewer from InterVent. I'll ask you 10 questions — first about your background, then some technical questions. Just speak naturally, and click Done when you finish each answer. Let's begin!";
    addToTranscript("ai", greeting);
    await speak(greeting);

    setAiStatus("thinking"); setLoadingNext(true);
    try {
      const { question, type } = await fetchNextQuestion(1, []);
      setLoadingNext(false);
      setCurrentQuestion({ question, type });
      addToTranscript("ai", question);
      await speak(question);
      autoListenFn();
    } catch (err: unknown) {
      setLoadingNext(false);
      toast({ title: "Error loading first question", description: err instanceof Error ? err.message : "Unknown", variant: "destructive" });
    }
  }, [speak, addToTranscript, autoListenFn, fetchNextQuestion, toast]);

  const handleDoneAnswer = useCallback(async () => {
    if (isSpeaking || loadingNext) return;
    stopListening();

    const captured = (currentAnswerRef.current + " " + interimAnswerRef.current).trim();
    const ans = captured || "[No answer provided]";
    const q = currentQuestionRef.current;
    if (!q) return;

    addToTranscript("user", ans);
    const newHistory: ConvItem[] = [...history, { question: q.question, type: q.type, answer: ans }];
    setHistory(newHistory);
    setCurrentAnswer(""); setInterimAnswer("");

    const nextNumber = currentIndex + 2; // 1-based next question number

    if (nextNumber > TOTAL_QUESTIONS) {
      // All done — submit
      if (timerRef.current) clearInterval(timerRef.current);
      setPhase("submitting");
      await speak("Thank you — that was your last question! Please hold on while I evaluate your responses.");
      try {
        const res = await fetch(`${FASTAPI_URL}/api/meet/submit`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            job_id, candidate_id, student_token: tokenRef.current,
            answers: newHistory.map(h => h.answer),
            time_taken_seconds: Math.floor((Date.now() - interviewStart) / 1000),
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Evaluation failed");
        setEvaluation(data.evaluation);
        setPhase("results");
        const rec = data.evaluation.recommendation;
        if (rec === "selected") {
          await speak(`Congratulations! You scored ${data.evaluation.overall_score} out of 100. You've been recommended for selection! The HR team will reach out soon.`);
        } else {
          await speak(`Thank you for your time. You scored ${data.evaluation.overall_score} out of 100. Keep practicing — you'll get there!`);
        }
      } catch (err: unknown) {
        toast({ title: "Submission failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
        setPhase("interview");
      }
      return;
    }

    setCurrentIndex(prev => prev + 1);
    setAiStatus("thinking"); setLoadingNext(true);
    try {
      const { question, type, feedback } = await fetchNextQuestion(nextNumber, newHistory);
      setLoadingNext(false);
      setCurrentQuestion({ question, type });

      if (feedback) {
        addToTranscript("ai", feedback);
        await speak(feedback);
        await new Promise(r => setTimeout(r, 200));
      }

      if (nextNumber === 6) {
        const transition = "Great, now let's move on to the technical portion.";
        addToTranscript("ai", transition);
        await speak(transition);
        await new Promise(r => setTimeout(r, 200));
      }

      addToTranscript("ai", question);
      await speak(question);
      autoListenFn();
    } catch (err: unknown) {
      setLoadingNext(false);
      toast({ title: "Error loading next question", description: err instanceof Error ? err.message : "Unknown", variant: "destructive" });
    }
  }, [isSpeaking, loadingNext, history, currentIndex, speak, stopListening, addToTranscript, autoListenFn, fetchNextQuestion, job_id, candidate_id, interviewStart, toast]);

  const handleEndAndEvaluate = useCallback(async () => {
    setShowEndDialog(false);
    stopListening();
    synthRef.current?.cancel();
    if (timerRef.current) clearInterval(timerRef.current);

    const captured = (currentAnswerRef.current + " " + interimAnswerRef.current).trim();
    let finalHistory = [...history];
    if (captured && currentQuestionRef.current) {
      finalHistory = [...finalHistory, {
        question: currentQuestionRef.current.question,
        type: currentQuestionRef.current.type,
        answer: captured,
      }];
    }

    if (finalHistory.length === 0) {
      streamRef.current?.getTracks().forEach(t => t.stop());
      setLocation("/student/calls");
      return;
    }

    setPhase("submitting");
    try {
      const res = await fetch(`${FASTAPI_URL}/api/meet/submit`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_id, candidate_id, student_token: tokenRef.current,
          answers: finalHistory.map(h => h.answer),
          time_taken_seconds: Math.floor((Date.now() - interviewStart) / 1000),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Evaluation failed");
      streamRef.current?.getTracks().forEach(t => t.stop());
      setEvaluation(data.evaluation);
      setPhase("results");
    } catch (err: unknown) {
      toast({ title: "Evaluation failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
      streamRef.current?.getTracks().forEach(t => t.stop());
      setLocation("/student/calls");
    }
  }, [stopListening, history, job_id, candidate_id, interviewStart, toast, setLocation]);

  const handleReschedule = useCallback(() => {
    setShowEndDialog(false);
    stopListening();
    synthRef.current?.cancel();
    if (timerRef.current) clearInterval(timerRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    setLocation("/student/calls");
  }, [stopListening, setLocation]);

  const toggleMic = useCallback(() => {
    if (micBlocked) {
      navigator.mediaDevices.getUserMedia({ audio: true })
        .then(s => { s.getTracks().forEach(t => t.stop()); setMicBlocked(false); setMicOn(true); setTimeout(() => startListening(), 200); })
        .catch(() => toast({ title: "Microphone still blocked", description: "Allow microphone in browser settings and refresh.", variant: "destructive" }));
      return;
    }
    if (micOn) { stopListening(); setMicOn(false); }
    else { setMicOn(true); if (phase === "interview" && !isSpeaking) setTimeout(() => startListening(), 100); }
  }, [micBlocked, micOn, phase, isSpeaking, stopListening, startListening, toast]);

  const toggleCamera = useCallback(() => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (!track) return;
    const newEnabled = !track.enabled;
    track.enabled = newEnabled;
    setCameraOn(newEnabled);
  }, []);

  const endCall = useCallback(() => {
    if (phase === "interview") { setShowEndDialog(true); return; }
    stopListening(); synthRef.current?.cancel();
    if (timerRef.current) clearInterval(timerRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    setLocation("/student/calls");
  }, [phase, stopListening, setLocation]);

  const formatTime = (s: number) => `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;
  const q = currentQuestion;
  const displayAnswer = currentAnswer + (interimAnswer ? " " + interimAnswer : "");

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (phase === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={28} className="animate-spin text-[#667eea]" />
          <p className="text-muted-foreground text-sm">Preparing your AI interview…</p>
        </div>
      </div>
    );
  }

  // ── Lobby ────────────────────────────────────────────────────────────────────
  if (phase === "lobby") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm">
          <div className="bg-card border border-border rounded-2xl shadow-xl overflow-hidden">
            <div className="h-1 w-full bg-gradient-to-r from-[#667eea] to-[#764ba2]" />
            <div className="p-8 text-center space-y-6">
              <div className="flex flex-col items-center gap-3">
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[#667eea] to-[#764ba2] flex items-center justify-center shadow-lg shadow-[#667eea]/20">
                  <Brain size={36} className="text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-foreground">AI Voice Interview</h1>
                  <p className="text-muted-foreground text-sm">Stage 4 — Meet Agent</p>
                </div>
              </div>

              <div className="text-left bg-muted/40 rounded-xl p-4 space-y-2.5 border border-border">
                {[
                  "Questions are generated one at a time, naturally",
                  "AI reacts to your answers before asking next",
                  'Say "repeat" anytime to hear the question again',
                  "Click Done when you finish each answer",
                  "Best experience in Chrome",
                ].map((tip, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <CheckCircle2 size={13} className="text-[#667eea] mt-0.5 shrink-0" />{tip}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-3 gap-2">
                {[["10", "Questions"], ["~25m", "Duration"], ["AI", "Interviewer"]].map(([v, l]) => (
                  <div key={l} className="bg-muted/50 rounded-xl p-3 border border-border">
                    <p className="text-base font-bold text-[#667eea]">{v}</p>
                    <p className="text-[11px] text-muted-foreground">{l}</p>
                  </div>
                ))}
              </div>

              <button onClick={startInterview}
                className="w-full h-12 rounded-xl bg-gradient-to-r from-[#667eea] to-[#764ba2] text-white font-semibold text-base hover:opacity-90 transition-opacity flex items-center justify-center gap-2 shadow-md shadow-[#667eea]/20">
                <Video size={18} /> Join Interview
              </button>
              <button onClick={() => setLocation("/student/calls")} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                ← Back to Interviews
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  // ── Interview ────────────────────────────────────────────────────────────────
  if (phase === "interview") {
    const progress = (currentIndex / TOTAL_QUESTIONS) * 100;

    return (
      <div className="h-screen bg-background flex flex-col overflow-hidden select-none">
        {/* Top bar */}
        <div className="flex items-center justify-between px-5 py-3 bg-card border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#667eea] to-[#764ba2] flex items-center justify-center">
              <Brain size={14} className="text-white" />
            </div>
            <span className="text-sm font-semibold text-foreground">InterVent AI Interview</span>
            <span className="ml-1 px-2 py-0.5 rounded-full bg-red-500/10 text-red-600 text-[10px] font-bold border border-red-500/20 animate-pulse">LIVE</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">Q{currentIndex + 1}/{TOTAL_QUESTIONS}</span>
            <div className="flex items-center gap-1.5 bg-muted/60 px-2.5 py-1 rounded-lg border border-border">
              <Clock size={11} className="text-muted-foreground" />
              <span className="text-xs font-mono text-foreground">{formatTime(timer)}</span>
            </div>
          </div>
        </div>

        {/* Progress */}
        <div className="h-0.5 bg-border shrink-0">
          <motion.div className="h-full bg-gradient-to-r from-[#667eea] to-[#764ba2]" animate={{ width: `${progress}%` }} transition={{ duration: 0.5 }} />
        </div>

        {/* Main */}
        <div className="flex-1 flex overflow-hidden min-h-0">
          {/* Left: AI tile + question */}
          <div className="flex-1 flex flex-col items-center justify-center gap-5 p-6 relative">
            {/* Repeat notification */}
            <AnimatePresence>
              {repeatFired && (
                <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className="absolute top-4 left-1/2 -translate-x-1/2 bg-[#667eea] text-white text-xs px-4 py-2 rounded-full z-10 font-medium shadow-md">
                  Repeating for you…
                </motion.div>
              )}
            </AnimatePresence>

            {/* AI participant tile */}
            <div className={cn(
              "relative w-72 h-52 rounded-2xl border flex flex-col items-center justify-center overflow-hidden shadow-md transition-all duration-300",
              aiStatus === "speaking"
                ? "bg-gradient-to-br from-[#667eea]/5 to-[#764ba2]/5 border-[#667eea]/30"
                : "bg-card border-border"
            )}>
              {aiStatus === "speaking" && (
                <>
                  <motion.div className="absolute inset-0 rounded-2xl border-2 border-[#667eea]/20"
                    animate={{ scale: [1, 1.03, 1], opacity: [0.5, 0, 0.5] }} transition={{ duration: 1.5, repeat: Infinity }} />
                  <motion.div className="absolute inset-0 rounded-2xl border border-[#764ba2]/15"
                    animate={{ scale: [1, 1.06, 1], opacity: [0.3, 0, 0.3] }} transition={{ duration: 1.5, repeat: Infinity, delay: 0.3 }} />
                </>
              )}

              <div className={cn(
                "w-20 h-20 rounded-2xl flex items-center justify-center shadow-md transition-all duration-300",
                aiStatus === "speaking" ? "bg-gradient-to-br from-[#667eea] to-[#764ba2] shadow-[#667eea]/25" :
                  aiStatus === "listening" ? "bg-gradient-to-br from-emerald-500 to-teal-500 shadow-emerald-200" :
                    aiStatus === "thinking" ? "bg-gradient-to-br from-amber-400 to-orange-500 shadow-amber-200" :
                      "bg-gradient-to-br from-[#667eea] to-[#764ba2]"
              )}>
                <Brain size={34} className="text-white" />
              </div>

              <div className="mt-3">
                <SoundWave active={aiStatus === "speaking"} />
              </div>

              <div className="absolute bottom-3 left-3">
                <span className="text-[11px] font-medium text-muted-foreground bg-background/80 px-2 py-0.5 rounded-md border border-border">InterVent AI</span>
              </div>

              <div className={cn(
                "absolute top-3 right-3 text-[10px] font-semibold px-2 py-0.5 rounded-full border",
                aiStatus === "speaking" ? "bg-[#667eea]/10 text-[#667eea] border-[#667eea]/20" :
                  aiStatus === "listening" ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" :
                    aiStatus === "thinking" ? "bg-amber-500/10 text-amber-600 border-amber-500/20" :
                      "bg-muted text-muted-foreground border-border"
              )}>
                {aiStatus === "speaking" ? "Speaking" : aiStatus === "listening" ? "Listening" : aiStatus === "thinking" ? "Thinking…" : "Ready"}
              </div>
            </div>

            {/* Question card */}
            <AnimatePresence mode="wait">
              {loadingNext ? (
                <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="w-full max-w-md bg-card border border-border rounded-xl p-4 flex items-center gap-3">
                  <Loader2 size={16} className="animate-spin text-[#667eea] shrink-0" />
                  <p className="text-sm text-muted-foreground">AI is preparing your next question…</p>
                </motion.div>
              ) : q ? (
                <motion.div key={currentIndex} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                  className="w-full max-w-md bg-card border border-border rounded-xl p-4 space-y-2 shadow-sm">
                  <div className="flex items-center gap-2">
                    <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full border",
                      q.type === "hr"
                        ? "bg-blue-500/10 text-blue-600 border-blue-500/20"
                        : "bg-[#667eea]/10 text-[#667eea] border-[#667eea]/20"
                    )}>
                      {q.type === "hr" ? "HR / Behavioural" : "Technical"}
                    </span>
                    <span className="text-[11px] text-muted-foreground">Q{currentIndex + 1}</span>
                    {isSpeaking && (
                      <span className="ml-auto flex items-center gap-1 text-[10px] text-[#667eea]">
                        <Volume2 size={10} className="animate-pulse" /> Reading…
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-foreground leading-relaxed font-medium">{q.question}</p>
                </motion.div>
              ) : null}
            </AnimatePresence>

            {/* User camera — always rendered, hidden via CSS when off */}
            <div className="absolute bottom-5 right-5 w-36 h-24 rounded-xl overflow-hidden border border-border shadow-md bg-muted/30">
              <video
                ref={videoRef}
                autoPlay muted playsInline
                className={cn("w-full h-full object-cover scale-x-[-1]", !cameraOn && "opacity-0")}
              />
              {!cameraOn && (
                <div className="absolute inset-0 flex items-center justify-center bg-muted/60">
                  <VideoOff size={18} className="text-muted-foreground" />
                </div>
              )}
              <div className="absolute bottom-1.5 left-2">
                <span className="text-[9px] text-muted-foreground bg-background/80 px-1.5 py-0.5 rounded border border-border">You</span>
              </div>
            </div>
          </div>

          {/* Right: transcript + answer */}
          <div className="w-72 border-l border-border bg-muted/20 flex flex-col shrink-0">
            <div className="px-4 py-3 border-b border-border bg-card">
              <p className="text-xs font-semibold text-muted-foreground">Conversation</p>
            </div>
            <div ref={transcriptRef} className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
              {transcript.map((item, i) => (
                <div key={i} className={cn("flex gap-2", item.role === "user" ? "flex-row-reverse" : "flex-row")}>
                  <div className={cn(
                    "max-w-[85%] rounded-2xl px-3 py-2 text-xs leading-relaxed",
                    item.role === "ai"
                      ? "bg-[#667eea]/10 text-foreground border border-[#667eea]/15 rounded-tl-sm"
                      : "bg-card text-foreground border border-border rounded-tr-sm shadow-sm"
                  )}>
                    {item.text}
                  </div>
                </div>
              ))}
              {isListening && (
                <div className="flex flex-row-reverse gap-2">
                  <div className="max-w-[85%] rounded-2xl rounded-tr-sm px-3 py-2 text-xs leading-relaxed bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/40">
                    {displayAnswer || <span className="italic text-emerald-500">Listening…</span>}
                  </div>
                </div>
              )}
            </div>

            {/* Answer + done button */}
            <div className="p-3 border-t border-border bg-card space-y-2">
              <div className={cn(
                "min-h-[48px] max-h-24 overflow-y-auto rounded-xl p-2.5 text-xs border transition-all",
                isListening ? "border-emerald-400/50 bg-emerald-50/50 dark:bg-emerald-950/20 text-foreground" : "border-border bg-muted/40 text-muted-foreground"
              )}>
                {displayAnswer || <span className="italic">{isListening ? "Listening…" : "Your answer appears here"}</span>}
              </div>
              <button
                onClick={handleDoneAnswer}
                disabled={isSpeaking || loadingNext}
                className="w-full h-9 rounded-xl bg-gradient-to-r from-[#667eea] to-[#764ba2] text-white text-xs font-semibold hover:opacity-90 transition-opacity disabled:opacity-40 flex items-center justify-center gap-1.5 shadow-sm"
              >
                {loadingNext ? (
                  <><Loader2 size={13} className="animate-spin" /> Getting next question…</>
                ) : (
                  <><CheckCircle2 size={13} /> {currentIndex === TOTAL_QUESTIONS - 1 ? "Submit Interview" : "Done Answering"}</>
                )}
              </button>
              {currentAnswer && (
                <button onClick={() => { setCurrentAnswer(""); setInterimAnswer(""); }} className="text-[10px] text-muted-foreground hover:text-foreground w-full text-center transition-colors">
                  Clear answer
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Bottom controls */}
        <div className="shrink-0 bg-card border-t border-border px-6 py-4 flex items-center justify-center gap-4">
          <div className="flex gap-1.5 mr-4">
            {Array.from({ length: TOTAL_QUESTIONS }).map((_, i) => (
              <div key={i} className={cn("h-1.5 rounded-full transition-all duration-300",
                i < currentIndex ? "bg-green-500 w-3" : i === currentIndex ? "bg-[#667eea] w-5" : "bg-border w-1.5"
              )} />
            ))}
          </div>

          <button onClick={toggleMic} title={micBlocked ? "Microphone blocked — click to retry" : micOn ? "Mute mic" : "Unmute mic"} className={cn(
            "w-11 h-11 rounded-full flex items-center justify-center transition-all border relative",
            micBlocked ? "bg-red-500 border-red-500 text-white hover:bg-red-600 animate-pulse" :
            micOn ? "bg-card border-border text-foreground hover:bg-muted" : "bg-red-500 border-red-500 text-white hover:bg-red-600"
          )}>
            {micOn && !micBlocked ? <Mic size={18} /> : <MicOff size={18} />}
          </button>

          <button onClick={toggleCamera} className={cn(
            "w-11 h-11 rounded-full flex items-center justify-center transition-all border",
            cameraOn ? "bg-card border-border text-foreground hover:bg-muted" : "bg-red-500 border-red-500 text-white hover:bg-red-600"
          )}>
            {cameraOn ? <Video size={18} /> : <VideoOff size={18} />}
          </button>

          <button onClick={endCall} className="w-12 h-11 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center text-white transition-all">
            <PhoneOff size={18} />
          </button>

          <div className="ml-4 flex items-center gap-2 min-w-[80px]">
            {micBlocked && (
              <span className="flex items-center gap-1.5 text-xs text-red-500">
                <MicOff size={12} /> Mic blocked
              </span>
            )}
            {!micBlocked && isListening && (
              <motion.span animate={{ opacity: [1, 0.4, 1] }} transition={{ duration: 1.2, repeat: Infinity }}
                className="flex items-center gap-1.5 text-xs text-emerald-600">
                <span className="w-2 h-2 rounded-full bg-emerald-500" /> Listening
              </motion.span>
            )}
            {isSpeaking && (
              <span className="flex items-center gap-1.5 text-xs text-[#667eea]">
                <Volume2 size={12} className="animate-pulse" /> AI Speaking
              </span>
            )}
          </div>
        </div>

        {/* End-call dialog */}
        <AnimatePresence>
          {showEndDialog && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
              <motion.div initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.92, opacity: 0 }}
                className="bg-card border border-border rounded-2xl shadow-2xl p-6 max-w-xs w-full mx-4 space-y-4">
                <div className="text-center">
                  <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-3">
                    <PhoneOff size={22} className="text-red-500" />
                  </div>
                  <h3 className="text-base font-bold text-foreground">End Interview?</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    You've answered <span className="font-semibold text-foreground">{history.length}</span> of <span className="font-semibold text-foreground">{TOTAL_QUESTIONS}</span> questions.
                  </p>
                </div>
                <div className="space-y-2">
                  <button onClick={handleEndAndEvaluate}
                    className="w-full h-10 rounded-xl bg-gradient-to-r from-[#667eea] to-[#764ba2] text-white text-sm font-semibold hover:opacity-90 transition-opacity">
                    End & Evaluate Now
                  </button>
                  <button onClick={handleReschedule}
                    className="w-full h-10 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 border border-amber-500/30 text-sm font-medium transition-colors">
                    Reschedule for Later
                  </button>
                  <button onClick={() => setShowEndDialog(false)}
                    className="w-full h-9 text-xs text-muted-foreground hover:text-foreground transition-colors">
                    Cancel — Continue Interview
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // ── Submitting ───────────────────────────────────────────────────────────────
  if (phase === "submitting") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center gap-5 text-center p-8">
          <div className="relative w-20 h-20">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[#667eea] to-[#764ba2] flex items-center justify-center shadow-lg shadow-[#667eea]/20">
              <Sparkles size={32} className="text-white" />
            </div>
            <motion.div className="absolute inset-0 rounded-2xl border-2 border-[#667eea]/40"
              animate={{ scale: [1, 1.3, 1], opacity: [1, 0, 1] }} transition={{ duration: 1.4, repeat: Infinity }} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-foreground">Evaluating your answers…</h2>
            <p className="text-muted-foreground text-sm mt-1">AI is analyzing all your responses. Just a moment.</p>
          </div>
          <div className="flex gap-1">
            {[0,1,2,3,4].map(i => (
              <motion.div key={i} className="w-2 h-2 rounded-full bg-[#667eea]"
                animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1, repeat: Infinity, delay: i * 0.18 }} />
            ))}
          </div>
        </motion.div>
      </div>
    );
  }

  // ── Results ──────────────────────────────────────────────────────────────────
  if (phase === "results") {
    if (alreadyCompleted && !evaluation) {
      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            className="bg-card border border-border rounded-2xl p-8 max-w-sm w-full text-center space-y-4 shadow-md">
            <CheckCircle2 size={40} className="text-green-500 mx-auto" />
            <h2 className="text-xl font-bold text-foreground">Interview Already Completed</h2>
            <p className="text-muted-foreground text-sm">You've already completed Stage 4. Your results have been recorded.</p>
            <button onClick={() => setLocation("/student/calls")}
              className="w-full h-10 rounded-xl bg-muted hover:bg-muted/80 text-foreground text-sm font-medium transition-colors border border-border">
              ← Back to Interviews
            </button>
          </motion.div>
        </div>
      );
    }
    if (!evaluation) return null;

    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-lg space-y-4">
          <div className={cn("rounded-2xl p-6 text-center border shadow-sm",
            evaluation.passed ? "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800/50" : "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800/50"
          )}>
            <div className={cn("w-14 h-14 rounded-full mx-auto flex items-center justify-center mb-3",
              evaluation.passed ? "bg-green-100 dark:bg-green-900/40" : "bg-red-100 dark:bg-red-900/40"
            )}>
              {evaluation.passed ? <CheckCircle2 size={28} className="text-green-600" /> : <XCircle size={28} className="text-red-600" />}
            </div>
            <h1 className="text-xl font-bold text-foreground">{evaluation.passed ? "Congratulations! You Passed" : "Interview Completed"}</h1>
            <p className={cn("text-sm mt-1", evaluation.passed ? "text-green-600" : "text-muted-foreground")}>
              {evaluation.passed ? "You've been recommended for selection" : "Thank you for your time"}
            </p>
          </div>

          <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
            <div className="flex justify-around">
              <ScoreRing score={evaluation.overall_score} label="Overall" size={90} />
              <ScoreRing score={evaluation.hr_score} label="HR" size={70} />
              <ScoreRing score={evaluation.technical_score} label="Technical" size={70} />
            </div>
          </div>

          <div className="bg-card border border-border rounded-2xl p-5 space-y-4 shadow-sm">
            <p className="text-sm text-muted-foreground leading-relaxed">{evaluation.summary}</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-semibold text-green-600 mb-2">Strengths</p>
                <ul className="space-y-1.5">
                  {evaluation.strengths.map((s, i) => (
                    <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                      <CheckCircle2 size={11} className="text-green-500 mt-0.5 shrink-0" />{s}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-xs font-semibold text-amber-600 mb-2">To Improve</p>
                <ul className="space-y-1.5">
                  {evaluation.improvements.map((s, i) => (
                    <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                      <BarChart3 size={11} className="text-amber-500 mt-0.5 shrink-0" />{s}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          <button onClick={() => setLocation("/student/calls")}
            className="w-full h-11 rounded-xl bg-card hover:bg-muted text-foreground text-sm font-medium border border-border transition-colors shadow-sm">
            ← Back to Interview Calls
          </button>
        </motion.div>
      </div>
    );
  }

  return null;
}

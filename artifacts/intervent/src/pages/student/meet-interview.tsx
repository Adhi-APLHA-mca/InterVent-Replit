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

const REPEAT_PHRASES = [
  "repeat", "say again", "say that again", "can't hear", "cannot hear",
  "didn't hear", "one more time", "come again", "pardon", "what did you say",
  "could you repeat", "i couldn't hear", "please repeat", "can you repeat",
  "i can't hear you", "speak again", "say it again",
];

const HR_ACKS = [
  "Great, thank you for sharing that.",
  "Interesting, I've noted your response.",
  "Thank you for that thoughtful answer.",
  "Appreciated, let's keep going.",
];
const TECH_ACKS = [
  "Good thinking on that one.",
  "Thank you for that technical breakdown.",
  "Noted — solid explanation.",
  "Great, let's move on.",
];

function rand<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

interface Question { question: string; type: "hr" | "technical"; index: number; }
interface QuestionScore { index: number; score: number; feedback: string; }
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
type Phase = "loading" | "lobby" | "interview" | "submitting" | "results";

declare global {
  interface Window {
    SpeechRecognition: typeof SpeechRecognition;
    webkitSpeechRecognition: typeof SpeechRecognition;
  }
}

function useSearchParams() {
  const params = new URLSearchParams(window.location.search);
  return { job_id: params.get("job_id") || "", candidate_id: params.get("candidate_id") || "" };
}

function ScoreRing({ score, label, size = 80 }: { score: number; label: string; size?: number }) {
  const radius = (size - 12) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 70 ? "#22c55e" : score >= 50 ? "#f59e0b" : "#ef4444";
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size}>
        <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="#374151" strokeWidth={6} />
        <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke={color} strokeWidth={6}
          strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transform: "rotate(-90deg)", transformOrigin: "50% 50%", transition: "stroke-dashoffset 1s ease" }} />
        <text x="50%" y="50%" dominantBaseline="middle" textAnchor="middle" fontSize="14" fontWeight="700" fill={color}>{score}%</text>
      </svg>
      <span className="text-xs text-gray-400 font-medium">{label}</span>
    </div>
  );
}

function SoundWave({ active, color = "#a78bfa" }: { active: boolean; color?: string }) {
  return (
    <div className="flex items-end gap-[3px] h-8">
      {[0.4, 0.7, 1, 0.8, 0.5, 0.9, 0.6, 1, 0.7, 0.4].map((h, i) => (
        <motion.div
          key={i}
          className="w-1 rounded-full"
          style={{ backgroundColor: color, minHeight: 4 }}
          animate={active ? { height: [4, h * 32, 4] } : { height: 4 }}
          transition={{ duration: 0.6, repeat: active ? Infinity : 0, delay: i * 0.06, ease: "easeInOut" }}
        />
      ))}
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
  const [interimAnswer, setInterimAnswer] = useState("");
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [aiStatus, setAiStatus] = useState<"idle" | "speaking" | "listening" | "thinking">("idle");
  const [transcript, setTranscript] = useState<Array<{ role: "ai" | "user"; text: string }>>([]);
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [alreadyCompleted, setAlreadyCompleted] = useState(false);
  const [timer, setTimer] = useState(0);
  const [interviewStart, setInterviewStart] = useState(0);
  const [cameraOn, setCameraOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [cameraReady, setCameraReady] = useState(false);
  const [repeatJustFired, setRepeatJustFired] = useState(false);

  const tokenRef = useRef<string>("");
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentAnswerRef = useRef("");
  const transcriptRef = useRef<HTMLDivElement>(null);
  const listeningRef = useRef(false);
  const repeatFiredRef = useRef(false);

  currentAnswerRef.current = currentAnswer;

  useEffect(() => {
    synthRef.current = window.speechSynthesis;
    navigator.mediaDevices.getUserMedia({ video: true, audio: false })
      .then(stream => {
        streamRef.current = stream;
        setCameraReady(true);
        if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play(); }
      })
      .catch(() => setCameraOn(false));

    return () => {
      streamRef.current?.getTracks().forEach(t => t.stop());
      synthRef.current?.cancel();
      recognitionRef.current?.abort();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  useEffect(() => {
    if (cameraReady && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play();
    }
  }, [cameraReady, phase]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { setLocation("/"); return; }
      if (!job_id || !candidate_id) { toast({ title: "Missing parameters", variant: "destructive" }); setLocation("/student/calls"); return; }
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
        setPhase(data.already_completed ? "results" : "lobby");
      } catch (err: unknown) {
        toast({ title: "Failed to load interview", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
        setPhase("lobby");
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: "smooth" });
  }, [transcript]);

  const speak = useCallback((text: string): Promise<void> => {
    return new Promise((resolve) => {
      if (!synthRef.current) { resolve(); return; }
      synthRef.current.cancel();
      const utt = new SpeechSynthesisUtterance(text);
      utt.rate = 0.92;
      utt.pitch = 1.0;
      utt.volume = 1.0;
      const voices = synthRef.current.getVoices();
      const preferred = voices.find(v => v.name.includes("Google") || v.name.includes("Natural") || v.lang.startsWith("en"));
      if (preferred) utt.voice = preferred;
      setIsSpeaking(true);
      setAiStatus("speaking");
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
    if (recognitionRef.current) { recognitionRef.current.abort(); recognitionRef.current = null; }
    setIsListening(false);
  }, []);

  const startListening = useCallback(() => {
    const SRA = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SRA) { toast({ title: "Use Chrome for voice", variant: "destructive" }); return; }

    if (recognitionRef.current) { recognitionRef.current.abort(); recognitionRef.current = null; }

    const rec = new SRA();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";

    rec.onresult = (event) => {
      let interim = "";
      let finalText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalText += t;
        else interim += t;
      }

      const allText = (currentAnswerRef.current + " " + interim + " " + finalText).toLowerCase();
      const hasRepeat = REPEAT_PHRASES.some(p => allText.includes(p));
      if (hasRepeat && !repeatFiredRef.current) {
        repeatFiredRef.current = true;
        setRepeatJustFired(true);
        rec.abort();
        recognitionRef.current = null;
        setIsListening(false);
        setCurrentAnswer("");
        setInterimAnswer("");
        currentAnswerRef.current = "";
        const q = questions[currentIndex];
        setTimeout(async () => {
          repeatFiredRef.current = false;
          setRepeatJustFired(false);
          await speak("Sure, let me repeat that for you. " + (q?.question || ""));
          autoListen();
        }, 300);
        return;
      }

      if (finalText) {
        setCurrentAnswer(prev => (prev + " " + finalText).trim());
        setInterimAnswer("");
      } else {
        setInterimAnswer(interim);
      }
    };

    rec.onend = () => {
      if (listeningRef.current) {
        setTimeout(() => { if (listeningRef.current) startListening(); }, 200);
      } else {
        setIsListening(false);
        setInterimAnswer("");
      }
    };

    rec.onerror = (e) => {
      if (e.error !== "aborted" && listeningRef.current) {
        setTimeout(() => { if (listeningRef.current) startListening(); }, 500);
      }
    };

    recognitionRef.current = rec;
    listeningRef.current = true;
    rec.start();
    setIsListening(true);
    setAiStatus("listening");
  }, [questions, currentIndex, speak, toast]);

  const autoListen = useCallback(() => {
    if (!micOn) return;
    setTimeout(() => startListening(), 400);
  }, [micOn, startListening]);

  const handleDoneAnswer = useCallback(async () => {
    if (isSpeaking) return;
    stopListening();
    const ans = currentAnswerRef.current.trim() || "[No answer provided]";
    addToTranscript("user", ans);

    const newAnswers = [...answers, ans];
    setAnswers(newAnswers);
    setCurrentAnswer("");
    setInterimAnswer("");

    const nextIndex = currentIndex + 1;

    if (nextIndex >= questions.length) {
      if (timerRef.current) clearInterval(timerRef.current);
      setPhase("submitting");
      await speak("Thank you for completing the interview. Please hold on while I evaluate your responses.");
      try {
        const res = await fetch(`${FASTAPI_URL}/api/meet/submit`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            job_id, candidate_id, student_token: tokenRef.current,
            answers: newAnswers,
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
          await speak(`Thank you for your time. You scored ${data.evaluation.overall_score} out of 100. Unfortunately you didn't meet the threshold this time. Keep practicing!`);
        }
      } catch (err: unknown) {
        toast({ title: "Submission failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
        setPhase("interview");
      }
      return;
    }

    setAiStatus("thinking");
    const q = questions[currentIndex];
    const ack = q?.type === "technical" ? rand(TECH_ACKS) : rand(HR_ACKS);
    await speak(ack);

    setCurrentIndex(nextIndex);
    await new Promise(r => setTimeout(r, 200));

    if (nextIndex === 5) await speak("Great! Now let's shift to the technical portion of the interview.");
    const nextQ = questions[nextIndex];
    addToTranscript("ai", nextQ?.question || "");
    await speak(`Question ${nextIndex + 1}: ` + (nextQ?.question || "Next question."));
    autoListen();
  }, [isSpeaking, answers, currentIndex, questions, speak, stopListening, addToTranscript, autoListen, job_id, candidate_id, interviewStart, toast]);

  const startInterview = useCallback(async () => {
    setPhase("interview");
    setCurrentIndex(0);
    setAnswers([]);
    setCurrentAnswer("");
    setInterimAnswer("");
    setTranscript([]);
    setInterviewStart(Date.now());
    timerRef.current = setInterval(() => setTimer(t => t + 1), 1000);

    await new Promise(r => setTimeout(r, 600));
    const greeting = "Welcome! I'm your AI interviewer from InterVent. I'll ask you 10 questions — 5 about your background, and 5 technical ones. Speak naturally when you're ready, and click Done when you finish each answer. Let's begin!";
    addToTranscript("ai", greeting);
    await speak(greeting);
    await new Promise(r => setTimeout(r, 300));
    const firstQ = questions[0];
    addToTranscript("ai", firstQ?.question || "Tell me about yourself.");
    await speak("Question 1: " + (firstQ?.question || "Tell me about yourself."));
    autoListen();
  }, [questions, speak, addToTranscript, autoListen]);

  const toggleMic = useCallback(() => {
    if (micOn) {
      stopListening();
      setMicOn(false);
    } else {
      setMicOn(true);
      if (phase === "interview" && !isSpeaking) startListening();
    }
  }, [micOn, phase, isSpeaking, stopListening, startListening]);

  const toggleCamera = useCallback(() => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (track) { track.enabled = !track.enabled; setCameraOn(track.enabled); }
  }, []);

  const endCall = useCallback(() => {
    stopListening();
    synthRef.current?.cancel();
    if (timerRef.current) clearInterval(timerRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    setLocation("/student/calls");
  }, [stopListening, setLocation]);

  const formatTime = (s: number) => `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;

  if (phase === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#111]">
        <div className="flex flex-col items-center gap-4">
          <Loader2 size={32} className="animate-spin text-violet-400" />
          <p className="text-gray-400 text-sm">Preparing your AI interview…</p>
        </div>
      </div>
    );
  }

  if (phase === "lobby") {
    return (
      <div className="min-h-screen bg-[#111] flex items-center justify-center p-4">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm">
          <div className="bg-[#1c1c1c] border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
            <div className="h-1 w-full bg-gradient-to-r from-violet-500 to-indigo-500" />
            <div className="p-8 text-center space-y-6">
              <div className="flex flex-col items-center gap-3">
                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-violet-600 to-indigo-700 flex items-center justify-center shadow-lg shadow-violet-900/40">
                  <Brain size={36} className="text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-white">AI Voice Interview</h1>
                  <p className="text-gray-500 text-sm">Stage 4 — Meet Agent</p>
                </div>
              </div>

              <div className="text-left bg-white/5 rounded-xl p-4 space-y-2.5 border border-white/5">
                {[
                  "10 questions — 5 HR, 5 Technical",
                  "Speak naturally — AI understands context",
                  'Say "repeat" or "say that again" anytime',
                  "Click Done when you finish each answer",
                  "Use Chrome for best voice support",
                ].map((tip, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm text-gray-400">
                    <CheckCircle2 size={13} className="text-violet-400 mt-0.5 shrink-0" />
                    {tip}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-3 gap-2">
                {[["10", "Questions"], ["~20m", "Duration"], ["AI", "Interviewer"]].map(([v, l]) => (
                  <div key={l} className="bg-white/5 rounded-xl p-3 border border-white/5">
                    <p className="text-base font-bold text-violet-400">{v}</p>
                    <p className="text-[11px] text-gray-500">{l}</p>
                  </div>
                ))}
              </div>

              <button
                onClick={startInterview}
                disabled={questions.length === 0}
                className="w-full h-12 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-semibold text-base hover:opacity-90 transition-opacity disabled:opacity-40 flex items-center justify-center gap-2"
              >
                <Video size={18} /> Join Interview
              </button>
              <button onClick={() => setLocation("/student/calls")} className="text-xs text-gray-600 hover:text-gray-400 transition-colors">
                ← Back to Interviews
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  if (phase === "interview") {
    const q = questions[currentIndex];
    const progress = (currentIndex / questions.length) * 100;
    const displayAnswer = currentAnswer + (interimAnswer ? " " + interimAnswer : "");

    return (
      <div className="h-screen bg-[#111] flex flex-col overflow-hidden select-none">
        {/* Top bar */}
        <div className="flex items-center justify-between px-5 py-3 bg-black/40 backdrop-blur-sm border-b border-white/5 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
              <Brain size={12} className="text-white" />
            </div>
            <span className="text-sm font-semibold text-white">InterVent AI Interview</span>
            <span className="ml-1 px-2 py-0.5 rounded-full bg-red-600/90 text-[10px] font-bold text-white animate-pulse">LIVE</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500">Q{currentIndex + 1}/{questions.length}</span>
            <div className="flex items-center gap-1.5 bg-white/5 px-2.5 py-1 rounded-lg">
              <Clock size={11} className="text-gray-400" />
              <span className="text-xs font-mono text-gray-300">{formatTime(timer)}</span>
            </div>
          </div>
        </div>

        {/* Progress */}
        <div className="h-0.5 bg-white/5 shrink-0">
          <motion.div className="h-full bg-gradient-to-r from-violet-500 to-indigo-500" animate={{ width: `${progress}%` }} transition={{ duration: 0.5 }} />
        </div>

        {/* Main area */}
        <div className="flex-1 flex overflow-hidden min-h-0">
          {/* Left: AI video area */}
          <div className="flex-1 flex flex-col items-center justify-center gap-5 p-6 relative">
            {/* Repeat notification */}
            <AnimatePresence>
              {repeatJustFired && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className="absolute top-4 left-1/2 -translate-x-1/2 bg-violet-600/90 text-white text-xs px-4 py-2 rounded-full z-10 font-medium"
                >
                  Repeating the question for you…
                </motion.div>
              )}
            </AnimatePresence>

            {/* AI "participant" tile */}
            <div className="relative w-72 h-52 rounded-2xl bg-[#1a1a2e] border border-white/10 flex flex-col items-center justify-center overflow-hidden shadow-2xl">
              {/* Animated background when speaking */}
              {aiStatus === "speaking" && (
                <motion.div
                  className="absolute inset-0 bg-gradient-to-br from-violet-900/30 to-indigo-900/30"
                  animate={{ opacity: [0.3, 0.6, 0.3] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                />
              )}
              {/* Speaking rings */}
              {aiStatus === "speaking" && (
                <>
                  <motion.div className="absolute inset-0 rounded-2xl border-2 border-violet-500/40"
                    animate={{ scale: [1, 1.04, 1], opacity: [0.5, 0, 0.5] }} transition={{ duration: 1.5, repeat: Infinity }} />
                  <motion.div className="absolute inset-0 rounded-2xl border border-indigo-500/30"
                    animate={{ scale: [1, 1.08, 1], opacity: [0.3, 0, 0.3] }} transition={{ duration: 1.5, repeat: Infinity, delay: 0.3 }} />
                </>
              )}
              <div className={cn(
                "w-20 h-20 rounded-full flex items-center justify-center shadow-lg transition-all duration-300",
                aiStatus === "speaking" ? "bg-gradient-to-br from-violet-500 to-indigo-600 shadow-violet-500/40" :
                  aiStatus === "listening" ? "bg-gradient-to-br from-emerald-500 to-teal-600 shadow-emerald-500/30" :
                    "bg-gradient-to-br from-slate-600 to-slate-700"
              )}>
                <Brain size={36} className="text-white" />
              </div>
              <div className="mt-3">
                <SoundWave active={aiStatus === "speaking"} color={aiStatus === "speaking" ? "#a78bfa" : "#6b7280"} />
              </div>
              <div className="absolute bottom-3 left-3">
                <span className="text-[11px] font-medium text-gray-300 bg-black/50 px-2 py-0.5 rounded-md">InterVent AI</span>
              </div>
              <div className={cn(
                "absolute top-3 right-3 text-[10px] font-semibold px-2 py-0.5 rounded-full",
                aiStatus === "speaking" ? "bg-violet-600 text-white" :
                  aiStatus === "listening" ? "bg-emerald-600 text-white" :
                    aiStatus === "thinking" ? "bg-amber-600 text-white" :
                      "bg-gray-700 text-gray-300"
              )}>
                {aiStatus === "speaking" ? "Speaking" : aiStatus === "listening" ? "Listening" : aiStatus === "thinking" ? "Thinking…" : "Ready"}
              </div>
            </div>

            {/* Question card */}
            <AnimatePresence mode="wait">
              <motion.div
                key={currentIndex}
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                className="w-full max-w-md bg-[#1c1c1c] border border-white/10 rounded-xl p-4 space-y-2"
              >
                <div className="flex items-center gap-2">
                  <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full",
                    q?.type === "hr" ? "bg-blue-500/20 text-blue-400" : "bg-violet-500/20 text-violet-400"
                  )}>
                    {q?.type === "hr" ? "HR / Behavioural" : "Technical"}
                  </span>
                  <span className="text-[11px] text-gray-600">Q{currentIndex + 1}</span>
                  {isSpeaking && (
                    <span className="ml-auto flex items-center gap-1 text-[10px] text-violet-400">
                      <Volume2 size={10} className="animate-pulse" /> AI reading…
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-200 leading-relaxed font-medium">{q?.question}</p>
              </motion.div>
            </AnimatePresence>

            {/* User camera — bottom right */}
            <div className="absolute bottom-5 right-5 w-36 h-24 rounded-xl overflow-hidden border-2 border-white/10 shadow-lg bg-[#222]">
              {cameraOn && cameraReady ? (
                <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover scale-x-[-1]" />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-[#1a1a1a]">
                  <VideoOff size={20} className="text-gray-600" />
                </div>
              )}
              <div className="absolute bottom-1.5 left-2">
                <span className="text-[9px] text-gray-300 bg-black/60 px-1.5 py-0.5 rounded">You</span>
              </div>
            </div>
          </div>

          {/* Right: Live transcript panel */}
          <div className="w-72 border-l border-white/5 bg-black/20 flex flex-col shrink-0">
            <div className="px-4 py-3 border-b border-white/5">
              <p className="text-xs font-semibold text-gray-400">Live Transcript</p>
            </div>
            <div ref={transcriptRef} className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
              {transcript.map((item, i) => (
                <div key={i} className={cn("flex gap-2", item.role === "user" ? "flex-row-reverse" : "flex-row")}>
                  <div className={cn(
                    "max-w-[85%] rounded-2xl px-3 py-2 text-xs leading-relaxed",
                    item.role === "ai"
                      ? "bg-violet-900/50 text-violet-100 rounded-tl-sm"
                      : "bg-emerald-900/50 text-emerald-100 rounded-tr-sm"
                  )}>
                    {item.text}
                  </div>
                </div>
              ))}
              {/* Live interim */}
              {isListening && (
                <div className="flex flex-row-reverse gap-2">
                  <div className="max-w-[85%] rounded-2xl rounded-tr-sm px-3 py-2 text-xs leading-relaxed bg-emerald-900/30 text-emerald-300/80 border border-emerald-800/30">
                    {displayAnswer || <span className="italic text-emerald-600">Listening…</span>}
                  </div>
                </div>
              )}
            </div>

            {/* Answer input + Done button */}
            <div className="p-3 border-t border-white/5 space-y-2">
              <div className={cn(
                "min-h-[48px] max-h-24 overflow-y-auto rounded-xl p-2.5 text-xs border transition-all",
                isListening ? "border-emerald-600/40 bg-emerald-900/10 text-gray-200" : "border-white/5 bg-white/5 text-gray-500"
              )}>
                {displayAnswer || <span className="italic text-gray-600">{isListening ? "Listening…" : "Your answer appears here"}</span>}
              </div>
              <button
                onClick={handleDoneAnswer}
                disabled={isSpeaking}
                className="w-full h-9 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-xs font-semibold hover:opacity-90 transition-opacity disabled:opacity-40 flex items-center justify-center gap-1.5"
              >
                <CheckCircle2 size={13} />
                {currentIndex === questions.length - 1 ? "Submit Interview" : "Done Answering"}
              </button>
              {currentAnswer && (
                <button onClick={() => { setCurrentAnswer(""); setInterimAnswer(""); }} className="text-[10px] text-gray-600 hover:text-gray-400 w-full text-center">
                  Clear answer
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Bottom control bar */}
        <div className="shrink-0 bg-black/60 backdrop-blur-sm border-t border-white/5 px-6 py-4 flex items-center justify-center gap-4">
          {/* Question dots */}
          <div className="flex gap-1.5 mr-4">
            {questions.map((_, i) => (
              <div key={i} className={cn("h-1.5 rounded-full transition-all duration-300",
                i < currentIndex ? "bg-green-500 w-3" : i === currentIndex ? "bg-violet-400 w-5" : "bg-gray-700 w-1.5"
              )} />
            ))}
          </div>

          {/* Mic button */}
          <button
            onClick={toggleMic}
            className={cn(
              "w-12 h-12 rounded-full flex items-center justify-center transition-all",
              micOn ? "bg-white/10 hover:bg-white/20 text-white" : "bg-red-600 hover:bg-red-700 text-white"
            )}
          >
            {micOn ? <Mic size={20} /> : <MicOff size={20} />}
          </button>

          {/* Camera button */}
          <button
            onClick={toggleCamera}
            className={cn(
              "w-12 h-12 rounded-full flex items-center justify-center transition-all",
              cameraOn ? "bg-white/10 hover:bg-white/20 text-white" : "bg-red-600 hover:bg-red-700 text-white"
            )}
          >
            {cameraOn ? <Video size={20} /> : <VideoOff size={20} />}
          </button>

          {/* End call */}
          <button
            onClick={endCall}
            className="w-14 h-12 rounded-full bg-red-600 hover:bg-red-700 flex items-center justify-center text-white transition-all"
          >
            <PhoneOff size={20} />
          </button>

          {/* Status indicator */}
          <div className="ml-4 flex items-center gap-2">
            {isListening && (
              <motion.span
                animate={{ opacity: [1, 0.4, 1] }}
                transition={{ duration: 1.2, repeat: Infinity }}
                className="flex items-center gap-1.5 text-xs text-emerald-400"
              >
                <span className="w-2 h-2 rounded-full bg-emerald-500" /> Listening
              </motion.span>
            )}
            {isSpeaking && (
              <span className="flex items-center gap-1.5 text-xs text-violet-400">
                <Volume2 size={12} className="animate-pulse" /> AI Speaking
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (phase === "submitting") {
    return (
      <div className="min-h-screen bg-[#111] flex items-center justify-center">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center gap-5 text-center p-8">
          <div className="relative w-20 h-20">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-violet-600 to-indigo-700 flex items-center justify-center">
              <Sparkles size={32} className="text-white" />
            </div>
            <motion.div className="absolute inset-0 rounded-full border-2 border-violet-500"
              animate={{ scale: [1, 1.3, 1], opacity: [1, 0, 1] }} transition={{ duration: 1.4, repeat: Infinity }} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Evaluating your answers…</h2>
            <p className="text-gray-500 text-sm mt-1">AI is analyzing all responses. This takes a moment.</p>
          </div>
          <div className="flex gap-1">
            {[0,1,2,3,4].map(i => (
              <motion.div key={i} className="w-2 h-2 rounded-full bg-violet-500"
                animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1, repeat: Infinity, delay: i * 0.18 }} />
            ))}
          </div>
        </motion.div>
      </div>
    );
  }

  if (phase === "results") {
    if (alreadyCompleted && !evaluation) {
      return (
        <div className="min-h-screen bg-[#111] flex items-center justify-center p-4">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="bg-[#1c1c1c] border border-white/10 rounded-2xl p-8 max-w-sm w-full text-center space-y-4">
            <CheckCircle2 size={40} className="text-green-500 mx-auto" />
            <h2 className="text-xl font-bold text-white">Interview Already Completed</h2>
            <p className="text-gray-500 text-sm">You've already completed Stage 4. Your results have been recorded.</p>
            <button onClick={() => setLocation("/student/calls")} className="w-full h-10 rounded-xl bg-white/10 hover:bg-white/15 text-white text-sm font-medium transition-colors">
              ← Back to Interviews
            </button>
          </motion.div>
        </div>
      );
    }

    if (!evaluation) return null;

    return (
      <div className="min-h-screen bg-[#111] flex items-center justify-center p-4">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-lg space-y-4">
          {/* Header */}
          <div className={cn(
            "rounded-2xl p-6 text-center border",
            evaluation.passed ? "bg-green-950/60 border-green-800/50" : "bg-red-950/60 border-red-800/50"
          )}>
            <div className={cn("w-14 h-14 rounded-full mx-auto flex items-center justify-center mb-3",
              evaluation.passed ? "bg-green-500/20" : "bg-red-500/20"
            )}>
              {evaluation.passed ? <CheckCircle2 size={28} className="text-green-400" /> : <XCircle size={28} className="text-red-400" />}
            </div>
            <h1 className="text-xl font-bold text-white">{evaluation.passed ? "Congratulations! You Passed" : "Interview Completed"}</h1>
            <p className={cn("text-sm mt-1", evaluation.passed ? "text-green-400" : "text-gray-400")}>
              {evaluation.passed ? "You've been recommended for selection" : "Thank you for your time"}
            </p>
          </div>

          {/* Scores */}
          <div className="bg-[#1c1c1c] border border-white/10 rounded-2xl p-6">
            <div className="flex justify-around">
              <ScoreRing score={evaluation.overall_score} label="Overall" size={90} />
              <ScoreRing score={evaluation.hr_score} label="HR" size={70} />
              <ScoreRing score={evaluation.technical_score} label="Technical" size={70} />
            </div>
          </div>

          {/* Summary */}
          <div className="bg-[#1c1c1c] border border-white/10 rounded-2xl p-5 space-y-4">
            <p className="text-sm text-gray-300 leading-relaxed">{evaluation.summary}</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs font-semibold text-green-400 mb-2">Strengths</p>
                <ul className="space-y-1">
                  {evaluation.strengths.map((s, i) => (
                    <li key={i} className="text-xs text-gray-400 flex items-start gap-1.5">
                      <CheckCircle2 size={11} className="text-green-500 mt-0.5 shrink-0" />{s}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-xs font-semibold text-amber-400 mb-2">To Improve</p>
                <ul className="space-y-1">
                  {evaluation.improvements.map((s, i) => (
                    <li key={i} className="text-xs text-gray-400 flex items-start gap-1.5">
                      <BarChart3 size={11} className="text-amber-500 mt-0.5 shrink-0" />{s}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          <button onClick={() => setLocation("/student/calls")} className="w-full h-11 rounded-xl bg-white/5 hover:bg-white/10 text-white text-sm font-medium border border-white/10 transition-colors">
            ← Back to Interview Calls
          </button>
        </motion.div>
      </div>
    );
  }

  return null;
}

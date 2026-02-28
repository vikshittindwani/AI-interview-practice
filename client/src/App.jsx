import { useEffect, useMemo, useRef, useState } from "react";

const tracks = ["System Design", "ML Fundamentals", "Behavioral", "Product Sense"];
const levels = ["Entry", "Mid", "Senior", "Staff"];
const interviewers = ["Priya Shah", "Neha Verma", "Ananya Iyer", "Kavya Menon"];
const ANSWER_PAUSE_LIMIT_SECONDS = 5;

export default function App() {
  const [questions, setQuestions] = useState([]);
  const [track, setTrack] = useState("");
  const [level, setLevel] = useState("");
  const [role, setRole] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [answer, setAnswer] = useState("");
  const [submitState, setSubmitState] = useState("Idle");
  const [autoVoiceInterview, setAutoVoiceInterview] = useState(false);
  const [awaitingNextDecision, setAwaitingNextDecision] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState("");
  const [feedback, setFeedback] = useState("");
  const [score, setScore] = useState(null);
  const [assistantLang, setAssistantLang] = useState("");
  const [onHold, setOnHold] = useState(false);
  const [interviewerName, setInterviewerName] = useState(interviewers[0]);
  const [targetQuestions, setTargetQuestions] = useState(5);
  const [questionsCompleted, setQuestionsCompleted] = useState(0);
  const [questionTimeLeft, setQuestionTimeLeft] = useState(90);
  const [isCallPage, setIsCallPage] = useState(false);
  const [answerPauseLeft, setAnswerPauseLeft] = useState(ANSWER_PAUSE_LIMIT_SECONDS);
  const [answerPauseArmed, setAnswerPauseArmed] = useState(false);

  const [stream, setStream] = useState(null);
  const [recording, setRecording] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [camOn, setCamOn] = useState(false);
  const [uploadState, setUploadState] = useState("Idle");
  const [interviewStarted, setInterviewStarted] = useState(false);
  const [interviewElapsed, setInterviewElapsed] = useState(0);
  const recordingTimerRef = useRef(null);

  const recorderRef = useRef(null);
  const sarvamRecorderRef = useRef(null);
  const sarvamChunksRef = useRef([]);
  const chunksRef = useRef([]);
  const callVideoRef = useRef(null);
  const lobbyVideoRef = useRef(null);
  const recognitionRef = useRef(null);
  const speechBufferRef = useRef("");
  const speechInterimRef = useRef("");
  const baseAnswerRef = useRef("");
  const answerRef = useRef("");
  const didAutoplayRef = useRef(false);
  const pendingSubmitRef = useRef(false);
  const autoVoiceInterviewRef = useRef(false);
  const manualDictationStopRef = useRef(false);
  const manualDictationActiveRef = useRef(false);
  const awaitingNextDecisionRef = useRef(false);
  const pendingDecisionRef = useRef(null);
  const decisionBufferRef = useRef("");
  const decisionTimeoutRef = useRef(null);
  const autoSubmitTimerRef = useRef(null);
  const stopSubmitFallbackRef = useRef(null);
  const submitInFlightRef = useRef(false);
  const serverAudioRef = useRef(null);
  const settingsTimerRef = useRef(null);
  const recentQuestionsRef = useRef([]);
  const sessionIdRef = useRef("");

  const [speechSupported, setSpeechSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [speechState, setSpeechState] = useState("");
  const [ttsSupported, setTtsSupported] = useState(false);
  const [ttsState, setTtsState] = useState("");
  const [sarvamRecording, setSarvamRecording] = useState(false);
  const [sarvamBusy, setSarvamBusy] = useState(false);
  const autoListenRef = useRef(false);
  const speechSupportedRef = useRef(false);
  const listeningRef = useRef(false);
  const assistantLangRef = useRef("");
  const onHoldRef = useRef(false);
  const holdTimerRef = useRef(null);
  const completedCountRef = useRef(0);
  const lastAnswerActivityRef = useRef(Date.now());
  const noResponseInFlightRef = useRef(false);
  const answerPauseArmedRef = useRef(false);
  const stopAfterSubmitRef = useRef(false);

  const showToast = (message) => {
    setToast(message);
    window.clearTimeout(showToast._t);
    showToast._t = window.setTimeout(() => setToast(""), 1800);
  };

  const clearAnswerDraft = () => {
    setAnswer("");
    answerRef.current = "";
    baseAnswerRef.current = "";
    speechBufferRef.current = "";
    speechInterimRef.current = "";
  };

  const clearAutoSubmitTimer = () => {
    if (autoSubmitTimerRef.current) {
      window.clearTimeout(autoSubmitTimerRef.current);
      autoSubmitTimerRef.current = null;
    }
  };

  const clearSettingsTimer = () => {
    if (settingsTimerRef.current) {
      window.clearTimeout(settingsTimerRef.current);
      settingsTimerRef.current = null;
    }
  };

  const clearHoldTimer = () => {
    if (holdTimerRef.current) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  };

  const getRoundTimeLimit = () => 90;

  const formatCountdown = (seconds) => {
    const safe = Math.max(0, Number(seconds) || 0);
    const mins = Math.floor(safe / 60);
    const secs = safe % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  const waitFor = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

  const markAnswerActivity = () => {
    lastAnswerActivityRef.current = Date.now();
    if (!answerPauseArmedRef.current) return;
    setAnswerPauseLeft(ANSWER_PAUSE_LIMIT_SECONDS);
  };

  const disarmAnswerPauseTimer = () => {
    answerPauseArmedRef.current = false;
    setAnswerPauseArmed(false);
    lastAnswerActivityRef.current = Date.now();
    setAnswerPauseLeft(ANSWER_PAUSE_LIMIT_SECONDS);
  };

  const armAnswerPauseTimer = () => {
    answerPauseArmedRef.current = true;
    setAnswerPauseArmed(true);
    lastAnswerActivityRef.current = Date.now();
    setAnswerPauseLeft(ANSWER_PAUSE_LIMIT_SECONDS);
  };

  const scheduleHoldTimer = () => {
    clearHoldTimer();
    if (!listeningRef.current) return;
    holdTimerRef.current = window.setTimeout(() => {
      if (!listeningRef.current) return;
      autoListenRef.current = false;
      setOnHold(true);
      setSpeechState("On hold. Tap Continue to resume.");
      clearAutoSubmitTimer();
      try {
        recognitionRef.current?.stop();
      } catch {
        // no-op
      }
    }, 12000);
  };

  const normalizeTranscript = (text) => String(text || "").trim();

  const detectLanguage = (text) => {
    const normalized = normalizeTranscript(text).toLowerCase();
    if (!normalized) return null;
    if (
      /\b(mujhse hindi mein baat karo|mujhse hindi me baat karo|hindi me baat karo|hindi mein baat karo|hindi mein samjhao|hindi me samjhao|hindi mein samjha sakte ho|hindi me samjha sakte ho|mujhe hindi mein samjhao|mujhe hindi me samjhao|speak in hindi|talk in hindi|hindi bolo|hindi mein bolo|hindi me bolo)\b/.test(
        normalized
      )
    ) {
      return "hi";
    }
    if (/\b(hinglish me|hinglish mein|hinglish bolo|talk in hinglish|speak hinglish)\b/.test(normalized)) {
      return "hinglish";
    }
    if (/\b(english me baat karo|english mein baat karo|talk in english|speak english)\b/.test(normalized)) {
      return "en";
    }
    const hasDevanagari = /[\u0900-\u097F]/.test(text);
    const hasEnglish = /[a-z]/i.test(text);
    const hindiHints =
      /\b(kya|kyu|kyon|kaise|kab|kahan|mujhse|hindi|baat|karo|krdo|kar do|tum|aap|mein|main|mera|meri|hai|hun|ho|nahi|haan|haanji|kyunki|iska|uska|please|bol|bolo|samjhao|samjha)\b/i.test(
        text
      );
    if (hasDevanagari && hasEnglish) return "hinglish";
    if (hasDevanagari) return "hi";
    if (hindiHints && hasEnglish) return "hinglish";
    if (hindiHints) return "hi";
    return "en";
  };

  const updateAssistantLanguage = (nextLang) => {
    if (!nextLang || nextLang === assistantLangRef.current) return;
    assistantLangRef.current = nextLang;
    setAssistantLang(nextLang);
    if (nextLang === "hi") {
      showToast("Language set to Hindi.");
    } else if (nextLang === "hinglish") {
      showToast("Language set to Hinglish.");
    } else {
      showToast("Language set to English.");
    }
  };

  const clearStopSubmitFallback = () => {
    if (stopSubmitFallbackRef.current) {
      window.clearTimeout(stopSubmitFallbackRef.current);
      stopSubmitFallbackRef.current = null;
    }
  };

  const clearDecisionTimer = () => {
    if (decisionTimeoutRef.current) {
      window.clearTimeout(decisionTimeoutRef.current);
      decisionTimeoutRef.current = null;
    }
  };

  const getOrCreateSessionId = () => {
    if (sessionIdRef.current) return sessionIdRef.current;
    const fallback = `sess-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    if (typeof window === "undefined") {
      sessionIdRef.current = fallback;
      return sessionIdRef.current;
    }
    const storageKey = "interview_session_id";
    const existing = window.localStorage.getItem(storageKey);
    if (existing && existing.trim()) {
      sessionIdRef.current = existing.trim();
      return sessionIdRef.current;
    }
    window.localStorage.setItem(storageKey, fallback);
    sessionIdRef.current = fallback;
    return sessionIdRef.current;
  };

  const isUnknownAnswer = (text) => {
    const normalized = normalizeTranscript(text).toLowerCase();
    if (!normalized) return false;
    return (
      /\b(i\s*don'?t\s*know|dont\s*know|do not know|no idea|not sure|not really|no clue)\b/.test(normalized) ||
      /\b(mujhe\s*nahi\s*pata|mujhe\s*pata\s*nahi|pata\s*nahi|nahi\s*pata|maloom\s*nahi|idea\s*nahi)\b/.test(
        normalized
      )
    );
  };

  const startInterview = ({ fromRecording = false } = {}) => {
    setInterviewStarted(true);
    setInterviewElapsed(0);
    setQuestionsCompleted(0);
    completedCountRef.current = 0;
    setQuestionTimeLeft(getRoundTimeLimit());
    disarmAnswerPauseTimer();
    setSubmitState("Interviewer joined");
    setFeedback("");
    setScore(null);
    if (!fromRecording) {
      setUploadState("Interview started");
    }
    showToast(`${interviewerName} joined the interview.`);
  };

  const markQuestionCompleted = () => {
    const next = Math.min(targetQuestions, completedCountRef.current + 1);
    completedCountRef.current = next;
    setQuestionsCompleted(next);
    if (next >= targetQuestions) {
      setSubmitState("Round complete");
      pauseVoiceLoop({ message: "Interview round complete." });
      showToast("Round complete.");
      return true;
    }
    setQuestionTimeLeft(getRoundTimeLimit());
    return false;
  };

  const pauseVoiceLoop = ({ message = "Voice loop paused." } = {}) => {
    autoVoiceInterviewRef.current = false;
    awaitingNextDecisionRef.current = false;
    pendingDecisionRef.current = null;
    decisionBufferRef.current = "";
    setAutoVoiceInterview(false);
    setAwaitingNextDecision(false);
    setOnHold(false);
    clearHoldTimer();
    clearDecisionTimer();
    clearAutoSubmitTimer();
    disarmAnswerPauseTimer();
    stopAfterSubmitRef.current = false;
    autoListenRef.current = false;
    setSubmitState("Paused");
    setSpeechState("Paused");
    manualDictationActiveRef.current = false;
    try {
      recognitionRef.current?.stop();
    } catch {
      // no-op
    }
    stopSarvamDictation();
    if (serverAudioRef.current) {
      serverAudioRef.current.pause();
      serverAudioRef.current = null;
    }
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    showToast(message);
  };

  const handleDecisionAction = (action) => {
    if (!action) return;
    pendingDecisionRef.current = null;
    awaitingNextDecisionRef.current = false;
    setAwaitingNextDecision(false);
    decisionBufferRef.current = "";
    setOnHold(false);
    autoListenRef.current = false;
    clearHoldTimer();
    clearDecisionTimer();

    if (action === "next") {
      try {
        recognitionRef.current?.stop();
      } catch {
        // no-op
      }
      clearAnswerDraft();
      setSubmitState("Generating next question...");
      void generateQuestions({ mode: "next", silent: true });
      return;
    }

    pauseVoiceLoop({ message: "Interview stopped." });
  };

  const startStopOnlyWindow = async (spokenText) => {
    awaitingNextDecisionRef.current = true;
    setAwaitingNextDecision(true);
    decisionBufferRef.current = "";
    clearDecisionTimer();
    setSubmitState("Say stop to end. Otherwise continuing...");
    await speakText(spokenText, { listenAfter: true, toastOnUnsupported: false });
    decisionTimeoutRef.current = window.setTimeout(() => {
      if (!awaitingNextDecisionRef.current) return;
      setSpeechState("Continuing to next question...");
      handleDecisionAction("next");
    }, 3500);
  };

  const ensureStream = async ({ audio = micOn, video = camOn } = {}) => {
    if (stream) return stream;
    if (!audio && !video) return null;
    const newStream = await navigator.mediaDevices.getUserMedia({ audio, video });
    newStream.getTracks().forEach((trackItem) => {
      if (trackItem.kind === "audio") trackItem.enabled = audio;
      if (trackItem.kind === "video") trackItem.enabled = video;
    });
    setStream(newStream);
    return newStream;
  };

  const toggleTrack = async (kind) => {
    const active = kind === "audio" ? micOn : camOn;
    const next = !active;
    if (!next) {
      const otherOn = kind === "audio" ? camOn : micOn;
      if (stream) {
        stream.getTracks().forEach((trackItem) => {
          if (trackItem.kind === kind) trackItem.enabled = false;
        });
        if (!otherOn) {
          stream.getTracks().forEach((trackItem) => trackItem.stop());
          setStream(null);
        }
      }
      if (kind === "audio") setMicOn(false);
      if (kind === "video") setCamOn(false);
      return;
    }

    try {
      const requested = await navigator.mediaDevices.getUserMedia({
        audio: kind === "audio",
        video: kind === "video",
      });
      const current = stream || new MediaStream();
      const existing = kind === "audio" ? current.getAudioTracks() : current.getVideoTracks();
      existing.forEach((trackItem) => {
        current.removeTrack(trackItem);
        trackItem.stop();
      });
      const incoming = kind === "audio" ? requested.getAudioTracks() : requested.getVideoTracks();
      incoming.forEach((trackItem) => {
        trackItem.enabled = true;
        current.addTrack(trackItem);
      });
      setStream(current);
      if (kind === "audio") setMicOn(true);
      if (kind === "video") setCamOn(true);
    } catch {
      showToast(kind === "audio" ? "Microphone permission denied." : "Camera permission denied.");
    }
  };

  const startRecording = async () => {
    setError("");
    const current = await ensureStream({ audio: true, video: true });
    if (!current) {
      showToast("Allow camera and mic access to record.");
      return;
    }
    if (callVideoRef.current) callVideoRef.current.srcObject = current;
    if (lobbyVideoRef.current) lobbyVideoRef.current.srcObject = current;

    chunksRef.current = [];
    const recorder = new MediaRecorder(current, {
      mimeType: "video/webm;codecs=vp9,opus",
    });
    recorderRef.current = recorder;

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunksRef.current.push(event.data);
      }
    };

    recorder.onstop = async () => {
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
      if (!blob.size) return;

      const formData = new FormData();
      const file = new File([blob], `session-${Date.now()}.webm`, {
        type: recorder.mimeType,
      });
      formData.append("media", file);

      try {
        setUploadState("Uploading...");
        const response = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });
        if (!response.ok) {
          throw new Error("Upload failed");
        }
        const data = await response.json();
        setUploadState(`Saved: ${data.filename}`);
        showToast("Recording uploaded.");
      } catch (uploadError) {
        setUploadState("Upload failed");
      }
    };

    recorder.start();
    setRecording(true);
    setUploadState("Recording...");
    if (!interviewStarted) {
      startInterview({ fromRecording: true });
    }
  };

  const stopRecording = () => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
    setRecording(false);
  };

  const getAudioRecorderMimeType = () => {
    if (typeof MediaRecorder === "undefined") return "";
    const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
    const supported = candidates.find((item) => MediaRecorder.isTypeSupported(item));
    return supported || "";
  };

  const startSarvamDictation = async () => {
    if (sarvamBusy || sarvamRecording) return;
    setSpeechState("Recording for Sarvam...");
    try {
      const micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      const mimeType = getAudioRecorderMimeType();
      const recorder = mimeType ? new MediaRecorder(micStream, { mimeType }) : new MediaRecorder(micStream);
      sarvamChunksRef.current = [];
      sarvamRecorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          sarvamChunksRef.current.push(event.data);
        }
      };
      recorder.onstop = async () => {
        setSarvamRecording(false);
        const blob = new Blob(sarvamChunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        micStream.getTracks().forEach((trackItem) => trackItem.stop());
        sarvamRecorderRef.current = null;
        sarvamChunksRef.current = [];
        if (!blob.size) {
          setSpeechState("No audio captured");
          return;
        }

        const formData = new FormData();
        const extension = blob.type.includes("mp4") ? "m4a" : "webm";
        formData.append("audio", new File([blob], `dictation-${Date.now()}.${extension}`, { type: blob.type }));
        formData.append("language", assistantLangRef.current || "en");

        setSarvamBusy(true);
        setSpeechState("Transcribing with Sarvam...");
        try {
          const response = await fetch("/api/transcribe", {
            method: "POST",
            body: formData,
          });
          if (!response.ok) {
            throw new Error("Transcription failed");
          }
          const data = await response.json();
          const transcript = String(data.transcript || "").trim();
          if (!transcript) {
            setSpeechState("No transcript returned");
            return;
          }
          const combined = [answerRef.current, transcript].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
          setAnswer(combined);
          answerRef.current = combined;
          setSpeechState("Sarvam transcript ready");
          showToast("Sarvam STT captured.");
        } catch {
          setSpeechState("Sarvam STT failed");
          showToast("Sarvam transcription failed.");
        } finally {
          setSarvamBusy(false);
        }
      };

      recorder.start();
      setSarvamRecording(true);
      showToast("Sarvam recording started.");
    } catch {
      setSpeechState("Could not access microphone");
      setSarvamRecording(false);
    }
  };

  const stopSarvamDictation = () => {
    if (!sarvamRecorderRef.current || sarvamRecorderRef.current.state === "inactive") return;
    sarvamRecorderRef.current.stop();
    setSpeechState("Finishing Sarvam recording...");
  };

  const toggleSarvamDictation = () => {
    if (sarvamRecording) {
      stopSarvamDictation();
      return;
    }
    startSarvamDictation();
  };

  const submitAnswerWithSpeech = async () => {
    clearStopSubmitFallback();
    if (listening && recognitionRef.current) {
      pendingSubmitRef.current = true;
      manualDictationActiveRef.current = false;
      recognitionRef.current.stop();
      setSpeechState("Stopping...");
      return;
    }
    await submitAnswer();
  };

  const toggleDictation = () => {
    if (!speechSupportedRef.current) {
      showToast("Speech recognition not supported in this browser.");
      return;
    }

    const recognition = recognitionRef.current;
    if (!recognition) return;

    if (!listening) {
      clearStopSubmitFallback();
      manualDictationActiveRef.current = true;
      manualDictationStopRef.current = false;
      baseAnswerRef.current = answer;
      speechBufferRef.current = "";
      speechInterimRef.current = "";
      try {
        recognition.start();
        setListening(true);
        listeningRef.current = true;
        setSpeechState("Realtime listening...");
      } catch {
        setSpeechState("Could not start speech recognition.");
        setListening(false);
        listeningRef.current = false;
      }
      return;
    }

    manualDictationActiveRef.current = false;
    manualDictationStopRef.current = true;
    autoListenRef.current = false;
    const shouldAutoSubmit = Boolean(currentQuestion.trim() && answerRef.current.trim());
    if (shouldAutoSubmit) {
      pendingSubmitRef.current = true;
      setSpeechState("Submitting...");
    }
    try {
      recognition.stop();
    } catch {
      // no-op
    }
    setListening(false);

    if (shouldAutoSubmit) {
      clearStopSubmitFallback();
      // Some browsers occasionally miss onend after stop(); fallback to ensure submit.
      stopSubmitFallbackRef.current = window.setTimeout(() => {
        if (submitInFlightRef.current) return;
        if (!pendingSubmitRef.current) return;
        pendingSubmitRef.current = false;
        void submitAnswer();
      }, 800);
    }
  };

  const startDictation = () => {
    if (!speechSupportedRef.current) return false;
    const recognition = recognitionRef.current;
    if (!recognition || listeningRef.current) return false;
    setOnHold(false);
    baseAnswerRef.current = answer;
    speechBufferRef.current = "";
    speechInterimRef.current = "";
    try {
      recognition.start();
      setListening(true);
      listeningRef.current = true;
      setSpeechState("Listening...");
      scheduleHoldTimer();
      return true;
    } catch {
      setSpeechState("Could not start speech recognition.");
      setListening(false);
      listeningRef.current = false;
      return false;
    }
  };

  const startDictationWithRetry = ({ attempts = 5, delayMs = 220 } = {}) => {
    if (startDictation()) return;
    if (attempts <= 1) return;
    window.setTimeout(() => {
      startDictationWithRetry({ attempts: attempts - 1, delayMs });
    }, delayMs);
  };

  const resumeFromHold = () => {
    if (!speechSupportedRef.current) return;
    setOnHold(false);
    setSpeechState("Listening...");
    startDictationWithRetry();
  };

  const generateQuestions = async ({
    mode = "next",
    answerText = "",
    silent = false,
    autoStartVoice = true,
    autoStartInterview = true,
  } = {}) => {
    if (!role.trim() || !track || !level) {
      if (!silent) showToast("Set role, track, and level first.");
      return false;
    }
    const language = assistantLangRef.current || "en";
    if (autoStartInterview && !interviewStarted) {
      startInterview();
    }
    if (autoStartVoice && !autoVoiceInterviewRef.current) {
      autoVoiceInterviewRef.current = true;
      setAutoVoiceInterview(true);
    }
    awaitingNextDecisionRef.current = false;
    setAwaitingNextDecision(false);
    pendingDecisionRef.current = null;
    decisionBufferRef.current = "";
    setOnHold(false);
    clearHoldTimer();
    disarmAnswerPauseTimer();
    setLoading(true);
    setSubmitState("Generating next question...");
    setError("");
    const previousQuestion = String(currentQuestion || "").trim();
    const normalizedPrevious = previousQuestion.toLowerCase();
    const recentQuestions = [...recentQuestionsRef.current.slice(-20), previousQuestion]
      .map((item) => String(item || "").trim())
      .filter(Boolean);
    try {
      const endpoint =
        mode === "followup" ? "/api/question/followup" : mode === "initial" ? "/api/generate" : "/api/question/next";
      const payload = {
        role,
        track,
        level,
        language,
        sessionId: getOrCreateSessionId(),
        recentQuestions,
        nonce: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      };
      if (mode === "followup") {
        payload.question = currentQuestion;
        payload.answer = String(answerText || "").trim();
      } else if (mode === "initial") {
        payload.count = 2;
      }
      let data = null;
      let lastError = null;
      const maxAttempts = 3;
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        const controller = new AbortController();
        const timeoutId = window.setTimeout(() => controller.abort(), 30000);
        try {
          const response = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: controller.signal,
            body: JSON.stringify(payload),
          });
          if (!response.ok) {
            const detail = await response.text();
            const retryable = response.status === 429 || response.status === 503 || response.status === 504;
            if (retryable && attempt < maxAttempts) {
              setSubmitState("Rate limited, retrying...");
              await waitFor(700 * attempt + Math.floor(Math.random() * 300));
              continue;
            }
            const failure = new Error(detail || `Failed to generate (${response.status})`);
            failure.status = response.status;
            throw failure;
          }
          data = await response.json();
          lastError = null;
          break;
        } catch (error) {
          const timedOut = error?.name === "AbortError";
          if (timedOut && attempt < maxAttempts) {
            setSubmitState("Timed out, retrying...");
            await waitFor(700 * attempt + Math.floor(Math.random() * 300));
            continue;
          }
          lastError = error;
          break;
        } finally {
          window.clearTimeout(timeoutId);
        }
      }
      if (lastError) throw lastError;
      if (!data) throw new Error("No response received");
      const candidateQuestions = Array.isArray(data.questions)
        ? data.questions
        : data.question
        ? [data.question]
        : [];
      if (candidateQuestions.length) {
        const nextQuestion =
          candidateQuestions.find((item) => String(item || "").trim().toLowerCase() !== normalizedPrevious) ||
          candidateQuestions[0];
        setQuestions(candidateQuestions);
        setCurrentQuestion(nextQuestion);
        clearAnswerDraft();
        setFeedback("");
        setScore(null);
        setSubmitState("Idle");
        if (!silent) {
          showToast("Question set refreshed.");
        }
        return true;
      } else {
        throw new Error("No questions returned");
      }
    } catch (genError) {
      const timedOut = genError?.name === "AbortError";
      const rateLimited =
        genError?.status === 429 || /rate limit|too many requests|429/i.test(String(genError?.message || ""));
      setError(
        rateLimited
          ? "Rate limit hit. Please wait a few seconds and try again."
          : timedOut
          ? "Next question timed out. Please retry."
          : "Could not generate questions. Check backend or API key."
      );
      setSubmitState("Next question failed");
    } finally {
      setLoading(false);
    }
    return false;
  };

  const startCallMode = async () => {
    const randomInterviewer = interviewers[Math.floor(Math.random() * interviewers.length)];
    setInterviewerName(randomInterviewer);
    setQuestionTimeLeft(getRoundTimeLimit());
    const ok = await generateQuestions({
      mode: "initial",
      silent: false,
      autoStartVoice: true,
      autoStartInterview: true,
    });
    if (!ok) return;
    setIsCallPage(true);
    showToast("Joined interview call.");
  };

  const endCallMode = () => {
    setIsCallPage(false);
    pauseVoiceLoop({ message: "Interview call ended." });
    if (recording) {
      stopRecording();
    }
  };

  const submitAnswer = async () => {
    if (submitInFlightRef.current) return;
    if (awaitingNextDecisionRef.current) {
      const typedDecision = parseNextDecision(answerRef.current);
      if (typedDecision === "stop") {
        handleDecisionAction("stop");
        return;
      }
      setSpeechState("Say stop to end, or wait for the next question.");
      return;
    }
    if (!role.trim() || !track || !level || !currentQuestion.trim()) {
      showToast("Set role, track, level, and question before submitting.");
      return;
    }

    const finalAnswer = answerRef.current.trim();
    if (!finalAnswer) {
      showToast("Add an answer before submitting.");
      return;
    }
    if (isUnknownAnswer(finalAnswer)) {
      submitInFlightRef.current = true;
      clearAutoSubmitTimer();
      setSubmitState("Answering...");
      try {
        const response = await fetch("/api/answer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            role,
            track,
            level,
            question: currentQuestion,
            language: assistantLangRef.current,
          }),
        });
        if (!response.ok) throw new Error("Answer failed");
        const data = await response.json();
        const answerText = String(data.answer || "").trim();
        setFeedback(answerText);
        setScore(null);
        setSubmitState("Answered");
        showToast("Answer ready.");
        const isComplete = markQuestionCompleted();
        if (stopAfterSubmitRef.current) {
          stopAfterSubmitRef.current = false;
          pauseVoiceLoop({ message: "Interview stopped." });
          return;
        }

        if (autoVoiceInterviewRef.current && !isComplete) {
          const lang = assistantLangRef.current;
          const intro =
            lang === "en"
              ? "No worries. Here’s a solid answer:"
              : "Koi baat nahi. Yeh ek solid answer hai:";
          const decisionLine =
            lang === "en"
              ? "If you want to stop, say stop now. Otherwise I will continue with the next question."
              : "Agar aapko stop karna hai to abhi stop boliye. Warna main next question continue karungi.";
          await startStopOnlyWindow(`${intro} ${answerText} ${decisionLine}`);
        } else if (!isComplete) {
          window.setTimeout(() => {
            void generateQuestions({
              mode: "next",
              silent: true,
              autoStartVoice: false,
              autoStartInterview: false,
            });
          }, 600);
        }
      } catch {
        setSubmitState("Answer failed");
        stopAfterSubmitRef.current = false;
      } finally {
        submitInFlightRef.current = false;
      }
      return;
    }
    submitInFlightRef.current = true;
    clearAutoSubmitTimer();
    setSubmitState("Submitting...");
    try {
      let response = null;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        response = await fetch("/api/evaluate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            role,
            track,
            level,
            question: currentQuestion,
            answer: finalAnswer,
            language: assistantLangRef.current,
          }),
        });
        if (response.ok) break;
        if (response.status < 500 && response.status !== 429) break;
      }
      if (!response?.ok) {
        const detail = await response?.text?.();
        throw new Error(detail || "Submit failed");
      }
      const data = await response.json();
      const nextFeedback = data.feedback || "";
      const nextScore = typeof data.score === "number" ? data.score : null;
      setFeedback(nextFeedback);
      setScore(nextScore);
      setSubmitState("Submitted");
      showToast("Feedback received.");
      const isComplete = markQuestionCompleted();
      if (stopAfterSubmitRef.current) {
        stopAfterSubmitRef.current = false;
        pauseVoiceLoop({ message: "Interview stopped." });
        return;
      }

      if (autoVoiceInterviewRef.current && !isComplete) {
        const lang = assistantLangRef.current;
        const verdictLine =
          nextScore !== null
            ? lang === "en"
              ? `Got it. Score ${nextScore} out of 100.`
              : `Theek hai. Score ${nextScore} out of 100.`
            : lang === "en"
            ? "Got it."
            : "Theek hai.";
        const decisionLine =
          lang === "en"
            ? "If you want to stop, say stop now. Otherwise I will continue with the next question."
            : "Agar aapko stop karna hai to abhi stop boliye. Warna main next question continue karungi.";
        const spokenEval = `${verdictLine} ${nextFeedback} ${decisionLine}`;
        await startStopOnlyWindow(spokenEval);
      } else if (!isComplete) {
        window.setTimeout(() => {
          void generateQuestions({
            mode: "followup",
            answerText: finalAnswer,
            silent: true,
            autoStartVoice: false,
            autoStartInterview: false,
          });
        }, 600);
      }
    } catch (submitError) {
      setSubmitState("Submit failed");
      setError(String(submitError?.message || "Submit failed"));
      showToast("Submit failed. Please try again.");
      stopAfterSubmitRef.current = false;
    } finally {
      submitInFlightRef.current = false;
    }
  };

  const handleNoRealtimeResponse = async () => {
    if (noResponseInFlightRef.current) return;
    if (!currentQuestion.trim()) return;
    noResponseInFlightRef.current = true;
    setSubmitState("No realtime response detected");
    setScore(0);

    try {
      const response = await fetch("/api/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role,
          track,
          level,
          question: currentQuestion,
          language: assistantLangRef.current || "en",
        }),
      });
      if (!response.ok) throw new Error("Could not prepare coaching feedback");
      const data = await response.json();
      const quickFeedback = String(data.answer || "").trim();
      setFeedback(quickFeedback || "No response captured. Keep your next answer concise and structured.");
    } catch {
      setFeedback("No response captured. Try answering with a short structure: context, action, impact.");
    }

    const isComplete = markQuestionCompleted();
    if (!isComplete) {
      window.setTimeout(() => {
        void generateQuestions({
          mode: "next",
          silent: true,
          autoStartVoice: false,
          autoStartInterview: false,
        });
      }, 700);
    }
    markAnswerActivity();
    noResponseInFlightRef.current = false;
  };

  const parseNextDecision = (text) => {
    const normalized = normalizeTranscript(text)
      .toLowerCase()
      .replace(/[^a-z0-9\u0900-\u097f\s]/gi, " ");
    if (!normalized) return null;

    // Ignore common polite filler that can contain "no" but does not mean stop.
    const cleaned = normalized
      .replace(/\b(no worries|no problem|not a problem|no issue)\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    const yesRegex =
      /\b(yes|yeah|yep|ok|okay|sure|continue|next|proceed|haan|han|ha|haanji|agla|aage|chalo|continue karo|next question|yes continue)\b/;
    // Do not use bare "no" as stop signal; it causes false positives from phrases like "no worries".
    const stopRegex = /\b(stop|nope|nah|end|quit|exit|ruk|ruko|band|band karo|bas|nahi|mat|roko|stop karo)\b/;
    const yesHindiTokens = ["हाँ", "हां", "आगे", "अगला", "नेक्स्ट", "यस"];
    const stopHindiTokens = ["रुको", "रोक", "बंद", "बस", "नहीं", "स्टॉप"];

    const hasYes = yesRegex.test(cleaned) || yesHindiTokens.some((token) => cleaned.includes(token));
    const hasStop = stopRegex.test(cleaned) || stopHindiTokens.some((token) => cleaned.includes(token));
    if (hasStop) return "stop";
    if (hasYes) return "next";
    return null;
  };

  const runListenAfterSpeech = (listenAfter) => {
    if (!listenAfter) return;
    autoListenRef.current = true;
    if (listeningRef.current) {
      recognitionRef.current?.stop();
    } else {
      startDictationWithRetry();
    }
  };

  const playAudioBase64 = (audioBase64, format = "mp3") =>
    new Promise((resolve) => {
      if (!audioBase64) {
        resolve(false);
        return;
      }

      try {
        if (serverAudioRef.current) {
          serverAudioRef.current.pause();
          serverAudioRef.current = null;
        }
        const safeFormat = String(format || "mp3").trim().toLowerCase();
        const audio = new Audio(`data:audio/${safeFormat};base64,${audioBase64}`);
        serverAudioRef.current = audio;

        let settled = false;
        const done = (ok) => {
          if (settled) return;
          settled = true;
          resolve(ok);
        };

        audio.onended = () => done(true);
        audio.onerror = () => done(false);

        const playPromise = audio.play();
        if (playPromise && typeof playPromise.catch === "function") {
          playPromise.catch(() => done(false));
        }
      } catch {
        resolve(false);
      }
    });

    const humanizeSpeechText = (text, lang) => {
    const base = String(text || "").replace(/\s+/g, " ").trim();
    if (!base) return "";
    const softened = base
      .replace(/\s*[:;]\s*/g, ", ")
      .replace(/\s*\-\s*/g, " ")
      .replace(/\s*\n\s*/g, " ");
    if (lang === "hinglish" || lang === "hi") {
      return softened.replace(/\?/g, "? ").replace(/\./g, ". ");
    }
    return softened;
  };

  const speakText = (text, { listenAfter = false, toastOnUnsupported = true } = {}) => {
    if (!text) return Promise.resolve(false);

    return new Promise((resolve) => {
      (async () => {
        setTtsState("Speaking...");
        try {
          const response = await fetch("/api/voice", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              text: humanizeSpeechText(text, assistantLangRef.current),
              language: assistantLangRef.current || "en",
            }),
          });
          if (!response.ok) {
            setTtsState("Speech failed");
            if (toastOnUnsupported) showToast("Voice request failed.");
            resolve(false);
            return;
          }
          const data = await response.json();
          const played = await playAudioBase64(data.audioBase64, data.format || "mp3");
          if (!played) {
            setTtsState("Speech failed");
            if (toastOnUnsupported) showToast("Could not play voice.");
            resolve(false);
            return;
          }
          setTtsState("Done");
          runListenAfterSpeech(listenAfter);
          resolve(true);
        } catch {
          setTtsState("Speech failed");
          if (toastOnUnsupported) showToast("Voice error.");
          resolve(false);
        }
      })();
    });
  };

  const buildSpokenQuestion = (text) => {
    const lang = assistantLangRef.current;
    if (lang === "hi") {
      return `ठीक है, सवाल सुनिए: ${text}`;
    }
    return `Alright, here’s the question: ${text}`;
  };

  const speakQuestion = (text, { listenAfter } = {}) =>
    speakText(buildSpokenQuestion(text), {
      listenAfter: typeof listenAfter === "boolean" ? listenAfter : autoVoiceInterviewRef.current,
    });

  useEffect(() => {
    answerRef.current = answer;
  }, [answer]);

  useEffect(() => {
    listeningRef.current = listening;
  }, [listening]);

  useEffect(() => {
    assistantLangRef.current = assistantLang;
    if (recognitionRef.current) {
      recognitionRef.current.lang = assistantLang === "hi" || assistantLang === "hinglish" ? "hi-IN" : "en-IN";
    }
  }, [assistantLang]);

  useEffect(() => {
    onHoldRef.current = onHold;
  }, [onHold]);

  useEffect(() => {
    completedCountRef.current = questionsCompleted;
  }, [questionsCompleted]);

  useEffect(() => {
    if (questionsCompleted <= targetQuestions) return;
    setQuestionsCompleted(targetQuestions);
    completedCountRef.current = targetQuestions;
  }, [targetQuestions, questionsCompleted]);

  useEffect(() => {
    speechSupportedRef.current = speechSupported;
  }, [speechSupported]);

  useEffect(() => {
    autoVoiceInterviewRef.current = autoVoiceInterview;
  }, [autoVoiceInterview]);

  useEffect(() => {
    awaitingNextDecisionRef.current = awaitingNextDecision;
  }, [awaitingNextDecision]);

  useEffect(() => {
    if (callVideoRef.current) {
      callVideoRef.current.srcObject = stream || null;
    }
    if (lobbyVideoRef.current) {
      lobbyVideoRef.current.srcObject = stream || null;
    }
  }, [stream, isCallPage]);

  useEffect(() => {
    if (!stream) return;
    stream.getTracks().forEach((trackItem) => {
      if (trackItem.kind === "audio") trackItem.enabled = micOn;
      if (trackItem.kind === "video") trackItem.enabled = camOn;
    });
  }, [stream, micOn, camOn]);

  useEffect(() => {
    if (!interviewStarted) {
      if (recordingTimerRef.current) {
        window.clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
      return;
    }

    const startTime = Date.now();
    recordingTimerRef.current = window.setInterval(() => {
      setInterviewElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    return () => {
      if (recordingTimerRef.current) {
        window.clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
    };
  }, [interviewStarted]);

  const formatElapsed = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach((trackItem) => trackItem.stop());
      }
    };
  }, [stream]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setSpeechSupported(false);
      setSpeechState("Speech not supported");
      return undefined;
    }

    setSpeechSupported(true);
    setSpeechState("Speech ready");
    const recognition = new SpeechRecognition();
    recognition.lang =
      assistantLangRef.current === "hi" || assistantLangRef.current === "hinglish" ? "hi-IN" : "en-IN";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      let finalText = "";
      let interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const text = result[0]?.transcript || "";
        if (result.isFinal) {
          finalText += `${text} `;
        } else {
          interimText += `${text} `;
        }
      }

      const combinedText = `${finalText} ${interimText}`.trim();
      if (combinedText && !awaitingNextDecisionRef.current) {
        scheduleHoldTimer();
      }

      if (awaitingNextDecisionRef.current) {
        // Decision mode should never be blocked by hold logic.
        clearHoldTimer();
        setOnHold(false);
        pendingSubmitRef.current = false;
        if (finalText) {
          decisionBufferRef.current += `${finalText} `;
        }
        const decisionText = `${decisionBufferRef.current} ${interimText}`;
        const intent = parseNextDecision(decisionText);
        if (intent === "next") {
          pendingDecisionRef.current = "next";
          autoListenRef.current = false;
          setSpeechState("Heard yes. Loading next question...");
          handleDecisionAction("next");
          try {
            recognition.stop();
          } catch {
            // no-op
          }
          return;
        }
        if (intent === "stop") {
          pendingDecisionRef.current = "stop";
          autoListenRef.current = false;
          setSpeechState("Stopping interview...");
          handleDecisionAction("stop");
          try {
            recognition.stop();
          } catch {
            // no-op
          }
          return;
        }
        setSpeechState("Say stop to end. Otherwise next question will continue.");
        return;
      }

      if (finalText) {
        const normalizedCommand = normalizeTranscript(finalText)
          .toLowerCase()
          .replace(/[^a-z0-9\u0900-\u097f\s]/gi, " ")
          .replace(/\s+/g, " ")
          .trim();
        const isSubmitCommand = /\bsubmit\b/.test(normalizedCommand);
        const isStopCommand =
          /^(stop|stop now|end|end interview|quit|exit|ruk|ruko|band|band karo|bas|roko|stop karo)$/.test(
            normalizedCommand
          ) || /(?:^|\s)(stop interview|end interview)(?:\s|$)/.test(normalizedCommand);

        if (isStopCommand) {
          manualDictationActiveRef.current = false;
          autoListenRef.current = false;
          if (answerRef.current.trim()) {
            pendingSubmitRef.current = true;
            stopAfterSubmitRef.current = true;
            setSpeechState("Submitting and stopping...");
          } else {
            stopAfterSubmitRef.current = false;
            setSpeechState("Stopping interview...");
            handleDecisionAction("stop");
          }
          try {
            recognition.stop();
          } catch {
            // no-op
          }
          return;
        }

        if (isSubmitCommand) {
          pendingSubmitRef.current = true;
          manualDictationActiveRef.current = false;
          autoListenRef.current = false;
          setSpeechState("Submitting...");
          recognition.stop();
          return;
        }
      }

      if (finalText) {
        speechBufferRef.current += finalText;
        const detectedLang = detectLanguage(finalText);
        if (detectedLang && detectedLang !== assistantLangRef.current) {
          updateAssistantLanguage(detectedLang);
        }
      }
      speechInterimRef.current = interimText;

      const combined = [baseAnswerRef.current, speechBufferRef.current, speechInterimRef.current]
        .filter(Boolean)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      setAnswer(combined);
      answerRef.current = combined;
      markAnswerActivity();

    };

    recognition.onend = () => {
      clearAutoSubmitTimer();
      setListening(false);
      listeningRef.current = false;
      clearHoldTimer();

      if (pendingDecisionRef.current) {
        const action = pendingDecisionRef.current;
        handleDecisionAction(action);
        return;
      }

      if (onHoldRef.current) return;
      setSpeechState("Stopped");

      if (manualDictationStopRef.current) {
        manualDictationStopRef.current = false;
        if (pendingSubmitRef.current) {
          clearStopSubmitFallback();
          pendingSubmitRef.current = false;
          submitAnswer();
        }
        return;
      }
      if (pendingSubmitRef.current) {
        clearStopSubmitFallback();
        pendingSubmitRef.current = false;
        submitAnswer();
        return;
      }
      if (manualDictationActiveRef.current) {
        setSpeechState("Realtime listening...");
        startDictationWithRetry({ attempts: 6, delayMs: 180 });
        return;
      }
      if (autoListenRef.current) {
        autoListenRef.current = false;
        startDictationWithRetry();
      }
    };

    recognition.onerror = (event) => {
      clearAutoSubmitTimer();
      setListening(false);
      listeningRef.current = false;
      clearHoldTimer();
      setSpeechState(`Speech error: ${event.error}`);
      if (
        manualDictationActiveRef.current &&
        !manualDictationStopRef.current &&
        event.error !== "not-allowed" &&
        event.error !== "service-not-allowed"
      ) {
        startDictationWithRetry({ attempts: 6, delayMs: 250 });
      }
    };

    recognitionRef.current = recognition;

    return () => {
      recognition.onresult = null;
      recognition.onend = null;
      recognition.onerror = null;
      clearAutoSubmitTimer();
      clearStopSubmitFallback();
      clearDecisionTimer();
      clearHoldTimer();
      try {
        recognition.stop();
      } catch {
        // no-op
      }
      recognitionRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    setTtsSupported(true);
    setTtsState("Ready");
    return undefined;
  }, []);

  useEffect(() => {
    if (!currentQuestion) return;
    setQuestionTimeLeft(getRoundTimeLimit());
    const nextQuestion = currentQuestion.trim();
    if (nextQuestion) {
      const existing = recentQuestionsRef.current.filter((item) => item !== nextQuestion);
      recentQuestionsRef.current = [...existing, nextQuestion].slice(-20);
    }
    if (!autoVoiceInterviewRef.current && !interviewStarted) return;
    let cancelled = false;
    const run = async () => {
      if (!didAutoplayRef.current) {
        didAutoplayRef.current = true;
      }
      await speakQuestion(currentQuestion, { listenAfter: autoVoiceInterviewRef.current });
      if (!cancelled && isCallPage && interviewStarted) {
        armAnswerPauseTimer();
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [currentQuestion]);

  useEffect(() => {
    if (!interviewStarted || !currentQuestion) return undefined;
    if (loading || awaitingNextDecision) return undefined;
    if (submitState === "Submitting..." || submitState === "Answering..." || submitState === "Round complete") {
      return undefined;
    }

    const timerId = window.setInterval(() => {
      setQuestionTimeLeft((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => {
      window.clearInterval(timerId);
    };
  }, [interviewStarted, currentQuestion, loading, awaitingNextDecision, submitState]);

  useEffect(() => {
    if (!isCallPage || !interviewStarted || !currentQuestion) return undefined;
    if (!answerPauseArmed) return undefined;
    if (loading || submitInFlightRef.current || noResponseInFlightRef.current) return undefined;
    if (submitState === "Round complete") return undefined;

    const timerId = window.setInterval(() => {
      const secondsIdle = Math.floor((Date.now() - lastAnswerActivityRef.current) / 1000);
      const left = Math.max(0, ANSWER_PAUSE_LIMIT_SECONDS - secondsIdle);
      setAnswerPauseLeft(left);
      if (left === 0) {
        window.clearInterval(timerId);
        if (listeningRef.current && recognitionRef.current) {
          pendingSubmitRef.current = true;
          autoListenRef.current = false;
          setSpeechState("Submitting...");
          try {
            recognitionRef.current.stop();
          } catch {
            // no-op
          }
          return;
        }
        if (answerRef.current.trim()) {
          void submitAnswer();
        } else {
          void handleNoRealtimeResponse();
        }
      }
    }, 1000);

    return () => {
      window.clearInterval(timerId);
    };
  }, [isCallPage, interviewStarted, currentQuestion, answerPauseArmed, loading, submitState]);

  useEffect(() => {
    if (!interviewStarted || !currentQuestion) return;
    if (questionTimeLeft > 0) return;
    if (submitInFlightRef.current) return;
    if (submitState === "Submitting..." || submitState === "Answering..." || submitState === "Round complete") {
      return;
    }

    if (answerRef.current.trim()) {
      showToast("Time is up. Submitting your answer.");
      void submitAnswer();
      return;
    }

    setSubmitState("Time up - skipped");
    setFeedback("No answer captured for this question.");
    setScore(0);
    const isComplete = markQuestionCompleted();
    if (!isComplete) {
      window.setTimeout(() => {
        void generateQuestions({
          mode: "next",
          silent: true,
          autoStartVoice: false,
          autoStartInterview: false,
        });
      }, 600);
    }
  }, [questionTimeLeft, interviewStarted, currentQuestion, submitState]);

  useEffect(() => {
    return () => {
      stopSarvamDictation();
      if (serverAudioRef.current) {
        serverAudioRef.current.pause();
        serverAudioRef.current = null;
      }
    };
  }, []);

  const progressWidth = useMemo(() => {
    if (recording) return "65%";
    if (uploadState.startsWith("Saved")) return "100%";
    return "35%";
  }, [recording, uploadState]);

  const roundProgress = useMemo(() => {
    const denominator = Math.max(1, Number(targetQuestions) || 1);
    return Math.min(100, Math.round((questionsCompleted / denominator) * 100));
  }, [questionsCompleted, targetQuestions]);

  const voiceMode = useMemo(() => {
    if (listening) return "user-talking";
    if (ttsState === "Speaking...") return "llm-talking";
    if (loading || submitState === "Submitting..." || submitState === "Generating next question...") {
      return "llm-thinking";
    }
    return "idle";
  }, [listening, ttsState, loading, submitState]);

  const userVoiceMode = useMemo(() => {
    if (listening || sarvamRecording) return "user-talking";
    return "idle";
  }, [listening, sarvamRecording]);
  const hasActiveVideo = Boolean(camOn && stream && stream.getVideoTracks().some((trackItem) => trackItem.enabled));

  if (isCallPage) {
    return (
      <div className="page">
        <div className="grain" />
        <header className="nav">
          <div className="brand">
            <span className="logo">IA</span>
            <div>
              <div className="name">Interview Atlas</div>
              <div className="tag">Live interview call</div>
            </div>
          </div>
          <div className="call-header-actions">
            <button
              className="btn ghost"
              onClick={() => generateQuestions({ mode: "next", autoStartInterview: false })}
            >
              Next question
            </button>
            <button className="btn ghost" onClick={pauseVoiceLoop}>
              Pause voice
            </button>
            <button className="btn primary" onClick={endCallMode}>
              Leave call
            </button>
          </div>
        </header>

        <main className="call-main">
          <section className="call-stage">
            <article className="call-screen interviewer-screen">
              <div className="screen-top">
                <span className="pill">{interviewerName}</span>
                <span className={`timer-chip ${questionTimeLeft <= 15 ? "danger" : ""}`}>
                  {formatCountdown(questionTimeLeft)}
                </span>
              </div>
              <div className="interviewer-avatar">{interviewerName.split(" ")[0]?.slice(0, 1) || "I"}</div>
              <div className="meta">Interviewer | Adaptive</div>
              <div className={`voice-wave ${voiceMode}`}>
                <div className="wave-glow wave-glow-a" />
                <div className="wave-glow wave-glow-b" />
                <div className="wave-core" />
              </div>
            </article>

            <article className="call-screen user-screen">
              {hasActiveVideo ? (
                <video ref={callVideoRef} autoPlay playsInline muted className={`video ${camOn ? "is-on" : ""}`} />
              ) : (
                <div className="interviewer-avatar">U</div>
              )}
              <div className="user-voice-overlay">
                <div className={`voice-wave user-voice-wave ${userVoiceMode}`}>
                  <div className="wave-glow wave-glow-a" />
                  <div className="wave-glow wave-glow-b" />
                  <div className="wave-core" />
                </div>
              </div>
              <div className="camera-label">
                <span className="live-dot" />
                You | {role || "Candidate"}
              </div>
            </article>

            <article className="call-screen question-screen">
              <div className="screen-top">
                <span className="pill">Question Panel</span>
                <span className="meta">
                  {questionsCompleted + 1} / {targetQuestions}
                </span>
              </div>
              <div className="question-card">{currentQuestion || "Generating first question..."}</div>
              <div className="meta">
                Click "Next question" for a fresh prompt. If you pause too long, AI gives quick feedback and moves on.
              </div>
            </article>
          </section>

          <aside className="call-sidebar">
            <div className="interview-grid">
              <div className="interview-kv">
                <span className="meta">Role</span>
                <strong>{role}</strong>
              </div>
              <div className="interview-kv">
                <span className="meta">Track</span>
                <strong>{track}</strong>
              </div>
              <div className="interview-kv">
                <span className="meta">Level</span>
                <strong>{level}</strong>
              </div>
              <div className="interview-kv">
                <span className="meta">Progress</span>
                <strong>
                  {questionsCompleted}/{targetQuestions}
                </strong>
              </div>
            </div>
            <div className="progress interview-progress">
              <span style={{ width: `${roundProgress}%` }} />
            </div>

            <label className="field">
              Your answer
              <textarea
                rows="7"
                value={answer}
                onChange={(e) => {
                  const nextValue = e.target.value;
                  setAnswer(nextValue);
                  markAnswerActivity();
                }}
                placeholder="Speak or type your answer as if you're in a live interview..."
              />
            </label>
            <div className="meta">
              Realtime pause timer: {formatCountdown(answerPauseLeft)} (auto-feedback + next question on timeout)
            </div>
            <div className="speech-controls">
              <button className={`btn ${micOn ? "primary" : "ghost"}`} onClick={() => toggleTrack("audio")}>
                {micOn ? "Mic on" : "Mic off"}
              </button>
              <button className={`btn ${camOn ? "primary" : "ghost"}`} onClick={() => toggleTrack("video")}>
                {camOn ? "Camera on" : "Camera off"}
              </button>
              <button
                className={`btn ${listening ? "primary" : "ghost"}`}
                type="button"
                onClick={toggleDictation}
                disabled={!speechSupported}
              >
                {listening ? "Stop dictation" : "Start dictation"}
              </button>
              <button
                className={`btn ${sarvamRecording ? "primary" : "ghost"}`}
                type="button"
                onClick={toggleSarvamDictation}
                disabled={sarvamBusy}
              >
                {sarvamRecording ? "Stop Sarvam STT" : sarvamBusy ? "Transcribing..." : "Record Sarvam STT"}
              </button>
              <button className="btn primary" onClick={submitAnswerWithSpeech}>
                Submit answer
              </button>
            </div>
            <div className="meta">{submitState}</div>
            {score !== null ? (
              <div className="score-card">
                <strong>Score: {score}/100</strong>
                <p>{feedback}</p>
              </div>
            ) : null}
          </aside>
        </main>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="grain" />
      <header className="nav">
        <div className="brand">
          <span className="logo">IA</span>
          <div>
            <div className="name">Interview Atlas</div>
            <div className="tag">AI interview studio</div>
          </div>
        </div>
        <nav className="links">
          <a href="#how">How it works</a>
          <a href="#types">Interview types</a>
          <a href="#studio">Studio</a>
          <a href="#pricing">Pricing</a>
        </nav>
        <button className="btn ghost" onClick={() => showToast("Demo request saved.")}>
          Book a demo
        </button>
      </header>

      <main>
        <section className="hero">
          <div className="hero-copy">
            <div className="pill">Now with real-time rubric scoring</div>
            <h1>Practice AI interviews like the real thing, without the stress.</h1>
            <p>
              Interview Atlas simulates modern AI interviews with adaptive question tracks, instant feedback,
              and a built-in coach that helps you sharpen answers fast.
            </p>
            <div className="hero-actions">
              <button
                className="btn ghost"
                onClick={() => pauseVoiceLoop()}
                disabled={!autoVoiceInterview && !awaitingNextDecision}
              >
                Pause voice loop
              </button>
              <button className="btn ghost" onClick={startInterview}>
                Start a mock interview
              </button>
            </div>
            <div className="hero-stats">
              <div>
                <div className="stat">92%</div>
                <div className="label">report better confidence</div>
              </div>
              <div>
                <div className="stat">14m</div>
                <div className="label">average prep session</div>
              </div>
              <div>
                <div className="stat">4.9</div>
                <div className="label">coach rating</div>
              </div>
            </div>
            {error ? <div className="error">{error}</div> : null}
          </div>
          <div className="hero-card">
            <div className="card-top">
              <div className="chip live">Live</div>
              <div className="chip">{track}</div>
              <div className="chip">{level} level</div>
            </div>
            <div className="card-body">
              <h3>Session preview</h3>
              <p className="meta">
                Configure role, level, and track, then join the live interview call. Questions appear only inside
                the call room.
              </p>
            </div>
            <div className="card-footer">
              <div className="progress">
                <span style={{ width: progressWidth }} />
              </div>
              <div className="footer-row">
                <span>Score: 78</span>
                <span>{uploadState}</span>
              </div>
            </div>
          </div>
          <div className="orb orb-a" />
          <div className="orb orb-b" />
        </section>

        <section id="studio" className="section split">
          <div className="split-copy">
            <h2>Live interview studio</h2>
            <p>
              Record a full mock interview session with video and audio. Toggle your mic and camera, then
              upload the take for review.
            </p>
            <div className="session-panel">
              <div className="session-header">
                <div>
                  <div className="session-title">Session status</div>
                  <div className="meta">Live interview recording and response flow</div>
                </div>
                <div className={`session-chip ${recording ? "live" : ""}`}>
                  {recording ? "Recording" : "Idle"}
                </div>
              </div>
              <div className="session-stats">
                <div>
                  <div className="stat">{formatElapsed(interviewElapsed)}</div>
                  <div className="label">Elapsed</div>
                </div>
                <div>
                  <div className="stat">{micOn ? "On" : "Off"}</div>
                  <div className="label">Mic</div>
                </div>
                <div>
                  <div className="stat">{camOn ? "On" : "Off"}</div>
                  <div className="label">Camera</div>
                </div>
                <div>
                  <div className="stat">{uploadState}</div>
                  <div className="label">Upload</div>
                </div>
              </div>
            </div>
            <div className="studio-controls">
              <label className="field">
                Role
                <input
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  placeholder="e.g. AI Engineer"
                />
              </label>
              <label className="field">
                Track
                <select value={track} onChange={(e) => setTrack(e.target.value)}>
                  <option value="">Select track</option>
                  {tracks.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                Level
                <select value={level} onChange={(e) => setLevel(e.target.value)}>
                  <option value="">Select level</option>
                  {levels.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                Language
                <select
                  value={assistantLang}
                  onChange={(e) => updateAssistantLanguage(e.target.value)}
                >
                  <option value="">Select language</option>
                  <option value="en">English</option>
                  <option value="hi">Hindi</option>
                  <option value="hinglish">Hinglish</option>
                </select>
              </label>
            </div>
            <div className="recorder-actions">
              <button className={`btn ${micOn ? "primary" : "ghost"}`} onClick={() => toggleTrack("audio")}>
                {micOn ? "Mic on" : "Mic off"}
              </button>
              <button className={`btn ${camOn ? "primary" : "ghost"}`} onClick={() => toggleTrack("video")}>
                {camOn ? "Camera on" : "Camera off"}
              </button>
              <button className="btn ghost" onClick={recording ? stopRecording : startRecording}>
                {recording ? "Stop recording" : "Start recording"}
              </button>
              <button className="btn primary" onClick={startCallMode} disabled={loading}>
                {loading ? "Generating..." : "Generate question & Join call"}
              </button>
            </div>
            <div className="meta">{uploadState}</div>
            <div className="answer-box">
              <div className="interview-brief">
                <div className="interview-brief-top">
                  <strong>Ready To Join</strong>
                </div>
                <div className="interview-grid">
                  <div className="interview-kv">
                    <span className="meta">Role</span>
                    <strong>{role || "Not set"}</strong>
                  </div>
                  <div className="interview-kv">
                    <span className="meta">Track</span>
                    <strong>{track || "Not set"}</strong>
                  </div>
                  <div className="interview-kv">
                    <span className="meta">Level</span>
                    <strong>{level || "Not set"}</strong>
                  </div>
                </div>
                <div className="meta">
                  Click "Generate question & Join call" to start a live interview room with interviewer, user, and
                  question panels.
                </div>
              </div>
            </div>
          </div>
          <div className="preview-grid">
            <div className="camera-preview">
              <video
                ref={lobbyVideoRef}
                autoPlay
                playsInline
                muted
                className={`video ${camOn ? "is-on" : ""}`}
              />
              <div className="camera-label">
                <span className="live-dot" />
                Live panel camera
              </div>
              <div className="camera-status">
                {loading
                  ? "Interviewer is preparing next prompt..."
                  : listening
                  ? "Interviewer is listening"
                  : "Interviewer is reviewing your answer"}
              </div>
            </div>
            <div className="voice-preview">
              <div className={`voice-call-ui ${voiceMode}`}>
                <div className="voice-ambient" />
                <div className="voice-diffused" />
                <div className="voice-concentrated" />
                <div className={`voice-wave ${voiceMode}`}>
                  <div className="wave-glow wave-glow-a" />
                  <div className="wave-glow wave-glow-b" />
                  <div className="wave-core" />
                </div>
                <div className="voice-bottom-row">
                  <div className="voice-actions">
                    <button
                      type="button"
                      className="call-btn play"
                      onClick={toggleDictation}
                      disabled={!speechSupported}
                    >
                      {listening ? "Pause" : "Play"}
                    </button>
                    {onHold ? (
                      <button
                        type="button"
                        className="call-btn continue"
                        onClick={resumeFromHold}
                        disabled={!speechSupported}
                      >
                        Continue
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="call-btn end"
                      onClick={() => {
                        pauseVoiceLoop({ message: "Voice interview ended." });
                        if (recording) {
                          stopRecording();
                        }
                      }}
                    >
                      End
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="how" className="section">
          <div className="section-title">
            <h2>How it works</h2>
            <p>Structured, realistic, and measurable. Every session ends with a plan.</p>
          </div>
          <div className="steps">
            <div className="step">
              <div className="step-num">01</div>
              <h3>Pick your track</h3>
              <p>Choose role, level, and company style. The AI adapts the bar.</p>
            </div>
            <div className="step">
              <div className="step-num">02</div>
              <h3>Live interview</h3>
              <p>Timed prompts, follow-ups, and curveballs — just like a panel.</p>
            </div>
            <div className="step">
              <div className="step-num">03</div>
              <h3>Feedback + drills</h3>
              <p>Get rubric scoring, highlight gaps, and receive targeted drills.</p>
            </div>
          </div>
        </section>

        <section id="types" className="section">
          <div className="section-title">
            <h2>Interview types</h2>
            <p>Pick a format that matches the job you want next.</p>
          </div>
          <div className="grid">
            <article className="panel">
              <h3>AI System Design</h3>
              <p>Architect LLM stacks, retrieval pipelines, and safety layers.</p>
              <span className="meta">75 questions</span>
            </article>
            <article className="panel">
              <h3>ML Fundamentals</h3>
              <p>Probability, optimization, model diagnostics, and tradeoffs.</p>
              <span className="meta">120 questions</span>
            </article>
            <article className="panel">
              <h3>Product Sense</h3>
              <p>Translate AI capabilities into measurable product wins.</p>
              <span className="meta">60 questions</span>
            </article>
            <article className="panel">
              <h3>Behavioral</h3>
              <p>Storytelling, impact framing, conflict resolution.</p>
              <span className="meta">90 questions</span>
            </article>
          </div>
        </section>

        <section id="pricing" className="section pricing">
          <div className="section-title">
            <h2>Simple pricing</h2>
            <p>Start free, upgrade when you want guided coaching.</p>
          </div>
          <div className="grid">
            <article className="panel price">
              <h3>Starter</h3>
              <div className="price-tag">$0</div>
              <p>3 sessions a week, core feedback, and scorecards.</p>
              <button className="btn ghost">Get started</button>
            </article>
            <article className="panel price highlight">
              <h3>Pro</h3>
              <div className="price-tag">$39</div>
              <p>Unlimited sessions, custom rubrics, and priority coaching.</p>
              <button className="btn primary">Go Pro</button>
            </article>
            <article className="panel price">
              <h3>Teams</h3>
              <div className="price-tag">$149</div>
              <p>Hiring loops, interview calibration, and analytics dashboards.</p>
              <button className="btn ghost">Talk to sales</button>
            </article>
          </div>
        </section>

        <section className="cta">
          <div>
            <h2>Ready to feel interview-ready?</h2>
            <p>Spin up a mock interview in under a minute.</p>
          </div>
          <button className="btn primary" onClick={() => showToast("Welcome to Interview Atlas.")}>
            Start free
          </button>
        </section>
      </main>

      <footer className="footer">
        <div>
          <strong>Interview Atlas</strong>
          <div className="meta">Practice interviews with clarity.</div>
        </div>
        <div className="meta">© 2026 Interview Atlas</div>
      </footer>

      {toast ? <div className="toast show">{toast}</div> : null}
    </div>
  );
}









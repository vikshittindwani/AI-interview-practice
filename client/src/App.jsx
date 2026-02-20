import { useEffect, useMemo, useRef, useState } from "react";

const tracks = ["System Design", "ML Fundamentals", "Behavioral", "Product Sense"];
const levels = ["Entry", "Mid", "Senior", "Staff"];

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

  const [stream, setStream] = useState(null);
  const [recording, setRecording] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [uploadState, setUploadState] = useState("Idle");
  const [interviewStarted, setInterviewStarted] = useState(false);
  const [interviewElapsed, setInterviewElapsed] = useState(0);
  const recordingTimerRef = useRef(null);

  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const videoRef = useRef(null);
  const recognitionRef = useRef(null);
  const speechBufferRef = useRef("");
  const speechInterimRef = useRef("");
  const baseAnswerRef = useRef("");
  const answerRef = useRef("");
  const didAutoplayRef = useRef(false);
  const pendingSubmitRef = useRef(false);
  const autoVoiceInterviewRef = useRef(false);
  const manualDictationStopRef = useRef(false);
  const awaitingNextDecisionRef = useRef(false);
  const pendingDecisionRef = useRef(null);
  const decisionBufferRef = useRef("");
  const decisionTimeoutRef = useRef(null);
  const autoSubmitTimerRef = useRef(null);
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
  const autoListenRef = useRef(false);
  const speechSupportedRef = useRef(false);
  const listeningRef = useRef(false);
  const assistantLangRef = useRef("");
  const onHoldRef = useRef(false);
  const holdTimerRef = useRef(null);

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
    } else {
      showToast("Language set to English.");
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
    if (!fromRecording) {
      setUploadState("Interview started");
    }
    showToast("Mock interview started.");
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
    autoListenRef.current = false;
    setSubmitState("Paused");
    setSpeechState("Paused");
    try {
      recognitionRef.current?.stop();
    } catch {
      // no-op
    }
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
      void generateQuestions({ silent: true });
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

  const ensureStream = async () => {
    if (stream) return stream;
    const newStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: true,
    });
    newStream.getTracks().forEach((trackItem) => {
      if (trackItem.kind === "audio") trackItem.enabled = micOn;
      if (trackItem.kind === "video") trackItem.enabled = camOn;
    });
    setStream(newStream);
    return newStream;
  };

  const toggleTrack = async (kind) => {
    const active = kind === "audio" ? micOn : camOn;
    const next = !active;

    const current = stream || (await ensureStream());
    current.getTracks().forEach((trackItem) => {
      if (trackItem.kind === kind) {
        trackItem.enabled = next;
      }
    });

    if (kind === "audio") setMicOn(next);
    if (kind === "video") setCamOn(next);
  };

  const startRecording = async () => {
    setError("");
    const current = await ensureStream();
    if (videoRef.current) {
      videoRef.current.srcObject = current;
    }

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

  const submitAnswerWithSpeech = async () => {
    if (listening && recognitionRef.current) {
      pendingSubmitRef.current = true;
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
      manualDictationStopRef.current = false;
      baseAnswerRef.current = answer;
      speechBufferRef.current = "";
      speechInterimRef.current = "";
      try {
        recognition.start();
        setListening(true);
        listeningRef.current = true;
        setSpeechState("Listening...");
      } catch {
        setSpeechState("Could not start speech recognition.");
        setListening(false);
        listeningRef.current = false;
      }
      return;
    }

    manualDictationStopRef.current = true;
    autoListenRef.current = false;
    recognition.stop();
    setListening(false);
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

  const generateQuestions = async ({ silent = false, autoStartVoice = true, autoStartInterview = true } = {}) => {
    if (!role.trim() || !track || !level) {
      if (!silent) showToast("Set role, track, and level first.");
      return;
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
    setLoading(true);
    setError("");
    let timeoutId = null;
    try {
      const controller = new AbortController();
      timeoutId = window.setTimeout(() => controller.abort(), 30000);
      const response = await fetch("https://ai-interview-practice-j164.onrender.com/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          role,
          track,
          level,
          language,
          sessionId: getOrCreateSessionId(),
          recentQuestions: recentQuestionsRef.current.slice(-8),
          count: 1,
          nonce: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        }),
      });
      if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail || "Failed to generate");
      }
      const data = await response.json();
      if (data.questions?.length) {
        setQuestions(data.questions);
        setCurrentQuestion(data.questions[0]);
        clearAnswerDraft();
        setFeedback("");
        setScore(null);
        setSubmitState("Idle");
        if (!silent) {
          showToast("Question set refreshed.");
        }
      } else {
        throw new Error("No questions returned");
      }
    } catch (genError) {
      const timedOut = genError?.name === "AbortError";
      setError(
        timedOut
          ? "Next question timed out. Please retry."
          : "Could not generate questions. Check backend or API key."
      );
      setSubmitState("Next question failed");
    } finally {
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
      setLoading(false);
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

        if (autoVoiceInterviewRef.current) {
          const lang = assistantLangRef.current;
          const intro =
            lang === "en"
              ? "No worries. Here’s a solid answer:"
              : "Koi baat nahi. Yeh ek solid answer hai:";
          const decisionLine =
            lang === "en"
              ? "If you want to stop, say stop now. Otherwise I will continue with the next question."
              : "Agar aapko stop karna hai to abhi stop boliye. Warna main next question continue karunga.";
          await startStopOnlyWindow(`${intro} ${answerText} ${decisionLine}`);
        }
      } catch {
        setSubmitState("Answer failed");
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

      if (autoVoiceInterviewRef.current) {
        const isCorrect = nextScore !== null ? nextScore >= 70 : false;
        const verdict = isCorrect ? "correct" : "incorrect";
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
            : "Agar aapko stop karna hai to abhi stop boliye. Warna main next question continue karunga.";
        const spokenEval = `${verdictLine} ${nextFeedback} ${decisionLine}`;
        await startStopOnlyWindow(spokenEval);
      }
    } catch (submitError) {
      setSubmitState("Submit failed");
      setError(String(submitError?.message || "Submit failed"));
      showToast("Submit failed. Please try again.");
    } finally {
      submitInFlightRef.current = false;
    }
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
    if (hasYes && !hasStop) return "next";
    if (hasStop && !hasYes) return "stop";
    if (hasYes && hasStop) return "next";
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
    speechSupportedRef.current = speechSupported;
  }, [speechSupported]);

  useEffect(() => {
    autoVoiceInterviewRef.current = autoVoiceInterview;
  }, [autoVoiceInterview]);

  useEffect(() => {
    awaitingNextDecisionRef.current = awaitingNextDecision;
  }, [awaitingNextDecision]);

  useEffect(() => {
    let cancelled = false;

    const startPreview = async () => {
      try {
        const current = await ensureStream();
        if (!cancelled && videoRef.current) {
          videoRef.current.srcObject = current;
        }
      } catch {
        if (!cancelled) {
          showToast("Allow camera access to enable preview.");
        }
      }
    };

    startPreview();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (stream && videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

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
        speechBufferRef.current += finalText;
      }
      speechInterimRef.current = interimText;

      const combined = [baseAnswerRef.current, speechBufferRef.current, speechInterimRef.current]
        .filter(Boolean)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      setAnswer(combined);
      answerRef.current = combined;

      if (finalText && /\bsubmit\b/i.test(finalText)) {
        pendingSubmitRef.current = true;
        autoListenRef.current = false;
        setSpeechState("Submitting...");
        recognition.stop();
      }
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
        return;
      }
      if (pendingSubmitRef.current) {
        pendingSubmitRef.current = false;
        submitAnswer();
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
    };

    recognitionRef.current = recognition;

    return () => {
      recognition.onresult = null;
      recognition.onend = null;
      recognition.onerror = null;
      clearAutoSubmitTimer();
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
    const nextQuestion = currentQuestion.trim();
    if (nextQuestion) {
      const existing = recentQuestionsRef.current.filter((item) => item !== nextQuestion);
      recentQuestionsRef.current = [...existing, nextQuestion].slice(-20);
    }
    if (!autoVoiceInterviewRef.current && !interviewStarted) return;
    if (!didAutoplayRef.current) {
      didAutoplayRef.current = true;
      speakQuestion(currentQuestion, { listenAfter: autoVoiceInterviewRef.current });
      return;
    }
    speakQuestion(currentQuestion, { listenAfter: autoVoiceInterviewRef.current });
  }, [currentQuestion]);

  useEffect(() => {
    return () => {
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

  const voiceMode = useMemo(() => {
    if (listening) return "user-talking";
    if (ttsState === "Speaking...") return "llm-talking";
    if (loading || submitState === "Submitting..." || submitState === "Generating next question...") {
      return "llm-thinking";
    }
    return "idle";
  }, [listening, ttsState, loading, submitState]);

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
              <ol className="questions">
                {questions.map((q, idx) => (
                  <li key={`${q}-${idx}`}>{q}</li>
                ))}
              </ol>
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
            </div>
            <div className="meta">{uploadState}</div>
            <div className="answer-box">
              <label className="field">
                <div className="question-header">
                  <span>Current question</span>
                  <button className="btn ghost" type="button" onClick={generateQuestions} disabled={loading}>
                    {loading ? "Generating..." : "Generate questions"}
                  </button>
                </div>
                <div className="question-card">{currentQuestion}</div>
              </label>
              <div className="speech-controls">
                <button
                  className="btn ghost"
                  type="button"
                  onClick={() => {
                    if (!autoVoiceInterviewRef.current) {
                      autoVoiceInterviewRef.current = true;
                      setAutoVoiceInterview(true);
                    }
                    speakQuestion(currentQuestion, { listenAfter: true });
                  }}
                  disabled={!ttsSupported}
                >
                  Speak question
                </button>
                <div className="meta">{ttsSupported ? ttsState || "TTS ready" : "TTS not supported"}</div>
              </div>
              <label className="field">
                Your answer
                <textarea
                  rows="5"
                  value={answer}
                  onChange={(e) => {
                    const nextValue = e.target.value;
                    setAnswer(nextValue);
                  }}
                  placeholder="Write your response to the current question..."
                />
              </label>
              <div className="speech-controls">
                <button
                  className={`btn ${listening ? "primary" : "ghost"}`}
                  type="button"
                  onClick={toggleDictation}
                  disabled={!speechSupported}
                >
                  {listening ? "Stop dictation" : "Start dictation"}
                </button>
                <div className="meta">
                  {speechSupported ? speechState || "Speech ready" : "Speech not supported"}
                </div>
              </div>
              <div className="meta">
                After feedback, say stop to end. Otherwise the next question will start automatically.
              </div>
              <button className="btn primary" onClick={submitAnswerWithSpeech}>
                Submit answer
              </button>
              <div className="meta">{submitState}</div>
              {score !== null ? (
                <div className="score-card">
                  <strong>Score: {score}/100</strong>
                  <p>{feedback}</p>
                </div>
              ) : null}
            </div>
          </div>
          <div className="preview-grid">
            <div className="camera-preview">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className={`video ${camOn ? "is-on" : ""}`}
              />
              <div className="camera-label">
                <span className="live-dot" />
                Live preview
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









import express from "express";
import cors from "cors";
import multer from "multer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 5050;
const uploadsDir = path.join(__dirname, "uploads");
const clientDistDir = path.resolve(__dirname, "..", "client", "dist");
const dataDir = path.join(__dirname, "data");
const sessionMemoryPath = path.join(dataDir, "session-memory.json");

const sessionStore = new Map();
const SESSION_LIMIT = Number(process.env.SESSION_MEMORY_LIMIT || 100);
const SESSION_QUESTION_LIMIT = Number(process.env.SESSION_QUESTION_LIMIT || 40);
const SIMILARITY_THRESHOLD = Number(process.env.QUESTION_SIMILARITY_THRESHOLD || 0.58);
const GROQ_TIMEOUT_MS = Number(process.env.GROQ_TIMEOUT_MS || 25000);
const GROQ_RETRY_LIMIT = Number(process.env.GROQ_RETRY_LIMIT || 5);

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

function normalizeQuestionText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractQuestionCandidate(text) {
  const raw = String(text || "").replace(/\r/g, "\n").trim();
  if (!raw) return "";
  const strippedLines = raw
    .split("\n")
    .map((line) => line.replace(/^\s*[-*>\d.()]+\s*/, "").trim())
    .filter(Boolean);
  const compact = strippedLines.join(" ").replace(/\s+/g, " ").trim();
  if (!compact) return "";

  const feedbackHint = /\b(good|great|nice|score|feedback|overall|your answer|improve|better|correct)\b/i;
  const questionLead = /\b(how|what|why|when|where|which|who|can|could|would|will|do|does|did|is|are|should)\b/i;

  const questionParts = compact.match(/[^?]*\?/g) || [];
  if (questionParts.length) {
    const scored = questionParts
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => ({
        part,
        score: (questionLead.test(part) ? 2 : 0) + (feedbackHint.test(part) ? -1 : 0),
      }))
      .sort((a, b) => b.score - a.score);
    const best = scored[0]?.part || questionParts[questionParts.length - 1].trim();
    return best.replace(/^["'`]+|["'`]+$/g, "").trim();
  }

  const picked = strippedLines.find((line) => questionLead.test(line)) || strippedLines[strippedLines.length - 1] || compact;
  return picked.replace(/^["'`]+|["'`]+$/g, "").trim();
}

function getLeadPhrase(text, size = 4) {
  const leadStopWords = new Set([
    "can",
    "could",
    "would",
    "will",
    "you",
    "please",
    "tell",
    "me",
    "about",
    "how",
    "what",
    "why",
    "when",
    "where",
    "which",
    "do",
    "does",
    "did",
    "your",
    "a",
    "an",
    "the",
  ]);
  const tokens = normalizeQuestionText(text)
    .split(" ")
    .filter(Boolean)
    .filter((token) => !leadStopWords.has(token));
  return tokens.slice(0, size).join(" ");
}

function ensureInterviewState(sessionMemory, { role, track, level }) {
  if (!sessionMemory.interview || typeof sessionMemory.interview !== "object") {
    sessionMemory.interview = {};
  }
  sessionMemory.interview = {
    role: String(role || sessionMemory.interview.role || "").trim(),
    track: String(track || sessionMemory.interview.track || "").trim(),
    level: String(level || sessionMemory.interview.level || "").trim(),
    askedQuestions: Array.isArray(sessionMemory.interview.askedQuestions)
      ? sessionMemory.interview.askedQuestions.slice(-SESSION_QUESTION_LIMIT)
      : [],
    lastQuestion: String(sessionMemory.interview.lastQuestion || "").trim(),
    lastCandidateAnswer: String(sessionMemory.interview.lastCandidateAnswer || "").trim(),
  };
  sessionMemory.updatedAt = Date.now();
  return sessionMemory.interview;
}

function recordAskedQuestion(sessionMemory, question) {
  const interview = sessionMemory.interview;
  if (!interview || !question) return;
  const clean = String(question || "").trim();
  if (!clean) return;
  const existing = Array.isArray(interview.askedQuestions) ? interview.askedQuestions : [];
  interview.askedQuestions = [...existing, clean].slice(-SESSION_QUESTION_LIMIT);
  interview.lastQuestion = clean;
  sessionMemory.updatedAt = Date.now();
}

function buildInterviewerSystemPrompt({ level, language = "en" }) {
  const style = "Be natural, professional, and balanced.";
  const langHint = buildLanguageGuidance(language);
  const interviewTypeLine = "You are an interviewer in a live interview tailored to the selected role, track, and level.";
  return `${interviewTypeLine} ${style} Keep realism high.
${buildLevelGuidance(level)}
Ask only one clear question at a time. Do not include feedback, evaluation, or commentary.
Avoid repetitive openers and repeated themes. ${langHint}`;
}

function buildNextQuestionPrompt({
  role,
  track,
  level,
  language = "en",
  avoidList = [],
  nonce = Date.now(),
}) {
  return `Generate one new interview question.
Role: ${role}
Track: ${track}
Level: ${level}
Track guidance: ${buildTrackGuidance(track)}
Level guidance: ${buildLevelGuidance(level)}
Language rule: ${buildLanguageGuidance(language)}
Choose the most appropriate category and topic naturally based on this interview context.
Avoid repeating any of these prior questions:
${avoidList.length ? avoidList.map((item, idx) => `${idx + 1}. ${item}`).join("\n") : "None"}
Use a different opener style from prior questions. Keep it under 35 words.
Nonce: ${nonce}
Return one standalone question only. No preface, no transition line, no feedback text.`;
}

function buildFollowUpPrompt({ role, track, level, question, answer, language = "en", nonce = Date.now() }) {
  const answerText = String(answer || "").trim();
  return `Generate one natural follow-up interviewer question.
Role: ${role}
Track: ${track}
Level: ${level}
Track guidance: ${buildTrackGuidance(track)}
Level guidance: ${buildLevelGuidance(level)}
Previous question: ${question}
Candidate answer: ${answerText}
Ask a precise follow-up that probes depth, tradeoff, or validation based on the candidate answer.
Do not repeat the previous question. Keep under 30 words.
Language rule: ${buildLanguageGuidance(language)}
Nonce: ${nonce}
Return one standalone question only. No preface, no transition line, no feedback text.`;
}

function toTokenSet(text) {
  const normalized = normalizeQuestionText(text);
  if (!normalized) return new Set();
  const rawTokens = normalized.split(" ").filter((token) => token.length > 2);
  const stopWords = new Set([
    "what",
    "when",
    "where",
    "which",
    "would",
    "could",
    "should",
    "about",
    "with",
    "from",
    "into",
    "your",
    "have",
    "been",
    "that",
    "this",
    "there",
    "their",
    "then",
    "than",
    "interview",
    "question",
    "role",
    "track",
    "level",
    "explain",
    "tell",
    "describe",
    "design",
    "system",
  ]);
  return new Set(rawTokens.filter((token) => !stopWords.has(token)));
}

function jaccardSimilarity(a, b) {
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection += 1;
  }
  const union = a.size + b.size - intersection;
  return union ? intersection / union : 0;
}

function isTooSimilar(candidate, existingQuestions) {
  const candidateTokens = toTokenSet(candidate);
  const candidateNormalized = normalizeQuestionText(candidate);
  const candidateLead = getLeadPhrase(candidate);
  if (!candidateNormalized) return true;
  for (const existing of existingQuestions) {
    const existingNormalized = normalizeQuestionText(existing);
    if (!existingNormalized) continue;
    if (candidateNormalized === existingNormalized) return true;
    if (candidateLead && candidateLead === getLeadPhrase(existing)) return true;
    const similarity = jaccardSimilarity(candidateTokens, toTokenSet(existing));
    if (similarity >= SIMILARITY_THRESHOLD) return true;
  }
  return false;
}

function pruneSessions() {
  if (sessionStore.size <= SESSION_LIMIT) return;
  const entries = [...sessionStore.entries()].sort(
    (_a, _b) => (_a[1].updatedAt || 0) - (_b[1].updatedAt || 0)
  );
  while (entries.length && sessionStore.size > SESSION_LIMIT) {
    const [oldestId] = entries.shift();
    sessionStore.delete(oldestId);
  }
}

function getSessionMemory(sessionId) {
  const key = String(sessionId || "").trim();
  if (!key) return { questions: [] };
  const current = sessionStore.get(key) || { questions: [], updatedAt: Date.now() };
  sessionStore.set(key, current);
  return current;
}

function updateSessionMemory(sessionId, questions) {
  const key = String(sessionId || "").trim();
  if (!key || !Array.isArray(questions) || !questions.length) return;
  const current = getSessionMemory(key);
  const deduped = [...new Set([...current.questions, ...questions.map((q) => String(q || "").trim()).filter(Boolean)])];
  current.questions = deduped.slice(-SESSION_QUESTION_LIMIT);
  current.updatedAt = Date.now();
  sessionStore.set(key, current);
  pruneSessions();
}

function loadSessionMemory() {
  try {
    if (!fs.existsSync(sessionMemoryPath)) return;
    const raw = fs.readFileSync(sessionMemoryPath, "utf8");
    if (!raw.trim()) return;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return;
    for (const [sessionId, value] of Object.entries(parsed)) {
      if (!value || typeof value !== "object") continue;
      const questions = Array.isArray(value.questions)
        ? value.questions.map((q) => String(q || "").trim()).filter(Boolean).slice(-SESSION_QUESTION_LIMIT)
        : [];
      const interview = value.interview && typeof value.interview === "object" ? value.interview : null;
      sessionStore.set(sessionId, {
        questions,
        interview: interview
          ? {
              role: String(interview.role || "").trim(),
              track: String(interview.track || "").trim(),
              level: String(interview.level || "").trim(),
              askedQuestions: Array.isArray(interview.askedQuestions)
                ? interview.askedQuestions.map((q) => String(q || "").trim()).filter(Boolean).slice(-SESSION_QUESTION_LIMIT)
                : [],
              lastQuestion: String(interview.lastQuestion || "").trim(),
              lastCandidateAnswer: String(interview.lastCandidateAnswer || "").trim(),
            }
          : undefined,
        updatedAt: Number(value.updatedAt || Date.now()),
      });
    }
    pruneSessions();
  } catch {
    // no-op on malformed cache file
  }
}

let persistTimer = null;
function schedulePersistSessionMemory() {
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    try {
      const payload = {};
      for (const [sessionId, value] of sessionStore.entries()) {
        payload[sessionId] = {
          questions: value.questions || [],
          interview: value.interview || {},
          updatedAt: value.updatedAt || Date.now(),
        };
      }
      fs.writeFileSync(sessionMemoryPath, JSON.stringify(payload, null, 2), "utf8");
    } catch {
      // no-op
    }
  }, 500);
}

loadSessionMemory();

app.use(cors());
app.use(express.json({ limit: "2mb" }));

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (_req, file, cb) => {
    const timestamp = Date.now();
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, `${timestamp}-${safeName}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 200 * 1024 * 1024 },
});

const sarvamTtsUrl = process.env.SARVAM_TTS_URL || "https://api.sarvam.ai/text-to-speech/stream";
const sarvamSttUrl =
  process.env.SARVAM_STT_URL || "https://api.sarvam.ai/speech-to-text";

async function fetchWithTimeout(url, options = {}, timeoutMs = GROQ_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfterMs(retryAfterHeader, fallbackMs = 1200) {
  const value = String(retryAfterHeader || "").trim();
  if (!value) return fallbackMs;
  const asNumber = Number(value);
  if (Number.isFinite(asNumber) && asNumber >= 0) {
    return Math.max(250, Math.round(asNumber * 1000));
  }
  const dateMs = Date.parse(value);
  if (Number.isFinite(dateMs)) {
    return Math.max(250, dateMs - Date.now());
  }
  return fallbackMs;
}

async function requestUniqueQuestions({
  apiKey,
  model,
  systemPrompt,
  userPrompt,
  count = 1,
  avoidList = [],
  temperature = 0.9,
}) {
  let accepted = [];
  let generatedPool = [];
  let attempts = 0;
  let lastDetail = "";

  while (accepted.length < count && attempts < GROQ_RETRY_LIMIT) {
    attempts += 1;
    const response = await fetchWithTimeout("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content:
              attempts === 1
                ? userPrompt
                : `${userPrompt}\nAttempt ${attempts}: use a different framing and avoid repeated wording.`,
          },
        ],
        temperature,
        max_tokens: 300,
      }),
    });

    if (!response.ok) {
      lastDetail = await response.text();
      if (response.status === 429 && attempts < GROQ_RETRY_LIMIT) {
        const retryAfterMs = parseRetryAfterMs(
          response.headers.get("retry-after"),
          700 * attempts + Math.floor(Math.random() * 300)
        );
        await sleep(retryAfterMs);
        continue;
      }
      break;
    }

    const data = await response.json();
    const text = String(data.choices?.[0]?.message?.content || "").trim();
    const generated = (() => {
      if (count === 1) {
        const single = extractQuestionCandidate(text);
        return single ? [single] : [];
      }
      return text
        .split("\n")
        .map((line) => extractQuestionCandidate(line))
        .filter(Boolean);
    })();
    generatedPool = [...generatedPool, ...generated];

    for (const question of generated) {
      if (accepted.length >= count) break;
      if (isTooSimilar(question, [...avoidList, ...accepted])) continue;
      accepted.push(question);
    }
  }

  if (accepted.length < count) {
    const normalizedAccepted = new Set(accepted.map((q) => normalizeQuestionText(q)));
    const normalizedAvoid = new Set(avoidList.map((q) => normalizeQuestionText(q)));
    for (const question of generatedPool) {
      if (accepted.length >= count) break;
      const normalized = normalizeQuestionText(question);
      if (!normalized || normalizedAccepted.has(normalized) || normalizedAvoid.has(normalized)) continue;
      accepted.push(question);
      normalizedAccepted.add(normalized);
    }
  }

  return { questions: accepted.slice(0, count), lastDetail };
}

function isRateLimited(detail) {
  return /\brate limit\b|\btoo many requests\b|\b429\b/i.test(String(detail || ""));
}


function buildLevelGuidance(level) {
  const normalized = String(level || "").trim().toLowerCase();
  if (normalized === "entry") {
    return "Entry only: fundamentals, basic scenarios, and clear definitions.";
  }
  if (normalized === "mid") {
    return "Mid only: practical implementation and tradeoffs.";
  }
  if (normalized === "senior") {
    return "Senior only: architecture, leadership, and decision-making.";
  }
  if (normalized === "staff") {
    return "Staff only: org impact, strategy, and complex systems.";
  }
  return `Use the selected level (${level}) strictly; do not drift to senior/staff complexity unless selected.`;
}

function buildTrackGuidance(track) {
  const normalized = String(track || "").trim().toLowerCase();
  if (normalized.includes("system design")) {
    return "Focus on architecture, scalability, tradeoffs, APIs, and infrastructure.";
  }
  if (normalized.includes("ml fundamental") || normalized.includes("machine learning")) {
    return "Focus on ML concepts, algorithms, evaluation, data, and modeling.";
  }
  if (normalized.includes("behavioral") || normalized.includes("behavioural")) {
    return "Focus on STAR method, leadership, teamwork, and conflict handling.";
  }
  if (normalized.includes("product sense") || normalized.includes("product")) {
    return "Focus on product thinking, metrics, prioritization, and UX.";
  }
  return "Use the selected track strictly and keep topics within that domain.";
}

function buildLanguageGuidance(language) {
  const normalized = String(language || "en").trim().toLowerCase();
  if (normalized === "hi" || normalized === "hindi") {
    return "Use fully Hindi.";
  }
  if (normalized === "hinglish") {
    return "Use natural spoken Hinglish (Hindi + English mix).";
  }
  return "Use fully English.";
}

function buildFallbackQuestions({ role, track, level, count = 1, language = "en", avoidList = [] }) {
  // Intentionally empty: question generation is LLM-only.
  return [];
}

function buildLocalEvaluation({ answer = "", language = "en" }) {
  const text = String(answer || "").trim();
  const words = text ? text.split(/\s+/).length : 0;
  const sentenceCount = text ? String(text).split(/[.!?]+/).filter((s) => s.trim().length > 0).length : 0;
  const hasStructure =
    /\b(first|second|finally|because|impact|result|tradeoff|therefore|approach|step)\b/i.test(text) ||
    /\b(pehle|phir|akhir|isliye|impact|result|approach|step)\b/i.test(text);
  const base = Math.min(60, words * 1.2) + Math.min(20, sentenceCount * 3) + (hasStructure ? 12 : 0);
  const score = Math.max(25, Math.min(85, Math.round(base)));
  const isHindi = String(language).toLowerCase() === "hi";
  const feedback = isHindi
    ? `Groq feedback unavailable tha, isliye local evaluation diya gaya. Aapka answer ${score}/100 ke aas-paas hai. Agle answer mein concise structure rakhiye: context, actions, impact, aur ek clear tradeoff.`
    : `Groq feedback was unavailable, so this is a local evaluation. Your answer is around ${score}/100. For the next answer, use a tight structure: context, actions, impact, and one clear tradeoff.`;

  return { score, feedback, fallback: true };
}

function buildLocalSampleAnswer({ question = "", language = "en" }) {
  const q = String(question || "this question").trim();
  const isHindi = String(language).toLowerCase() === "hi";
  if (isHindi) {
    return `Is question ka structured answer dene ke liye pehle context clear karein, phir apna approach batayein, phir measurable impact share karein, aur end mein tradeoff mention karein. Agar real example ho to 1 short STAR style example add karein. Question: ${q}`;
  }
  return `To answer this well, start with context, then explain your approach, then quantify impact, and close with one tradeoff you considered. If possible, include one short STAR-style example. Question: ${q}`;
}

function mapAssistantLanguageToSarvamCode(language) {
  const lang = String(language || "").toLowerCase();
  if (lang === "hi" || lang === "hinglish") return "hi-IN";
  return "en-IN";
}

function getSarvamSttConfig(language = "en") {
  const normalizedLanguage = String(language || "").toLowerCase();
  const model = String(process.env.SARVAM_STT_MODEL || "saaras:v3").trim();
  const mode = String(
    process.env.SARVAM_STT_MODE || (normalizedLanguage === "hinglish" ? "codemix" : "transcribe")
  )
    .trim()
    .toLowerCase();
  const languageCode = String(
    process.env.SARVAM_STT_LANGUAGE_CODE ||
      (mode === "codemix" ? "unknown" : mapAssistantLanguageToSarvamCode(normalizedLanguage))
  ).trim();
  return { model, mode, languageCode };
}

async function synthesizeSarvamSimple(text, language = "en") {
  const apiKey = process.env.SARVAM_API_KEY;
  if (!apiKey) {
    throw new Error("Missing SARVAM_API_KEY");
  }

  const outputCodec = (process.env.SARVAM_TTS_OUTPUT_AUDIO_CODEC || "mp3").toLowerCase();
  const payload = {
    text: String(text || "").trim(),
    target_language_code:
      process.env.SARVAM_TTS_TARGET_LANGUAGE_CODE || mapAssistantLanguageToSarvamCode(language),
    speaker: process.env.SARVAM_TTS_SPEAKER || "shreya",
    model: process.env.SARVAM_TTS_MODEL || "bulbul:v3",
    pace: Number(process.env.SARVAM_TTS_PACE || 1.1),
    speech_sample_rate: Number(process.env.SARVAM_TTS_SPEECH_SAMPLE_RATE || 22050),
    output_audio_codec: outputCodec,
    enable_preprocessing: String(process.env.SARVAM_TTS_ENABLE_PREPROCESSING || "true") !== "false",
  };
  const response = await fetch(sarvamTtsUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-subscription-key": apiKey,
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const detail = await response.text();
    const error = new Error("Sarvam TTS API error");
    error.detail = detail || "Unknown Sarvam TTS error";
    throw error;
  }

  const audioBuffer = Buffer.from(await response.arrayBuffer());
  const audioBase64 = audioBuffer.toString("base64");
  if (!audioBase64) {
    const error = new Error("No audio returned");
    error.detail = "Streamed audio buffer was empty";
    throw error;
  }

  return { audioBase64, format: outputCodec };
}

async function transcribeSarvamAudio(file, language = "en") {
  const apiKey = process.env.SARVAM_API_KEY;
  if (!apiKey) {
    throw new Error("Missing SARVAM_API_KEY");
  }
  if (!file?.path) {
    throw new Error("No audio file provided");
  }

  const audioBuffer = fs.readFileSync(file.path);
  const blob = new Blob([audioBuffer], { type: file.mimetype || "audio/webm" });
  const form = new FormData();
  const sttConfig = getSarvamSttConfig(language);
  form.append("file", blob, file.originalname || path.basename(file.path));
  form.append("model", sttConfig.model);
  form.append("mode", sttConfig.mode);
  form.append("language_code", sttConfig.languageCode);

  const response = await fetch(sarvamSttUrl, {
    method: "POST",
    headers: { "api-subscription-key": apiKey },
    body: form,
  });
  if (!response.ok) {
    const detail = await response.text();
    const error = new Error("Sarvam STT API error");
    error.detail = detail || "Unknown Sarvam STT error";
    throw error;
  }

  const data = await response.json();
  const transcript =
    data?.transcript ||
    data?.transcript_text ||
    data?.text ||
    data?.output_text ||
    data?.data?.transcript ||
    data?.results?.[0]?.transcript ||
    "";

  return {
    transcript: String(transcript || "").trim(),
    raw: data,
  };
}


app.post("/api/upload", upload.single("media"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }
  return res.json({ filename: req.file.filename, size: req.file.size });
});

app.post("/api/generate", async (req, res) => {
  const {
    role = "",
    track = "",
    level = "",
    count = 1,
    nonce = Date.now(),
    language = "en",
    recentQuestions = [],
    sessionId = "",
  } = req.body || {};
  const apiKey = String(process.env.GROQ_API_KEY || "").trim();
  if (!String(role).trim() || !String(track).trim() || !String(level).trim()) {
    return res.status(400).json({ error: "role, track, and level are required" });
  }

  const model = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
  const recentList = Array.isArray(recentQuestions)
    ? recentQuestions
        .map((item) => String(item || "").trim())
        .filter(Boolean)
        .slice(-20)
    : [];
  const sessionMemory = getSessionMemory(sessionId);
  const interviewState = ensureInterviewState(sessionMemory, { role, track, level });
  const memoryList = Array.isArray(sessionMemory.questions) ? sessionMemory.questions.slice(-30) : [];
  const askedList = Array.isArray(interviewState.askedQuestions) ? interviewState.askedQuestions.slice(-20) : [];
  const avoidList = [...new Set([...memoryList, ...askedList, ...recentList])].slice(-50);

  if (!apiKey) {
    return res.status(503).json({
      error: "Missing GROQ_API_KEY",
      detail: "Question generation is LLM-only; configure GROQ_API_KEY to generate questions.",
    });
  }

  const systemPrompt = buildInterviewerSystemPrompt({ level, language });
  const prompt = buildNextQuestionPrompt({
    role,
    track,
    level,
    language,
    avoidList,
    nonce,
  });

  try {
    const { questions, lastDetail } = await requestUniqueQuestions({
      apiKey,
      model,
      systemPrompt,
      userPrompt: prompt,
      count: Math.max(1, Number(count) || 1),
      avoidList,
      temperature: 0.92,
    });

    if (!questions.length) {
      const rateLimited = isRateLimited(lastDetail);
      return res.status(rateLimited ? 429 : 502).json({
        error: rateLimited ? "Groq rate limit exceeded" : "No unique questions returned from Groq",
        detail: lastDetail || "Groq returned empty/duplicate-only output for this request.",
      });
    }

    questions.forEach((q) => recordAskedQuestion(sessionMemory, q));
    updateSessionMemory(sessionId, questions);
    schedulePersistSessionMemory();
    return res.json({ questions });
  } catch (error) {
    if (error?.name === "AbortError") {
      return res.status(504).json({
        error: "Groq request timed out",
        detail: "LLM generation timed out; please retry.",
      });
    }

    return res.status(502).json({
      error: "Failed to reach Groq API",
      detail: String(error?.message || error),
    });
  }
});

app.post("/api/question/next", async (req, res) => {
  const {
    role = "",
    track = "",
    level = "",
    nonce = Date.now(),
    language = "en",
    recentQuestions = [],
    sessionId = "",
  } = req.body || {};
  const apiKey = String(process.env.GROQ_API_KEY || "").trim();
  if (!String(role).trim() || !String(track).trim() || !String(level).trim()) {
    return res.status(400).json({ error: "role, track, and level are required" });
  }
  if (!apiKey) {
    return res.status(503).json({
      error: "Missing GROQ_API_KEY",
      detail: "Question generation is LLM-only; configure GROQ_API_KEY to generate questions.",
    });
  }

  const sessionMemory = getSessionMemory(sessionId);
  const interviewState = ensureInterviewState(sessionMemory, { role, track, level });
  const model = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
  const recentList = Array.isArray(recentQuestions)
    ? recentQuestions.map((item) => String(item || "").trim()).filter(Boolean).slice(-20)
    : [];
  const avoidList = [
    ...new Set([
      ...(sessionMemory.questions || []).slice(-30),
      ...(interviewState.askedQuestions || []).slice(-25),
      ...recentList,
    ]),
  ].slice(-60);
  try {
    const { questions, lastDetail } = await requestUniqueQuestions({
      apiKey,
      model,
      systemPrompt: buildInterviewerSystemPrompt({ level, language }),
      userPrompt: buildNextQuestionPrompt({
        role,
        track,
        level,
        language,
        avoidList,
        nonce,
      }),
      count: 1,
      avoidList,
      temperature: 0.9,
    });

    if (!questions.length) {
      const rateLimited = isRateLimited(lastDetail);
      return res.status(rateLimited ? 429 : 502).json({
        error: rateLimited ? "Groq rate limit exceeded" : "No unique questions returned from Groq",
        detail: lastDetail || "Groq returned empty/duplicate-only output for this request.",
      });
    }
    const question = questions[0];
    recordAskedQuestion(sessionMemory, question);
    updateSessionMemory(sessionId, [question]);
    schedulePersistSessionMemory();
    return res.json({
      question,
      type: "next",
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      return res.status(504).json({
        error: "Groq request timed out",
        detail: "LLM generation timed out; please retry.",
      });
    }
    return res.status(502).json({
      error: "Failed to reach Groq API",
      detail: String(error?.message || error),
    });
  }
});

app.post("/api/question/followup", async (req, res) => {
  const {
    role = "",
    track = "",
    level = "",
    question = "",
    answer = "",
    nonce = Date.now(),
    language = "en",
    sessionId = "",
  } = req.body || {};
  const apiKey = String(process.env.GROQ_API_KEY || "").trim();
  if (!String(role).trim() || !String(track).trim() || !String(level).trim()) {
    return res.status(400).json({ error: "role, track, and level are required" });
  }
  if (!String(answer).trim()) {
    return res.status(400).json({ error: "answer is required" });
  }
  if (!apiKey) {
    return res.status(503).json({
      error: "Missing GROQ_API_KEY",
      detail: "Question generation is LLM-only; configure GROQ_API_KEY to generate questions.",
    });
  }

  const sessionMemory = getSessionMemory(sessionId);
  const interviewState = ensureInterviewState(sessionMemory, { role, track, level });
  const sourceQuestion = String(question || interviewState.lastQuestion || "").trim();
  if (!sourceQuestion) {
    return res.status(400).json({ error: "question is required for follow-up" });
  }

  const avoidList = [
    ...new Set([...(sessionMemory.questions || []).slice(-30), ...(interviewState.askedQuestions || []).slice(-25)]),
  ].slice(-60);
  const model = process.env.GROQ_MODEL || "openai/gpt-oss-120b";

  try {
    const { questions, lastDetail } = await requestUniqueQuestions({
      apiKey,
      model,
      systemPrompt: buildInterviewerSystemPrompt({ level, language }),
      userPrompt: buildFollowUpPrompt({
        role,
        track,
        level,
        question: sourceQuestion,
        answer,
        language,
        nonce,
      }),
      count: 1,
      avoidList: [...avoidList, sourceQuestion],
      temperature: 0.75,
    });

    if (!questions.length) {
      const rateLimited = isRateLimited(lastDetail);
      return res.status(rateLimited ? 429 : 502).json({
        error: rateLimited ? "Groq rate limit exceeded" : "No follow-up question returned from Groq",
        detail: lastDetail || "Groq returned empty/duplicate-only output for follow-up request.",
      });
    }
    const followupQuestion = questions[0];
    interviewState.lastCandidateAnswer = String(answer).trim();
    recordAskedQuestion(sessionMemory, followupQuestion);
    updateSessionMemory(sessionId, [followupQuestion]);
    schedulePersistSessionMemory();
    return res.json({
      question: followupQuestion,
      type: "followup",
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      return res.status(504).json({
        error: "Groq request timed out",
        detail: "LLM generation timed out; please retry.",
      });
    }
    return res.status(502).json({
      error: "Failed to reach Groq API",
      detail: String(error?.message || error),
    });
  }
});

app.post("/api/voice", async (req, res) => {
  const { text = "", language = "en" } = req.body || {};
  if (!String(text).trim()) {
    return res.status(400).json({ error: "Text is required" });
  }

  try {
    const audio = await synthesizeSarvamSimple(String(text).trim(), language);
    return res.json(audio);
  } catch (error) {
    return res.status(500).json({
      error: "Failed to synthesize voice",
      detail: error?.detail || String(error?.message || error),
    });
  }
});

app.post("/api/transcribe", upload.single("audio"), async (req, res) => {
  const language = String(req.body?.language || "en").trim();
  if (!req.file) {
    return res.status(400).json({ error: "Audio file is required" });
  }

  try {
    const result = await transcribeSarvamAudio(req.file, language);
    if (!result.transcript) {
      return res.status(500).json({
        error: "No transcript returned",
        detail: JSON.stringify(result.raw || {}),
      });
    }
    return res.json({ transcript: result.transcript });
  } catch (error) {
    return res.status(500).json({
      error: "Failed to transcribe audio",
      detail: error?.detail || String(error?.message || error),
    });
  } finally {
    if (req.file?.path && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
      } catch {
        // no-op
      }
    }
  }
});


app.post("/api/evaluate", async (req, res) => {
  const {
    role = "",
    track = "",
    level = "",
    question = "",
    answer = "",
    language = "en",
  } = req.body || {};

  if (!answer || !answer.trim()) {
    return res.status(400).json({ error: "Answer is required" });
  }
  if (!String(role).trim() || !String(track).trim() || !String(level).trim()) {
    return res.status(400).json({ error: "role, track, and level are required" });
  }

  const apiKey = String(process.env.GROQ_API_KEY || "").trim();
  if (!apiKey) {
    const local = buildLocalEvaluation({ answer, language });
    return res.json({
      ...local,
      detail: "Missing GROQ_API_KEY. Local fallback evaluation used.",
    });
  }

  const model = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
  const languageHint =
    String(language).toLowerCase() === "hinglish"
      ? "Give feedback in casual Hinglish in Roman letters."
      : String(language).toLowerCase() === "hi"
      ? "Give feedback in natural Hindi in Devanagari script."
      : "Give feedback in natural English.";
  const prompt = `You are an interview evaluator. Score the candidate's answer from 0 to 100 and give concise, conversational feedback in a short, friendly style.
Role: ${role}
Track: ${track}
Level: ${level}
Question: ${question}
Answer: ${answer}

${languageHint}
Return JSON with keys: score (number) and feedback (string).`;

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content:
              "You are a friendly interview coach. Keep feedback short, supportive, and natural. Use the requested language.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.4,
        max_tokens: 300,
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      if (/invalid_api_key/i.test(detail)) {
        const local = buildLocalEvaluation({ answer, language });
        return res.json({
          ...local,
          detail: "Groq invalid API key. Local fallback evaluation used.",
        });
      }
      return res.status(500).json({ error: "Groq API error", detail });
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || "";
    let parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      const match = text.match(/\\{[\\s\\S]*\\}/);
      if (match) {
        parsed = JSON.parse(match[0]);
      }
    }

    if (!parsed || typeof parsed.score !== "number") {
      return res.json({ score: 0, feedback: text.trim() || "No feedback returned." });
    }

    return res.json({
      score: Math.max(0, Math.min(100, Math.round(parsed.score))),
      feedback: String(parsed.feedback || "").trim(),
    });
  } catch (error) {
    const local = buildLocalEvaluation({ answer, language });
    return res.json({
      ...local,
      detail: "Failed to reach Groq API. Local fallback evaluation used.",
    });
  }
});

app.post("/api/answer", async (req, res) => {
  const {
    role = "",
    track = "",
    level = "",
    question = "",
    language = "en",
  } = req.body || {};

  if (!question || !question.trim()) {
    return res.status(400).json({ error: "Question is required" });
  }
  if (!String(role).trim() || !String(track).trim() || !String(level).trim()) {
    return res.status(400).json({ error: "role, track, and level are required" });
  }

  const apiKey = String(process.env.GROQ_API_KEY || "").trim();
  if (!apiKey) {
    return res.json({
      answer: buildLocalSampleAnswer({ question, language }),
      fallback: true,
      detail: "Missing GROQ_API_KEY. Local fallback answer used.",
    });
  }

  const model = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
  const languageHint =
    String(language).toLowerCase() === "hinglish"
      ? "Answer in casual Hinglish in Roman letters."
      : String(language).toLowerCase() === "hi"
      ? "Answer in natural Hindi in Devanagari script."
      : "Answer in natural English.";

  const prompt = `You are a friendly interview coach. Provide a strong, concise sample answer in a short, conversational tone.
Role: ${role}
Track: ${track}
Level: ${level}
Question: ${question}

${languageHint}
Return plain text only.`;

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content:
              "You are a friendly interview coach. Give a clear, practical answer in 4 to 6 sentences.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.5,
        max_tokens: 350,
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      if (/invalid_api_key/i.test(detail)) {
        return res.json({
          answer: buildLocalSampleAnswer({ question, language }),
          fallback: true,
          detail: "Groq invalid API key. Local fallback answer used.",
        });
      }
      return res.status(500).json({ error: "Groq API error", detail });
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || "";
    return res.json({ answer: String(text || "").trim() });
  } catch (error) {
    return res.json({
      answer: buildLocalSampleAnswer({ question, language }),
      fallback: true,
      detail: "Failed to reach Groq API. Local fallback answer used.",
    });
  }
});

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Serve the built React app if it exists
if (fs.existsSync(clientDistDir)) {
  app.use(express.static(clientDistDir));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(clientDistDir, "index.html"));
  });
}

app.listen(port, "0.0.0.0", () => {
  console.log(`Server listening on port ${port}`);
});


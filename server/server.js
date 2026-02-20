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
const SIMILARITY_THRESHOLD = Number(process.env.QUESTION_SIMILARITY_THRESHOLD || 0.72);
const GROQ_TIMEOUT_MS = Number(process.env.GROQ_TIMEOUT_MS || 25000);

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
  if (!candidateNormalized) return true;
  for (const existing of existingQuestions) {
    const existingNormalized = normalizeQuestionText(existing);
    if (!existingNormalized) continue;
    if (candidateNormalized === existingNormalized) return true;
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
      sessionStore.set(sessionId, {
        questions,
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

const murfTtsUrl = process.env.MURF_TTS_URL || "https://api.murf.ai/v1/speech/generate";

async function fetchWithTimeout(url, options = {}, timeoutMs = GROQ_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}


function buildLevelGuidance(level) {
  const normalized = String(level || "").trim().toLowerCase();
  if (normalized === "entry") {
    return "Entry difficulty only: fundamentals, simple practical scenarios, clear definitions, no deep architecture or research-heavy topics.";
  }
  if (normalized === "mid") {
    return "Mid difficulty only: practical implementation tradeoffs and moderate complexity; avoid senior/staff scope.";
  }
  if (normalized === "senior") {
    return "Senior difficulty: complex tradeoffs, scalability, system-level impact, and ambiguity handling.";
  }
  if (normalized === "staff") {
    return "Staff difficulty: org-level strategy, cross-team architecture, long-term technical direction, and leadership judgment.";
  }
  return `Use the selected level (${level}) strictly; do not drift to senior/staff complexity unless selected.`;
}

function buildFallbackQuestions({ role, track, level, count = 1, language = "en", avoidList = [] }) {
  const roleText = String(role || "this role").trim();
  const trackText = String(track || "this track").trim();
  const levelText = String(level || "selected").trim();
  const lang = String(language || "en").toLowerCase();

  const english = [
    `Can you walk me through a recent ${roleText} project and your key technical decisions?`,
    `For ${trackText}, what tradeoff do you evaluate first at ${levelText} level, and why?`,
    `Describe a production issue you solved and how you verified the fix end-to-end.`,
    `How do you break a complex problem into milestones before implementation starts?`,
    `What metrics would you track to confirm your solution is actually working?`,
  ];
  const hindi = [
    `Aap apne kisi recent ${roleText} project ke baare mein batayein, aur key technical decisions kya the?`,
    `${trackText} mein ${levelText} level par aap sabse pehla tradeoff kaise evaluate karte hain, aur kyun?`,
    `Kisi production issue ka example dijiye jo aapne solve kiya ho, aur fix ko end-to-end kaise verify kiya?`,
    `Complex problem ko implementation se pehle milestones mein kaise todte hain?`,
    `Aap kaunse metrics track karte hain taaki solution ke result confirm ho sakein?`,
  ];

  const candidates = lang === "hi" || lang === "hinglish" ? hindi : english;
  const filtered = candidates.filter((q) => !isTooSimilar(q, avoidList));
  const chosen = (filtered.length ? filtered : candidates).slice(0, Math.max(1, Number(count) || 1));
  return chosen;
}

async function synthesizeMurfSimple(text) {
  const apiKey = process.env.MURF_API_KEY;
  if (!apiKey) {
    throw new Error("Missing MURF_API_KEY");
  }

  const basePayload = {
    text,
    voiceId: process.env.MURF_VOICE_ID || "en-US-natalie",
    style: process.env.MURF_STYLE || "Conversational",
    modelVersion: (process.env.MURF_MODEL_VERSION || "FALCON").toUpperCase(),
    multiNativeLocale: process.env.MURF_MULTI_NATIVE_LOCALE || "hi-IN",
    format: (process.env.MURF_FORMAT || "MP3").toUpperCase(),
    sampleRate: Number(process.env.MURF_SAMPLE_RATE || 24000),
    channelType: (process.env.MURF_CHANNEL_TYPE || "MONO").toUpperCase(),
    encodeAsBase64: true,
  };
  const murfHeaders = {
    "Content-Type": "application/json",
    "api-key": apiKey,
  };
  const voiceCandidates = [
    basePayload.voiceId,
    process.env.MURF_FALLBACK_VOICE_ID || "en-US-natalie",
    "en-US-natalie",
    "en-US-alicia",
  ].filter(Boolean);
  const modelCandidates =
    basePayload.modelVersion === "FALCON"
      ? ["FALCON", "GEN2"]
      : [basePayload.modelVersion, "GEN2"];

  let response = null;
  let lastDetail = "";
  for (const voiceId of [...new Set(voiceCandidates)]) {
    for (const modelVersion of [...new Set(modelCandidates)]) {
      const payload = { ...basePayload, voiceId, modelVersion };
      response = await fetch(murfTtsUrl, {
        method: "POST",
        headers: murfHeaders,
        body: JSON.stringify(payload),
      });
      if (response.ok) {
        break;
      }
      lastDetail = await response.text();
      const invalidVoice = /Invalid voice_id/i.test(lastDetail);
      const invalidModel = /ModelVersion|GEN2|Invalid value/i.test(lastDetail);
      if (!invalidVoice && !invalidModel) {
        const error = new Error("Murf TTS API error");
        error.detail = lastDetail;
        throw error;
      }
    }
    if (response?.ok) break;
  }
  if (!response?.ok) {
    const error = new Error("Murf TTS API error");
    error.detail = lastDetail || "Unknown Murf error";
    throw error;
  }

  const data = await response.json();
  let audioBase64 = data?.encodedAudio || null;
  if (!audioBase64 && data?.audioFile) {
    const audioResponse = await fetch(data.audioFile);
    if (audioResponse.ok) {
      const audioBuffer = Buffer.from(await audioResponse.arrayBuffer());
      audioBase64 = audioBuffer.toString("base64");
    }
  }

  if (!audioBase64) {
    const error = new Error("No audio returned");
    error.detail = JSON.stringify(data);
    throw error;
  }

  return { audioBase64, format: "mp3" };
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
    count = 5,
    nonce = Date.now(),
    language = "en",
    recentQuestions = [],
    sessionId = "",
  } = req.body || {};
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    return res.status(400).json({ error: "Missing GROQ_API_KEY" });
  }
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
  const memoryList = Array.isArray(sessionMemory.questions) ? sessionMemory.questions.slice(-30) : [];
  const avoidList = [...new Set([...memoryList, ...recentList])].slice(-40);
  const languageHint =
    String(language).toLowerCase() === "hinglish"
      ? "Use casual Hinglish in Roman letters."
      : String(language).toLowerCase() === "hi"
      ? "Use natural Hindi in Devanagari script."
      : "Use natural English.";
  const levelHint = buildLevelGuidance(level);

  const prompt = `Create ${Math.max(3, count * 4)} interview questions for a ${level} ${role} interview focused on ${track}.
Guidelines:
- Use role, track, and level to decide what to ask.
- ${levelHint}
- Use diverse sub-topics. Avoid reusing the same 7-8 templates.
- Avoid repeating themes or wording from previous questions.
${languageHint}
Questions to avoid repeating:
${avoidList.length ? avoidList.map((item, i) => `${i + 1}. ${item}`).join("\n") : "None"}
Nonce: ${nonce}.
Return each question on a new line only.`;

  try {
    let accepted = [];
    let generatedPool = [];
    let attempts = 0;
    let lastDetail = "";

    while (accepted.length < count && attempts < 3) {
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
            {
              role: "system",
              content:
                "You are a friendly interview coach with a short, conversational tone. Ask one clear question at a time. Keep it crisp and natural.",
            },
            {
              role: "user",
              content:
                attempts === 1
                  ? prompt
                  : `${prompt}\nAttempt ${attempts}: be more original and avoid repeating wording from earlier attempts.`,
            },
          ],
          temperature: 0.95,
          max_tokens: 700,
        }),
      });

      if (!response.ok) {
        lastDetail = await response.text();
        break;
      }

      const data = await response.json();
      const text = data.choices?.[0]?.message?.content || "";
      const generated = text
        .split("\n")
        .map((line) => line.replace(/^\s*[-*\d.]+\s*/, "").trim())
        .filter(Boolean);
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

    const fallback = avoidList.filter(Boolean).length
      ? []
      : [`Can you walk me through a recent project and your key technical decisions?`];
    const questions = [...accepted, ...fallback].slice(0, count);

    if (!questions.length) {
      const fallbackQuestions = buildFallbackQuestions({
        role,
        track,
        level,
        count,
        language,
        avoidList,
      });
      updateSessionMemory(sessionId, fallbackQuestions);
      schedulePersistSessionMemory();
      return res.json({
        questions: fallbackQuestions,
        fallback: true,
        detail: lastDetail || "No unique questions returned from Groq.",
      });
    }

    updateSessionMemory(sessionId, questions);
    schedulePersistSessionMemory();
    return res.json({ questions });
  } catch (error) {
    const fallbackQuestions = buildFallbackQuestions({
      role,
      track,
      level,
      count,
      language,
      avoidList,
    });
    updateSessionMemory(sessionId, fallbackQuestions);
    schedulePersistSessionMemory();

    if (error?.name === "AbortError") {
      return res.json({
        questions: fallbackQuestions,
        fallback: true,
        detail: "Groq request timed out",
      });
    }

    return res.json({
      questions: fallbackQuestions,
      fallback: true,
      detail: "Failed to reach Groq API",
    });
  }
});

app.post("/api/voice", async (req, res) => {
  const { text = "" } = req.body || {};
  if (!String(text).trim()) {
    return res.status(400).json({ error: "Text is required" });
  }

  try {
    const audio = await synthesizeMurfSimple(String(text).trim());
    return res.json(audio);
  } catch (error) {
    return res.status(500).json({
      error: "Failed to synthesize voice",
      detail: error?.detail || String(error?.message || error),
    });
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

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return res.status(400).json({ error: "Missing GROQ_API_KEY" });
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
    return res.status(500).json({ error: "Failed to reach Groq API" });
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

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return res.status(400).json({ error: "Missing GROQ_API_KEY" });
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
      return res.status(500).json({ error: "Groq API error", detail });
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || "";
    return res.json({ answer: String(text || "").trim() });
  } catch (error) {
    return res.status(500).json({ error: "Failed to reach Groq API" });
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


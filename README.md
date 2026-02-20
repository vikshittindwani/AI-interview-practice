# Interview Atlas

AI-powered mock interview studio with:
- adaptive question generation
- answer scoring + concise feedback
- sample answer generation when the user is stuck
- optional text-to-speech for interview questions
- browser speech dictation and camera/mic recording

This repo has two apps:
- `client/` React + Vite frontend
- `server/` Express backend (Groq + Murf integrations)

## Tech Stack
- Frontend: React 18, Vite
- Backend: Node.js, Express, Multer, CORS, dotenv
- AI APIs: Groq (question generation/evaluation/answers), Murf (TTS)

## Project Structure
```text
final ai inter/
  client/
  server/
```

## Prerequisites
- Node.js 18+
- npm
- Groq API key
- Murf API key (optional unless using `/api/voice`)

## Environment Variables
Create `server/.env`:

```env
# Required for core AI features
GROQ_API_KEY=your_groq_api_key

# Optional
PORT=5050
GROQ_MODEL=openai/gpt-oss-120b
GROQ_TIMEOUT_MS=25000

# Session memory tuning
SESSION_MEMORY_LIMIT=100
SESSION_QUESTION_LIMIT=40
QUESTION_SIMILARITY_THRESHOLD=0.72

# Murf TTS (required for /api/voice)
MURF_API_KEY=your_murf_api_key
MURF_TTS_URL=https://api.murf.ai/v1/speech/generate
MURF_VOICE_ID=en-US-natalie
MURF_FALLBACK_VOICE_ID=en-US-natalie
MURF_STYLE=Conversational
MURF_MODEL_VERSION=FALCON
MURF_MULTI_NATIVE_LOCALE=hi-IN
MURF_FORMAT=MP3
MURF_SAMPLE_RATE=24000
MURF_CHANNEL_TYPE=MONO
```

## Local Development
### 1) Install dependencies
```bash
cd server && npm install
cd ../client && npm install
```

### 2) Run backend
```bash
cd server
npm run dev
```
Backend runs on `http://localhost:5050`.

### 3) Run frontend
```bash
cd client
npm run dev
```
Frontend runs on `http://localhost:5173`.

Vite is configured to proxy `/api` requests to `http://localhost:5050`.

## Build for Production
```bash
cd client
npm run build
```

If `client/dist` exists, the Express server serves it automatically.

## API Endpoints
- `POST /api/upload`
  - Uploads recorded interview media (`multipart/form-data`, field: `media`).
- `POST /api/generate`
  - Generates interview questions based on `role`, `track`, `level`, `language`, and session context.
- `POST /api/evaluate`
  - Scores candidate answer (`0-100`) and returns concise feedback.
- `POST /api/answer`
  - Returns a strong sample answer when the candidate says they do not know.
- `POST /api/voice`
  - Synthesizes speech from text (Murf).
- `GET /api/health`
  - Health check.

## Notes
- Session question memory is persisted at `server/data/session-memory.json`.
- Uploaded recordings are stored in `server/uploads/`.
- Browser voice dictation uses Web Speech APIs and may behave differently across browsers.

## License
No license file is currently included. Add one (for example, MIT) before publishing publicly.

# Interview Atlas

AI-powered mock interview studio with:
- adaptive question generation
- answer scoring + concise feedback
- sample answer generation when the user is stuck
- Sarvam AI text-to-speech for interview questions
- browser speech dictation + optional Sarvam speech-to-text recording
- camera/mic recording

This repo has two apps:
- `client/` React + Vite frontend
- `server/` Express backend (Groq + Murf integrations)

## Tech Stack
- Frontend: React 18, Vite
- Backend: Node.js, Express, Multer, CORS, dotenv
- AI APIs: Groq (question generation/evaluation/answers), Sarvam (TTS + STT)

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
- Sarvam API key (required for `/api/voice` and `/api/transcribe`)

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

# Sarvam Voice
SARVAM_API_KEY=your_sarvam_api_key
SARVAM_TTS_URL=https://api.sarvam.ai/text-to-speech/stream
SARVAM_TTS_MODEL=bulbul:v3
SARVAM_TTS_SPEAKER=shreya
SARVAM_TTS_TARGET_LANGUAGE_CODE=en-IN
SARVAM_TTS_PACE=1.1
SARVAM_TTS_SPEECH_SAMPLE_RATE=22050
SARVAM_TTS_OUTPUT_AUDIO_CODEC=mp3
SARVAM_TTS_ENABLE_PREPROCESSING=true
SARVAM_STT_URL=https://api.sarvam.ai/speech-to-text-translate
SARVAM_STT_MODEL=saaras:v2.5
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
  - Synthesizes speech from text (Sarvam TTS).
- `POST /api/transcribe`
  - Transcribes recorded audio (`multipart/form-data`, field: `audio`) using Sarvam STT.
- `GET /api/health`
  - Health check.

## Notes
- Session question memory is persisted at `server/data/session-memory.json`.
- Uploaded recordings are stored in `server/uploads/`.
- Browser voice dictation still uses Web Speech APIs for live mode.
- Sarvam STT is available via the "Record Sarvam STT" control in the studio.

## License
No license file is currently included. Add one (for example, MIT) before publishing publicly.

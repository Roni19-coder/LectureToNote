
import os
import tempfile
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from faster_whisper import WhisperModel
from notes import router as notes_router
from analytics import router as analytics_router

app = FastAPI(title="LecToNote API")
app.include_router(notes_router)
app.include_router(analytics_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://lecture-to-note.vercel.app"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Start with a small model for a CPU-based laptop.
MODEL_SIZE = os.getenv("WHISPER_MODEL", "tiny")
model = None

ALLOWED_EXTENSIONS = {
    ".mp3", ".wav", ".m4a", ".ogg",
    ".mp4", ".webm", ".mpeg", ".mpga",
}


def get_model():
    global model

    if model is None:
        model = WhisperModel(
            MODEL_SIZE,
            device="cpu",
            compute_type="int8",
        )

    return model


@app.get("/")
def health_check():
    return {"status": "ok", "service": "LecToNote API"}


@app.post("/api/transcribe")
async def transcribe_lecture(file: UploadFile = File(...)):
    suffix = Path(file.filename or "").suffix.lower()

    if suffix not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail="Unsupported file format.",
        )

    temp_path = None

    try:
        # Save the upload temporarily so Whisper can process it.
        with tempfile.NamedTemporaryFile(
            delete=False, suffix=suffix
        ) as temp:
            temp_path = temp.name
            total_size = 0

            while True:
                chunk = await file.read(1024 * 1024)

                if not chunk:
                    break

                total_size += len(chunk)

                if total_size > 100 * 1024 * 1024:
                    raise HTTPException(
                        status_code=413,
                        detail="File is too large. Maximum size is 100 MB.",
                    )

                temp.write(chunk)

        if total_size == 0:
            raise HTTPException(
                status_code=400,
                detail="The uploaded file is empty.",
            )

        whisper = get_model()

        segments, info = whisper.transcribe(
            temp_path,
            beam_size=1,
            vad_filter=True,
        )

        # Consume the generator while the temporary file exists.
        transcript_segments = [
            {
                "start": round(segment.start, 2),
                "end": round(segment.end, 2),
                "text": segment.text.strip(),
            }
            for segment in segments
        ]

        return {
            "filename": file.filename,
            "language": info.language,
            "duration": round(info.duration, 2),
            "segments": transcript_segments,
            "transcript": " ".join(
                segment["text"] for segment in transcript_segments
            ),
        }

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Transcription failed: {str(exc)}",
        ) from exc
    finally:
        await file.close()

        if temp_path and os.path.exists(temp_path):
            os.remove(temp_path)

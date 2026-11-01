import json
import os

from dotenv import load_dotenv
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from groq import Groq

load_dotenv()
router = APIRouter()
api_key = os.getenv("GROQ_API_KEY")
model = os.getenv("GROQ_MODEL", "openai/gpt-oss-20b")
client = Groq(api_key=api_key) if api_key else None


class NotesRequest(BaseModel):
    transcript: str = Field(min_length=20, max_length=100000)


class QuizRequest(BaseModel):
    content: str = Field(min_length=20, max_length=100000)


def require_client():
    if client is None:
        raise HTTPException(status_code=500, detail="GROQ_API_KEY is missing. Add it to backend/.env.")


@router.post("/api/generate-notes")
def generate_notes(request: NotesRequest):
    require_client()
    try:
        result = client.chat.completions.create(
            model=model, temperature=0.3, max_completion_tokens=6000,
            messages=[
                {"role": "system", "content": """You are LecToNote, an academic note-taking assistant. Create accurate Markdown study notes with: Lecture Overview, Detailed Notes, Key Concepts and Definitions, Important Formulas and Examples, Quick Revision Summary, and five Practice Questions with answers. Do not invent facts; use only the transcript."""},
                {"role": "user", "content": "Generate study notes from this lecture transcript:\n\n" + request.transcript},
            ],
        )
        notes = result.choices[0].message.content
        if not notes or not notes.strip():
            raise HTTPException(status_code=502, detail="Groq returned empty notes.")
        return {"notes": notes.strip(), "model": model}
    except HTTPException:
        raise
    except Exception as exc:
        print(f"Groq notes generation error: {exc}")
        raise HTTPException(status_code=502, detail="AI note generation failed. Check your Groq key, model, and usage limits.") from exc


@router.post("/api/generate-quiz")
def generate_quiz(request: QuizRequest):
    require_client()
    try:
        result = client.chat.completions.create(
            model=model, temperature=0.3, max_completion_tokens=3000,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": """Generate exactly 5 multiple-choice questions based only on the supplied lecture. Return JSON only: {"questions":[{"question":"...","options":["A","B","C","D"],"answer":0,"explanation":"..."}]}. Each question must have exactly 4 string options. answer must be an integer 0-3 representing the correct option index. Include an explanation grounded in the content. No Markdown fences."""},
                {"role": "user", "content": request.content},
            ],
        )
        raw = result.choices[0].message.content
        if not raw:
            raise HTTPException(status_code=502, detail="Groq returned an empty quiz.")
        questions = json.loads(raw).get("questions")
        if not isinstance(questions, list) or len(questions) != 5:
            raise HTTPException(status_code=502, detail="The AI did not return exactly 5 questions. Try again.")
        for q in questions:
            if (not isinstance(q, dict) or not isinstance(q.get("question"), str)
                or not isinstance(q.get("options"), list) or len(q["options"]) != 4
                or not all(isinstance(x, str) for x in q["options"])
                or type(q.get("answer")) is not int or q["answer"] not in range(4)
                or not isinstance(q.get("explanation"), str)):
                raise HTTPException(status_code=502, detail="The AI returned an invalid question format.")
        return {"questions": questions, "model": model}
    except HTTPException:
        raise
    except Exception as exc:
        print(f"Groq quiz generation error: {exc}")
        raise HTTPException(status_code=502, detail="Quiz generation failed. Check your Groq model, API key, and usage limits.") from exc

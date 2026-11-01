import os
from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from dotenv import load_dotenv

load_dotenv()

try:
    from pymongo import MongoClient, DESCENDING
    from pymongo.errors import PyMongoError
except ImportError:  # Keep app importable; endpoints return a clear setup error.
    MongoClient = None
    DESCENDING = -1
    PyMongoError = Exception

router = APIRouter(tags=["study-analytics"])
_mongo_client = None
_db = None


def get_db():
    global _mongo_client, _db
    uri = os.getenv("MONGO_URI") or os.getenv("MONGODB_URI")
    if not uri:
        raise HTTPException(status_code=503, detail="MongoDB is not configured. Add MONGO_URI to backend/.env.")
    if MongoClient is None:
        raise HTTPException(status_code=503, detail="pymongo is not installed. Run: py -m pip install pymongo.")
    if _db is None:
        try:
            _mongo_client = MongoClient(uri, serverSelectionTimeoutMS=4000)
            _mongo_client.admin.command("ping")
            _db = _mongo_client[os.getenv("MONGO_DB_NAME", "lectonote")]
            _db.lectures.create_index([("client_id", 1), ("created_at", -1)])
            _db.quiz_attempts.create_index([("client_id", 1), ("created_at", -1)])
        except Exception as exc:
            _mongo_client = None
            _db = None
            raise HTTPException(status_code=503, detail="Could not connect to MongoDB. Check MONGO_URI and network access.") from exc
    return _db


class LectureEvent(BaseModel):
    client_id: str = Field(min_length=8, max_length=100)
    title: str = Field(min_length=1, max_length=200)
    file_name: str = Field(min_length=1, max_length=255)
    duration_seconds: float = Field(default=0, ge=0, le=86400)
    transcript_chars: int = Field(default=0, ge=0, le=2000000)


class QuizAttempt(BaseModel):
    client_id: str = Field(min_length=8, max_length=100)
    lecture_id: Optional[str] = Field(default=None, max_length=100)
    topic: str = Field(min_length=1, max_length=200)
    score: int = Field(ge=0, le=100)
    total_questions: int = Field(ge=1, le=100)
    percentage: int = Field(ge=0, le=100)


@router.post("/api/analytics/lectures")
def record_lecture(event: LectureEvent):
    db = get_db()
    now = datetime.now(timezone.utc)
    record = event.model_dump() if hasattr(event, "model_dump") else event.dict()
    record.update({"created_at": now, "_id": uuid4().hex})
    try:
        db.lectures.insert_one(record)
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Could not save lecture analytics to MongoDB.") from exc
    return {"ok": True, "lecture_id": record["_id"], "created_at": now.isoformat()}


@router.post("/api/analytics/quiz-attempts")
def record_quiz_attempt(event: QuizAttempt):
    if event.score > event.total_questions:
        raise HTTPException(status_code=422, detail="Score cannot exceed the number of questions.")
    if event.percentage != round((event.score / event.total_questions) * 100):
        raise HTTPException(status_code=422, detail="Percentage does not match score and total_questions.")
    db = get_db()
    now = datetime.now(timezone.utc)
    record = event.model_dump() if hasattr(event, "model_dump") else event.dict()
    record.update({"created_at": now, "_id": uuid4().hex})
    try:
        db.quiz_attempts.insert_one(record)
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Could not save quiz analytics to MongoDB.") from exc
    return {"ok": True, "attempt_id": record["_id"], "created_at": now.isoformat()}


@router.get("/api/analytics")
def get_analytics(client_id: str = Query(min_length=8, max_length=100)):
    db = get_db()
    try:
        lectures = list(db.lectures.find({"client_id": client_id}).sort("created_at", DESCENDING))
        attempts = list(db.quiz_attempts.find({"client_id": client_id}).sort("created_at", DESCENDING))
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Could not read analytics from MongoDB.") from exc

    total_questions = sum(int(a.get("total_questions", 0)) for a in attempts)
    correct_answers = sum(int(a.get("score", 0)) for a in attempts)
    average_accuracy = round(correct_answers / total_questions * 100) if total_questions else 0
    total_seconds = sum(float(l.get("duration_seconds", 0)) for l in lectures)

    today = datetime.now(timezone.utc).date()
    day_buckets = {}
    for offset in range(6, -1, -1):
        day = today - timedelta(days=offset)
        day_buckets[day.isoformat()] = {"date": day.isoformat(), "label": day.strftime("%a"), "lectures": 0, "quiz_attempts": 0, "minutes": 0.0}
    for item in lectures:
        created = item.get("created_at")
        if created:
            key = created.date().isoformat()
            if key in day_buckets:
                day_buckets[key]["lectures"] += 1
                day_buckets[key]["minutes"] += round(float(item.get("duration_seconds", 0)) / 60, 1)
    for item in attempts:
        created = item.get("created_at")
        if created:
            key = created.date().isoformat()
            if key in day_buckets:
                day_buckets[key]["quiz_attempts"] += 1

    by_topic = {}
    for attempt in attempts:
        topic = str(attempt.get("topic") or "Untitled lecture")
        row = by_topic.setdefault(topic, {"topic": topic, "attempts": 0, "correct": 0, "questions": 0})
        row["attempts"] += 1
        row["correct"] += int(attempt.get("score", 0))
        row["questions"] += int(attempt.get("total_questions", 0))
    topic_performance = [
        {"topic": row["topic"], "attempts": row["attempts"], "accuracy": round(row["correct"] / row["questions"] * 100) if row["questions"] else 0}
        for row in by_topic.values()
    ]
    topic_performance.sort(key=lambda row: (row["accuracy"], -row["attempts"]))

    recent = []
    for item in lectures[:10]:
        created = item.get("created_at")
        recent.append({"type": "lecture", "title": item.get("title", "Lecture"), "created_at": created.isoformat() if created else "", "detail": f"Lecture processed · {round(float(item.get('duration_seconds', 0)) / 60, 1)} media minutes"})
    for item in attempts[:10]:
        created = item.get("created_at")
        recent.append({"type": "quiz", "title": item.get("topic", "Quiz"), "created_at": created.isoformat() if created else "", "detail": f"Quiz submitted · {item.get('score', 0)}/{item.get('total_questions', 0)} correct ({item.get('percentage', 0)}%)"})
    recent.sort(key=lambda row: row["created_at"], reverse=True)

    return {
        "total_lectures": len(lectures),
        "total_lecture_minutes": round(total_seconds / 60, 1),
        "quiz_attempts": len(attempts),
        "average_accuracy": average_accuracy,
        "total_questions_answered": total_questions,
        "correct_answers": correct_answers,
        "weekly_activity": list(day_buckets.values()),
        "topic_performance": topic_performance,
        "recent_activity": recent[:10],
    }

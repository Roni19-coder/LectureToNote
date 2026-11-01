"use client";

import { useEffect, useRef, useState } from "react";
import {
  Upload,
  FileAudio,
  FileVideo,
  BookOpen,
  Search,
  Sparkles,
  Clock3,
  Files,
  X,
  Copy,
  Check,
  LoaderCircle,
  BrainCircuit,
  Download,
  ListChecks,
  ChartNoAxesCombined,
  Target,
  Trophy,
  CalendarDays,
  RefreshCw,
  Info,
} from "lucide-react";

type Segment = { start: number; end: number; text: string };
type Question = {
  question: string;
  options: string[];
  answer: number;
  explanation: string;
};
type AnalyticsData = {
  total_lectures: number;
  total_lecture_minutes: number;
  quiz_attempts: number;
  average_accuracy: number;
  total_questions_answered: number;
  correct_answers: number;
  weekly_activity: {
    date: string;
    label: string;
    lectures: number;
    quiz_attempts: number;
    minutes: number;
  }[];
  topic_performance: { topic: string; attempts: number; accuracy: number }[];
  recent_activity: {
    type: string;
    title: string;
    created_at: string;
    detail: string;
  }[];
};

export default function Home() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [segments, setSegments] = useState<Segment[]>([]);
  const [language, setLanguage] = useState("");
  const [duration, setDuration] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [notes, setNotes] = useState("");
  const [generatingNotes, setGeneratingNotes] = useState(false);
  const [notesError, setNotesError] = useState("");
  const [notesModel, setNotesModel] = useState("");
  const [quiz, setQuiz] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [generatingQuiz, setGeneratingQuiz] = useState(false);
  const [quizError, setQuizError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [clientId, setClientId] = useState("");
  const [currentLectureId, setCurrentLectureId] = useState("");
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState("");
  const [analyticsNotice, setAnalyticsNotice] = useState("");

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
  useEffect(() => {
    const initializeClientId = () => {
      const storageKey = "lectonote_client_id";
      let id = window.localStorage.getItem(storageKey);

      if (!id) {
        id = crypto.randomUUID();
        window.localStorage.setItem(storageKey, id);
      }

      setClientId(id);
    };

    const timeoutId = window.setTimeout(initializeClientId, 0);

    return () => window.clearTimeout(timeoutId);
  }, []);

  async function loadAnalytics(id = clientId) {
    if (!id) return;
    setAnalyticsLoading(true);
    setAnalyticsError("");
    try {
      const res = await fetch(
        `${API_URL}/api/analytics?client_id=${encodeURIComponent(id)}`,
      );
      const data = await res.json();
      if (!res.ok)
        throw new Error(data.detail || "Could not load study analytics.");
      setAnalytics(data);
    } catch (e) {
      setAnalyticsError(
        e instanceof Error ? e.message : "Could not connect to analytics API.",
      );
    } finally {
      setAnalyticsLoading(false);
    }
  }

  async function saveLectureAnalytics(payload: {
    title: string;
    file_name: string;
    duration_seconds: number;
    transcript_chars: number;
  }) {
    if (!clientId) return;
    try {
      const res = await fetch(`${API_URL}/api/analytics/lectures`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: clientId, ...payload }),
      });
      const data = await res.json();
      if (!res.ok)
        throw new Error(data.detail || "Lecture analytics could not be saved.");
      setCurrentLectureId(data.lecture_id);
      setAnalyticsNotice("");
      await loadAnalytics(clientId);
    } catch (e) {
      setAnalyticsNotice(
        e instanceof Error
          ? e.message
          : "Lecture analytics could not be saved.",
      );
    }
  }

  async function saveQuizAnalytics(finalScore: number) {
    if (!clientId) return;
    try {
      const res = await fetch(
        `${API_URL}/api/analytics/quiz-attempts`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            client_id: clientId,
            lecture_id: currentLectureId || null,
            topic: file?.name || "Untitled lecture",
            score: finalScore,
            total_questions: quiz.length,
            percentage: quiz.length
              ? Math.round((finalScore / quiz.length) * 100)
              : 0,
          }),
        },
      );
      const data = await res.json();
      if (!res.ok)
        throw new Error(data.detail || "Quiz result could not be saved.");
      setAnalyticsNotice("");
      await loadAnalytics(clientId);
    } catch (e) {
      setAnalyticsNotice(
        e instanceof Error ? e.message : "Quiz result could not be saved.",
      );
    }
  }

  const btn =
    "cursor-pointer rounded-xl bg-violet-600 px-5 py-3 font-semibold transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50";
  const score = quiz.filter((q, i) => answers[i] === q.answer).length;

  function chooseFile(f?: File) {
    if (!f) return;
    if (!/\.(mp3|wav|m4a|ogg|mp4|webm|mpeg|mpga)$/i.test(f.name)) {
      setError("Unsupported file format.");
      return;
    }
    if (!f.size || f.size > 100 * 1024 * 1024) {
      setError("File must be larger than 0 bytes and no more than 100 MB.");
      return;
    }
    setFile(f);
    setError("");
    setTranscript("");
    setSegments([]);
    setNotes("");
    setNotesError("");
    setQuiz([]);
    setAnswers({});
    setQuizError("");
    setSubmitted(false);
  }
  function removeFile() {
    setFile(null);
    setTranscript("");
    setSegments([]);
    setLanguage("");
    setDuration(null);
    setNotes("");
    setQuiz([]);
    setAnswers({});
    setSubmitted(false);
    setError("");
    setNotesError("");
    setQuizError("");
  }

  function time(s: number) {
    return `${Math.floor(s / 60)
      .toString()
      .padStart(2, "0")}:${Math.floor(s % 60)
      .toString()
      .padStart(2, "0")}`;
  }

  async function handleTranscribe() {
    if (!file) return setError("Please select an audio or video file first.");
    setTranscribing(true);
    setError("");
    setTranscript("");
    setNotes("");
    setQuiz([]);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${API_URL}/api/transcribe`, {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Transcription failed.");
      setTranscript(data.transcript || "");
      setSegments(data.segments || []);
      setLanguage(data.language || "Unknown");
      setDuration(typeof data.duration === "number" ? data.duration : null);
      if (!data.transcript?.trim()) setError("No speech was detected.");
      else {
        await saveLectureAnalytics({
          title: file.name.replace(/\.[^.]+$/, ""),
          file_name: file.name,
          duration_seconds:
            typeof data.duration === "number" ? data.duration : 0,
          transcript_chars: String(data.transcript || "").length,
        });
      }
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Could not connect to the transcription server.",
      );
    } finally {
      setTranscribing(false);
    }
  }

  async function handleGenerateNotes() {
    if (!transcript.trim())
      return setNotesError("Generate a transcript first.");
    setGeneratingNotes(true);
    setNotesError("");
    setNotes("");
    try {
      const res = await fetch(`${API_URL}/api/generate-notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to generate notes.");
      setNotes(data.notes || "");
      setNotesModel(data.model || "Groq");
    } catch (e) {
      setNotesError(
        e instanceof Error ? e.message : "Could not generate notes.",
      );
    } finally {
      setGeneratingNotes(false);
    }
  }

  async function handleGenerateQuiz() {
    const content = notes.trim() || transcript.trim();
    if (!content)
      return setQuizError("Generate a transcript or study notes first.");
    setGeneratingQuiz(true);
    setQuizError("");
    setQuiz([]);
    setAnswers({});
    setSubmitted(false);
    try {
      const res = await fetch(`${API_URL}/api/generate-quiz`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to generate quiz.");
      if (!Array.isArray(data.questions) || data.questions.length !== 5)
        throw new Error("The AI returned an invalid quiz. Try again.");
      setQuiz(data.questions);
    } catch (e) {
      setQuizError(e instanceof Error ? e.message : "Could not generate quiz.");
    } finally {
      setGeneratingQuiz(false);
    }
  }

  async function submitQuiz() {
    if (Object.keys(answers).length !== quiz.length) {
      setQuizError("Please answer all 5 questions before submitting.");
      return;
    }
    setQuizError("");
    setSubmitted(true);
    await saveQuizAnalytics(score);
  }

  async function copyTranscript() {
    try {
      await navigator.clipboard.writeText(transcript);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("Unable to copy transcript.");
    }
  }
  function downloadNotes() {
    const url = URL.createObjectURL(
      new Blob([notes], { type: "text/markdown;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "lecture_study_notes.md";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="min-h-screen bg-[#090b10] text-white">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-white/10 bg-[#0d1017] p-6 md:block">
        <div className="mb-12 flex items-center gap-3">
          <div className="rounded-xl bg-violet-600 p-2">
            <BookOpen size={23} />
          </div>
          <div>
            <h1 className="text-lg font-bold">LecToNote</h1>
            <p className="text-xs text-gray-500">Your AI study space</p>
          </div>
        </div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-500">
          Workspace
        </p>
        <nav className="space-y-2">
          <button
            onClick={() =>
              document
                .getElementById("lectures")
                ?.scrollIntoView({ behavior: "smooth" })
            }
            className="flex w-full cursor-pointer items-center gap-3 rounded-lg bg-violet-300/15 px-4 py-3 text-left text-violet-300 hover:text-white"
          >
            <Files size={19} />
            My Lectures
          </button>
          {transcript.trim() && !transcribing && (
            <button
              onClick={() =>
                document
                  .getElementById("ai-study-notes")
                  ?.scrollIntoView({ behavior: "smooth" })
              }
              className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-4 py-3 text-left bg-violet-300/15 text-violet-300 hover:text-white"
            >
              <BookOpen size={19} />
              Study Notes
            </button>
          )}
          {transcript.trim() && !transcribing && (
            <button
              onClick={() =>
                document
                  .getElementById("ai-quiz")
                  ?.scrollIntoView({ behavior: "smooth" })
              }
              className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-4 py-3 text-left bg-violet-300/15 text-violet-300 hover:text-white"
            >
              <Sparkles size={19} />
              AI Learning
            </button>
          )}
          {transcript.trim() && !transcribing && (
            <button
              onClick={() =>
                document
                  .getElementById("study-analytics")
                  ?.scrollIntoView({ behavior: "smooth" })
              }
              className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-4 py-3 text-left bg-violet-300/15 text-violet-300 hover:text-white"
            >
              <ChartNoAxesCombined size={19} />
              Study Analytics
            </button>
          )}
          <button
            onClick={() =>
              document
                .getElementById("about")
                ?.scrollIntoView({ behavior: "smooth" })
            }
            className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-4 py-3 text-left bg-violet-300/15 text-violet-300 hover:text-white"
          >
            <Info size={19} />
            About
          </button>
        </nav>
        <div className="absolute bottom-6 left-6 right-6 rounded-xl border border-white/10 p-4">
          <p className="text-sm font-medium">Study smarter</p>
          <p className="mt-1 text-xs leading-5 text-gray-500">
            Turn long lectures into useful study material.
          </p>
        </div>
      </aside>

      <section id="lectures" className="px-5 py-7 md:ml-64 md:px-10 md:py-10">
        <header className="mb-10 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm text-gray-500">YOUR WORKSPACE</p>
            <h2 className="mt-2 text-3xl font-bold">My Lectures</h2>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-white/10 px-3 py-2 text-sm text-gray-400">
            <Sparkles size={16} className="text-violet-400" />
            AI-powered learning
          </div>
        </header>
        <h3 className="text-xl font-semibold">Turn lectures into knowledge.</h3>
        <p className="mt-2 mb-8 text-sm text-gray-400">
          Upload a recording to generate transcripts, notes, and revision
          material.
        </p>
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null))
              setDragging(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            chooseFile(e.dataTransfer.files[0]);
          }}
          onClick={() => {
            if (!file) inputRef.current?.click();
          }}
          className={`rounded-2xl border-2 border-dashed p-8 text-center sm:p-14 ${dragging ? "border-violet-400 bg-violet-500/10" : "border-white/15 bg-[#11141d] hover:border-violet-500/60"} ${!file ? "cursor-pointer" : "cursor-default"}`}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".mp3,.wav,.m4a,.ogg,.mp4,.webm,.mpeg,.mpga"
            className="hidden"
            onChange={(e) => {
              chooseFile(e.target.files?.[0]);
              e.currentTarget.value = "";
            }}
          />
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-violet-500/15 text-violet-300">
            <Upload size={30} />
          </div>
          <h3 className="text-lg font-semibold">
            {file ? "Lecture selected" : "Upload your lecture"}
          </h3>
          <p className="mx-auto mt-2 max-w-md text-sm text-gray-400">
            Drag and drop an audio or video file, or click to browse.
          </p>
          <p className="mt-4 text-xs text-gray-500">
            MP3, WAV, M4A, OGG, MP4, WebM · Maximum 100 MB
          </p>
          {file && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="mx-auto mt-6 flex max-w-md items-center gap-3 rounded-xl border border-white/10 bg-[#090b10] p-4 text-left"
            >
              {/\.(mp4|webm)$/i.test(file.name) ? <FileVideo /> : <FileAudio />}
              <span className="min-w-0 flex-1 truncate text-sm">
                {file.name}
              </span>
              <button className="cursor-pointer" onClick={removeFile}>
                <X size={18} />
              </button>
            </div>
          )}
          {!file && (
            <button
              className={`${btn} mt-6`}
              onClick={(e) => {
                e.stopPropagation();
                inputRef.current?.click();
              }}
            >
              Choose a file
            </button>
          )}
        </div>
        <div className="mt-6 flex justify-center">
          <button
            onClick={handleTranscribe}
            disabled={!file || transcribing}
            className={btn}
          >
            {transcribing ? (
              <>
                <LoaderCircle className="mr-2 inline animate-spin" />
                Transcribing...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 inline" />
                Generate Transcript
              </>
            )}
          </button>
        </div>
        {error && (
          <p
            role="alert"
            className="mt-5 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400"
          >
            {error}
          </p>
        )}
        {transcript && !transcribing && (
          <section className="mt-10 rounded-2xl border border-white/10 bg-[#11141d] p-5 sm:p-7">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-xl font-semibold">Lecture Transcript</h3>
                <p className="mt-2 text-sm text-gray-400">
                  Language: {language}
                  {duration !== null &&
                    ` · Duration: ${Math.floor(duration / 60)}m ${Math.round(duration % 60)}s`}
                </p>
              </div>
              <button
                onClick={copyTranscript}
                className="cursor-pointer rounded-lg border border-white/10 px-4 py-2 text-sm"
              >
                {copied ? (
                  <Check className="mr-2 inline" />
                ) : (
                  <Copy className="mr-2 inline" />
                )}
                {copied ? "Copied!" : "Copy Transcript"}
              </button>
            </div>
            <div className="max-h-[500px] overflow-y-auto whitespace-pre-wrap break-words rounded-xl bg-[#090b10] p-5 text-sm leading-7 text-gray-300">
              {transcript}
            </div>
            <h4 className="mb-4 mt-8 flex items-center gap-2 text-lg font-semibold">
              <Clock3 className="text-violet-400" />
              Timestamped Segments
            </h4>
            <div className="space-y-3">
              {segments.map((s, i) => (
                <div
                  key={`${s.start}-${i}`}
                  className="flex gap-4 rounded-xl bg-white/5 p-4"
                >
                  <span className="font-mono text-xs text-violet-300">
                    {time(s.start)}
                  </span>
                  <p className="text-sm leading-6 text-gray-300">{s.text}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {transcript && !transcribing && (
          <section
            id="ai-study-notes"
            className="mt-8 scroll-mt-8 rounded-2xl border border-violet-500/20 bg-[#11141d] p-5 sm:p-7"
          >
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
              <div className="flex items-center gap-3">
                <BrainCircuit className="text-violet-300" size={27} />
                <div>
                  <h3 className="text-xl font-semibold">AI Study Notes</h3>
                  <p className="mt-1 text-sm text-gray-400">
                    Powered by Groq AI
                  </p>
                </div>
              </div>
              <button
                onClick={handleGenerateNotes}
                disabled={generatingNotes}
                className={btn}
              >
                {generatingNotes ? (
                  <>
                    <LoaderCircle className="mr-2 inline animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 inline" />
                    {notes ? "Regenerate Notes" : "Generate AI Notes"}
                  </>
                )}
              </button>
            </div>
            <p className="mt-4 text-sm text-gray-400">
              Create structured notes, key concepts, a revision summary, and
              practice questions.
            </p>
            {notesError && (
              <p role="alert" className="mt-4 text-sm text-red-400">
                {notesError}
              </p>
            )}
            {notes && (
              <>
                <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm text-gray-400">
                  Generated study material · {notesModel}
                  <button
                    onClick={downloadNotes}
                    className="cursor-pointer rounded-lg border border-white/10 px-3 py-2 text-white"
                  >
                    <Download className="mr-2 inline" size={15} />
                    Download Markdown
                  </button>
                </div>
                <article className="mt-4 whitespace-pre-wrap break-words rounded-xl bg-[#090b10] p-5 text-sm leading-7 text-gray-300">
                  {notes}
                </article>
              </>
            )}
          </section>
        )}

        {transcript.trim() && !transcribing && (
          <section
            id="ai-quiz"
            className="mt-8 scroll-mt-8 rounded-2xl border border-white/10 bg-[#11141d] p-5 sm:p-7"
          >
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
              <div className="flex items-center gap-3">
                <ListChecks size={27} className="text-violet-300" />
                <div>
                  <h3 className="text-xl font-semibold">
                    AI Learning · Interactive Quiz
                  </h3>
                  <p className="mt-1 text-sm text-gray-400">
                    Five multiple-choice questions based on your lecture.
                  </p>
                </div>
              </div>
              <button
                onClick={handleGenerateQuiz}
                disabled={
                  generatingQuiz || (!transcript.trim() && !notes.trim())
                }
                className={btn}
              >
                {generatingQuiz ? (
                  <>
                    <LoaderCircle className="mr-2 inline animate-spin" />
                    Generating Quiz...
                  </>
                ) : quiz.length ? (
                  "Generate New Quiz"
                ) : (
                  "Generate Quiz"
                )}
              </button>
            </div>
            {quizError && (
              <p role="alert" className="mt-4 text-sm text-red-400">
                {quizError}
              </p>
            )}
            {generatingQuiz && (
              <p className="mt-5 text-gray-300">
                Groq is creating your questions...
              </p>
            )}
            {quiz.length > 0 && !generatingQuiz && (
              <div className="mt-6 space-y-6">
                <div className="flex justify-between text-sm text-gray-400">
                  <span>Answer all questions</span>
                  {submitted && (
                    <strong className="text-violet-300">
                      Score: {score}/{quiz.length}
                    </strong>
                  )}
                </div>
                {quiz.map((q, i) => (
                  <div
                    key={q.question + i}
                    className="rounded-xl border border-white/10 bg-[#090b10] p-5"
                  >
                    <h4 className="font-semibold">
                      <span className="mr-2 text-violet-400">Q{i + 1}.</span>
                      {q.question}
                    </h4>
                    <div className="mt-4 space-y-2">
                      {q.options.map((opt, j) => {
                        const correct = q.answer === j;
                        const selected = answers[i] === j;
                        let style =
                          "border-white/10 hover:border-violet-500/50";
                        if (submitted && correct)
                          style = "border-emerald-500 bg-emerald-500/10";
                        else if (submitted && selected)
                          style = "border-red-500 bg-red-500/10";
                        else if (selected)
                          style = "border-violet-500 bg-violet-500/10";
                        return (
                          <button
                            key={j}
                            disabled={submitted}
                            onClick={() =>
                              setAnswers((prev) => ({ ...prev, [i]: j }))
                            }
                            className={`flex w-full cursor-pointer items-center gap-3 rounded-lg border p-3 text-left text-sm ${style} disabled:cursor-default`}
                          >
                            <span className="rounded-full bg-white/5 px-2 py-1">
                              {String.fromCharCode(65 + j)}
                            </span>
                            <span className="flex-1">{opt}</span>
                            {submitted && correct && (
                              <Check className="text-emerald-400" size={18} />
                            )}
                          </button>
                        );
                      })}
                    </div>
                    {submitted && (
                      <div className="mt-4 rounded-lg bg-white/5 p-4 text-sm leading-6">
                        <p
                          className={
                            answers[i] === q.answer
                              ? "text-emerald-400"
                              : "text-red-400"
                          }
                        >
                          {answers[i] === q.answer ? "Correct!" : "Incorrect"}
                        </p>
                        <p className="mt-2 text-gray-300">
                          Correct answer: {q.options[q.answer]}
                        </p>
                        <p className="mt-2 text-gray-400">{q.explanation}</p>
                      </div>
                    )}
                  </div>
                ))}
                {!submitted ? (
                  <button className={`${btn} w-full`} onClick={submitQuiz}>
                    Submit Answers
                  </button>
                ) : (
                  <div className="rounded-xl bg-violet-500/10 p-5 text-center">
                    <h4 className="text-xl font-bold">
                      You scored {score} out of {quiz.length}
                    </h4>
                    <button
                      className={`${btn} mt-4`}
                      onClick={() => {
                        setAnswers({});
                        setSubmitted(false);
                        setQuizError("");
                      }}
                    >
                      Try Again
                    </button>
                  </div>
                )}
              </div>
            )}
            {!quiz.length && !generatingQuiz && !quizError && (
              <div className="mt-6 rounded-xl border border-dashed border-white/10 p-6 text-center">
                <BrainCircuit className="mx-auto text-violet-400" size={30} />
                <p className="mt-3 font-medium">Ready to test yourself?</p>
                <p className="mt-2 text-sm text-gray-500">
                  Generate a transcript first, then create your quiz.
                </p>
              </div>
            )}
          </section>
        )}
        {transcript.trim() && !transcribing && (
          <section
            id="study-analytics"
            className="mt-12 scroll-mt-8 rounded-2xl border border-white/10 bg-[#11141d] p-5 sm:p-7"
          >
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
              <div className="flex items-center gap-3">
                <ChartNoAxesCombined size={28} className="text-violet-300" />
                <div>
                  <h3 className="text-xl font-semibold">Study Analytics</h3>
                  <p className="mt-1 text-sm text-gray-400">
                    Your saved lecture and quiz progress
                  </p>
                </div>
              </div>
              <button
                onClick={() => void loadAnalytics()}
                disabled={!clientId || analyticsLoading}
                className="cursor-pointer rounded-xl border border-white/10 px-4 py-2 text-sm text-gray-200 hover:bg-white/5 disabled:opacity-50"
              >
                <RefreshCw
                  size={15}
                  className={`mr-2 inline ${analyticsLoading ? "animate-spin" : ""}`}
                />
                Refresh
              </button>
            </div>
            {analyticsNotice && (
              <p
                role="status"
                className="mt-4 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-amber-300"
              >
                {analyticsNotice}
              </p>
            )}
            {analyticsError && (
              <div className="mt-5 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300">
                <p>{analyticsError}</p>
                <p className="mt-1 text-xs text-red-200/70">
                  Check that MongoDB is configured and the FastAPI server is
                  running.
                </p>
              </div>
            )}
            {analyticsLoading && !analytics && (
              <p className="mt-6 text-sm text-gray-400">
                Loading your analytics...
              </p>
            )}
            {analytics && (
              <>
                <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {[
                    {
                      label: "Lectures processed",
                      value: analytics.total_lectures,
                      icon: Files,
                      sub: "Saved in MongoDB",
                    },
                    {
                      label: "Total lecture duration",
                      value: `${Math.round(analytics.total_lecture_minutes * 10) / 10} min`,
                      icon: Clock3,
                      sub: "Duration of processed media",
                    },
                    {
                      label: "Quiz attempts",
                      value: analytics.quiz_attempts,
                      icon: Trophy,
                      sub: "Submitted quizzes",
                    },
                    {
                      label: "Average accuracy",
                      value: `${analytics.average_accuracy}%`,
                      icon: Target,
                      sub: `${analytics.correct_answers}/${analytics.total_questions_answered} answers correct`,
                    },
                  ].map((card) => (
                    <div
                      key={card.label}
                      className="rounded-xl border border-white/10 bg-[#090b10] p-4"
                    >
                      <card.icon size={20} className="text-violet-300" />
                      <p className="mt-4 text-sm text-gray-400">{card.label}</p>
                      <p className="mt-1 text-2xl font-bold">{card.value}</p>
                      <p className="mt-1 text-xs text-gray-500">{card.sub}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-5 grid gap-5 xl:grid-cols-2">
                  <div className="rounded-xl border border-white/10 bg-[#090b10] p-5">
                    <div className="mb-5 flex items-center gap-2">
                      <CalendarDays size={18} className="text-violet-300" />
                      <h4 className="font-semibold">Last 7 days</h4>
                    </div>
                    <div className="grid grid-cols-7 gap-2">
                      {analytics.weekly_activity.map((day) => {
                        const max = Math.max(
                          1,
                          ...analytics.weekly_activity.map(
                            (d) => d.lectures + d.quiz_attempts,
                          ),
                        );
                        const count = day.lectures + day.quiz_attempts;
                        return (
                          <div
                            key={day.date}
                            className="flex min-w-0 flex-col items-center gap-2"
                          >
                            <div className="flex h-28 w-full items-end justify-center rounded-md bg-white/[0.03] px-1">
                              <div
                                title={`${day.lectures} lectures, ${day.quiz_attempts} quiz attempts`}
                                className="w-full max-w-7 rounded-t-md bg-violet-500"
                                style={{
                                  height: `${count ? Math.max(8, (count / max) * 100) : 2}%`,
                                }}
                              />
                            </div>
                            <span className="text-[10px] text-gray-500">
                              {day.label}
                            </span>
                            <span className="text-xs text-gray-300">
                              {count}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    <p className="mt-4 text-xs text-gray-500">
                      Bars show lectures processed plus quiz attempts. Minutes
                      refer to the duration of uploaded media, not measured
                      study time.
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-[#090b10] p-5">
                    <h4 className="mb-4 font-semibold">
                      Quiz performance by lecture
                    </h4>
                    {analytics.topic_performance.length ? (
                      <div className="space-y-4">
                        {analytics.topic_performance
                          .slice(0, 6)
                          .map((topic) => (
                            <div key={topic.topic}>
                              <div className="mb-2 flex items-center justify-between gap-3">
                                <span className="min-w-0 truncate text-sm text-gray-300">
                                  {topic.topic}
                                </span>
                                <span
                                  className={`text-sm ${topic.accuracy < 60 ? "text-red-300" : topic.accuracy < 80 ? "text-amber-300" : "text-emerald-300"}`}
                                >
                                  {topic.accuracy}%
                                </span>
                              </div>
                              <div className="h-2 overflow-hidden rounded-full bg-white/10">
                                <div
                                  className={`h-full rounded-full ${topic.accuracy < 60 ? "bg-red-400" : topic.accuracy < 80 ? "bg-amber-400" : "bg-emerald-400"}`}
                                  style={{ width: `${topic.accuracy}%` }}
                                />
                              </div>
                              <p className="mt-1 text-xs text-gray-500">
                                {topic.attempts} attempt
                                {topic.attempts === 1 ? "" : "s"}
                              </p>
                            </div>
                          ))}
                      </div>
                    ) : (
                      <div className="rounded-lg border border-dashed border-white/10 p-6 text-center">
                        <Target size={25} className="mx-auto text-gray-500" />
                        <p className="mt-3 text-sm text-gray-300">
                          No quiz results yet
                        </p>
                        <p className="mt-1 text-xs text-gray-500">
                          Submit a quiz to see your accuracy by lecture.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
                <div className="mt-5 rounded-xl border border-white/10 bg-[#090b10] p-5">
                  <h4 className="mb-4 font-semibold">Recent activity</h4>
                  {analytics.recent_activity.length ? (
                    <div className="space-y-3">
                      {analytics.recent_activity.slice(0, 8).map((item, i) => (
                        <div
                          key={`${item.created_at}-${i}`}
                          className="flex items-start gap-3 border-b border-white/5 pb-3 last:border-0 last:pb-0"
                        >
                          <div className="mt-0.5 rounded-lg bg-violet-500/10 p-2 text-violet-300">
                            {item.type === "quiz" ? (
                              <ListChecks size={16} />
                            ) : (
                              <FileAudio size={16} />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm text-gray-200">
                              {item.title}
                            </p>
                            <p className="mt-1 text-xs text-gray-500">
                              {item.detail}
                            </p>
                          </div>
                          <time className="shrink-0 text-xs text-gray-500">
                            {new Date(item.created_at).toLocaleDateString()}
                          </time>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">
                      Your lecture and quiz activity will appear here after you
                      use the app.
                    </p>
                  )}
                </div>
              </>
            )}
          </section>
        )}

        <hr className="mt-6 border-t border-dotted border-white/20" />
        <section id="about" className="mt-10 scroll-mt-8">
          <div id="about" className="mt-10 grid gap-4 sm:grid-cols-3">
            {[
              {
                icon: FileAudio,
                title: "Smart Transcription",
                text: "Convert speech into timestamped text.",
              },
              {
                icon: BrainCircuit,
                title: "Groq AI Study Notes",
                text: "Generate summaries and key concepts.",
              },
              {
                icon: Search,
                title: "Interactive AI Quiz",
                text: "Practice questions and review explanations.",
              },
            ].map((item) => (
              <div
                key={item.title}
                className="rounded-2xl border border-white/10 bg-[#11141d] p-5"
              >
                <item.icon className="mb-4 text-violet-400" size={23} />
                <h4 className="font-semibold">{item.title}</h4>
                <p className="mt-2 text-sm text-gray-400">{item.text}</p>
              </div>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}

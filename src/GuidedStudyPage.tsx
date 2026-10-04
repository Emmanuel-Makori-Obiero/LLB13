import { useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  GraduationCap,
  Headphones,
  Loader2,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { Markdown } from "./Markdown";
import { askAI } from "./lib/ai";
import { generateAudio } from "./lib/cloudMedia";
import {
  createGuidedCourse,
  evaluateWrittenCheckpoint,
  getCourseProgress,
  listGuideSources,
  listGuidedCourses,
  resumeLessonIndex,
  saveLessonProgress,
  type CourseProgress,
  type GuidedCourse,
  type GuideLesson,
  type SourceChoice,
  type StudyLanguage,
} from "./lib/guidedStudy";
import { downloadPdf, downloadWord } from "./export";

type LessonAudio = { url: string; mimeType: string; courseId: string; lessonIndex: number };

export default function GuidedStudyPage() {
  const [sources, setSources] = useState<SourceChoice[]>([]);
  const [courses, setCourses] = useState<GuidedCourse[]>([]);
  const [course, setCourse] = useState<GuidedCourse | null>(null);
  const [progress, setProgress] = useState<CourseProgress[]>([]);
  const [subject, setSubject] = useState("Torts");
  const [preferences, setPreferences] = useState(
    "Teach in plain language, use memorable stories and Kenyan law where the sources support it. Explain first, then quiz me.",
  );
  const [selected, setSelected] = useState<string[]>([]);
  const [lessonIndex, setLessonIndex] = useState(0);
  const [picked, setPicked] = useState<Record<number, number>>({});
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [writtenAnswer, setWrittenAnswer] = useState("");
  const [visibility, setVisibility] = useState<"private" | "group">("private");
  const [courseLanguage, setCourseLanguage] = useState<StudyLanguage>("en");
  const [lessonAudio, setLessonAudio] = useState<LessonAudio | null>(null);
  const [audioBusy, setAudioBusy] = useState(false);
  const activeLessonKey = useRef("");
  const audioRequestId = useRef(0);
  const openRequestId = useRef(0);
  const progressRequestId = useRef(0);
  const lessonActionId = useRef(0);

  const load = async () => {
    try {
      const [available, saved] = await Promise.all([
        listGuideSources(),
        listGuidedCourses(),
      ]);
      const withProgress = await Promise.all(
        saved.map(async (item) => {
          try {
            const rows = await getCourseProgress(item.id);
            return {
              ...item,
              progress: Math.round(
                (rows.filter((row) => row.status === "completed").length /
                  Math.max(1, item.syllabus.lessons.length)) *
                  100,
              ),
            };
          } catch {
            return item;
          }
        }),
      );
      setSources(available);
      setCourses(withProgress);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not load saved sources.");
    }
  };

  useEffect(() => { void load(); }, []);
  useEffect(() => {
    activeLessonKey.current = `${course?.id ?? ""}:${lessonIndex}`;
    audioRequestId.current += 1;
    setLessonAudio(null);
    setAudioBusy(false);
  }, [course?.id, lessonIndex]);
  useEffect(() => {
    if (!course) {
      setProgress([]);
      return;
    }
    const requestId = ++progressRequestId.current;
    const courseId = course.id;
    void getCourseProgress(courseId)
      .then((rows) => { if (requestId === progressRequestId.current) setProgress(rows); })
      .catch((error: Error) => { if (requestId === progressRequestId.current) setNotice(error.message); });
    return () => {
      if (progressRequestId.current === requestId) progressRequestId.current += 1;
    };
  }, [course?.id]);

  const lesson: GuideLesson | undefined = course?.syllabus.lessons[lessonIndex];
  const lessonProgress = useMemo(
    () => progress.find((item) => item.lesson_index === lessonIndex),
    [progress, lessonIndex],
  );
  const answered = lesson?.quiz.filter((_, index) => picked[index] !== undefined).length ?? 0;
  const score = lesson
    ? lesson.quiz.filter((question, index) => picked[index] === question.answerIndex).length
    : 0;

  const generate = async () => {
    lessonActionId.current += 1;
    audioRequestId.current += 1;
    setBusy(true);
    setNotice("Starting a staged read so every source section is covered…");
    try {
      const created = await createGuidedCourse(
        subject.trim(),
        sources.filter((source) => selected.includes(`${source.kind}:${source.id}`)),
        preferences,
        visibility,
        setNotice,
        courseLanguage,
      );
      activeLessonKey.current = `${created.id}:0`;
      setCourses((current) => [created, ...current.filter((item) => item.id !== created.id)]);
      setCourse(created);
      setLessonIndex(0);
      setPicked({});
      setProgress([]);
      setNotice("Syllabus ready. Your course card is saved below.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not create the syllabus.");
    } finally {
      setBusy(false);
    }
  };

  const open = async (next: GuidedCourse) => {
    const requestId = ++openRequestId.current;
    lessonActionId.current += 1;
    audioRequestId.current += 1;
    activeLessonKey.current = `${next.id}:0`;
    setBusy(true);
    setCourse(next);
    setProgress([]);
    setPicked({});
    setWrittenAnswer("");
    setLessonAudio(null);
    setAudioBusy(false);
    setNotice("Loading your saved progress…");
    try {
      const resumed = await resumeLessonIndex(next);
      if (requestId !== openRequestId.current) return;
      setProgress(resumed.progress);
      setLessonIndex(resumed.lessonIndex);
      setNotice(
        resumed.progress.some((item) => item.status === "completed")
          ? "Continuing from your next incomplete lesson."
          : "Starting Lesson 1.",
      );
    } catch (error) {
      if (requestId !== openRequestId.current) return;
      setNotice(error instanceof Error ? error.message : "Could not load progress.");
    } finally {
      if (requestId === openRequestId.current) setBusy(false);
    }
  };

  const closeCourse = () => {
    lessonActionId.current += 1;
    openRequestId.current += 1;
    progressRequestId.current += 1;
    audioRequestId.current += 1;
    activeLessonKey.current = "";
    setCourse(null);
    setLessonAudio(null);
    setAudioBusy(false);
    setWrittenAnswer("");
    setPicked({});
  };

  const submitWrittenAnswer = async () => {
    if (!course || !lesson || writtenAnswer.trim().length < 20) return;
    const requestId = ++lessonActionId.current;
    const lessonKey = `${course.id}:${lessonIndex}`;
    const answer = writtenAnswer;
    setBusy(true);
    setNotice("Evaluating your written answer and saving what you learned…");
    try {
      const result = await evaluateWrittenCheckpoint(
        course,
        lessonIndex,
        answer,
        lessonProgress?.last_answer,
      );
      if (requestId !== lessonActionId.current || activeLessonKey.current !== lessonKey) return;
      const savedProgress = await getCourseProgress(course.id);
      if (requestId !== lessonActionId.current || activeLessonKey.current !== lessonKey) return;
      setProgress(savedProgress);
      setCourse({ ...course, progress: result.progress });
      setNotice(
        result.checkpoint.passed
          ? "Checkpoint passed. Your next lesson is unlocked."
          : "Keep improving this step, then submit the revised answer.",
      );
    } catch (error) {
      if (requestId !== lessonActionId.current || activeLessonKey.current !== lessonKey) return;
      setNotice(error instanceof Error ? error.message : "Could not evaluate your answer.");
    } finally {
      if (requestId === lessonActionId.current) setBusy(false);
    }
  };

  const submit = async () => {
    if (!course || !lesson || !lesson.quiz.length || answered < lesson.quiz.length) return;
    const requestId = ++lessonActionId.current;
    const lessonKey = `${course.id}:${lessonIndex}`;
    const selectedAnswers = { ...picked };
    setBusy(true);
    try {
      const result = await saveLessonProgress(
        course,
        lessonIndex,
        Math.round((score / lesson.quiz.length) * 100),
        lesson.quiz.map((_, index) => selectedAnswers[index]),
      );
      if (requestId !== lessonActionId.current || activeLessonKey.current !== lessonKey) return;
      const savedProgress = await getCourseProgress(course.id);
      if (requestId !== lessonActionId.current || activeLessonKey.current !== lessonKey) return;
      setProgress(savedProgress);
      setCourse({ ...course, progress: result.progress });
      setNotice(
        result.status === "completed"
          ? "Checkpoint saved. Nice work—continue to the next lesson."
          : "Checkpoint saved. Repeat this lesson once more, then try the quiz again.",
      );
    } catch (error) {
      if (requestId !== lessonActionId.current || activeLessonKey.current !== lessonKey) return;
      setNotice(error instanceof Error ? error.message : "Could not save checkpoint.");
    } finally {
      if (requestId === lessonActionId.current) setBusy(false);
    }
  };

  const askFollowUp = async () => {
    if (!course || !lesson) return;
    const requestId = ++lessonActionId.current;
    const lessonKey = `${course.id}:${lessonIndex}`;
    setBusy(true);
    try {
      const readable = course.source_labels.filter((source) => source.kind !== "material");
      const sourceMode = !course.source_document_ids.length
        ? "general"
        : readable.length > 0 && readable.every((source) => source.kind === "document" && source.scope === "library")
          ? "library"
          : readable.some((source) => source.scope === "library")
            ? "auto"
            : "materials";
      const languageInstruction = course.syllabus.language === "sw"
        ? "Answer in fluent Kenyan Kiswahili and keep official authorities and case names in their original form."
        : "Answer in clear Kenyan English.";
      const result = await askAI({
        feature: "chat",
        mode: sourceMode,
        docIds: course.source_document_ids,
        messages: [{
          role: "user",
          content: `I am studying ${course.subject}, lesson ${lesson.title}. ${languageInstruction} Explain this lesson in an even simpler way and give one everyday story. Do not quiz me yet. Lesson: ${lesson.explanation}`,
        }],
      });
      if (requestId === lessonActionId.current && activeLessonKey.current === lessonKey) setNotice(result.answer);
    } catch (error) {
      if (requestId !== lessonActionId.current || activeLessonKey.current !== lessonKey) return;
      setNotice(error instanceof Error ? error.message : "Could not ask the tutor.");
    } finally {
      if (requestId === lessonActionId.current) setBusy(false);
    }
  };

  const makeLessonAudio = async () => {
    if (!course || !lesson || audioBusy) return;
    const requestId = ++audioRequestId.current;
    const courseId = course.id;
    const selectedLessonIndex = lessonIndex;
    const lessonKey = `${courseId}:${selectedLessonIndex}`;
    const narration = [
      lesson.title,
      `Learning goal: ${lesson.objective}`,
      lesson.explanation,
      lesson.example ? `Example: ${lesson.example}` : "",
    ].filter(Boolean).join("\n\n");
    setAudioBusy(true);
    setLessonAudio(null);
    setNotice("Creating natural lesson narration…");
    try {
      const result = await generateAudio({
        text: narration,
        title: `${course.subject} — ${lesson.title}`,
        language: course.syllabus.language ?? "en",
      });
      if (requestId !== audioRequestId.current || activeLessonKey.current !== lessonKey) return;
      setLessonAudio({ url: result.signed_url, mimeType: result.mime_type ?? "audio/mpeg", courseId, lessonIndex: selectedLessonIndex });
      setNotice("Lesson audio is ready. Use the player or download it for later.");
    } catch (error) {
      if (requestId === audioRequestId.current && activeLessonKey.current === lessonKey) {
        setNotice(error instanceof Error ? error.message : "Could not create lesson audio.");
      }
    } finally {
      if (requestId === audioRequestId.current) setAudioBusy(false);
    }
  };

  const goToLesson = (nextIndex: number) => {
    if (!course) return;
    lessonActionId.current += 1;
    audioRequestId.current += 1;
    activeLessonKey.current = `${course.id}:${nextIndex}`;
    setLessonAudio(null);
    setAudioBusy(false);
    setLessonIndex(nextIndex);
    setPicked({});
    setWrittenAnswer("");
  };

  const exportCourse = (kind: "word" | "pdf") => {
    if (!course) return;
    const text = [
      course.syllabus.overview,
      ...course.syllabus.lessons.map((item, index) =>
        `## Lesson ${index + 1}: ${item.title}\n\n**Goal:** ${item.objective}\n\n${item.explanation}\n\n${item.example ? `**Story / example**\n\n${item.example}\n\n` : ""}### Checkpoint\n\n${item.quiz.map((question, questionIndex) => `${questionIndex + 1}. ${question.question}\n   ${question.options.map((option, optionIndex) => `${String.fromCharCode(65 + optionIndex)}. ${option}`).join("\n   ")}`).join("\n\n")}`,
      ),
    ].join("\n\n");
    const options = {
      eyebrow: "Group 13 · Guided study",
      subtitle: `${course.subject} · ${course.syllabus.lessons.length} lessons`,
      sources: course.source_labels.map((source) => `${source.title} (${source.kind === "material" ? "Library material" : source.scope === "library" ? "Library book" : source.kind === "transcript" ? "Saved transcript" : "My saved document"})`),
      footer: "Prepared in Group 13 · Review authorities against the original source",
    };
    if (kind === "word") downloadWord(course.title, text, `${course.subject.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-guided-study.doc`, options);
    else downloadPdf(course.title, text, `${course.subject.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-guided-study.pdf`, options);
  };

  return (
    <section className="guide-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">Source-grounded learning path</div>
          <h1 className="heading">Guided study.</h1>
          <p className="subheading">Choose your books and saved transcripts. The tutor builds a syllabus, teaches one step at a time, revisits weak areas, and saves your progress.</p>
        </div>
        <div className="guide-icon"><GraduationCap size={30} /></div>
      </div>
      {notice && <div className="guide-notice" aria-live="polite">{notice}</div>}

      {!course && <>
        <div className="card card-pad guide-builder">
          <div className="section-label">Build a new guided syllabus</div>
          <label>Subject or unit<input value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="e.g. Torts: negligence" /></label>
          <label>Course and narration language
            <select value={courseLanguage} onChange={(event) => setCourseLanguage(event.target.value as StudyLanguage)}>
              <option value="en">English · Kenyan English voice</option>
              <option value="sw">Kiswahili · sauti ya Kiswahili</option>
            </select>
            <small className="field-hint">The syllabus, quizzes, written feedback and generated audio follow this choice. Authorities and case names stay in their official form.</small>
          </label>
          <label>Teaching preferences<textarea value={preferences} onChange={(event) => setPreferences(event.target.value)} rows={3} /></label>
          <div className="card card-pad guide-visibility">
            <div className="section-label">Who can see this syllabus?</div>
            <div className="ta-share-choice" role="radiogroup">
              <label className={visibility === "private" ? "on" : ""}><input type="radio" name="syllabus-visibility" checked={visibility === "private"} onChange={() => setVisibility("private")} /> Only me</label>
              <label className={visibility === "group" ? "on" : ""}><input type="radio" name="syllabus-visibility" checked={visibility === "group"} onChange={() => setVisibility("group")} /> Share with Group 13</label>
            </div>
            <p className="field-hint">You can choose whether other signed-in group members can open the generated course.</p>
          </div>
          <div className="guide-source-head">
            <div><div className="section-label">Choose source books and saved transcripts</div><p className="field-hint">Library books can be combined with your own documents and saved transcripts.</p></div>
            <button className="secondary-button" onClick={() => void load()}><RefreshCw size={13} /> Refresh</button>
          </div>
          <div className="guide-source-list">
            {sources.length ? sources.map((source) => {
              const key = `${source.kind}:${source.id}`;
              const on = selected.includes(key);
              return <button type="button" key={key} className={`guide-source ${on ? "selected" : ""}`} onClick={() => setSelected((current) => on ? current.filter((item) => item !== key) : [...current, key])}>
                <BookOpen size={16} />
                <span><strong>{source.title}</strong><small>{source.kind === "material" ? "Library material · linked reference" : source.scope === "library" ? "Library book · AI-readable" : source.kind === "transcript" ? "Saved transcript" : "My saved document"}{source.citation ? ` · ${source.citation}` : ""}</small></span>
                <span className="guide-check">{on ? "Selected" : "Choose"}</span>
              </button>;
            }) : <p className="empty">Save a book/document in the Library or finish a transcript first.</p>}
          </div>
          <button className="primary-button" disabled={busy || !subject.trim() || !selected.length} onClick={() => void generate()}><Sparkles size={14} /> {busy ? "Building…" : "Build my guided syllabus"}</button>
        </div>
        {!!courses.length && <div className="card card-pad">
          <div className="section-label">Your saved guided syllabi</div>
          <div className="guide-courses">{courses.map((item) => <article className="guide-course" key={item.id}>
            <div><strong>{item.subject}</strong><span>{item.syllabus.lessons.length} lessons · {item.source_labels.length} sources · {item.syllabus.language === "sw" ? "Kiswahili" : "English"} · {item.visibility === "group" ? "Shared with Group 13" : "Only you"}</span></div>
            <div className="guide-mini-progress"><span style={{ width: `${item.progress}%` }} /></div><b>{item.progress}%</b>
            <button className="primary-button small-action" disabled={busy} onClick={() => void open(item)}>{item.progress > 0 && item.progress < 100 ? "Continue learning" : item.progress >= 100 ? "Review course" : "Start learning"} <ChevronRight size={13} /></button>
          </article>)}</div>
        </div>}
      </>}

      {course && lesson && <div className="guide-workspace">
        <button className="secondary-button" disabled={busy} onClick={closeCourse}><ChevronLeft size={14} /> All guided syllabi</button>
        <div className="card card-pad guide-hero">
          <div><div className="eyebrow">{course.subject} · {course.syllabus.language === "sw" ? "Kiswahili" : "English"}</div><h2>{course.title}</h2><p>{course.syllabus.overview}</p>
            <div className="export-actions guide-export-actions"><button className="secondary-button small-action" onClick={() => exportCourse("word")}><Download size={13} /> Word</button><button className="secondary-button small-action" onClick={() => exportCourse("pdf")}><Download size={13} /> PDF</button></div>
          </div>
          <div className="guide-progress-ring"><strong>{course.progress}%</strong><span>complete</span></div>
        </div>
        <div className="guide-layout">
          <aside className="card guide-outline">
            <div className="section-label">Course path</div>
            {course.syllabus.lessons.map((item, index) => <button key={`${item.title}-${index}`} disabled={busy} className={index === lessonIndex ? "active" : ""} onClick={() => goToLesson(index)}>
              <span className={`guide-dot ${progress.find((row) => row.lesson_index === index)?.status === "completed" ? "done" : ""}`}>{index + 1}</span>
              <span>{item.title}<small>{item.checkpoint === "exam" ? "Exam checkpoint" : "Kaizen quiz"}</small></span>
            </button>)}
          </aside>
          <main className="card card-pad guide-lesson">
            <div className="guide-lesson-top"><span>Lesson {lessonIndex + 1} of {course.syllabus.lessons.length}</span><span>{lesson.checkpoint === "exam" ? "Exam checkpoint" : "Short retrieval quiz"}</span></div>
            <div className="guide-audio-toolbar">
              <button className="secondary-button" onClick={() => void makeLessonAudio()} disabled={audioBusy}>
                {audioBusy ? <Loader2 size={14} className="studio-spin" /> : <Headphones size={14} />}
                {audioBusy ? "Creating natural audio…" : lessonAudio ? "Regenerate lesson audio" : "Listen to this lesson"}
              </button>
              <span>{course.syllabus.language === "sw" ? "Kiswahili voice" : "English voice"}</span>
            </div>
            <p className="field-hint">Generating audio sends the selected lesson text to ElevenLabs, uses your account quota, and saves private audio in Supabase. Avoid confidential client material.</p>
            {lessonAudio && lessonAudio.courseId === course.id && lessonAudio.lessonIndex === lessonIndex && <div className="guide-audio-player"><audio controls src={lessonAudio.url} /><a className="secondary-button" href={lessonAudio.url} download={`${course.subject.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-lesson-${lessonIndex + 1}.${lessonAudio.mimeType === "audio/mpeg" ? "mp3" : lessonAudio.mimeType === "audio/ogg" ? "ogg" : "wav"}`}><Download size={13} /> Download audio</a></div>}
            <h2>{lesson.title}</h2>
            <p className="guide-objective"><strong>Goal:</strong> {lesson.objective}</p>
            <div className="guide-explanation"><Markdown text={lesson.explanation} /></div>
            {lesson.example && <div className="guide-story"><strong>Story / example</strong><Markdown text={lesson.example} /></div>}
            <div className="card card-pad kaizen-checkpoint">
              <div className="section-label">Kaizen checkpoint · write it in your own words</div>
              <p className="field-hint">Type your explanation, rule, reasoning, or application. The tutor saves your answer and uses the feedback when teaching your next attempt.</p>
              <textarea rows={7} value={writtenAnswer} disabled={busy} onChange={(event) => setWrittenAnswer(event.target.value)} placeholder="State the rule, explain why it matters, and apply it to a short example…" />
              <button className="primary-button" onClick={() => void submitWrittenAnswer()} disabled={busy || writtenAnswer.trim().length < 20}>{busy ? "Checking your reasoning…" : "Submit written checkpoint"}</button>
              {lessonProgress?.last_answer && <div className="kaizen-feedback"><strong>Feedback · {lessonProgress.last_answer.score}%</strong><Markdown text={lessonProgress.last_answer.feedback} /><p><strong>Missing points:</strong> {lessonProgress.last_answer.missing_points.join("; ") || "None recorded."}</p><p><strong>Next step:</strong> {lessonProgress.last_answer.next_step}</p></div>}
            </div>
            <button className="secondary-button" onClick={() => void askFollowUp()} disabled={busy}><Sparkles size={13} /> Ask the tutor for a simpler explanation</button>
            <div className="guide-quiz">
              <div className="section-label">{lesson.checkpoint === "exam" ? "Checkpoint exam" : "Kaizen recall check"}</div>
              <p className="field-hint">Try the questions after the explanation. You can repeat this lesson whenever you need.</p>
              {lesson.quiz.map((question, questionIndex) => <div className="guide-question" key={`${question.question}-${questionIndex}`}>
                <strong>{questionIndex + 1}. {question.question}</strong>
                {question.options.map((option, optionIndex) => <button key={option} className={picked[questionIndex] === optionIndex ? "picked" : ""} disabled={busy || lessonProgress?.status === "completed"} onClick={() => setPicked((current) => ({ ...current, [questionIndex]: optionIndex }))}><span>{String.fromCharCode(65 + optionIndex)}</span>{option}</button>)}
                {picked[questionIndex] !== undefined && <p className={picked[questionIndex] === question.answerIndex ? "guide-right" : "guide-wrong"}>{picked[questionIndex] === question.answerIndex ? "Correct. " : "Not quite. "}{question.explanation}</p>}
              </div>)}
              {lesson.quiz.length > 0 && <div className="guide-submit"><span>{answered} of {lesson.quiz.length} answered{lessonProgress?.status === "repeat" ? " · Repeat recommended" : ""}</span><button className="primary-button" disabled={busy || answered < lesson.quiz.length || lessonProgress?.status === "completed"} onClick={() => void submit()}>{lessonProgress?.status === "completed" ? <><CheckCircle2 size={14} /> Completed</> : "Save checkpoint"}</button></div>}
            </div>
            <div className="guide-nav">
              <button className="secondary-button" disabled={busy || lessonIndex === 0} onClick={() => goToLesson(lessonIndex - 1)}><ChevronLeft size={14} /> Previous</button>
              <button className="primary-button" disabled={busy || lessonIndex === course.syllabus.lessons.length - 1} onClick={() => goToLesson(lessonIndex + 1)}>Next lesson <ChevronRight size={14} /></button>
            </div>
          </main>
        </div>
      </div>}
    </section>
  );
}

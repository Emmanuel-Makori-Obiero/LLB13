import { useEffect, useState } from "react";
import { Check, Clock3 } from "lucide-react";
import type { Lesson } from "./data/types";
import { supabase } from "./data/repository";

type CheckIn = { lesson_id: string; checked_in_at: string };
const nairobiDate = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

export default function AttendancePage({ lessons, userId }: { lessons: Lesson[]; userId: string | null }) {
  const [checked, setChecked] = useState<CheckIn[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const today = nairobiDate();
  useEffect(() => {
    if (!supabase || !userId) return;
    void supabase.from("class_attendance").select("lesson_id,checked_in_at").eq("user_id", userId).then(({ data, error: loadError }) => {
      if (loadError) setError(loadError.message);
      else setChecked((data ?? []) as CheckIn[]);
    });
  }, [userId]);
  const todaysLessons = lessons.filter((lesson) => lesson.lesson_date === today).sort((a, b) => (a.start_time ?? "").localeCompare(b.start_time ?? ""));
  const checkIn = async (lessonId: string) => {
    if (!supabase || !userId || busy) return;
    setBusy(lessonId); setError(""); setNotice("");
    const { data, error: insertError } = await supabase.from("class_attendance").insert({ lesson_id: lessonId, user_id: userId }).select("lesson_id,checked_in_at").single();
    if (insertError) {
      if (insertError.code === "23505") setNotice("You’re already checked in for this class.");
      else setError(insertError.message);
    } else if (data) {
      setChecked((items) => [...items, data as CheckIn]); setNotice("Attendance recorded.");
    }
    setBusy(null);
  };
  return <>
    <div className="page-heading"><div><div className="eyebrow">Group 13 class record</div><h1>Attendance.</h1><p className="subheading">Check in yourself for a scheduled class today. Check-ins are tied to your signed-in account.</p></div></div>
    <div className="card card-pad">
      <div className="card-header"><span className="section-label">Today · {new Date(`${today}T12:00:00+03:00`).toLocaleDateString("en-GB", { timeZone: "Africa/Nairobi", weekday: "long", day: "numeric", month: "long" })}</span><span className="quiet">{todaysLessons.length} scheduled</span></div>
      {error && <p className="connection-error">{error}</p>}{notice && <p className="field-hint">{notice}</p>}
      {!todaysLessons.length ? <p className="subheading">There are no Group 13 classes on the timetable for today.</p> : <div className="row-list">{todaysLessons.map((lesson) => {
        const record = checked.find((item) => item.lesson_id === lesson.id);
        return <div className="row" key={lesson.id}><div className="type-mark"><Clock3 size={16}/></div><div className="row-main"><div className="row-title">{lesson.unit} · {lesson.topic}</div><div className="row-meta">{lesson.start_time?.slice(0,5) ?? "Time TBA"}{lesson.end_time ? `–${lesson.end_time.slice(0,5)}` : ""}{lesson.venue ? ` · ${lesson.venue}` : ""}</div></div><div className="row-end">{record ? <span className="chip green"><Check size={13}/> Checked in {new Date(record.checked_in_at).toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Nairobi" })}</span> : <button className="primary-button" disabled={busy === lesson.id} onClick={() => void checkIn(lesson.id)}>{busy === lesson.id ? "Checking in…" : "Check in"}</button>}</div></div>;
      })}</div>}
    </div>
  </>;
}

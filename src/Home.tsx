import { CalendarDays, CheckSquare, FileText, Library } from "lucide-react";
import type { Assignment, Lesson, Todo } from "./data/types";
import LearningLoop from "./LearningLoop";

type Props = {
  name: string;
  lessons: Lesson[];
  todos: Todo[];
  assignments: Assignment[];
  userId: string | null;
  setPage: (id: string) => void;
};
const today = () => new Date().toISOString().slice(0, 10);
const hm = (t?: string | null) => (t ? t.slice(0, 5) : "");

export default function Home({
  name,
  lessons,
  todos,
  assignments,
  userId,
  setPage,
}: Props) {
  const t = today();
  const todayLessons = lessons.filter((l) => l.lesson_date === t);
  const next = lessons.filter((l) => l.lesson_date > t).slice(0, 3);
  const open = todos.filter((x) => !x.completed);
  const dueSoon = assignments
    .filter((a) => a.status !== "Completed")
    .slice(0, 3);
  const hour = new Date().getHours();
  const greet =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="heading">
            {greet}, {name}.
          </h1>
          <p className="subheading">Here is what matters today.</p>
        </div>
      </div>
      <LearningLoop
        assignments={assignments}
        lessons={lessons}
        userId={userId}
        onOpenArena={() => setPage("arena")}
      />
      <div className="home-grid">
        <div className="card card-pad">
          <div className="section-label">Today’s lessons</div>
          {todayLessons.length === 0 ? (
            <p className="field-hint">No lessons today.</p>
          ) : (
            todayLessons.map((l) => (
              <div className="home-line" key={l.id}>
                <strong>{hm(l.start_time) || "Today"}</strong> {l.topic}
                <span>{l.unit}</span>
              </div>
            ))
          )}
          {next.length > 0 && (
            <>
              <div className="section-label home-sub">Coming up</div>
              {next.map((l) => (
                <div className="home-line" key={l.id}>
                  <strong>
                    {new Date(l.lesson_date + "T00:00:00").toLocaleDateString(
                      "en-GB",
                      { weekday: "short", day: "numeric", month: "short" },
                    )}
                  </strong>{" "}
                  {l.topic}
                  <span>{l.unit}</span>
                </div>
              ))}
            </>
          )}
          <button className="link-button" onClick={() => setPage("timetable")}>
            Open timetable
          </button>
        </div>
        <div className="card card-pad">
          <div className="section-label">My to-do · {open.length} open</div>
          {open.slice(0, 4).map((x) => (
            <div className="home-line" key={x.id}>
              {x.title}
              {x.due && <span>Due {x.due}</span>}
            </div>
          ))}
          {open.length === 0 && (
            <p className="field-hint">You are all caught up.</p>
          )}
          <button className="link-button" onClick={() => setPage("todos")}>
            See all
          </button>
        </div>
        {dueSoon.length > 0 && (
          <div className="card card-pad">
            <div className="section-label">Assignments</div>
            {dueSoon.map((a) => (
              <div className="home-line" key={a.id}>
                {a.title}
                <span>
                  {a.unit} · due {a.due}
                </span>
              </div>
            ))}
            <button
              className="link-button"
              onClick={() => setPage("assignments")}
            >
              Open assignments
            </button>
          </div>
        )}
      </div>
      <div className="quick-row">
        <button onClick={() => setPage("timetable")}>
          <CalendarDays size={18} />
          Timetable
        </button>
        <button onClick={() => setPage("todos")}>
          <CheckSquare size={18} />
          To-do
        </button>
        <button onClick={() => setPage("assignments")}>
          <FileText size={18} />
          Assignments
        </button>
        <button onClick={() => setPage("library")}>
          <Library size={18} />
          Library
        </button>
      </div>
    </>
  );
}

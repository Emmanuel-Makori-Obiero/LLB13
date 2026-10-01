import {
  useEffect,
  useMemo,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import {
  BookOpen,
  Bell,
  CalendarDays,
  Check,
  CheckSquare,
  ChevronRight,
  Clock3,
  Download,
  FileText,
  Film,
  Gavel,
  LayoutDashboard,
  Library,
  LogOut,
  Maximize2,
  Menu,
  MessageSquare,
  Mic,
  Minimize2,
  MoreHorizontal,
  PenLine,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserCircle,
  Users,
  Video,
  X,
} from "lucide-react";
import {
  isSupabaseConfigured,
  repository,
  supabase,
  uploadUserAsset,
} from "./data/repository";
import type {
  Assignment,
  AssignmentStatus,
  Discussion,
  Lesson,
  Material,
  MediaResource,
  Member,
  Todo,
  Unit,
} from "./data/types";
import { unitReps } from "./data/types";
import MeetingRoom from "./MeetingRoom";
import LoginPage, { ResetPasswordPage } from "./AuthPage";
import { downloadInfo, readerUrl, safeUrl, toEmbedUrl } from "./links";
import AdminPage from "./AdminPage";
import InstallButton from "./InstallButton";
import { DeleteAccountCard } from "./AccountPage";
import Home from "./Home";
import TimetablePage from "./TimetablePage";
import TranscribePage from "./TranscribePage";
import { CounsellorChat } from "./CounsellorChat";
import { StudyAssistant } from "./StudyAssistant";
import { ResearchWriter } from "./ResearchWriter";
import { TranscriptAI } from "./TranscriptAI";
import { askAI, extractText, type AIFeature } from "./lib/ai";
import { Markdown } from "./Markdown";
import GrowthPage from "./GrowthPage";
import PracticeRoom from "./PracticeRoom";
import RealtimeJudgeRoom from "./RealtimeJudgeRoom";
import BookReader from "./BookReader";
import LearningStudio from "./LearningStudio";

const nav = [
  { id: "dashboard", label: "Home", icon: LayoutDashboard },
  { id: "timetable", label: "Timetable", icon: CalendarDays },
  { id: "todos", label: "My to-do", icon: CheckSquare },
  { id: "assignments", label: "Assignments", icon: FileText },
  { id: "library", label: "Library", icon: Library },
  { id: "units", label: "Units", icon: BookOpen },
  { id: "discussions", label: "Discussions", icon: MessageSquare },
  { id: "members", label: "Members", icon: Users },
  { id: "transcribe", label: "Transcribe", icon: Mic },
  { id: "media", label: "Media", icon: Film },
  { id: "assistant", label: "Study assistant", icon: Sparkles },
  { id: "research", label: "Research writer", icon: PenLine },
  { id: "arena", label: "Legal Arena", icon: Gavel },
  { id: "growth", label: "Growth studio", icon: Sparkles },
  { id: "counsellor", label: "Counsellor", icon: Users },
];
const validViews = new Set([
  ...nav.map((item) => item.id),
  "settings",
  "meeting",
  "unit",
  "reader",
  "assistant",
  "counsellor",
  "admin",
  "account",
]);
const viewFromPath = () => {
  const path = window.location.pathname.replace(/^\/+|\/+$/g, "");
  if (path.startsWith("meetings/")) return "meeting";
  if (path.startsWith("units/")) return "unit";
  if (path.startsWith("library/materials/")) return "reader";
  return path && validViews.has(path) ? path : "dashboard";
};
const statusOrder: AssignmentStatus[] = [
  "Not Started",
  "In Progress",
  "Submitted",
  "Under Review",
  "Corrections",
  "Completed",
];
const initials = "13";
const roomLink = (id: string) => `${window.location.origin}/meetings/${id}`;
const whatsappLink = (discussion: Discussion) =>
  `https://wa.me/?text=${encodeURIComponent(`Join "${discussion.title}" on Group 13: ${roomLink(discussion.id)}`)}`;
const profileInitials = (name: string, email = "") =>
  (name || email.split("@")[0] || initials)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
type UserProfile = {
  displayName: string;
  role: string;
  avatarUrl: string;
  wallpaperUrl: string;
};

function App() {
  const [authLoading, setAuthLoading] = useState(true);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [adminState, setAdminState] = useState<"unknown" | "yes" | "no">(
    "unknown",
  );
  const [recovering, setRecovering] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pathKey, setPathKey] = useState(() => window.location.pathname);
  const [profile, setProfile] = useState<UserProfile>({
    displayName: "",
    role: "LLB · Year 1",
    avatarUrl: "",
    wallpaperUrl: "",
  });
  const [view, setView] = useState(viewFromPath);
  const [units, setUnits] = useState<Unit[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [discussions, setDiscussions] = useState<Discussion[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [media, setMedia] = useState<MediaResource[]>([]);
  const [selectedUnit, setSelectedUnit] = useState("");
  const [transcribeUnit, setTranscribeUnit] = useState<string | undefined>();
  const [selectedAssignment, setSelectedAssignment] = useState("");
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState("");
  const [loadError, setLoadError] = useState("");
  const [activeMeeting, setActiveMeeting] = useState<Discussion | null>(null);
  const [activeMaterial, setActiveMaterial] = useState<Material | null>(null);
  const [materialFormOpen, setMaterialFormOpen] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<Material | null>(null);
  const [assignmentFormOpen, setAssignmentFormOpen] = useState(false);
  const isAdmin = adminState === "yes";

  useEffect(() => {
    if (!supabase) {
      setAuthLoading(false);
      return;
    }
    let active = true;
    const applySession = (
      session: {
        user?: {
          id?: string;
          email?: string;
          user_metadata?: Record<string, unknown>;
        };
      } | null,
    ) => {
      const metadata = session?.user?.user_metadata ?? {};
      setUserEmail(session?.user?.email ?? null);
      setUserId(session?.user?.id ?? null);
      setProfile({
        displayName:
          typeof metadata.display_name === "string"
            ? metadata.display_name
            : "",
        role:
          typeof metadata.role === "string" ? metadata.role : "LLB · Year 1",
        avatarUrl:
          typeof metadata.avatar_url === "string" ? metadata.avatar_url : "",
        wallpaperUrl:
          typeof metadata.wallpaper_url === "string"
            ? metadata.wallpaper_url
            : "",
      });
    };
    const finishAuthCallback = async () => {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      if (code) {
        const { error } = await supabase!.auth.exchangeCodeForSession(code);
        if (error)
          console.error(
            "Could not complete the email confirmation:",
            error.message,
          );
      }
      const sessionResult = await supabase!.auth.getSession();
      if (!active) return;
      applySession(sessionResult.data.session);
      if (code || window.location.hash.includes("access_token")) {
        window.history.replaceState({}, "", window.location.pathname);
      }
      setAuthLoading(false);
    };
    void finishAuthCallback();
    /* Keep this listener active after the initial callback has been processed. */
    const { data: listener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === "PASSWORD_RECOVERY") setRecovering(true);
        applySession(session);
      },
    );
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!userEmail) {
      setAdminState("unknown");
      return;
    }
    let active = true;
    void repository.isSuperAdmin().then((result) => {
      if (active) setAdminState(result ? "yes" : "no");
    });
    return () => {
      active = false;
    };
  }, [userEmail]);
  useEffect(() => {
    const onPopState = () => {
      setView(viewFromPath());
      setPathKey(window.location.pathname);
      setMenuOpen(false);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);
  useEffect(() => {
    if (!userEmail || !supabase) return;
    const client = supabase;
    let active = true;
    const refresh = async () => {
      const results = await Promise.allSettled([
        repository.getUnits(),
        repository.getMaterials(),
        repository.getAssignments(),
        repository.getDiscussions(),
        repository.getMembers(),
        repository.getTodos(),
        repository.getTimetable(),
        repository.getMedia(),
      ]);
      if (!active) return;
      const [u, m, a, d, groupMembers, userTodos, timetable, resources] =
        results;
      if (u.status === "fulfilled") setUnits(u.value);
      if (m.status === "fulfilled") setMaterials(m.value);
      if (a.status === "fulfilled") setAssignments(a.value);
      if (d.status === "fulfilled") setDiscussions(d.value);
      if (groupMembers.status === "fulfilled") setMembers(groupMembers.value);
      if (userTodos.status === "fulfilled") setTodos(userTodos.value);
      if (timetable.status === "fulfilled") setLessons(timetable.value);
      if (resources.status === "fulfilled") setMedia(resources.value);
      const failed = results.find((result) => result.status === "rejected");
      setLoadError(
        failed?.status === "rejected"
          ? failed.reason instanceof Error
            ? failed.reason.message
            : "Some workspace data could not be loaded."
          : "",
      );
    };
    void refresh();
    const channel = client.channel("group13-live-data");
    const tables = [
      "units",
      "materials",
      "assignments",
      "discussions",
      "members",
      "todos",
      "timetable",
      "media_resources",
    ];
    tables.forEach((table) =>
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        () => void refresh(),
      ),
    );
    void channel.subscribe();
    return () => {
      active = false;
      void client.removeChannel(channel);
    };
  }, [userEmail]);
  useEffect(() => {
    const meetingId =
      window.location.pathname.match(/^\/meetings\/([^/]+)/)?.[1];
    if (!meetingId) setActiveMeeting(null);
    else if (discussions.length)
      setActiveMeeting(
        discussions.find((discussion) => discussion.id === meetingId) ?? null,
      );
  }, [discussions, pathKey]);
  useEffect(() => {
    const unitId = window.location.pathname.match(/^\/units\/([^/]+)/)?.[1];
    const materialId = window.location.pathname.match(
      /^\/library\/materials\/([^/]+)/,
    )?.[1];
    if (unitId && units.length) setSelectedUnit(unitId);
    if (!materialId) setActiveMaterial(null);
    else if (materials.length)
      setActiveMaterial(
        materials.find((material) => material.id === materialId) ?? null,
      );
  }, [units, materials, pathKey]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 2800);
    return () => clearTimeout(timer);
  }, [notice]);

  const selected = units.find((u) => u.id === selectedUnit) ?? units[0];
  const selectedA =
    assignments.find((a) => a.id === selectedAssignment) ?? assignments[0];
  const filteredMaterials = useMemo(
    () =>
      materials.filter((m) =>
        [m.title, m.type, m.unit, m.topic]
          .join(" ")
          .toLowerCase()
          .includes(search.toLowerCase()),
      ),
    [materials, search],
  );
  const visibleTodos = todos;
  const setPage = (next: string) => {
    const target = validViews.has(next) ? next : "dashboard";
    setMenuOpen(false);
    const path = target === "dashboard" ? "/" : `/${target}`;
    if (window.location.pathname !== path)
      window.history.pushState({}, "", path);
    setView(target);
    setSearch("");
    if (target !== "transcribe") setTranscribeUnit(undefined);
  };
  const openTranscribeForUnit = (unitName: string) => {
    window.history.pushState({}, "", "/transcribe");
    setTranscribeUnit(unitName);
    setView("transcribe");
  };
  useEffect(() => {
    if (
      userEmail &&
      adminState === "no" &&
      (view === "settings" || view === "admin")
    )
      setPage("dashboard");
  }, [userEmail, adminState, view]);
  const openMeeting = (discussion: Discussion) => {
    window.history.pushState({}, "", `/meetings/${discussion.id}`);
    setActiveMeeting(discussion);
    setView("meeting");
  };
  const closeMeeting = () => {
    window.history.pushState({}, "", "/discussions");
    setActiveMeeting(null);
    setView("discussions");
  };
  const startMeeting = async (title: string) => {
    try {
      const created = await repository.createMeeting(
        title.trim() || "Group 13 meeting",
        profile.displayName || userEmail?.split("@")[0] || "Group 13",
      );
      setDiscussions((current) =>
        current.some((item) => item.id === created.id)
          ? current
          : [...current, created],
      );
      openMeeting(created);
      setNotice(
        "Room started. Copy the link or share it on WhatsApp so others can join.",
      );
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Could not start the meeting.",
      );
    }
  };
  const endMeeting = async (discussion: Discussion) => {
    if (!window.confirm(`End "${discussion.title}" and remove its link?`))
      return;
    try {
      await repository.deleteMeeting(discussion.id);
      setDiscussions((current) =>
        current.filter((item) => item.id !== discussion.id),
      );
      if (activeMeeting?.id === discussion.id) closeMeeting();
      setNotice("Meeting ended.");
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Could not end the meeting.",
      );
    }
  };
  const copyRoomLink = async (discussion: Discussion) => {
    await navigator.clipboard?.writeText(roomLink(discussion.id));
    setNotice("Room link copied. Paste it in the group chat.");
  };
  const deleteMaterial = async (material: Material) => {
    if (
      !window.confirm(
        `Delete "${material.title}"? The file is removed for everyone.`,
      )
    )
      return;
    try {
      await repository.deleteMaterial(material);
      setMaterials((current) =>
        current.filter((item) => item.id !== material.id),
      );
      setNotice("Material deleted.");
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Could not delete the material.",
      );
    }
  };
  const updateMaterial = async (
    material: Material,
    changes: Omit<Material, "id">,
  ) => {
    try {
      const updated = await repository.updateMaterial(material.id, changes);
      setMaterials((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setActiveMaterial((current) =>
        current?.id === updated.id ? updated : current,
      );
      setEditingMaterial(null);
      setNotice("Book details updated.");
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Could not update the book.",
      );
    }
  };
  const openUnit = (unit: Unit) => {
    window.history.pushState({}, "", `/units/${unit.id}`);
    setSelectedUnit(unit.id);
    setView("unit");
  };
  const openReader = (material: Material) => {
    if (!material.url) {
      setNotice("This material has no file or link yet.");
      return;
    }
    window.history.pushState({}, "", `/library/materials/${material.id}`);
    setActiveMaterial(material);
    setView("reader");
  };
  const closeReader = () => {
    window.history.pushState({}, "", "/library");
    setActiveMaterial(null);
    setView("library");
  };
  const bumpAssignment = async (id: string) => {
    const assignment = assignments.find((item) => item.id === id);
    if (!assignment) return;
    const status =
      statusOrder[
        (statusOrder.indexOf(assignment.status) + 1) % statusOrder.length
      ];
    try {
      await repository.updateAssignmentStatus(id, status);
      setAssignments((current) =>
        current.map((a) => (a.id === id ? { ...a, status } : a)),
      );
      setNotice("Assignment status saved.");
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Could not save assignment status.",
      );
    }
  };
  const saveProfile = async (changes: Partial<UserProfile>) => {
    if (!supabase) return;
    const metadata = {
      display_name: changes.displayName ?? profile.displayName,
      role: changes.role ?? profile.role,
      avatar_url: changes.avatarUrl ?? profile.avatarUrl,
      wallpaper_url: changes.wallpaperUrl ?? profile.wallpaperUrl,
    };
    const { error } = await supabase.auth.updateUser({ data: metadata });
    if (error) throw new Error(error.message);
    setProfile({
      displayName: metadata.display_name,
      role: metadata.role,
      avatarUrl: metadata.avatar_url,
      wallpaperUrl: metadata.wallpaper_url,
    });
  };
  const uploadProfileAssetAndSave = async (
    kind: "avatar" | "wallpaper",
    file: File,
  ) => {
    const url = await uploadUserAsset(kind, file);
    await saveProfile(
      kind === "avatar" ? { avatarUrl: url } : { wallpaperUrl: url },
    );
  };

  if (!isSupabaseConfigured) return <LoginPage configured={false} />;
  if (authLoading)
    return (
      <div className="auth-page">
        <p className="subheading">Checking your secure session…</p>
      </div>
    );
  if (recovering && userEmail)
    return <ResetPasswordPage onDone={() => setRecovering(false)} />;
  if (!userEmail) return <LoginPage configured onSignedIn={setUserEmail} />;

  return (
    <div
      className="app-shell"
      style={
        profile.wallpaperUrl
          ? {
              backgroundImage: `linear-gradient(rgba(247,245,240,.76), rgba(247,245,240,.76)), url(${profile.wallpaperUrl})`,
              backgroundSize: "cover",
              backgroundAttachment: "fixed",
            }
          : undefined
      }
    >
      <aside className="sidebar">
        <Brand />
        <nav>
          <div className="nav-label">Main</div>
          {nav.slice(0, 8).map((item) => (
            <NavItem
              key={item.id}
              {...item}
              active={view === item.id}
              onClick={() => setPage(item.id)}
            />
          ))}
          <div className="nav-label">More</div>
          {nav.slice(8).map((item) => (
            <NavItem
              key={item.id}
              {...item}
              active={view === item.id}
              onClick={() => setPage(item.id)}
            />
          ))}
          <div className="nav-label">You</div>
          <NavItem
            id="account"
            label="My profile"
            icon={UserCircle}
            active={view === "account"}
            onClick={() => setPage("account")}
          />
          {isAdmin && (
            <>
              <div className="nav-label">Administration</div>
              <NavItem
                id="admin"
                label="Admin"
                icon={ShieldCheck}
                active={view === "admin"}
                onClick={() => setPage("admin")}
              />
              <NavItem
                id="settings"
                label="Settings"
                icon={Settings}
                active={view === "settings"}
                onClick={() => setPage("settings")}
              />
            </>
          )}
        </nav>
        <div className="sidebar-bottom">
          <div className="profile-mini">
            <Avatar
              initials={profileInitials(profile.displayName, userEmail ?? "")}
              tone="#C96E52"
              image={profile.avatarUrl}
            />
            <div>
              <div className="profile-name">
                {profile.displayName ||
                  userEmail?.split("@")[0] ||
                  "Your profile"}
              </div>
              <div className="profile-role">{profile.role}</div>
            </div>
            <MoreHorizontal
              size={15}
              style={{ marginLeft: "auto", color: "rgba(255,255,255,.45)" }}
            />
          </div>
        </div>
      </aside>
      <div className="mobile-nav">
        <Brand compact />
        <div className="mobile-title">{pageLabel(view)}</div>
        <InstallButton className="install-chip" label="Get app" />
        <button
          className="mobile-avatar"
          aria-label="My profile"
          onClick={() => setPage("account")}
        >
          <Avatar
            initials={profileInitials(profile.displayName, userEmail ?? "")}
            tone="#C96E52"
            image={profile.avatarUrl}
          />
        </button>
      </div>
      {menuOpen && (
        <div className="mobile-backdrop" onClick={() => setMenuOpen(false)}>
          <nav
            className="mobile-drawer"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className="drawer-profile"
              onClick={() => setPage("account")}
            >
              <Avatar
                initials={profileInitials(profile.displayName, userEmail ?? "")}
                tone="#C96E52"
                image={profile.avatarUrl}
              />
              <div>
                <div className="profile-name">
                  {profile.displayName || userEmail?.split("@")[0]}
                </div>
                <div className="profile-role">{userEmail}</div>
              </div>
            </button>
            <div className="nav-label">Main</div>
            {nav.slice(0, 8).map((item) => (
              <NavItem
                key={item.id}
                {...item}
                active={view === item.id}
                onClick={() => setPage(item.id)}
              />
            ))}
            <div className="nav-label">More</div>
            {nav.slice(8).map((item) => (
              <NavItem
                key={item.id}
                {...item}
                active={view === item.id}
                onClick={() => setPage(item.id)}
              />
            ))}
            <div className="nav-label">You</div>
            <NavItem
              id="account"
              label="My profile"
              icon={UserCircle}
              active={view === "account"}
              onClick={() => setPage("account")}
            />
            {isAdmin && (
              <>
                <div className="nav-label">Administration</div>
                <NavItem
                  id="admin"
                  label="Admin"
                  icon={ShieldCheck}
                  active={view === "admin"}
                  onClick={() => setPage("admin")}
                />
                <NavItem
                  id="settings"
                  label="Settings"
                  icon={Settings}
                  active={view === "settings"}
                  onClick={() => setPage("settings")}
                />
              </>
            )}
            <div className="nav-label">App</div>
            <InstallButton className="nav-item" label="Download app" />
            <div className="mobile-drawer-foot">
              <div className="profile-name">
                {profile.displayName || userEmail?.split("@")[0]}
              </div>
              <button
                className="nav-item"
                onClick={async () => {
                  setMenuOpen(false);
                  await supabase?.auth.signOut();
                  setUserEmail(null);
                }}
              >
                <LogOut />
                Sign out
              </button>
            </div>
          </nav>
        </div>
      )}
      <nav className="tabbar" aria-label="Main">
        {[
          ["dashboard", "Home", LayoutDashboard],
          ["timetable", "Timetable", CalendarDays],
          ["todos", "To-do", CheckSquare],
          ["library", "Library", Library],
        ].map(([id, label, Icon]) => {
          const I = Icon as typeof BookOpen;
          return (
            <button
              key={id as string}
              className={view === id ? "active" : ""}
              onClick={() => setPage(id as string)}
            >
              <I size={21} />
              <span>{label as string}</span>
            </button>
          );
        })}
        <button
          className={menuOpen ? "active" : ""}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <Menu size={21} />
          <span>More</span>
        </button>
      </nav>
      <main className="main">
        <Topbar
          view={view}
          email={userEmail ?? ""}
          name={profile.displayName}
          initials={profileInitials(profile.displayName, userEmail ?? "")}
          image={profile.avatarUrl}
          userId={userId}
          onOpenNotifications={() => setPage("discussions")}
          onSignOut={async () => {
            await supabase?.auth.signOut();
            setUserEmail(null);
          }}
        />
        <div className="content">
          {loadError && (
            <div className="connection-error">
              <strong>
                {isAdmin
                  ? "Supabase request failed"
                  : "We could not load the latest information"}
              </strong>
              <span>
                {isAdmin
                  ? loadError
                  : "Please check your internet and refresh the page."}
              </span>
            </div>
          )}
          {view === "dashboard" && (
            <Home
              name={profile.displayName || userEmail?.split("@")[0] || "there"}
              lessons={lessons}
              todos={visibleTodos}
              assignments={assignments}
              userId={userId}
              setPage={setPage}
            />
          )}
          {view === "growth" && (
            <GrowthPage userId={userId} onOpenArena={() => setPage("arena")} />
          )}
          {view === "transcribe" && (
            <TranscribePage
              units={units}
              userId={userId}
              isAdmin={isAdmin}
              initialUnit={transcribeUnit}
              displayName={
                profile.displayName || userEmail?.split("@")[0] || "Member"
              }
              setNotice={setNotice}
            />
          )}
          {view === "timetable" && (
            <TimetablePage
              lessons={lessons}
              units={units}
              members={members}
              canDelete={(lesson) =>
                isAdmin || (!!userId && lesson.created_by === userId)
              }
              setNotice={setNotice}
              onAdded={(lesson) =>
                setLessons((c) =>
                  [...c, lesson].sort((a, b) =>
                    (a.lesson_date + (a.start_time ?? "")).localeCompare(
                      b.lesson_date + (b.start_time ?? ""),
                    ),
                  ),
                )
              }
              onRemoved={(id) =>
                setLessons((c) => c.filter((l) => l.id !== id))
              }
            />
          )}
          {view === "units" && (
            <UnitsPage
              units={units}
              selected={selected}
              selectedUnit={selectedUnit}
              setSelectedUnit={setSelectedUnit}
              materials={materials}
              setNotice={setNotice}
              setPage={setPage}
              openUnit={openUnit}
            />
          )}
          {view === "unit" && selected && (
            <UnitWorkspacePage
              unit={selected}
              materials={materials}
              assignments={assignments}
              discussions={discussions}
              openReader={openReader}
              openMeeting={openMeeting}
              userId={userId}
              onTranscribe={openTranscribeForUnit}
            />
          )}
          {view === "library" && (
            <LibraryPageReal
              materials={filteredMaterials}
              search={search}
              setSearch={setSearch}
              openCreate={() => setMaterialFormOpen(true)}
              openEdit={setEditingMaterial}
              openReader={openReader}
              canDelete={(material) =>
                isAdmin || (!!userId && material.owner_id === userId)
              }
              onDelete={deleteMaterial}
            />
          )}
          {view === "reader" && activeMaterial && (
            <MaterialReader material={activeMaterial} onClose={closeReader} />
          )}
          {view === "reader" && !activeMaterial && (
            <div className="card card-pad empty">
              {materials.length
                ? "That material could not be found."
                : "Loading material…"}{" "}
              <button className="material-link" onClick={closeReader}>
                Back to library
              </button>
            </div>
          )}
          {view === "assignments" && (
            <AssignmentsPageReal
              assignments={assignments}
              selected={selectedA}
              selectedId={selectedAssignment}
              setSelected={setSelectedAssignment}
              bump={bumpAssignment}
              openCreate={() => setAssignmentFormOpen(true)}
            />
          )}
          {view === "todos" && (
            <TodoPage
              todos={visibleTodos}
              onCreate={async (todo) => {
                const created = await repository.createTodo(todo);
                setTodos((current) => [created, ...current]);
              }}
              onToggle={async (todo) => {
                await repository.toggleTodo(todo.id, !todo.completed);
                setTodos((current) =>
                  current.map((item) =>
                    item.id === todo.id
                      ? { ...item, completed: !item.completed }
                      : item,
                  ),
                );
              }}
            />
          )}
          {view === "discussions" && (
            <DiscussionsPage
              discussions={discussions}
              members={members}
              userId={userId}
              displayName={
                profile.displayName ||
                userEmail?.split("@")[0] ||
                "Group 13 member"
              }
              openMeeting={openMeeting}
              onStart={startMeeting}
              onEnd={endMeeting}
              onCopy={copyRoomLink}
              canEnd={(discussion) =>
                isAdmin || (!!userId && discussion.created_by === userId)
              }
            />
          )}
          {view === "media" && (
            <MediaPage
              media={media}
              onCreate={async (item) => {
                const created = await repository.createMedia(item);
                setMedia((current) => [...current, created]);
                setNotice("Media resource added.");
              }}
            />
          )}
          {view === "arena" && (
            <ArenaPage
              materials={materials}
              setPage={setPage}
              openReader={openReader}
            />
          )}
          {view === "members" && <SectionedMembersPage members={members} />}
          {view === "assistant" && (
            <>
              <PageHeading
                eyebrow="Your guided study companion"
                title="Study assistant."
                subtitle="Ask, summarise, brief cases and practise from your own materials."
              />
              <StudyAssistant />
              <LearningStudio />
            </>
          )}
          {view === "research" && (
            <>
              <PageHeading
                eyebrow="From topic to finished paper"
                title="Research writer."
                subtitle="Plan, draft, critique and cite your essays and research papers with an assistant that marks every authority you must verify."
              />
              <ResearchWriter />
            </>
          )}
          {view === "counsellor" && <CounsellorPage />}
          {view === "account" && (
            <>
              <PageHeading
                eyebrow="Your profile"
                title="Account."
                subtitle="Update your details, or delete your account and everything you uploaded."
                stamp={false}
              />
              <ProfileSettings
                profile={profile}
                onSave={saveProfile}
                onUpload={uploadProfileAssetAndSave}
                setNotice={setNotice}
              />
              <DeleteAccountCard
                email={userEmail ?? ""}
                isAdmin={isAdmin}
                onDeleted={() => setUserEmail(null)}
                setNotice={setNotice}
              />
            </>
          )}
          {view === "admin" && isAdmin && (
            <AdminPage
              onUnitAdded={(unit) => setUnits((c) => [...c, unit])}
              onUnitRemoved={(id) =>
                setUnits((c) => c.filter((u) => u.id !== id))
              }
              units={units}
              members={members}
              lessons={lessons}
              onTimetableApplied={setLessons}
              currentEmail={userEmail ?? ""}
              setNotice={setNotice}
            />
          )}
          {view === "settings" && isAdmin && (
            <SettingsPage setNotice={setNotice} />
          )}
          {view === "meeting" && !activeMeeting && (
            <div className="card card-pad empty">
              {discussions.length
                ? "That meeting room could not be found."
                : "Loading room…"}{" "}
              <button
                className="material-link"
                onClick={() => setPage("discussions")}
              >
                Back to discussions
              </button>
            </div>
          )}
          {view === "meeting" && activeMeeting && (
            <div className="meeting-page">
              <PageHeading
                eyebrow="Group 13 live room"
                title={activeMeeting.title}
                subtitle="Your private browser-based discussion room is ready."
                stamp={false}
              />
            </div>
          )}
        </div>
      </main>
      {notice && (
        <div className="toast">
          <Check size={15} />
          {isAdmin ? notice : notice.replace(/supabase/gi, "the server")}
          <button onClick={() => setNotice("")}>
            <X size={14} />
          </button>
        </div>
      )}
      {activeMeeting && (
        <MeetingRoom discussion={activeMeeting} onClose={closeMeeting} />
      )}
      {materialFormOpen && (
        <MaterialForm
          units={units}
          onClose={() => setMaterialFormOpen(false)}
          onCreated={async (material, file) => {
            try {
              const created = await repository.createMaterial(material, file);
              setMaterials((current) => [created, ...current]);
              setMaterialFormOpen(false);
              setNotice(file ? "Material uploaded." : "Material link added.");
            } catch (error) {
              setNotice(
                error instanceof Error
                  ? error.message
                  : "Could not add material.",
              );
            }
          }}
        />
      )}
      {editingMaterial && (
        <MaterialForm
          units={units}
          initial={editingMaterial}
          onClose={() => setEditingMaterial(null)}
          onUpdated={(changes) => updateMaterial(editingMaterial, changes)}
        />
      )}
      {assignmentFormOpen && (
        <AssignmentForm
          units={units}
          owner={profile.displayName || userEmail?.split("@")[0] || "Member"}
          onClose={() => setAssignmentFormOpen(false)}
          onCreated={async (assignment) => {
            try {
              const created = await repository.createAssignment(assignment);
              setAssignments((current) => [...current, created]);
              setSelectedAssignment(created.id);
              setAssignmentFormOpen(false);
              setNotice(
                "Assignment created. It now shows on everyone’s to-do list.",
              );
            } catch (error) {
              setNotice(
                error instanceof Error
                  ? error.message
                  : "Could not create assignment.",
              );
            }
          }}
        />
      )}
    </div>
  );
}

const pageLabel = (view: string) =>
  view === "meeting"
    ? "Meeting room"
    : view === "admin"
      ? "Admin"
      : view === "account"
        ? "My profile"
        : view === "reader"
          ? "Reading"
          : view === "unit"
            ? "Unit"
            : (nav.find((n) => n.id === view)?.label ?? "Settings");
function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="brand">
      <div className="brand-mark">13</div>
      {!compact && (
        <div>
          <div className="brand-name">GROUP 13</div>
          <div className="brand-sub">Law school hub</div>
        </div>
      )}
    </div>
  );
}
function Avatar({
  initials,
  tone,
  image,
}: {
  initials: string;
  tone: string;
  image?: string;
}) {
  return (
    <div
      className="avatar"
      style={{
        background: tone,
        ...(image
          ? {
              backgroundImage: `url(${image})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              color: "transparent",
            }
          : {}),
      }}
    >
      {initials}
    </div>
  );
}
function NavItem({
  label,
  icon: Icon,
  active,
  onClick,
}: {
  id: string;
  label: string;
  icon: typeof BookOpen;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button className={`nav-item ${active ? "active" : ""}`} onClick={onClick}>
      <Icon />
      {label}
    </button>
  );
}
function NotificationBell({
  userId,
  onOpen,
}: {
  userId: string | null;
  onOpen: () => void;
}) {
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    if (!supabase || !userId) return;
    const client = supabase;
    let active = true;
    const load = async () => {
      const { count } = await client
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("recipient_id", userId)
        .is("read_at", null);
      if (active) setUnread(count ?? 0);
    };
    void load();
    const channel = client
      .channel(`notifications-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `recipient_id=eq.${userId}`,
        },
        () => void load(),
      )
      .subscribe();
    return () => {
      active = false;
      void client.removeChannel(channel);
    };
  }, [userId]);
  const open = async () => {
    if (supabase && userId) {
      await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("recipient_id", userId)
        .is("read_at", null);
      setUnread(0);
    }
    onOpen();
  };
  return (
    <button
      type="button"
      className="icon-button notification-button"
      title={unread ? `${unread} unread notifications` : "Notifications"}
      onClick={() => void open()}
    >
      <Bell size={15} />
      {unread > 0 && (
        <span className="notification-count">{unread > 9 ? "9+" : unread}</span>
      )}
    </button>
  );
}
function Topbar({
  view,
  email,
  name,
  initials,
  image,
  userId,
  onOpenNotifications,
  onSignOut,
}: {
  view: string;
  email: string;
  name: string;
  initials: string;
  image?: string;
  userId: string | null;
  onOpenNotifications: () => void;
  onSignOut: () => void;
}) {
  const label = pageLabel(view);
  return (
    <header className="topbar">
      <div className="breadcrumb">
        <span>Group 13</span>
        <ChevronRight size={13} />
        <strong>{label}</strong>
      </div>
      <div className="top-actions">
        <InstallButton className="secondary-button install-button" />
        <NotificationBell userId={userId} onOpen={onOpenNotifications} />
        <span className="signed-in-as" title={email}>
          {name || email}
        </span>
        <button className="icon-button" title="Sign out" onClick={onSignOut}>
          <LogOut size={15} />
        </button>
        <Avatar initials={initials} tone="#163A34" image={image} />
      </div>
    </header>
  );
}
function PageHeading({
  eyebrow,
  title,
  subtitle,
  stamp = true,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  stamp?: boolean;
}) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p className="subheading">{subtitle}</p>
      </div>
      {stamp && (
        <div className="date-stamp">
          <strong>
            {new Date().toLocaleDateString("en-GB", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </strong>
        </div>
      )}
    </div>
  );
}
function CardHeader({ label, action }: { label: string; action?: string }) {
  return (
    <div className="card-header">
      <span className="section-label">{label}</span>
      {action && <span className="quiet">{action}</span>}
    </div>
  );
}

function UnitsPage({
  units,
  selected,
  selectedUnit,
  setSelectedUnit,
  materials,
  setNotice,
  setPage,
  openUnit,
}: {
  units: Unit[];
  selected?: Unit;
  selectedUnit: string;
  setSelectedUnit: (id: string) => void;
  materials: Material[];
  setNotice: (n: string) => void;
  setPage: (p: string) => void;
  openUnit: (unit: Unit) => void;
}) {
  return (
    <>
      <PageHeading
        eyebrow="The curriculum"
        title="Your units."
        subtitle="Pick a unit to see its materials, assignments and who represents it."
      />
      <div className="page-grid">
        <div className="card card-pad">
          <CardHeader label="All units" action={`${units.length} units`} />
          <div className="unit-list">
            {units.map((u) => (
              <div
                className="unit-item"
                key={u.id}
                onClick={() => {
                  setSelectedUnit(u.id);
                  openUnit(u);
                }}
                style={
                  selectedUnit === u.id
                    ? {
                        background: "#fbfaf6",
                        margin: "0 -8px",
                        paddingLeft: 8,
                        paddingRight: 8,
                      }
                    : undefined
                }
              >
                <div className="unit-top">
                  <div>
                    <div className="unit-code">{u.code}</div>
                    <div className="unit-name">{u.name}</div>
                    <div className="unit-lead">
                      {unitReps(u).length > 1
                        ? "Representatives"
                        : "Representative"}
                      : {unitReps(u).join(", ") || "To be assigned"}
                    </div>
                  </div>
                  <ChevronRight size={15} color="var(--muted)" />
                </div>
                <div className="unit-progress">
                  <div className="progress">
                    <span
                      style={{ width: `${u.progress}%`, background: u.color }}
                    />
                  </div>
                  <span>{u.progress}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="card card-pad">
          <div className="detail-title">
            <div>
              <div className="eyebrow">Selected unit</div>
              <h2>{selected?.name}</h2>
              <div className="detail-meta">
                {selected?.code} ·{" "}
                {unitReps(selected).join(", ") || "No representative yet"}
              </div>
            </div>
          </div>
          <div className="tab-bar">
            <button className="tab active">Overview</button>
            <button className="tab" onClick={() => setPage("library")}>
              Materials
            </button>
            <button className="tab" onClick={() => setPage("assignments")}>
              Assignments
            </button>
            <button className="tab" onClick={() => setPage("discussions")}>
              Discussions
            </button>
          </div>
          <div className="callout">
            <p>
              <strong>
                {unitReps(selected).length > 1
                  ? "Unit representatives"
                  : "Unit representative"}
                :
              </strong>{" "}
              {unitReps(selected).join(", ") || "To be assigned"}
            </p>
          </div>
          <div style={{ marginTop: 22 }}>
            <div className="section-label">Latest in this unit</div>
            <div className="row-list">
              {materials
                .filter((m) => m.unit === selected?.name)
                .slice(0, 3)
                .map((m) => (
                  <div className="row" key={m.id}>
                    <div className="type-mark">
                      {m.type.slice(0, 3).toUpperCase()}
                    </div>
                    <div className="row-main">
                      <div className="row-title">{m.title}</div>
                      <div className="row-meta">
                        {m.topic} · {m.date}
                      </div>
                    </div>
                    <ChevronRight size={15} color="var(--muted)" />
                  </div>
                ))}
            </div>
            <button
              className="secondary-button"
              style={{ marginTop: 15 }}
              onClick={() => selected && openUnit(selected)}
            >
              Open unit workspace{" "}
              <ChevronRight size={14} style={{ verticalAlign: "middle" }} />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function DiscussionsPage({
  discussions,
  members,
  userId,
  displayName,
  openMeeting,
  onStart,
  onEnd,
  onCopy,
  canEnd,
}: {
  discussions: Discussion[];
  members: Member[];
  userId: string | null;
  displayName: string;
  openMeeting: (discussion: Discussion) => void;
  onStart: (title: string) => Promise<void>;
  onEnd: (discussion: Discussion) => Promise<void>;
  onCopy: (discussion: Discussion) => Promise<void>;
  canEnd: (discussion: Discussion) => boolean;
}) {
  const [title, setTitle] = useState("");
  const [starting, setStarting] = useState(false);
  const [viewerName, setViewerName] = useState("");
  useEffect(() => {
    void supabase?.auth.getUser().then(({ data }) => {
      const name = data.user?.user_metadata?.display_name;
      if (typeof name === "string") setViewerName(name);
    });
  }, []);
  const scheduled = discussions.filter((discussion) => !discussion.instant);
  const live = discussions.filter((discussion) => discussion.instant);
  const canManage = (discussion: Discussion) =>
    canEnd(discussion) || (!!viewerName && discussion.leader === viewerName);
  const start = async (event: React.FormEvent) => {
    event.preventDefault();
    setStarting(true);
    await onStart(title);
    setTitle("");
    setStarting(false);
  };
  return (
    <>
      <PageHeading
        eyebrow="Talk it through"
        title="Discussions."
        subtitle="Scheduled discussions and quick live rooms, all in one place."
      />
      <div className="grid grid-main">
        <div className="card card-pad">
          <CardHeader
            label="Discussion calendar"
            action={`${scheduled.length} scheduled`}
          />
          <div className="row-list">
            {scheduled.map((d, i) => (
              <div className="row" key={d.id}>
                <div
                  className="type-mark"
                  style={{
                    borderTop: `3px solid ${i === 0 ? "var(--oxblood)" : "var(--forest)"}`,
                  }}
                >
                  <CalendarDays size={14} />
                </div>
                <div className="row-main">
                  <div className="row-title">{d.title}</div>
                  <div className="row-meta">
                    {d.day} · {d.time} · Led by {d.leader}
                  </div>
                  <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                    {d.topics.map((t) => (
                      <span className="chip" key={t}>
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="row-end">
                  <span className={`chip ${i === 0 ? "red" : ""}`}>
                    {d.status}
                  </span>
                  <div className="share-actions">
                    <button
                      className="secondary-button"
                      onClick={() => openMeeting(d)}
                    >
                      <Video size={14} /> Join room
                    </button>
                    <button
                      className="secondary-button"
                      onClick={() => void onCopy(d)}
                    >
                      Copy link
                    </button>
                    <a
                      className="secondary-button"
                      href={whatsappLink(d)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      WhatsApp
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {!scheduled.length && (
            <div className="empty">No scheduled discussions yet.</div>
          )}
        </div>
        <div className="grid">
          <div className="card docket">
            <div className="card-pad">
              <div className="section-label">Start a meeting</div>
              <div className="docket-title" style={{ fontSize: 25 }}>
                Open a room now and send the link to the group.
              </div>
              <form className="data-form" onSubmit={start}>
                <label>
                  Meeting title
                  <input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="e.g. Torts revision, tonight"
                  />
                </label>
                <button
                  className="primary-button"
                  type="submit"
                  disabled={starting}
                >
                  {starting ? "Starting…" : "Start meeting"}
                </button>
              </form>
            </div>
          </div>
          <div className="card card-pad">
            <CardHeader label="Live rooms" action={`${live.length} open`} />
            <div className="row-list">
              {live.map((d) => (
                <div className="row" key={d.id}>
                  <div className="type-mark">
                    <Video size={14} />
                  </div>
                  <div className="row-main">
                    <div className="row-title">{d.title}</div>
                    <div className="row-meta">
                      Started by {d.leader} · {d.day} · {d.time}
                    </div>
                  </div>
                  <div className="row-end">
                    <div className="share-actions">
                      <button
                        className="secondary-button"
                        onClick={() => openMeeting(d)}
                      >
                        Join
                      </button>
                      <button
                        className="secondary-button"
                        onClick={() => void onCopy(d)}
                      >
                        Copy link
                      </button>
                      <a
                        className="secondary-button"
                        href={whatsappLink(d)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        WhatsApp
                      </a>
                      {canManage(d) && (
                        <button
                          className="small-danger"
                          onClick={() => void onEnd(d)}
                        >
                          End
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {!live.length && (
              <div className="empty">No live rooms. Start one above.</div>
            )}
          </div>
        </div>
        <AnnouncementPanel
          members={members}
          userId={userId}
          displayName={displayName}
        />
      </div>
    </>
  );
}

type Announcement = {
  id: string;
  author_name: string;
  title: string;
  message: string;
  created_at: string;
};

function AnnouncementPanel({
  members,
  userId,
  displayName,
}: {
  members: Member[];
  userId: string | null;
  displayName: string;
}) {
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [rows, setRows] = useState<Announcement[]>([]);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState("");
  const load = async () => {
    if (!supabase) return;
    const { data } = await supabase
      .from("group_announcements")
      .select("id,author_name,title,message,created_at")
      .order("created_at", { ascending: false })
      .limit(20);
    setRows((data ?? []) as Announcement[]);
  };
  useEffect(() => {
    void load();
    if (!supabase) return;
    const channel = supabase
      .channel("group-announcements")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "group_announcements" },
        () => void load(),
      )
      .subscribe();
    return () => {
      void supabase?.removeChannel(channel);
    };
  }, []);
  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!supabase || !userId || !title.trim() || !message.trim()) return;
    setSending(true);
    setStatus("");
    const { data: announcement, error } = await supabase
      .from("group_announcements")
      .insert({
        created_by: userId,
        author_name: displayName || "Group 13 member",
        title: title.trim(),
        message: message.trim(),
      })
      .select("id")
      .single();
    if (error || !announcement) {
      setStatus(error?.message ?? "Could not send announcement.");
      setSending(false);
      return;
    }
    const recipients = [
      ...new Set([
        userId,
        ...members
          .map((member) => member.user_id)
          .filter((id): id is string => Boolean(id)),
      ]),
    ];
    const { error: notifyError } = await supabase
      .from("notifications")
      .insert(
        recipients.map((recipient_id) => ({
          recipient_id,
          announcement_id: announcement.id,
          title: title.trim(),
          body: message.trim(),
        })),
      );
    setTitle("");
    setMessage("");
    setSending(false);
    setStatus(
      notifyError
        ? "Announcement sent, but some notification badges could not be created."
        : "Announcement sent to the group.",
    );
    void load();
  };
  return (
    <div className="card card-pad announcement-panel">
      <div className="card-header">
        <span className="section-label">Group announcements</span>
        <span className="quiet">Notify everyone in Group 13</span>
      </div>
      <form className="data-form announcement-form" onSubmit={send}>
        <label>
          Announcement title
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="e.g. Change of venue for tomorrow"
          />
        </label>
        <label>
          Message
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Tell the group what changed…"
            rows={3}
          />
        </label>
        <button
          className="primary-button"
          type="submit"
          disabled={sending || !userId}
        >
          {sending ? "Sending…" : "Notify group"}
        </button>
        {status && <span className="field-hint">{status}</span>}
      </form>
      {rows.length > 0 && (
        <div className="announcement-list">
          {rows.map((row) => (
            <article className="announcement" key={row.id}>
              <strong>{row.title}</strong>
              <p>{row.message}</p>
              <small>
                {row.author_name} · {new Date(row.created_at).toLocaleString()}
              </small>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

type UnitRecording = {
  id: string;
  title: string;
  unit: string | null;
  lesson_number: number | null;
  lesson_title: string | null;
  status: "processing" | "done" | "failed";
  duration_seconds: number | null;
  created_at: string;
};
const recordingClock = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
};

function UnitRecordings({
  unit,
  userId,
  onTranscribe,
}: {
  unit: Unit;
  userId: string | null;
  onTranscribe: (unitName: string) => void;
}) {
  const [recordings, setRecordings] = useState<UnitRecording[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [chunks, setChunks] = useState<{ text: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!supabase) {
        setLoading(false);
        return;
      }
      const { data, error } = await supabase
        .from("transcripts")
        .select(
          "id,title,unit,lesson_number,lesson_title,status,duration_seconds,created_at",
        )
        .eq("unit", unit.name)
        .order("lesson_number", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: true });
      if (!active) return;
      if (error) {
        setMessage(
          "Run supabase/transcript-lessons.sql to enable lesson recordings.",
        );
      } else {
        setRecordings((data ?? []) as UnitRecording[]);
      }
      setLoading(false);
    };
    void load();
    return () => {
      active = false;
    };
  }, [unit.name]);

  const openRecording = async (recording: UnitRecording) => {
    if (!supabase || recording.status !== "done") return;
    setSelectedId(recording.id);
    setChunks([]);
    const { data, error } = await supabase
      .from("transcript_chunks")
      .select("text")
      .eq("transcript_id", recording.id)
      .order("idx");
    if (error) {
      setMessage("Could not load this lesson recording.");
      return;
    }
    setChunks((data ?? []) as { text: string }[]);
  };
  const selected = recordings.find((recording) => recording.id === selectedId);
  return (
    <div className="card card-pad unit-recordings">
      <div className="card-header">
        <div>
          <div className="section-label">Lesson recordings</div>
          <p className="subheading">
            Keep each lecture under {unit.name}, then make notes or a summary
            from its transcript.
          </p>
        </div>
        <button
          className="primary-button"
          onClick={() => onTranscribe(unit.name)}
        >
          <Mic size={14} /> Add recording
        </button>
      </div>
      {message && (
        <p className="field-hint" style={{ marginTop: 12 }}>
          {message}
        </p>
      )}
      {loading && (
        <p className="field-hint" style={{ marginTop: 12 }}>
          Loading recordings…
        </p>
      )}
      {!loading && !recordings.length && !message && (
        <div className="empty">
          No recordings yet. Add Lesson 1 above to start this unit’s archive.
        </div>
      )}
      <div className="row-list">
        {recordings.map((recording) => (
          <div className="row" key={recording.id}>
            <div className="type-mark">
              <Mic size={14} />
            </div>
            <div className="row-main">
              <div className="row-title">
                {recording.lesson_number
                  ? `Lesson ${recording.lesson_number}: `
                  : ""}
                {recording.lesson_title || recording.title}
              </div>
              <div className="row-meta">
                {recording.status === "done"
                  ? "Ready for notes and summary"
                  : recording.status}
                {recording.duration_seconds
                  ? ` · ${recordingClock(recording.duration_seconds)}`
                  : ""}
              </div>
            </div>
            {recording.status === "done" && (
              <button
                className="secondary-button"
                onClick={() => void openRecording(recording)}
              >
                {selectedId === recording.id ? "Selected" : "Open lesson"}
              </button>
            )}
          </div>
        ))}
      </div>
      {selected && chunks.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <div className="section-label">
            {selected.lesson_title || selected.title} study actions
          </div>
          <TranscriptAI
            key={selected.id}
            transcriptId={selected.id}
            userId={userId}
            title={selected.lesson_title || selected.title}
            unit={selected.unit}
            ready
            getText={() => chunks.map((chunk) => chunk.text).join("\n\n")}
          />
        </div>
      )}
    </div>
  );
}

function UnitWorkspacePage({
  unit,
  materials,
  assignments,
  discussions,
  openReader,
  openMeeting,
  userId,
  onTranscribe,
}: {
  unit: Unit;
  materials: Material[];
  assignments: Assignment[];
  discussions: Discussion[];
  openReader: (material: Material) => void;
  openMeeting: (discussion: Discussion) => void;
  userId: string | null;
  onTranscribe: (unitName: string) => void;
}) {
  const unitMaterials = materials.filter(
    (material) => material.unit === unit.name,
  );
  const unitAssignments = assignments.filter(
    (assignment) => assignment.unit === unit.name,
  );
  const unitDiscussions = discussions.filter(
    (discussion) => discussion.title === unit.name,
  );
  return (
    <>
      <PageHeading
        eyebrow="Unit workspace"
        title={unit.name}
        subtitle={`${unit.code} · ${unitReps(unit).length > 1 ? "Representatives" : "Representative"}: ${unitReps(unit).join(", ") || "to be assigned"}. This is the working page for the unit.`}
      />
      <div
        className="unit-workspace-banner"
        style={{ borderTopColor: unit.color }}
      >
        <div>
          <div className="eyebrow">Next up</div>
          <h2>{unit.next}</h2>
        </div>
        <span className="chip">{unit.progress}% progress</span>
      </div>
      <UnitRecordings unit={unit} userId={userId} onTranscribe={onTranscribe} />
      <div className="grid grid-two unit-workspace-grid">
        <div className="card card-pad">
          <CardHeader
            label="Materials"
            action={`${unitMaterials.length} saved`}
          />
          <div className="row-list">
            {unitMaterials.map((material) => (
              <button
                className="row workspace-row"
                key={material.id}
                onClick={() => openReader(material)}
              >
                <div className="type-mark">
                  {material.type.slice(0, 3).toUpperCase()}
                </div>
                <div className="row-main">
                  <div className="row-title">{material.title}</div>
                  <div className="row-meta">
                    {material.topic} · {material.date}
                  </div>
                </div>
                <ChevronRight size={15} />
              </button>
            ))}
          </div>
          {!unitMaterials.length && (
            <div className="empty">
              No materials have been added for this unit yet.
            </div>
          )}
        </div>
        <div className="card card-pad">
          <CardHeader
            label="Assignments"
            action={`${unitAssignments.length} tracked`}
          />
          <div className="row-list">
            {unitAssignments.map((assignment) => (
              <div className="row" key={assignment.id}>
                <div className="type-mark">
                  {assignment.status.slice(0, 2).toUpperCase()}
                </div>
                <div className="row-main">
                  <div className="row-title">{assignment.title}</div>
                  <div className="row-meta">
                    Due {assignment.due} · {assignment.status}
                  </div>
                </div>
              </div>
            ))}
          </div>
          {!unitAssignments.length && (
            <div className="empty">
              No assignments have been added for this unit yet.
            </div>
          )}
        </div>
      </div>
      <div className="card card-pad">
        <CardHeader
          label="Discussions"
          action={`${unitDiscussions.length} rooms`}
        />
        <div className="row-list">
          {unitDiscussions.map((discussion) => (
            <div className="row" key={discussion.id}>
              <div className="type-mark">
                <Video size={14} />
              </div>
              <div className="row-main">
                <div className="row-title">
                  {discussion.day} · {discussion.time}
                </div>
                <div className="row-meta">
                  Led by {discussion.leader} · {discussion.topics.join(" · ")}
                </div>
              </div>
              <button
                className="secondary-button"
                onClick={() => openMeeting(discussion)}
              >
                Join room
              </button>
            </div>
          ))}
        </div>
        {!unitDiscussions.length && (
          <div className="empty">
            No discussions have been added for this unit yet.
          </div>
        )}
      </div>
    </>
  );
}

function DownloadLink({
  material,
  className = "material-link",
  icon = false,
}: {
  material: Material;
  className?: string;
  icon?: boolean;
}) {
  const info = downloadInfo(material);
  if (!info) return null;
  const download = async (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    try {
      // Fetching the Supabase file first gives the browser a real Blob to save,
      // rather than navigating to a preview page when the URL is cross-origin.
      const response = await fetch(info.href, { credentials: "omit" });
      if (!response.ok)
        throw new Error(`Download failed with ${response.status}`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${material.title.replace(/[^\w\-. ]+/g, "").trim() || "material"}.${material.type.toLowerCase().replace(/[^a-z0-9]+/g, "") || "file"}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      // Some third-party hosts disallow CORS. Their direct URL is still opened
      // immediately, without routing through the in-app reader.
      window.location.assign(info.href);
    }
  };
  return (
    <a
      className={className}
      href={info.href}
      onClick={info.file ? download : undefined}
      {...(info.file
        ? { download: "" }
        : { target: "_blank", rel: "noreferrer" })}
    >
      {icon && <Download size={14} />}
      {info.label}
    </a>
  );
}
function MaterialReader({
  material,
  onClose,
}: {
  material: Material;
  onClose: () => void;
}) {
  return <BookReader material={material} onClose={onClose} />;
}

function TodoPage({
  todos,
  onCreate,
  onToggle,
}: {
  todos: Todo[];
  onCreate: (todo: Omit<Todo, "id">) => Promise<void>;
  onToggle: (todo: Todo) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;
    await onCreate({
      title: title.trim(),
      due: due || undefined,
      completed: false,
      source: "manual",
    });
    setTitle("");
    setDue("");
  };
  return (
    <>
      <PageHeading
        eyebrow="Your personal work queue"
        title="To-do."
        subtitle="Your assignments appear automatically. Add private tasks for yourself whenever you need them."
      />
      <div className="page-grid">
        <div className="card card-pad">
          <CardHeader
            label="My tasks"
            action={`${todos.filter((todo) => !todo.completed).length} open`}
          />
          <div className="row-list">
            {todos.map((todo) => (
              <button
                className="row todo-row"
                key={todo.id}
                onClick={() => void onToggle(todo)}
              >
                <span className={`checkbox ${todo.completed ? "done" : ""}`}>
                  {todo.completed && <Check size={12} />}
                </span>
                <div className="row-main">
                  <div
                    className={`row-title ${todo.completed ? "todo-complete" : ""}`}
                  >
                    {todo.title}
                  </div>
                  <div className="row-meta">
                    {todo.source === "assignment"
                      ? "From assignment"
                      : "Personal task"}
                    {todo.due ? ` · Due ${todo.due}` : ""}
                  </div>
                </div>
                <span className="chip">{todo.completed ? "Done" : "Open"}</span>
              </button>
            ))}
          </div>
          {!todos.length && (
            <div className="empty">
              No tasks yet. Create your first task below.
            </div>
          )}
        </div>
        <div className="card card-pad">
          <CardHeader label="Add a private task" />
          <form className="data-form" onSubmit={submit}>
            <label>
              Task
              <input
                required
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Read a case, prepare questions…"
              />
            </label>
            <label>
              Due date
              <input
                value={due}
                onChange={(event) => setDue(event.target.value)}
                placeholder="Optional"
              />
            </label>
            <button className="primary-button" type="submit">
              Add to-do
            </button>
          </form>
        </div>
      </div>
    </>
  );
}

function MediaPage({
  media,
  onCreate,
}: {
  media: MediaResource[];
  onCreate: (media: Omit<MediaResource, "id">) => Promise<void>;
}) {
  const [form, setForm] = useState<Omit<MediaResource, "id">>({
    kind: "youtube",
    title: "",
    url: "",
    topic: "",
    source: "YouTube",
  });
  const change = (key: keyof typeof form, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));
  return (
    <>
      <PageHeading
        eyebrow="Law in every format"
        title="Media."
        subtitle="Add law-related films, YouTube lectures, music, and court-case recordings. Nothing is preloaded."
      />
      <div className="card card-pad media-form-card">
        <CardHeader label="Add a resource" action="Your private collection" />
        <form
          className="data-form media-form"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!/^https:\/\//i.test(form.url)) return;
            await onCreate(form);
            setForm({
              kind: "youtube",
              title: "",
              url: "",
              topic: "",
              source: "YouTube",
            });
          }}
        >
          <label>
            Type
            <select
              value={form.kind}
              onChange={(event) =>
                change("kind", event.target.value as MediaResource["kind"])
              }
            >
              <option value="movie">Movie · MovieFree link</option>
              <option value="youtube">YouTube video</option>
              <option value="music">Music</option>
              <option value="court">Court case / lecture</option>
            </select>
          </label>
          <label>
            Title
            <input
              required
              value={form.title}
              onChange={(event) => change("title", event.target.value)}
            />
          </label>
          <label>
            URL
            <input
              required
              type="url"
              pattern="https://.+"
              title="Link must start with https://"
              value={form.url}
              onChange={(event) => change("url", event.target.value)}
              placeholder="https://…"
            />
          </label>
          <label>
            Law topic
            <input
              required
              value={form.topic}
              onChange={(event) => change("topic", event.target.value)}
              placeholder="Evidence, advocacy, constitutional law…"
            />
          </label>
          <label>
            Source
            <input
              required
              value={form.source}
              onChange={(event) => change("source", event.target.value)}
            />
          </label>
          <button className="primary-button" type="submit">
            Add resource
          </button>
        </form>
      </div>
      <div className="media-grid">
        {media.map((item) => (
          <article className="card media-card" key={item.id}>
            <div className="media-frame">
              {item.kind === "youtube" || item.kind === "court" ? (
                <iframe
                  src={toEmbedUrl(item.url)}
                  title={item.title}
                  loading="lazy"
                  allowFullScreen
                />
              ) : (
                <div className="media-link-card">
                  <Film size={24} />
                  <strong>{item.title}</strong>
                  <a
                    href={safeUrl(item.url) || undefined}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open resource
                  </a>
                </div>
              )}
            </div>
            <div className="card-pad">
              <span className="chip">{item.kind}</span>
              <h3>{item.title}</h3>
              <p>
                {item.topic} · {item.source}
              </p>
              {safeUrl(item.url) && (
                <a
                  className="material-link"
                  href={safeUrl(item.url)}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open in new tab
                </a>
              )}
            </div>
          </article>
        ))}
      </div>
      {!media.length && (
        <div className="card card-pad empty">
          Your collection is empty. Add a law movie, YouTube video, music link,
          or court recording above.
        </div>
      )}
    </>
  );
}

function CounsellorPage() {
  return (
    <>
      <PageHeading
        eyebrow="A calm place to pause"
        title="Counsellor."
        subtitle="Private study support and signposting for when law school feels heavy."
      />
      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <CardHeader label="Talk it through" />
        <CounsellorChat />
      </div>
      <div className="grid grid-two">
        <div className="card card-pad">
          <div className="eyebrow">Start here</div>
          <h2>Take the next small step.</h2>
          <p className="subheading">
            Write down what is making today difficult, choose one task, and
            contact a trusted person or qualified counsellor when you need human
            support.
          </p>
          <div className="callout">
            <p>
              <strong>Important:</strong> This page is not a crisis service or a
              substitute for a licensed professional. If you may be in immediate
              danger, contact local emergency services or a trusted person now.
            </p>
            <p>
              In Kenya: Kenya Red Cross free helpline <strong>1199</strong>,
              Befrienders Kenya <strong>+254 722 178 177</strong> (call, SMS or
              WhatsApp), emergencies <strong>999</strong> or{" "}
              <strong>112</strong>.
            </p>
          </div>
        </div>
        <div className="card card-pad">
          <CardHeader label="Study-care prompts" />
          <div className="row-list">
            <div className="row">
              <span className="type-mark">01</span>
              <span className="row-title">
                What is the smallest useful task I can do in ten minutes?
              </span>
            </div>
            <div className="row">
              <span className="type-mark">02</span>
              <span className="row-title">
                Who can I tell that I need support today?
              </span>
            </div>
            <div className="row">
              <span className="type-mark">03</span>
              <span className="row-title">What can wait until tomorrow?</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function SectionedMembersPage({ members }: { members: Member[] }) {
  const [section, setSection] = useState<"all" | "A" | "B">("all");
  const visible = members.filter(
    (member) => section === "all" || member.section === section,
  );
  return (
    <>
      <PageHeading
        eyebrow="The people behind the work"
        title="Members."
        subtitle="Browse the group by Section A or Section B."
      />
      <div className="toolbar">
        <div className="segmented">
          <button
            className={section === "all" ? "active" : ""}
            onClick={() => setSection("all")}
          >
            Everyone
          </button>
          <button
            className={section === "A" ? "active" : ""}
            onClick={() => setSection("A")}
          >
            Section A
          </button>
          <button
            className={section === "B" ? "active" : ""}
            onClick={() => setSection("B")}
          >
            Section B
          </button>
        </div>
      </div>
      <div className="card card-pad">
        <div className="row-list">
          {visible.map((member) => (
            <div className="member" key={member.name}>
              <Avatar initials={member.initials} tone={member.tone} />
              <div>
                <div className="member-name">{member.name}</div>
                <div className="member-role">
                  Section {member.section ?? "A"} · {member.role}
                </div>
                <div className="member-role">{member.units}</div>
              </div>
              <div className="progress">
                <span
                  style={{
                    width: `${member.progress}%`,
                    background: member.tone,
                  }}
                />
              </div>
              <span className="stat-label">{member.progress}%</span>
            </div>
          ))}
        </div>
        {!visible.length && (
          <div className="empty">
            No members have been added to this section yet.
          </div>
        )}
      </div>
    </>
  );
}

function ArenaPage({
  materials,
  setPage,
  openReader,
}: {
  materials: Material[];
  setPage: (p: string) => void;
  openReader: (material: Material) => void;
}) {
  const [mode, setMode] = useState<"quick" | "moot">("quick");
  const [selectedId, setSelectedId] = useState(materials[0]?.id ?? "");
  const selected =
    materials.find((material) => material.id === selectedId) ?? materials[0];
  return (
    <>
      <PageHeading
        eyebrow="Practice with pressure"
        title="Legal Arena."
        subtitle="Practice only from sources you or your group have uploaded. No preloaded cases or invented scenarios."
      />
      <PracticeCoach />
      <PracticeRoom />
      <RealtimeJudgeRoom />
      {materials.length === 0 ? (
        <div className="card card-pad empty-state">
          <div className="section-label">Arena is waiting for research</div>
          <h2>Upload a source before you practise.</h2>
          <p>
            Add a case, statute, judgment, or lecture note to the library. The
            arena will use that source as the record for your exercise.
          </p>
          <button className="primary-button" onClick={() => setPage("library")}>
            Open library{" "}
            <ChevronRight size={14} style={{ verticalAlign: "middle" }} />
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-two">
            <div
              className={`card card-pad arena-card ${mode === "quick" ? "" : "light"}`}
            >
              <div>
                <div className="arena-kicker">Quick debate · 5–10 min</div>
                <h2>Build the argument.</h2>
                <p>
                  Choose an uploaded source, identify its rule, apply it to the
                  issue, and answer the strongest counterargument.
                </p>
              </div>
              <div className="arena-footer">
                <div className="rounds">
                  <span className="round active" />
                  <span className="round active" />
                  <span className="round" />
                  <span className="round" />
                </div>
                <button
                  className={
                    mode === "quick" ? "primary-button" : "secondary-button"
                  }
                  onClick={() => setMode("quick")}
                >
                  {mode === "quick" ? "Selected" : "Choose quick debate"}
                </button>
              </div>
            </div>
            <div
              className={`card card-pad arena-card ${mode === "moot" ? "" : "light"}`}
            >
              <div>
                <div className="arena-kicker">Full moot · 30–60 min</div>
                <h2>Work through the record.</h2>
                <p>
                  Use the same uploaded source for roles, issues, authorities,
                  and submissions. Nothing is pre-seeded.
                </p>
              </div>
              <div className="arena-footer">
                <div className="rounds">
                  <span className="round active" />
                  <span className="round active" />
                  <span className="round active" />
                  <span className="round" />
                </div>
                <button
                  className={
                    mode === "moot" ? "primary-button" : "secondary-button"
                  }
                  onClick={() => setMode("moot")}
                >
                  {mode === "moot" ? "Selected" : "Choose full moot"}
                </button>
              </div>
            </div>
          </div>
          <div className="card card-pad" style={{ marginTop: 18 }}>
            <CardHeader
              label={
                mode === "quick" ? "Quick debate source" : "Full moot source"
              }
              action={`${materials.length} uploaded`}
            />
            <label
              className="data-form"
              style={{ display: "block", marginTop: 18 }}
            >
              Research source
              <select
                value={selected?.id ?? ""}
                onChange={(event) => setSelectedId(event.target.value)}
              >
                {materials.map((material) => (
                  <option key={material.id} value={material.id}>
                    {material.title} · {material.type}
                  </option>
                ))}
              </select>
            </label>
            {selected && (
              <div className="detail-title" style={{ marginTop: 21 }}>
                <div>
                  <div className="eyebrow">
                    {selected.unit} · {selected.topic}
                  </div>
                  <h2>{selected.title}</h2>
                  <div className="detail-meta">
                    {selected.topic || selected.source}
                  </div>
                </div>
                <button
                  className="primary-button"
                  onClick={() => openReader(selected)}
                >
                  Open source{" "}
                  <ChevronRight size={14} style={{ verticalAlign: "middle" }} />
                </button>
              </div>
            )}
            <div className="callout" style={{ marginTop: 18 }}>
              <p>
                <strong>How this works:</strong> read the source, draft your
                argument, and keep your citations tied to the uploaded material.
                AI judging will be added through your secured Google AI Studio
                server integration once the model endpoint and research-file
                format are configured.
              </p>
            </div>
          </div>
        </>
      )}
    </>
  );
}

function PracticeCoach() {
  const [kind, setKind] = useState<"moot" | "kmun">("moot");
  const [mode, setMode] = useState<"guide" | "practice" | "judge">("guide");
  const [brief, setBrief] = useState("");
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState("");
  const feature: AIFeature =
    kind === "moot"
      ? mode === "judge"
        ? "moot_judge"
        : mode === "guide"
          ? "moot_guide"
          : "moot"
      : mode === "guide"
        ? "kmun_guide"
        : "kmun";
  const run = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await askAI({
        feature,
        mode: "general",
        messages: [
          {
            role: "user",
            content:
              brief.trim() ||
              (kind === "moot"
                ? "Teach me the basics and give me a short practice drill."
                : "Teach me the basics and give me a short delegate practice drill."),
          },
        ],
      });
      setAnswer(result.answer);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The coach is unavailable right now.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="card card-pad practice-coach">
      <div className="card-header">
        <div>
          <div className="section-label">Personal practice studio</div>
          <p className="subheading">
            Learn the rules, practise under pressure, then receive judge-style
            feedback.
          </p>
        </div>
        <span className="chip">Moot Court + KMUN</span>
      </div>
      <div className="segmented practice-tabs" role="tablist">
        <button
          className={kind === "moot" ? "active" : ""}
          onClick={() => {
            setKind("moot");
            setAnswer("");
          }}
        >
          Moot Court
        </button>
        <button
          className={kind === "kmun" ? "active" : ""}
          onClick={() => {
            setKind("kmun");
            setAnswer("");
          }}
        >
          KMUN
        </button>
      </div>
      <div className="practice-modes">
        <button
          className={mode === "guide" ? "active" : ""}
          onClick={() => setMode("guide")}
        >
          Guide me
        </button>
        <button
          className={mode === "practice" ? "active" : ""}
          onClick={() => setMode("practice")}
        >
          Practice drill
        </button>
        {kind === "moot" && (
          <button
            className={mode === "judge" ? "active" : ""}
            onClick={() => setMode("judge")}
          >
            AI judge
          </button>
        )}
      </div>
      <form className="data-form" onSubmit={run}>
        <label>
          {mode === "judge"
            ? "Your submission or moot problem"
            : kind === "moot"
              ? "What do you want to work on?"
              : "Country, committee, agenda, or speech"}
          <textarea
            value={brief}
            onChange={(event) => setBrief(event.target.value)}
            rows={4}
            placeholder={
              kind === "moot"
                ? "Example: I represent the appellant in a judicial review moot…"
                : "Example: Kenya, UNHRC, digital privacy and surveillance…"
            }
          />
        </label>
        <button className="primary-button" type="submit" disabled={busy}>
          {busy
            ? "Coach is preparing…"
            : mode === "judge"
              ? "Judge my submission"
              : "Start practice"}
        </button>
      </form>
      {error && (
        <div className="connection-error" style={{ marginTop: 14 }}>
          {error}
        </div>
      )}
      {answer && (
        <div className="practice-answer">
          <Markdown text={answer} />
        </div>
      )}
    </div>
  );
}

function LibraryPageReal({
  materials,
  search,
  setSearch,
  openCreate,
  openEdit,
  openReader,
  canDelete,
  onDelete,
}: {
  materials: Material[];
  search: string;
  setSearch: (value: string) => void;
  openCreate: () => void;
  openEdit: (material: Material) => void;
  openReader: (material: Material) => void;
  canDelete: (material: Material) => boolean;
  onDelete: (material: Material) => void;
}) {
  return (
    <>
      <PageHeading
        eyebrow="Shared source desk"
        title="The library."
        subtitle="Find the authority, note, or past paper you need without digging through folders."
      />
      <div className="toolbar">
        <div className="search">
          <Search size={15} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search title, topic, unit…"
          />
        </div>
        <button className="primary-button" onClick={openCreate}>
          <Plus size={14} style={{ verticalAlign: "middle" }} /> Add material
        </button>
      </div>
      <div className="card card-pad table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: "40%" }}>Material</th>
              <th>Type</th>
              <th>Unit</th>
              <th>Added</th>
              <th>Resource</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {materials.map((material) => (
              <tr key={material.id}>
                <td>
                  <span className="material-title">{material.title}</span>
                  <span className="material-sub">{material.topic}</span>
                </td>
                <td>
                  <span className="chip">
                    <span className="chip-dot" />
                    {material.type}
                  </span>
                </td>
                <td>{material.unit}</td>
                <td>{material.date}</td>
                <td>
                  {material.url ? (
                    <div className="resource-actions">
                      <button
                        className="material-link material-preview-button"
                        onClick={() => openReader(material)}
                      >
                        Preview & read
                      </button>
                      <DownloadLink material={material} />
                    </div>
                  ) : (
                    material.source
                  )}
                </td>
                <td>
                  <div className="resource-actions">
                    <button
                      className="secondary-button small-action"
                      onClick={() => openEdit(material)}
                      aria-label={`Edit ${material.title}`}
                    >
                      Edit
                    </button>
                    {canDelete(material) && (
                      <button
                        className="small-danger"
                        onClick={() => onDelete(material)}
                        aria-label={`Delete ${material.title}`}
                      >
                        <Trash2 size={12} /> Delete
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!materials.length && (
          <div className="empty">
            No materials match “{search}”. Add one using the button above.
          </div>
        )}
      </div>
    </>
  );
}

function AssignmentsPageReal({
  assignments,
  selected,
  selectedId,
  setSelected,
  bump,
  openCreate,
}: {
  assignments: Assignment[];
  selected?: Assignment;
  selectedId: string;
  setSelected: (id: string) => void;
  bump: (id: string) => Promise<void>;
  openCreate: () => void;
}) {
  return (
    <>
      <PageHeading
        eyebrow="Work in progress"
        title="Assignments."
        subtitle="Create and track assignments. New ones appear on everyone’s to-do list automatically."
      />
      <div className="page-grid">
        <div className="card card-pad">
          <CardHeader
            label="Your queue"
            action={`${assignments.length} assignments`}
          />
          <div className="row-list">
            {assignments.map((assignment) => (
              <button
                className="row assignment-row"
                key={assignment.id}
                onClick={() => setSelected(assignment.id)}
              >
                <div className="type-mark">
                  {assignment.unit.slice(0, 2).toUpperCase()}
                </div>
                <div className="row-main">
                  <div className="row-title">{assignment.title}</div>
                  <div className="row-meta">
                    {assignment.unit} · Reviewer: {assignment.reviewer}
                  </div>
                </div>
                <div className="row-end">
                  <span className="chip">{assignment.status}</span>
                  <strong>{assignment.due}</strong>
                </div>
              </button>
            ))}
          </div>
          <button
            className="secondary-button"
            style={{ marginTop: 17 }}
            onClick={openCreate}
          >
            <Plus size={14} style={{ verticalAlign: "middle" }} /> New
            assignment
          </button>
        </div>
        <div className="card card-pad">
          {selected ? (
            <>
              <div className="eyebrow">Assignment detail</div>
              <h2 style={{ fontSize: 28 }}>{selected.title}</h2>
              <div className="detail-meta">
                {selected.unit} · Due {selected.due} · Reviewer{" "}
                {selected.reviewer}
              </div>
              <div className="callout">
                <p>
                  <strong>Brief:</strong> {selected.brief}
                </p>
              </div>
              <button
                className="primary-button"
                style={{ marginTop: 20 }}
                onClick={() => void bump(selected.id)}
              >
                Save next status{" "}
                <ChevronRight size={14} style={{ verticalAlign: "middle" }} />
              </button>
            </>
          ) : (
            <div className="empty">
              Select an assignment to see its details.
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function FormShell({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="form-overlay">
      <div className="form-card">
        <div className="detail-title">
          <h2>{title}</h2>
          <button className="icon-button" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
function MaterialForm({
  units,
  initial,
  onClose,
  onCreated,
  onUpdated,
}: {
  units: Unit[];
  initial?: Material;
  onClose: () => void;
  onCreated?: (material: Omit<Material, "id">, file?: File) => Promise<void>;
  onUpdated?: (material: Omit<Material, "id">) => Promise<void>;
}) {
  const [file, setFile] = useState<File>();
  const [extracting, setExtracting] = useState(false);
  const [extractNote, setExtractNote] = useState("");
  const [form, setForm] = useState<Omit<Material, "id">>(() =>
    initial
      ? {
          title: initial.title,
          type: initial.type,
          unit: initial.unit,
          topic: initial.topic,
          date: initial.date,
          source: initial.source,
          url: initial.url ?? "",
          storage_path: initial.storage_path,
          owner_id: initial.owner_id,
        }
      : {
          title: "",
          type: "Lecture notes",
          unit: units[0]?.name ?? "",
          topic: "",
          date: new Date().toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          }),
          source: "Group 13",
          url: "",
        },
  );
  const change = (key: keyof typeof form, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));
  const inspectBook = async (selectedFile: File | undefined) => {
    setFile(selectedFile);
    if (!selectedFile || initial) return;
    setExtracting(true);
    setExtractNote("Reading the book and extracting details…");
    try {
      const text = (await extractText(selectedFile)).trim();
      if (text.length < 60)
        throw new Error(
          "The file has too little readable text. Scanned PDFs need OCR first.",
        );
      const availableUnits = units.map((unit) => unit.name).join("; ");
      const result = await askAI({
        feature: "book_metadata",
        mode: "general",
        messages: [
          {
            role: "user",
            content: `Inspect this uploaded book. Available units are: ${availableUnits || "none"}. Choose a matching unit only from that list. File name: ${selectedFile.name}\n\nBOOK TEXT:\n${text.slice(0, 60000)}`,
          },
        ],
      });
      const metadata = result.data as {
        title?: string;
        type?: string;
        unit?: string;
        topics?: string[];
        source?: string;
        date?: string;
      } | null;
      const matchingUnit = units.find(
        (unit) => unit.name === metadata?.unit,
      )?.name;
      setForm((current) => ({
        ...current,
        title:
          metadata?.title?.trim() ||
          current.title ||
          selectedFile.name.replace(/\.[^.]+$/, ""),
        type: metadata?.type?.trim() || current.type,
        unit: matchingUnit || current.unit,
        topic: Array.isArray(metadata?.topics)
          ? metadata.topics.filter(Boolean).join(", ")
          : current.topic,
        source: metadata?.source?.trim() || current.source,
        date: metadata?.date?.trim() || current.date,
      }));
      setExtractNote("Details extracted. Review them before saving.");
    } catch (error) {
      setExtractNote(
        error instanceof Error
          ? error.message
          : "Could not extract book details. Enter them manually.",
      );
    } finally {
      setExtracting(false);
    }
  };
  return (
    <FormShell
      title={initial ? "Edit book details" : "Add library material"}
      onClose={onClose}
    >
      <form
        className="data-form"
        onSubmit={(event) => {
          event.preventDefault();
          void (initial ? onUpdated?.(form) : onCreated?.(form, file));
        }}
      >
        <label>
          Title
          <input
            required
            value={form.title}
            onChange={(event) => change("title", event.target.value)}
          />
        </label>
        <label>
          Type
          <select
            value={form.type}
            onChange={(event) => change("type", event.target.value)}
          >
            <option>Lecture notes</option>
            <option>Case brief</option>
            <option>Statute</option>
            <option>Textbook</option>
            <option>Past paper</option>
            <option>Guide</option>
          </select>
        </label>
        <label>
          Unit
          <select
            value={form.unit}
            onChange={(event) => change("unit", event.target.value)}
          >
            {units.map((unit) => (
              <option key={unit.id}>{unit.name}</option>
            ))}
          </select>
        </label>
        <label>
          Topics
          <span className="field-hint">
            Separate multiple topics with commas
          </span>
          <input
            required
            value={form.topic}
            onChange={(event) => change("topic", event.target.value)}
          />
        </label>
        <label>
          Source
          <input
            required
            value={form.source}
            onChange={(event) => change("source", event.target.value)}
          />
        </label>
        <label>
          Material link{" "}
          <span className="field-hint">Optional if uploading a file</span>
          <input
            type="url"
            pattern="https?://.+"
            title="Link must start with http:// or https://"
            value={form.url ?? ""}
            onChange={(event) => change("url", event.target.value)}
            placeholder="https://…"
          />
        </label>
        <label>
          Upload file{" "}
          <span className="field-hint">Optional PDF, DOCX, or image</span>
          <input
            type="file"
            accept=".pdf,.doc,.docx,.ppt,.pptx,.txt,.png,.jpg,.jpeg"
            onChange={(event) => void inspectBook(event.target.files?.[0])}
          />
          {extracting && (
            <span className="field-hint">
              AI is analysing the readable text…
            </span>
          )}
          {!extracting && extractNote && (
            <span className="field-hint">{extractNote}</span>
          )}
        </label>
        <button className="primary-button" type="submit">
          {initial
            ? "Save book details"
            : file
              ? "Upload material"
              : "Save material link"}
        </button>
      </form>
    </FormShell>
  );
}
function AssignmentForm({
  units,
  owner,
  onClose,
  onCreated,
}: {
  units: Unit[];
  owner: string;
  onClose: () => void;
  onCreated: (assignment: Omit<Assignment, "id">) => Promise<void>;
}) {
  const [form, setForm] = useState<Omit<Assignment, "id">>({
    title: "",
    unit: units[0]?.name ?? "",
    due: "",
    status: "Not Started",
    owner,
    reviewer: "",
    brief: "",
  });
  const change = (key: keyof typeof form, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));
  return (
    <FormShell title="New assignment" onClose={onClose}>
      <form
        className="data-form"
        onSubmit={(event) => {
          event.preventDefault();
          void onCreated(form);
        }}
      >
        <label>
          Title
          <input
            required
            value={form.title}
            onChange={(event) => change("title", event.target.value)}
          />
        </label>
        <label>
          Unit
          <select
            value={form.unit}
            onChange={(event) => change("unit", event.target.value)}
          >
            {units.map((unit) => (
              <option key={unit.id}>{unit.name}</option>
            ))}
          </select>
        </label>
        <label>
          Due date
          <input
            required
            value={form.due}
            onChange={(event) => change("due", event.target.value)}
            placeholder="10 Oct 2026"
          />
        </label>
        <label>
          Reviewer
          <input
            required
            value={form.reviewer}
            onChange={(event) => change("reviewer", event.target.value)}
          />
        </label>
        <label>
          Brief
          <textarea
            required
            value={form.brief}
            onChange={(event) => change("brief", event.target.value)}
          />
        </label>
        <button className="primary-button" type="submit">
          Create assignment
        </button>
      </form>
    </FormShell>
  );
}
function ProfileSettings({
  profile,
  onSave,
  onUpload,
  setNotice,
}: {
  profile: UserProfile;
  onSave: (changes: Partial<UserProfile>) => Promise<void>;
  onUpload: (kind: "avatar" | "wallpaper", file: File) => Promise<void>;
  setNotice: (notice: string) => void;
}) {
  const [name, setName] = useState(profile.displayName);
  const [role, setRole] = useState(profile.role);
  const [busy, setBusy] = useState("");
  const completion =
    ([name.trim(), role.trim(), profile.avatarUrl].filter(Boolean).length / 3) *
    100;
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy("profile");
    try {
      await onSave({ displayName: name.trim(), role: role.trim() });
      setNotice("Profile saved.");
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Could not save profile.",
      );
    } finally {
      setBusy("");
    }
  };
  const upload = async (kind: "avatar" | "wallpaper", file?: File) => {
    if (!file) return;
    setBusy(kind);
    try {
      await onUpload(kind, file);
      setNotice(
        kind === "avatar"
          ? "Profile picture updated."
          : "Workspace wallpaper updated.",
      );
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Could not upload image.",
      );
    } finally {
      setBusy("");
    }
  };
  return (
    <div className="card card-pad profile-settings">
      <div className="card-header">
        <span className="section-label">Your profile</span>
        <span className="quiet">{Math.round(completion)}% complete</span>
      </div>
      <div className="profile-settings-grid">
        <div>
          <div className="profile-preview">
            <Avatar
              initials={profileInitials(name)}
              tone="#C96E52"
              image={profile.avatarUrl}
            />
            <div>
              <strong>{name || "Your name"}</strong>
              <span>{role || "Add your role"}</span>
            </div>
          </div>
          <div className="progress profile-progress">
            <span style={{ width: `${completion}%` }} />
          </div>
          <p className="field-hint">
            Add your name, role, and a picture to reach 100%.
          </p>
        </div>
        <form className="data-form" onSubmit={save}>
          <label>
            Display name
            <input
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Amina M."
            />
          </label>
          <label>
            Role or year
            <input
              required
              value={role}
              onChange={(event) => setRole(event.target.value)}
              placeholder="e.g. LLB · Year 1"
            />
          </label>
          <button
            className="primary-button"
            type="submit"
            disabled={busy === "profile"}
          >
            {busy === "profile" ? "Saving…" : "Save profile"}
          </button>
        </form>
      </div>
      <div className="profile-upload-row">
        <label className="upload-tile">
          Profile picture
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(event) => void upload("avatar", event.target.files?.[0])}
          />
          <span>{busy === "avatar" ? "Uploading…" : "Choose image"}</span>
        </label>
        <label className="upload-tile">
          Workspace wallpaper
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(event) =>
              void upload("wallpaper", event.target.files?.[0])
            }
          />
          <span>
            {busy === "wallpaper"
              ? "Uploading…"
              : profile.wallpaperUrl
                ? "Change image"
                : "Choose image"}
          </span>
        </label>
      </div>
    </div>
  );
}

function SettingsPage({ setNotice }: { setNotice: (n: string) => void }) {
  const connected = isSupabaseConfigured;
  return (
    <>
      <PageHeading
        eyebrow="The foundation underneath"
        title="Settings."
        subtitle={
          connected
            ? "Supabase is active. The workspace is reading from your project."
            : "Add your Supabase environment values to switch from demo data to your project."
        }
        stamp={false}
      />
      <div className="grid grid-two">
        <div className="card card-pad">
          <CardHeader
            label="Supabase connection"
            action={connected ? "Connected" : "Not configured"}
          />
          <div className="callout">
            <p>
              <strong>
                {connected
                  ? "Source of truth: Supabase."
                  : "Configuration required."}
              </strong>{" "}
              {connected
                ? "Live tables and policies are connected."
                : "Copy .env.example to .env.local, add the two browser-safe values, and restart the dev server."}
            </p>
          </div>
          <div style={{ marginTop: 20 }}>
            <div className="section-label">Environment keys</div>
            <div className="row-list">
              <div className="row">
                <div className="type-mark">URL</div>
                <div className="row-main">
                  <div className="row-title">VITE_SUPABASE_URL</div>
                  <div className="row-meta">Your project URL</div>
                </div>
                <span className={`chip ${connected ? "green" : ""}`}>
                  {connected ? "loaded" : "pending"}
                </span>
              </div>
              <div className="row">
                <div className="type-mark">KEY</div>
                <div className="row-main">
                  <div className="row-title">VITE_SUPABASE_ANON_KEY</div>
                  <div className="row-meta">Browser-safe anonymous key</div>
                </div>
                <span className={`chip ${connected ? "green" : ""}`}>
                  {connected ? "loaded" : "pending"}
                </span>
              </div>
            </div>
          </div>
          <button
            className="primary-button"
            style={{ marginTop: 18 }}
            onClick={() =>
              setNotice(
                connected
                  ? "Supabase environment loaded. Restart Vite after editing .env.local."
                  : "Add both Supabase variables and restart Vite.",
              )
            }
          >
            Check configuration
          </button>
        </div>
        <div className="card card-pad">
          <CardHeader label="Live features" />
          <div className="row-list">
            {[
              "Supabase data reads",
              "Library material creation",
              "Assignment creation and status updates",
              "WebRTC discussion rooms",
              "Realtime room chat and presence",
            ].map((item) => (
              <div className="row" key={item}>
                <Check size={15} color="var(--forest)" />
                <span className="row-title">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

export default App;

import { useEffect, useState, useCallback } from "react";
import { apiClient } from "../api/client";
import {
  type ClassLevel,
  type ChapterStatus,
  type NcertSubjectData,
  NCERT_SYLLABUS,
  getSubjectByKey,
  chapterKey,
} from "../data/ncert-syllabus";
import { getChapterMarks, hasBoardMarks, chapterPriority } from "../data/cbse-weightage";

// ── Setup helpers ─────────────────────────────────────────────────────────────

const CLASS_OPTIONS: ClassLevel[] = ["X", "XI", "XII"];

const CLASS_X_SUBJECT_KEYS = [
  "X-Mathematics",
  "X-Science",
  "X-English",
  "X-History",
  "X-Geography",
  "X-Political-Science",
  "X-Economics",
] as const;

type Stream = "PCM" | "PCB" | "PCMB";

function subjectKeysForStream(classLevel: "XI" | "XII", stream: Stream, includeEnglish: boolean): string[] {
  const base: Record<Stream, string[]> = {
    PCM: [`${classLevel}-Physics`, `${classLevel}-Chemistry`, `${classLevel}-Mathematics`],
    PCB: [`${classLevel}-Physics`, `${classLevel}-Chemistry`, `${classLevel}-Biology`],
    PCMB: [`${classLevel}-Physics`, `${classLevel}-Chemistry`, `${classLevel}-Mathematics`, `${classLevel}-Biology`],
  };
  const keys = [...base[stream]];
  if (includeEnglish) keys.push(`${classLevel}-English`);
  return keys;
}

// ── Status styling ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  ChapterStatus,
  { label: string; icon: string; bg: string; color: string; border: string }
> = {
  not_started: {
    label: "Not Started",
    icon: "⬜",
    bg: "#f9fafb",
    color: "#6b7280",
    border: "#e5e7eb",
  },
  in_progress: {
    label: "In Progress",
    icon: "🔵",
    bg: "#eff6ff",
    color: "#1d4ed8",
    border: "#bfdbfe",
  },
  studied: {
    label: "Studied",
    icon: "✅",
    bg: "#f0fdf4",
    color: "#15803d",
    border: "#bbf7d0",
  },
};

const STATUS_CYCLE: ChapterStatus[] = ["not_started", "in_progress", "studied"];

function nextStatus(current: ChapterStatus): ChapterStatus {
  const idx = STATUS_CYCLE.indexOf(current);
  return STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length];
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SyllabusTrackerPage() {
  // Profile state
  const [profile, setProfile] = useState<{
    classLevel: string;
    subjectKeys: string[];
    setupDone: boolean;
  } | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);

  // Setup form state
  const [setupClass, setSetupClass] = useState<ClassLevel>("XI");
  const [setupStream, setSetupStream] = useState<Stream>("PCM");
  const [setupEnglish, setSetupEnglish] = useState(true);
  const [setupXSubjects, setSetupXSubjects] = useState<string[]>([...CLASS_X_SUBJECT_KEYS]);
  const [setupSaving, setSetupSaving] = useState(false);

  // Progress state
  const [progress, setProgress] = useState<Record<string, ChapterStatus>>({});
  const [activeSubjectKey, setActiveSubjectKey] = useState<string>("");
  const [priorityMode, setPriorityMode] = useState(false);

  // Load profile and progress on mount
  useEffect(() => {
    Promise.all([apiClient.getSyllabusProfile(), apiClient.getSyllabusProgress()])
      .then(([p, prog]) => {
        setProfile(p);
        setProgress((prog ?? {}) as Record<string, ChapterStatus>);
        if (p?.subjectKeys?.length) setActiveSubjectKey(p.subjectKeys[0]);
      })
      .catch(console.error)
      .finally(() => setProfileLoading(false));
  }, []);

  // Save setup
  const handleSaveSetup = async () => {
    setSetupSaving(true);
    try {
      let subjectKeys: string[];
      if (setupClass === "X") {
        subjectKeys = setupXSubjects;
      } else {
        subjectKeys = subjectKeysForStream(setupClass as "XI" | "XII", setupStream, setupEnglish);
      }
      if (!subjectKeys.length) return;
      const saved = await apiClient.saveSyllabusProfile({ classLevel: setupClass, subjectKeys });
      setProfile(saved);
      setActiveSubjectKey(subjectKeys[0]);
    } finally {
      setSetupSaving(false);
    }
  };

  // Toggle chapter status
  const toggleChapter = useCallback(
    async (subjectKey: string, chIdx: number) => {
      const key = chapterKey(subjectKey, chIdx);
      const current = progress[key] ?? "not_started";
      const next = nextStatus(current);
      setProgress((prev) => ({ ...prev, [key]: next }));
      try {
        await apiClient.updateSyllabusProgress({ chapterKey: key, status: next });
      } catch {
        // Revert on failure
        setProgress((prev) => ({ ...prev, [key]: current }));
      }
    },
    [progress]
  );

  // Active subject data
  const activeSubject = activeSubjectKey ? getSubjectByKey(activeSubjectKey) : null;

  // Progress stats for a subject
  function subjectStats(subjectKey: string, subject: NcertSubjectData) {
    const total = subject.chapters.length;
    const studied = subject.chapters.filter(
      (_, i) => progress[chapterKey(subjectKey, i)] === "studied"
    ).length;
    const inProgress = subject.chapters.filter(
      (_, i) => progress[chapterKey(subjectKey, i)] === "in_progress"
    ).length;
    const pct = total ? Math.round((studied / total) * 100) : 0;
    return { total, studied, inProgress, pct };
  }

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (profileLoading) {
    return (
      <div className="page" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
        <div className="tag">Loading your syllabus tracker...</div>
      </div>
    );
  }

  // ── Setup screen ─────────────────────────────────────────────────────────────
  if (!profile?.setupDone) {
    const isX = setupClass === "X";
    return (
      <div className="page">
        <h2 style={{ marginTop: 0 }}>Set Up Your Syllabus Tracker</h2>
        <p style={{ color: "var(--color-text-muted)", marginBottom: "28px" }}>
          This is a one-time setup. Choose your class and subjects — you can change these later.
        </p>

        {/* Class selector */}
        <div className="card" style={{ marginBottom: "20px" }}>
          <h3 style={{ marginTop: 0, marginBottom: "14px" }}>Select Your Class</h3>
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
            {CLASS_OPTIONS.map((cls) => (
              <button
                key={cls}
                onClick={() => setSetupClass(cls)}
                style={{
                  padding: "10px 28px",
                  borderRadius: "8px",
                  border: `2px solid ${setupClass === cls ? "var(--color-primary)" : "#e5e7eb"}`,
                  background: setupClass === cls ? "var(--color-primary)" : "#fff",
                  color: setupClass === cls ? "#fff" : "var(--color-text)",
                  fontWeight: 600,
                  fontSize: "1rem",
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
              >
                Class {cls}
              </button>
            ))}
          </div>
        </div>

        {/* Subject selection */}
        <div className="card" style={{ marginBottom: "24px" }}>
          <h3 style={{ marginTop: 0, marginBottom: "14px" }}>
            {isX ? "Select Subjects" : "Select Your Stream"}
          </h3>

          {isX ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {CLASS_X_SUBJECT_KEYS.map((key) => {
                const sub = getSubjectByKey(key);
                const checked = setupXSubjects.includes(key);
                return (
                  <label
                    key={key}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      cursor: "pointer",
                      padding: "8px 12px",
                      borderRadius: "8px",
                      border: `1px solid ${checked ? "var(--color-primary-light)" : "#e5e7eb"}`,
                      background: checked ? "#f0f7ff" : "#fff",
                      transition: "all 0.15s",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) =>
                        setSetupXSubjects((prev) =>
                          e.target.checked ? [...prev, key] : prev.filter((k) => k !== key)
                        )
                      }
                    />
                    <span style={{ fontWeight: 500 }}>{sub?.name}</span>
                  </label>
                );
              })}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                {(["PCM", "PCB", "PCMB"] as Stream[]).map((s) => (
                  <button
                    key={s}
                    onClick={() => setSetupStream(s)}
                    style={{
                      padding: "10px 24px",
                      borderRadius: "8px",
                      border: `2px solid ${setupStream === s ? "var(--color-primary)" : "#e5e7eb"}`,
                      background: setupStream === s ? "var(--color-primary)" : "#fff",
                      color: setupStream === s ? "#fff" : "var(--color-text)",
                      fontWeight: 600,
                      cursor: "pointer",
                      transition: "all 0.15s",
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  cursor: "pointer",
                  padding: "8px 12px",
                  borderRadius: "8px",
                  border: `1px solid ${setupEnglish ? "var(--color-primary-light)" : "#e5e7eb"}`,
                  background: setupEnglish ? "#f0f7ff" : "#fff",
                  width: "fit-content",
                }}
              >
                <input
                  type="checkbox"
                  checked={setupEnglish}
                  onChange={(e) => setSetupEnglish(e.target.checked)}
                />
                <span style={{ fontWeight: 500 }}>Include English</span>
              </label>
              <div style={{ fontSize: "0.85rem", color: "var(--color-text-muted)", padding: "8px 12px", background: "#f9fafb", borderRadius: "8px" }}>
                <strong>Subjects: </strong>
                {subjectKeysForStream(setupClass as "XI" | "XII", setupStream, setupEnglish)
                  .map((k) => getSubjectByKey(k)?.name)
                  .join(", ")}
              </div>
            </div>
          )}
        </div>

        <button
          className="primary-button"
          onClick={handleSaveSetup}
          disabled={setupSaving || (isX && setupXSubjects.length === 0)}
        >
          {setupSaving ? "Saving..." : "Start Tracking"}
        </button>
      </div>
    );
  }

  // ── Main tracker ─────────────────────────────────────────────────────────────
  const subjectList: NcertSubjectData[] = (profile.subjectKeys ?? [])
    .map((k) => getSubjectByKey(k))
    .filter(Boolean) as NcertSubjectData[];

  return (
    <div className="page">
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <h2 style={{ margin: 0 }}>Syllabus Tracker</h2>
          <p style={{ margin: "4px 0 0", color: "var(--color-text-muted)", fontSize: "0.9rem" }}>
            Class {profile.classLevel} · NCERT 2024 · Tap a chapter to update progress
          </p>
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
          {activeSubject && hasBoardMarks(activeSubjectKey) && (
            <button
              onClick={() => setPriorityMode((p) => !p)}
              style={{
                fontSize: "0.8rem", padding: "6px 14px", borderRadius: "8px", cursor: "pointer",
                border: `1px solid ${priorityMode ? "#f59e0b" : "#e5e7eb"}`,
                background: priorityMode ? "#fffbeb" : "#fff",
                color: priorityMode ? "#b45309" : "var(--color-text)",
                fontWeight: priorityMode ? 600 : 400,
              }}
            >
              {priorityMode ? "🎯 Priority ON" : "🎯 Board Priority"}
            </button>
          )}
          <button
            className="secondary-button"
            style={{ fontSize: "0.8rem" }}
            onClick={() => setProfile({ ...profile, setupDone: false })}
          >
            Change Subjects
          </button>
        </div>
      </div>

      {/* Overall summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "12px", marginBottom: "24px" }}>
        {subjectList.map((sub) => {
          const { studied, total, pct } = subjectStats(sub.key, sub);
          return (
            <button
              key={sub.key}
              onClick={() => setActiveSubjectKey(sub.key)}
              style={{
                padding: "14px",
                borderRadius: "10px",
                border: `2px solid ${activeSubjectKey === sub.key ? "var(--color-primary)" : "#e5e7eb"}`,
                background: activeSubjectKey === sub.key ? "#f0f7ff" : "#fff",
                cursor: "pointer",
                textAlign: "left",
                transition: "all 0.15s",
              }}
            >
              <div style={{ fontWeight: 600, fontSize: "0.9rem", marginBottom: "6px" }}>{sub.shortName}</div>
              {/* Progress bar */}
              <div style={{ height: "5px", borderRadius: "3px", background: "#e5e7eb", marginBottom: "6px", overflow: "hidden" }}>
                <div
                  style={{
                    height: "100%",
                    width: `${pct}%`,
                    background: pct === 100 ? "#16a34a" : "var(--color-primary)",
                    borderRadius: "3px",
                    transition: "width 0.3s",
                  }}
                />
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
                {studied}/{total} chapters · {pct}%
              </div>
            </button>
          );
        })}
      </div>

      {/* Chapter list for active subject */}
      {activeSubject && (
        <div className="card">
          {/* Subject header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px", flexWrap: "wrap", gap: "8px" }}>
            <div>
              <h3 style={{ margin: 0 }}>{activeSubject.name}</h3>
              {(() => {
                const { studied, inProgress, total, pct } = subjectStats(activeSubject.key, activeSubject);
                return (
                  <p style={{ margin: "4px 0 0", fontSize: "0.85rem", color: "var(--color-text-muted)" }}>
                    {studied} studied · {inProgress} in progress · {total - studied - inProgress} not started · {pct}% complete
                  </p>
                );
              })()}
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                className="secondary-button"
                style={{ fontSize: "0.78rem", padding: "5px 14px" }}
                onClick={async () => {
                  const updates: Promise<any>[] = [];
                  activeSubject.chapters.forEach((_, i) => {
                    const key = chapterKey(activeSubject.key, i);
                    if ((progress[key] ?? "not_started") !== "studied") {
                      setProgress((prev) => ({ ...prev, [key]: "studied" }));
                      updates.push(apiClient.updateSyllabusProgress({ chapterKey: key, status: "studied" }));
                    }
                  });
                  await Promise.all(updates);
                }}
              >
                Mark All Studied
              </button>
              <button
                className="secondary-button"
                style={{ fontSize: "0.78rem", padding: "5px 14px" }}
                onClick={async () => {
                  const updates: Promise<any>[] = [];
                  activeSubject.chapters.forEach((_, i) => {
                    const key = chapterKey(activeSubject.key, i);
                    if ((progress[key] ?? "not_started") !== "not_started") {
                      setProgress((prev) => ({ ...prev, [key]: "not_started" }));
                      updates.push(apiClient.updateSyllabusProgress({ chapterKey: key, status: "not_started" }));
                    }
                  });
                  await Promise.all(updates);
                }}
              >
                Reset All
              </button>
            </div>
          </div>

          {/* Chapter rows, grouped by section if applicable */}
          {renderChapterList(activeSubject, progress, toggleChapter, priorityMode)}
        </div>
      )}

      {/* Legend */}
      <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", marginTop: "16px" }}>
        {(Object.entries(STATUS_CONFIG) as [ChapterStatus, typeof STATUS_CONFIG[ChapterStatus]][]).map(
          ([status, cfg]) => (
            <div key={status} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.82rem", color: "var(--color-text-muted)" }}>
              <span>{cfg.icon}</span> {cfg.label}
            </div>
          )
        )}
        <span style={{ fontSize: "0.82rem", color: "var(--color-text-muted)" }}>· Tap any chapter to cycle its status</span>
      </div>
    </div>
  );
}

// ── Chapter list renderer (handles section grouping for English) ──────────────

function renderChapterList(
  subject: NcertSubjectData,
  progress: Record<string, ChapterStatus>,
  onToggle: (subjectKey: string, chapterIndex: number) => void,
  priorityMode: boolean
) {
  const hasSections = subject.chapters.some((c) => c.section);

  // Build flat list with global indices
  type ChapterItem = { chapter: typeof subject.chapters[0]; globalIndex: number };
  let allItems: ChapterItem[] = subject.chapters.map((ch, i) => ({ chapter: ch, globalIndex: i }));

  // In priority mode, sort by descending priority score (unstudied high-mark chapters first)
  if (priorityMode) {
    allItems = [...allItems].sort((a, b) => {
      const pa = chapterPriority(subject.key, a.globalIndex, progress[chapterKey(subject.key, a.globalIndex)] ?? "not_started");
      const pb = chapterPriority(subject.key, b.globalIndex, progress[chapterKey(subject.key, b.globalIndex)] ?? "not_started");
      return pb - pa;
    });
  }

  if (!hasSections || priorityMode) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        {allItems.map(({ chapter, globalIndex }) => (
          <ChapterRow
            key={globalIndex}
            index={globalIndex}
            name={chapter.name}
            subjectKey={subject.key}
            status={progress[chapterKey(subject.key, globalIndex)] ?? "not_started"}
            onToggle={() => onToggle(subject.key, globalIndex)}
            priorityMode={priorityMode}
          />
        ))}
      </div>
    );
  }

  // Group by section
  const sections: { name: string; chapters: ChapterItem[] }[] = [];
  for (const item of allItems) {
    const sectionName = item.chapter.section ?? "Other";
    let section = sections.find((s) => s.name === sectionName);
    if (!section) {
      section = { name: sectionName, chapters: [] };
      sections.push(section);
    }
    section.chapters.push(item);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
      {sections.map((section) => (
        <div key={section.name}>
          <div
            style={{
              fontSize: "0.78rem",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.5px",
              color: "var(--color-text-muted)",
              marginBottom: "8px",
              paddingBottom: "6px",
              borderBottom: "1px solid #f0f0f0",
            }}
          >
            {section.name}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {section.chapters.map(({ chapter, globalIndex }) => (
              <ChapterRow
                key={globalIndex}
                index={globalIndex}
                name={chapter.name}
                subjectKey={subject.key}
                status={progress[chapterKey(subject.key, globalIndex)] ?? "not_started"}
                onToggle={() => onToggle(subject.key, globalIndex)}
                priorityMode={false}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Single chapter row ────────────────────────────────────────────────────────

function ChapterRow({
  index,
  name,
  subjectKey,
  status,
  onToggle,
  priorityMode,
}: {
  index: number;
  name: string;
  subjectKey: string;
  status: ChapterStatus;
  onToggle: () => void;
  priorityMode: boolean;
}) {
  const cfg = STATUS_CONFIG[status];
  const marks = getChapterMarks(subjectKey, index);
  const priority = chapterPriority(subjectKey, index, status);

  // Highlight high-priority unstudied chapters in priority mode
  const isHighPriority = priorityMode && priority >= 6 && status !== "studied";
  const isMedPriority = priorityMode && priority >= 3 && priority < 6 && status !== "studied";

  const borderColor = isHighPriority ? "#f97316" : isMedPriority ? "#f59e0b" : cfg.border;
  const bgColor = isHighPriority ? "#fff7ed" : isMedPriority ? "#fffbeb" : cfg.bg;

  return (
    <button
      onClick={onToggle}
      title="Click to change status"
      style={{
        display: "flex",
        alignItems: "center",
        gap: "12px",
        padding: "10px 14px",
        borderRadius: "8px",
        border: `1px solid ${borderColor}`,
        background: bgColor,
        cursor: "pointer",
        textAlign: "left",
        transition: "all 0.15s",
        width: "100%",
      }}
    >
      <span style={{ fontSize: "1rem", flexShrink: 0 }}>{cfg.icon}</span>
      <span style={{ fontSize: "0.88rem", color: "#6b7280", flexShrink: 0, minWidth: "24px" }}>
        {String(index + 1).padStart(2, "0")}
      </span>
      <span style={{ fontWeight: 500, color: cfg.color, flex: 1, fontSize: "0.9rem" }}>{name}</span>
      {marks > 0 && (
        <span
          title={`~${marks} marks in CBSE board exam`}
          style={{
            fontSize: "0.7rem",
            padding: "2px 7px",
            borderRadius: "20px",
            background: isHighPriority ? "#fed7aa" : isMedPriority ? "#fde68a" : "#f1f5f9",
            color: isHighPriority ? "#c2410c" : isMedPriority ? "#92400e" : "#64748b",
            fontWeight: 700,
            flexShrink: 0,
            border: `1px solid ${isHighPriority ? "#fdba74" : isMedPriority ? "#fcd34d" : "#e2e8f0"}`,
          }}
        >
          ~{marks}m
        </span>
      )}
      <span
        style={{
          fontSize: "0.72rem",
          padding: "2px 8px",
          borderRadius: "20px",
          background: cfg.border,
          color: cfg.color,
          fontWeight: 600,
          flexShrink: 0,
        }}
      >
        {cfg.label}
      </span>
    </button>
  );
}

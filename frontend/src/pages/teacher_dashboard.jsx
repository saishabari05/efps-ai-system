import { useState, useEffect, useCallback } from "react";
import {
  AreaChart, Area, LineChart, Line, BarChart, Bar,
  PieChart, Pie, Cell, RadarChart, Radar, PolarGrid,
  PolarAngleAxis, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer
} from "recharts";

// ─── API CONFIG ──────────────────────────────────────────────────────────────
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:10000";

const getTeacherAuthHeaders = () => {
  try {
    const raw = localStorage.getItem("teacher");
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed?.token ? { Authorization: `Bearer ${parsed.token}` } : {};
  } catch {
    return {};
  }
};

const authFetch = (url, options = {}) => {
  const headers = {
    ...(options.headers || {}),
    ...getTeacherAuthHeaders(),
  };
  return fetch(url, { ...options, headers });
};

const getAcademicYearLabel = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const startYear = month >= 5 ? year : year - 1;
  const endYear = startYear + 1;
  return `Academic Year ${startYear}–${String(endYear).slice(-2)}`;
};

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const initials = (name) => name.split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase();
const attColor = (pct) => pct >= 80 ? "#10b981" : pct >= 65 ? "#f59e0b" : "#ef4444";

const toValidNumber = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const getAttendancePercent = (student) => {
  const directAttendance =
    toValidNumber(student?.attendance) ??
    toValidNumber(student?.attendancePercentage) ??
    toValidNumber(student?.att);

  if (directAttendance !== null) return Math.max(0, Math.min(100, directAttendance));

  const records = Array.isArray(student?.attendanceRecords) ? student.attendanceRecords : [];
  if (!records.length) return null;

  const presentCount = records.filter((record) => {
    if (typeof record?.present === "boolean") return record.present;
    if (typeof record?.present === "string") {
      const status = record.present.trim().toLowerCase();
      return status === "present" || status === "true" || status === "p";
    }
    return false;
  }).length;

  return Math.round((presentCount / records.length) * 100);
};

const getAverageScore = (student) => {
  const directScore = toValidNumber(student?.marks) ?? toValidNumber(student?.score);
  if (directScore !== null) return Math.max(0, Math.min(100, directScore));

  const marksList = Array.isArray(student?.marks) ? student.marks : [];
  const numericScores = marksList
    .map((markEntry) => toValidNumber(markEntry?.score ?? markEntry?.marks))
    .filter((score) => score !== null)
    .map((score) => Math.max(0, Math.min(100, score)));

  if (numericScores.length) {
    return Math.round((numericScores.reduce((sum, score) => sum + score, 0) / numericScores.length) * 10) / 10;
  }

  const performanceRecords = Array.isArray(student?.performanceRecords) ? student.performanceRecords : [];
  const performanceScores = performanceRecords
    .map((record) => {
      const semesterScore = toValidNumber(record?.semesterMarks);
      if (semesterScore !== null) return Math.max(0, Math.min(100, semesterScore));

      const preSem = toValidNumber(record?.totalBeforeSem);
      if (preSem === null) return null;

      // totalBeforeSem is commonly out of 40; convert to percentage scale.
      const scaled = preSem <= 40 ? preSem * 2.5 : preSem;
      return Math.max(0, Math.min(100, scaled));
    })
    .filter((score) => score !== null);

  if (!performanceScores.length) return null;

  return Math.round((performanceScores.reduce((sum, score) => sum + score, 0) / performanceScores.length) * 10) / 10;
};

const getRiskLevel = (student) => {
  const attendance = getAttendancePercent(student);
  const score = getAverageScore(student);

  if ((attendance !== null && attendance < 65) || (score !== null && score < 40)) return "high";
  if ((attendance !== null && attendance < 80) || (score !== null && score < 60)) return "medium";
  return "low";
};

const getRiskScore = (student) => {
  const attendance = getAttendancePercent(student);
  const score = getAverageScore(student);

  if (attendance === null && score === null) return null;

  const normalizedAttendance = attendance ?? 100;
  const normalizedScore = score ?? 100;
  const scoreGap = 100 - normalizedScore;
  const attendanceGap = 100 - normalizedAttendance;
  const risk = Math.round(attendanceGap * 0.55 + scoreGap * 0.45);

  return Math.max(0, Math.min(100, risk));
};

const getMarksEntries = (student) => {
  const marksEntries = Array.isArray(student?.marks)
    ? student.marks
      .map((entry) => {
        const score = toValidNumber(entry?.score ?? entry?.marks);
        const subject = (entry?.subject ?? entry?.subjectName ?? "").toString().trim();
        if (score === null || !subject) return null;
        return { subject, score: Math.max(0, Math.min(100, score)) };
      })
      .filter((entry) => entry !== null)
    : [];

  if (marksEntries.length) {
    return marksEntries;
  }

  const performanceRecords = Array.isArray(student?.performanceRecords) ? student.performanceRecords : [];
  const perfEntries = performanceRecords
    .map((record) => {
      const subject = (record?.subjectName ?? record?.subject ?? "").toString().trim();
      if (!subject) return null;

      const semesterScore = toValidNumber(record?.semesterMarks);
      const preSem = toValidNumber(record?.totalBeforeSem);
      const rawScore = semesterScore !== null ? semesterScore : preSem;
      if (rawScore === null) return null;

      const normalized = rawScore <= 40 ? rawScore * 2.5 : rawScore;
      return { subject, score: Math.max(0, Math.min(100, normalized)) };
    })
    .filter((entry) => entry !== null);

  if (perfEntries.length) {
    return perfEntries;
  }

  const directScore = toValidNumber(student?.marks) ?? toValidNumber(student?.score);
  if (directScore === null) return [];

  const subject = (student?.subjectName ?? student?.subject ?? "Overall").toString().trim() || "Overall";
  return [{ subject, score: Math.max(0, Math.min(100, directScore)) }];
};

const getSubjectPerformanceData = (students = []) => {
  const bucket = new Map();

  students.forEach((student) => {
    getMarksEntries(student).forEach(({ subject, score }) => {
      if (!bucket.has(subject)) {
        bucket.set(subject, { total: 0, count: 0, top: 0 });
      }

      const current = bucket.get(subject);
      current.total += score;
      current.count += 1;
      current.top = Math.max(current.top, score);
    });
  });

  return Array.from(bucket.entries())
    .map(([subject, data]) => ({
      name: subject,
      classAvg: Math.round((data.total / data.count) * 10) / 10,
      topScore: Math.round(data.top),
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 8);
};

const getAttendanceTrendData = (students = []) => {
  const weeks = Array.from({ length: 8 }, (_, index) => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (7 - index) * 7);

    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    end.setHours(23, 59, 59, 999);

    return {
      week: `Wk ${index + 1}`,
      start,
      end,
      present: 0,
      total: 0,
    };
  });

  students.forEach((student) => {
    const records = Array.isArray(student?.attendanceRecords) ? student.attendanceRecords : [];

    records.forEach((record) => {
      const recordDate = new Date(record?.date);
      if (Number.isNaN(recordDate.getTime())) return;

      const weekIndex = weeks.findIndex((week) => recordDate >= week.start && recordDate <= week.end);
      if (weekIndex === -1) return;

      const week = weeks[weekIndex];
      week.total += 1;

      const present =
        record?.present === true ||
        (typeof record?.present === "string" && ["present", "true", "p"].includes(record.present.trim().toLowerCase()));

      if (present) week.present += 1;
    });
  });

  const trend = weeks
    .map((week) => (week.total ? { week: week.week, avg: Math.round((week.present / week.total) * 100) } : null))
    .filter((entry) => entry !== null);

  if (trend.length > 0) return trend;

  const directAttendanceValues = students
    .map((student) => getAttendancePercent(student))
    .filter((value) => value !== null);

  if (!directAttendanceValues.length) return [];

  const overallAverage = Math.round(
    directAttendanceValues.reduce((sum, value) => sum + value, 0) / directAttendanceValues.length
  );

  return Array.from({ length: 8 }, (_, index) => ({ week: `Wk ${index + 1}`, avg: overallAverage }));
};

const getAssignedSubjects = (teacher) => {
  const rawSubjects = Array.isArray(teacher?.subjects) ? teacher.subjects : [];

  return rawSubjects
    .map((subject, index) => {
      const name = (subject?.name || subject?.subjectName || "").toString().trim();
      const semester = (subject?.semester || "").toString().trim();
      const section = (subject?.section || "").toString().trim();

      if (!name) return null;

      return {
        key: `${name}__${semester}__${section}__${index}`,
        name,
        semester,
        section,
        label: [name, semester ? `Sem ${semester}` : "", section ? `Sec ${section}` : ""]
          .filter(Boolean)
          .join(" • "),
      };
    })
    .filter((subject) => subject !== null);
};

const getStudentsForAssignedSubject = (students = [], subjectOption) => {
  if (!subjectOption) return students;

  const normalizeText = (value) => String(value ?? "").trim().toLowerCase();
  const normalizeSection = (value) => normalizeText(value).replace(/\s+/g, "");
  const normalizeSemester = (value) => {
    const text = normalizeText(value);
    const digitMatch = text.match(/\d+/);
    return digitMatch ? digitMatch[0] : text;
  };

  const subjectSemester = normalizeSemester(subjectOption.semester);
  const subjectSection = normalizeSection(subjectOption.section);

  const strictMatches = students.filter((student) => {
    const studentSemester = normalizeSemester(student?.semester);
    const studentSection = normalizeSection(student?.section);

    const semesterMatches = !subjectSemester || studentSemester === subjectSemester;
    const sectionMatches = !subjectSection || studentSection === subjectSection;
    return semesterMatches && sectionMatches;
  });

  if (strictMatches.length > 0) {
    return strictMatches;
  }

  // If metadata formats differ (e.g. "5" vs "5th"), avoid an empty picker.
  return students;
};

const buildStudentRecommendations = (student, allStudents = []) => {
  const studentName = student?.fullName || student?.name || "This student";
  const attendance = getAttendancePercent(student);
  const averageScore = getAverageScore(student);
  const marksEntries = getMarksEntries(student);
  const weakSubjects = marksEntries.filter((entry) => entry.score < 50);
  const strongPeerExists = allStudents.some((peer) => {
    if ((peer?.studentId || peer?._id) === (student?.studentId || student?._id)) return false;
    const peerScore = getAverageScore(peer);
    return peerScore !== null && peerScore >= 75;
  });

  const recommendations = [];

  if (attendance !== null && attendance < 75) {
    recommendations.push({
      icon: "📣",
      title: "Schedule counseling session",
      desc: `${studentName} has low attendance and may need direct follow-up.`,
    });
  }

  if (weakSubjects.length > 0) {
    recommendations.push({
      icon: "📚",
      title: "Assign supplementary material",
      desc: `Focus on ${weakSubjects.slice(0, 2).map((entry) => entry.subject).join(" and ")} to improve low scores.`,
    });
  }

  if (strongPeerExists) {
    recommendations.push({
      icon: "🤝",
      title: "Peer mentoring pairing",
      desc: "Pair this student with a stronger classmate for guided practice.",
    });
  }

  if (averageScore !== null && averageScore < 60) {
    recommendations.push({
      icon: "📅",
      title: "Plan a reassessment",
      desc: "Offer a short re-test or revision checkpoint after targeted remediation.",
    });
  }

  if (recommendations.length === 0) {
    recommendations.push({
      icon: "✅",
      title: "Maintain current support",
      desc: `${studentName} is stable right now. Continue regular feedback and monitoring.`,
    });
  }

  return recommendations;
};

const getStudentAttendanceHistory = (student) => {
  const records = Array.isArray(student?.attendanceRecords) ? student.attendanceRecords : [];
  const directAttendance = getAttendancePercent(student);

  const formatter = new Intl.DateTimeFormat("en-US", { month: "short" });
  const now = new Date();
  const windows = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    return {
      monthKey,
      month: formatter.format(date),
      present: 0,
      total: 0,
    };
  });

  records.forEach((record) => {
    const recordDate = new Date(record?.date);
    if (Number.isNaN(recordDate.getTime())) return;

    const key = `${recordDate.getFullYear()}-${String(recordDate.getMonth() + 1).padStart(2, "0")}`;
    const bucket = windows.find((item) => item.monthKey === key);
    if (!bucket) return;

    bucket.total += 1;
    const present =
      record?.present === true ||
      (typeof record?.present === "string" && ["present", "true", "p"].includes(record.present.trim().toLowerCase()));

    if (present) bucket.present += 1;
  });

  const historyFromRecords = windows
    .map((bucket) => {
      if (!bucket.total) return null;
      return {
        month: bucket.month,
        att: Math.round((bucket.present / bucket.total) * 100),
      };
    })
    .filter((entry) => entry !== null);

  if (historyFromRecords.length) {
    return historyFromRecords;
  }

  if (directAttendance === null) {
    return [];
  }

  return windows.map((bucket) => ({
    month: bucket.month,
    att: Math.round(directAttendance),
  }));
};

// ─── STYLES (inline) ─────────────────────────────────────────────────────────
const S = {
  app: {
    display: "flex", height: "100vh", fontFamily: "'DM Sans', 'Segoe UI', sans-serif",
    background: "#f8faff", color: "#0f1c3f", overflow: "hidden",
  },
  sidebar: {
    width: 240, flexShrink: 0, height: "100vh",
    background: "linear-gradient(170deg, #0f1c3f 0%, #1a2f5a 45%, #1e3470 100%)",
    display: "flex", flexDirection: "column", position: "relative", overflow: "hidden",
    zIndex: 100,
  },
  main: { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" },
  topbar: {
    height: 64, background: "#fff", borderBottom: "1px solid #e2e8f8",
    display: "flex", alignItems: "center", padding: "0 28px", gap: 16,
    flexShrink: 0, boxShadow: "0 1px 3px rgba(15,28,63,0.06)",
  },
  content: { flex: 1, overflowY: "auto", padding: 28 },
  card: {
    background: "#fff", borderRadius: 12, border: "1px solid #e2e8f8",
    boxShadow: "0 1px 3px rgba(15,28,63,0.06)", padding: 22,
  },
};

// ─── SUB COMPONENTS ──────────────────────────────────────────────────────────

function Toast({ msg, visible }) {
  return (
    <div style={{
      position: "fixed", bottom: 28, right: 28, zIndex: 999,
      background: "#0f1c3f", color: "#fff", padding: "13px 20px",
      borderRadius: 10, fontSize: 14, fontWeight: 500,
      boxShadow: "0 12px 40px rgba(15,28,63,0.2)",
      display: "flex", alignItems: "center", gap: 8,
      transform: visible ? "translateY(0)" : "translateY(120px)",
      opacity: visible ? 1 : 0,
      transition: "all 0.35s cubic-bezier(0.175,0.885,0.32,1.275)",
      pointerEvents: "none",
    }}>
      {msg}
    </div>
  );
}

function Avatar({ name, size = 38, style = {} }) {
  const colors = ["#3b82f6", "#1e4db7", "#2563eb", "#1d4ed8"];
  const idx = name.charCodeAt(0) % colors.length;
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: `linear-gradient(135deg, ${colors[idx]}, #0f1c3f)`,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.35, fontWeight: 700, color: "#fff",
      flexShrink: 0, ...style,
    }}>
      {initials(name)}
    </div>
  );
}

function RiskBadge({ risk }) {
  const cfg = {
    high:   { bg: "#fff1f2", color: "#dc2626", dot: "#ef4444", label: "High" },
    medium: { bg: "#fffbeb", color: "#d97706", dot: "#f59e0b", label: "Medium" },
    low:    { bg: "#f0fdf4", color: "#16a34a", dot: "#10b981", label: "Low" },
  }[risk];
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 10px",
      borderRadius: 20, fontSize: 11.5, fontWeight: 600,
      background: cfg.bg, color: cfg.color,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: cfg.dot, display: "inline-block" }} />
      {cfg.label}
    </span>
  );
}

function StatCard({ icon, value, label, change, changeUp, accent }) {
  const accents = {
    blue:  { bg: "#eff6ff", stripe: "#2563eb" },
    red:   { bg: "#fff1f2", stripe: "#ef4444" },
    green: { bg: "#f0fdf4", stripe: "#10b981" },
    amber: { bg: "#fffbeb", stripe: "#f59e0b" },
  }[accent];
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        ...S.card, position: "relative", overflow: "hidden",
        transition: "all 0.2s ease",
        transform: hovered ? "translateY(-2px)" : "none",
        boxShadow: hovered ? "0 8px 24px rgba(15,28,63,0.1)" : S.card.boxShadow,
      }}
    >
      <div style={{
        position: "absolute", top: 0, right: 0, width: 80, height: 80,
        borderRadius: "0 12px 0 100%", background: accents.stripe, opacity: 0.07,
      }} />
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: accents.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>
          {icon}
        </div>
        {change && (
          <span style={{
            fontSize: 11.5, fontWeight: 600, padding: "3px 7px", borderRadius: 6,
            background: changeUp ? "#f0fdf4" : "#fff1f2",
            color: changeUp ? "#16a34a" : "#dc2626",
          }}>
            {change}
          </span>
        )}
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, lineHeight: 1, marginBottom: 4, fontFamily: "'DM Mono', monospace" }}>
        {value}
      </div>
      <div style={{ fontSize: 12.5, color: "#64748b", fontWeight: 500 }}>{label}</div>
    </div>
  );
}

function CardHeader({ title, subtitle, badge }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#0f1c3f" }}>{title}</div>
        {subtitle && <div style={{ fontSize: 11.5, color: "#94a3b8", marginTop: 2 }}>{subtitle}</div>}
      </div>
      {badge && (
        <span style={{ fontSize: 11, padding: "4px 9px", borderRadius: 20, background: "#e8f0fe", color: "#1e4db7", fontWeight: 600 }}>
          {badge}
        </span>
      )}
    </div>
  );
}

// ─── SIDEBAR ─────────────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { id: "overview",    icon: "⬡", label: "Overview" },
  { id: "students",    icon: "◫", label: "My Students" },
  { id: "attendance",  icon: "◻", label: "Attendance" },
  { id: "performance", icon: "◈", label: "Performance Entry" },
  { id: "risk",        icon: "◑", label: "Risk Monitoring" },
  { id: "profile",     icon: "◯", label: "Profile", sep: true },
];

function Sidebar({ active, onNav, teacher, highRiskCount = 0, isMobile = false, isOpen = false, onClose }) {
  const teacherName = teacher?.name || teacher?.fullName || "Teacher";
  const teacherDept = teacher?.dept ? `Dept. of ${teacher.dept}` : "Department";
  const navItems = NAV_ITEMS.map((item) =>
    item.id === "risk"
      ? { ...item, badge: highRiskCount > 0 ? highRiskCount : null }
      : item
  );

  return (
    <aside style={{
      ...S.sidebar,
      ...(isMobile
        ? {
            position: "fixed",
            left: 0,
            top: 0,
            transform: isOpen ? "translateX(0)" : "translateX(-105%)",
            transition: "transform 0.25s ease",
            boxShadow: isOpen ? "0 24px 40px rgba(15,28,63,0.35)" : "none",
          }
        : {}),
    }}>
      {/* glow orbs */}
      <div style={{ position:"absolute", top:-60, right:-60, width:200, height:200, borderRadius:"50%", background:"radial-gradient(circle,rgba(59,130,246,0.12),transparent 70%)", pointerEvents:"none" }} />
      <div style={{ position:"absolute", bottom:40, left:-80, width:220, height:220, borderRadius:"50%", background:"radial-gradient(circle,rgba(30,77,183,0.15),transparent 70%)", pointerEvents:"none" }} />

      {/* Logo */}
      <div style={{ padding:"20px 20px 16px", borderBottom:"1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <div style={{ width:36, height:36, borderRadius:10, background:"linear-gradient(135deg,#3b82f6,#1e4db7)", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:700, fontSize:16, color:"#fff", boxShadow:"0 4px 12px rgba(59,130,246,0.35)" }}>
            E
          </div>
          <div>
            <div style={{ fontSize:15, fontWeight:700, color:"#fff", letterSpacing:"0.02em" }}>EFPS</div>
            <div style={{ fontSize:10, color:"rgba(255,255,255,0.4)", letterSpacing:"0.08em", textTransform:"uppercase" }}>Failure Prevention</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ padding:"16px 12px", flex:1 }}>
        <div style={{ fontSize:10, color:"rgba(255,255,255,0.3)", letterSpacing:"0.1em", textTransform:"uppercase", padding:"0 8px", marginBottom:8 }}>Main Menu</div>
        {navItems.map((item) => (
          <div key={item.id}>
            {item.sep && <div style={{ fontSize:10, color:"rgba(255,255,255,0.3)", letterSpacing:"0.1em", textTransform:"uppercase", padding:"0 8px", marginBottom:8, marginTop:16 }}>Account</div>}
            <NavItem item={item} active={active === item.id} onClick={() => {
              onNav(item.id);
              if (isMobile && onClose) onClose();
            }} />
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div style={{ padding:"16px 12px", borderTop:"1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <Avatar name={teacherName} size={32} />
          <div>
            <div style={{ fontSize:12.5, fontWeight:600, color:"#fff" }}>{teacherName}</div>
            <div style={{ fontSize:11, color:"rgba(255,255,255,0.4)" }}>{teacherDept}</div>
          </div>
        </div>
      </div>
    </aside>
  );
}

function NavItem({ item, active, onClick }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display:"flex", alignItems:"center", gap:10, padding:"9px 12px",
        borderRadius:8, cursor:"pointer", marginBottom:2, position:"relative",
        fontSize:13.5, fontWeight:500, transition:"all 0.18s ease",
        color: active ? "#fff" : hovered ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.55)",
        background: active ? "rgba(59,130,246,0.2)" : hovered ? "rgba(255,255,255,0.06)" : "transparent",
        boxShadow: active ? "inset 0 0 0 1px rgba(59,130,246,0.25)" : "none",
      }}
    >
      {active && (
        <div style={{ position:"absolute", left:0, top:"50%", transform:"translateY(-50%)", width:3, height:18, background:"#3b82f6", borderRadius:"0 2px 2px 0" }} />
      )}
      <span style={{ fontSize:15, width:18, textAlign:"center" }}>{item.icon}</span>
      {item.label}
      {item.badge && (
        <span style={{ marginLeft:"auto", background:"#ef4444", color:"#fff", fontSize:10, fontWeight:600, padding:"2px 6px", borderRadius:10 }}>
          {item.badge}
        </span>
      )}
    </div>
  );
}

// ─── TOPBAR ──────────────────────────────────────────────────────────────────
const PAGE_META = {
  overview:    { title: "Overview",             sub: "Academic Year 2024–25" },
  students:    { title: "My Students",           sub: "Students enrolled" },
  attendance:  { title: "Attendance Management", sub: "Mark & track attendance" },
  performance: { title: "Performance Entry",     sub: "Enter & manage scores" },
  risk:        { title: "Risk Monitoring",       sub: "Early intervention alerts" },
  profile:     { title: "My Profile",            sub: "Account & preferences" },
  detail:      { title: "Student Detail",        sub: "Viewing student record" },
};

function Topbar({ page, onLogout, studentCount = 0, teacher, showMenuButton = false, onMenuToggle }) {
  const baseMeta = PAGE_META[page] || PAGE_META.overview;
  const meta =
    page === "students"
      ? { ...baseMeta, sub: `${studentCount} students enrolled` }
      : page === "overview"
        ? { ...baseMeta, sub: getAcademicYearLabel() }
        : baseMeta;
  const teacherName = teacher?.name || teacher?.fullName || "Teacher";
  const teacherSummary = teacher?.dept ? `${teacher.dept} Department` : "Faculty";

  return (
    <header style={S.topbar}>
      {showMenuButton && (
        <button
          onClick={onMenuToggle}
          style={{
            width: 36,
            height: 36,
            borderRadius: 8,
            border: "1px solid #e2e8f8",
            background: "#fff",
            color: "#1e4db7",
            fontSize: 18,
            lineHeight: 1,
            cursor: "pointer",
            flexShrink: 0,
          }}
          aria-label="Toggle menu"
        >
          ☰
        </button>
      )}
      <div style={{ flex:1 }}>
        <div style={{ fontSize:17, fontWeight:700, color:"#0f1c3f" }}>{meta.title}</div>
        {!showMenuButton && <div style={{ fontSize:12, color:"#94a3b8", marginTop:1 }}>{meta.sub}</div>}
      </div>
      <div style={{ display:"flex", alignItems:"center", gap:16 }}>
        <div style={{ textAlign:"right", display: showMenuButton ? "none" : "block" }}>
          <div style={{ fontSize:13.5, fontWeight:600, color:"#0f1c3f" }}>{teacherName}</div>
          <div style={{ fontSize:11.5, color:"#64748b" }}>{teacherSummary}</div>
        </div>
        <Avatar name={teacherName} size={showMenuButton ? 32 : 38} style={{ boxShadow:"0 0 0 3px rgba(59,130,246,0.15)", cursor:"pointer" }} />
        <button
          onClick={onLogout}
          style={{ display:"flex", alignItems:"center", gap:6, padding:showMenuButton ? "7px 10px" : "7px 14px", borderRadius:8, border:"1px solid #e2e8f8", background:"#fff", color:"#64748b", fontSize:13, fontWeight:500, cursor:"pointer", fontFamily:"inherit" }}
          onMouseEnter={e => { e.target.style.borderColor="#ef4444"; e.target.style.color="#ef4444"; e.target.style.background="#fff5f5"; }}
          onMouseLeave={e => { e.target.style.borderColor="#e2e8f8"; e.target.style.color="#64748b"; e.target.style.background="#fff"; }}
        >
          {showMenuButton ? "Logout" : "↪ Logout"}
        </button>
      </div>
    </header>
  );
}

// ─── OVERVIEW PAGE ────────────────────────────────────────────────────────────
function OverviewPage({ students = [], isMobile = false }) {
  // Calculate stats from real data
  const calculateStats = () => {
    if (!students || students.length === 0) {
      return {
        total: 0,
        highRisk: 0,
        mediumRisk: 0,
        lowRisk: 0,
        avgAtt: null,
        avgScore: null,
      };
    }

    const attendanceValues = students
      .map((student) => getAttendancePercent(student))
      .filter((value) => value !== null);

    const scoreValues = students
      .map((student) => getAverageScore(student))
      .filter((value) => value !== null);

    const riskBuckets = students.reduce(
      (acc, student) => {
        const risk = getRiskLevel(student);
        acc[risk] += 1;
        return acc;
      },
      { high: 0, medium: 0, low: 0 }
    );

    const avgAtt = attendanceValues.length
      ? Math.round(attendanceValues.reduce((sum, value) => sum + value, 0) / attendanceValues.length)
      : null;

    const avgScore = scoreValues.length
      ? Math.round((scoreValues.reduce((sum, value) => sum + value, 0) / scoreValues.length) * 10) / 10
      : null;

    return {
      total: students.length,
      highRisk: riskBuckets.high,
      mediumRisk: riskBuckets.medium,
      lowRisk: riskBuckets.low,
      avgAtt,
      avgScore,
    };
  };

  const stats = calculateStats();

  const ATT_TREND = getAttendanceTrendData(students);
  const PERF_DATA = getSubjectPerformanceData(students);

  const RISK_PIE = [
    { name: "Low Risk",    value: stats.lowRisk, color: "#10b981" },
    { name: "Medium Risk", value: stats.mediumRisk, color: "#f59e0b" },
    { name: "High Risk",   value: stats.highRisk, color: "#ef4444" },
  ].filter(r => r.value > 0);

  return (
    <div style={{ animation:"fadeIn 0.25s ease" }}>
      {/* Stats */}
      <div style={{ display:"grid", gridTemplateColumns:isMobile ? "1fr" : "repeat(4,1fr)", gap:16, marginBottom:24 }}>
        <StatCard icon="🎓" value={stats.total}    label="Total Assigned Students" change={stats.total > 0 ? "✓" : ""} changeUp accent="blue" />
        <StatCard icon="⚠️" value={stats.highRisk}     label="High Risk Students"       change={stats.highRisk > 0 ? "⚠️" : "✓"} changeUp={false} accent="red" />
        <StatCard icon="📋" value={stats.avgAtt !== null ? `${stats.avgAtt}%` : "—"} label="Average Attendance"       change="" changeUp accent="green" />
        <StatCard icon="📊" value={stats.avgScore !== null ? stats.avgScore : "—"}   label="Avg Performance Score"    change="" changeUp={false} accent="amber" />
      </div>

      {/* Charts row */}
      <div style={{ display:"grid", gridTemplateColumns:isMobile ? "1fr" : "1fr 1.8fr", gap:16, marginBottom:16 }}>
        {/* Pie */}
        <div style={S.card}>
          <CardHeader title="Risk Distribution" subtitle="Current semester" badge={stats.total + " total"} />
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={RISK_PIE} cx="50%" cy="50%" innerRadius={60} outerRadius={90} dataKey="value" paddingAngle={3}>
                {RISK_PIE.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
              </Pie>
              <Tooltip contentStyle={{ borderRadius:8, border:"1px solid #e2e8f8", fontSize:12, fontFamily:"DM Sans" }} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize:12, fontFamily:"DM Sans" }} />
            </PieChart>
          </ResponsiveContainer>
          {RISK_PIE.length === 0 && (
            <div style={{ marginTop: 8, textAlign: "center", fontSize: 12, color: "#94a3b8" }}>
              Risk data not available
            </div>
          )}
        </div>
        {/* Attendance Trend */}
        <div style={S.card}>
          <CardHeader title="Attendance Trend" subtitle="Past 8 weeks" badge="Weekly avg" />
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={ATT_TREND}>
              <defs>
                <linearGradient id="attGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#2563eb" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="week" tick={{ fontSize:11, fontFamily:"DM Sans" }} axisLine={false} tickLine={false} />
              <YAxis domain={[70,100]} tick={{ fontSize:11, fontFamily:"DM Mono, monospace" }} axisLine={false} tickLine={false} tickFormatter={v => v+"%"} />
              <Tooltip contentStyle={{ borderRadius:8, border:"1px solid #e2e8f8", fontSize:12 }} formatter={v => [v+"%", "Attendance"]} />
              <Area type="monotone" dataKey="avg" stroke="#2563eb" strokeWidth={2.5} fill="url(#attGrad)" dot={{ r:4, fill:"#fff", strokeWidth:2, stroke:"#2563eb" }} />
            </AreaChart>
          </ResponsiveContainer>
          {ATT_TREND.length === 0 && (
            <div style={{ marginTop: 8, textAlign: "center", fontSize: 12, color: "#94a3b8" }}>
              Attendance trend data not available
            </div>
          )}
        </div>
      </div>

      {/* Performance Bar */}
      <div style={S.card}>
        <CardHeader title="Performance Comparison" subtitle="Assessment scores by category" badge="Sem 5" />
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={PERF_DATA} barCategoryGap="35%">
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize:12, fontFamily:"DM Sans" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize:11, fontFamily:"DM Mono, monospace" }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ borderRadius:8, border:"1px solid #e2e8f8", fontSize:12 }} />
            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize:12, fontFamily:"DM Sans" }} />
            <Bar dataKey="classAvg" name="Class Avg" fill="#2563eb" radius={[5,5,0,0]} />
            <Bar dataKey="topScore" name="Top Scorers" fill="#10b981" radius={[5,5,0,0]} />
          </BarChart>
        </ResponsiveContainer>
        {PERF_DATA.length === 0 && (
          <div style={{ marginTop: 8, textAlign: "center", fontSize: 12, color: "#94a3b8" }}>
            Performance data not available
          </div>
        )}
      </div>
    </div>
  );
}

// ─── MY STUDENTS PAGE ─────────────────────────────────────────────────────────
function StudentsPage({ students, onViewDetail, loading, isMobile = false }) {
  const [search, setSearch] = useState("");
  const [semFilter, setSemFilter] = useState("All");
  const [riskFilter, setRiskFilter] = useState("All");

  const enrichedStudents = (students || []).map(s => ({
    ...s,
    id: s.studentId,
    name: s.fullName,
    sem: s.semester,
    sec: s.section,
    att: getAttendancePercent(s),
    score: getAverageScore(s),
    risk: getRiskLevel(s),
  }));

  const semesterOptions = [
    "All",
    ...Array.from(new Set(enrichedStudents.map((student) => String(student.sem)).filter((value) => value && value !== "undefined")))
      .sort((a, b) => Number(a) - Number(b)),
  ];

  const filtered = enrichedStudents.filter(s => {
    const matchSearch = s.name.toLowerCase().includes(search.toLowerCase()) || s.id.toLowerCase().includes(search.toLowerCase());
    const matchSem = semFilter === "All" || s.sem === parseInt(semFilter);
    const matchRisk = riskFilter === "All" || s.risk === riskFilter.toLowerCase();
    return matchSearch && matchSem && matchRisk;
  });

  if (loading) {
    return <div style={{ textAlign: "center", padding: "40px", color: "#94a3b8" }}>Loading students...</div>;
  }

  return (
    <div style={{ animation:"fadeIn 0.25s ease" }}>
      {/* Toolbar */}
      <div style={{ display:"flex", gap:12, marginBottom:16, alignItems:"center", flexWrap:isMobile ? "wrap" : "nowrap" }}>
        <div style={{ position:"relative", flex:1 }}>
          <span style={{ position:"absolute", left:11, top:"50%", transform:"translateY(-50%)", color:"#94a3b8", fontSize:14 }}>🔍</span>
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or student ID…"
            style={{ width:"100%", padding:"9px 12px 9px 36px", borderRadius:8, border:"1px solid #e2e8f8", fontFamily:"inherit", fontSize:13.5, color:"#0f1c3f", outline:"none", background:"#fff" }}
            onFocus={e => { e.target.style.borderColor="#3b82f6"; e.target.style.boxShadow="0 0 0 3px rgba(59,130,246,0.12)"; }}
            onBlur={e => { e.target.style.borderColor="#e2e8f8"; e.target.style.boxShadow="none"; }}
          />
        </div>
        <FilterSelect
          value={semFilter}
          onChange={setSemFilter}
          options={semesterOptions}
          labels={semesterOptions.map((option) => option === "All" ? "All Semesters" : `Semester ${option}`)}
        />
        <FilterSelect value={riskFilter} onChange={setRiskFilter} options={["All","High","Medium","Low"]} labels={["All Risk Levels","High Risk","Medium Risk","Low Risk"]} />
      </div>

      {/* Table */}
      <div style={{ background:"#fff", borderRadius:12, border:"1px solid #e2e8f8", overflow:"hidden", boxShadow:"0 1px 3px rgba(15,28,63,0.06)" }}>
        <div style={{ overflowX: "auto" }}>
        <table style={{ width:"100%", borderCollapse:"collapse", minWidth: isMobile ? 820 : "unset" }}>
          <thead>
            <tr style={{ background:"#f8faff", borderBottom:"1px solid #e2e8f8" }}>
              {["Student","Student ID","Semester","Section","Attendance","Risk Level",""].map(h => (
                <th key={h} style={{ padding:"12px 16px", textAlign:"left", fontSize:11.5, fontWeight:600, color:"#94a3b8", textTransform:"uppercase", letterSpacing:"0.06em" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((s, i) => (
              <StudentRow key={s.id} student={s} isLast={i === filtered.length - 1} onView={onViewDetail} />
            ))}
          </tbody>
        </table>
        </div>
        {filtered.length === 0 && (
          <div style={{ padding:"40px 0", textAlign:"center", color:"#94a3b8", fontSize:14 }}>No students match your search.</div>
        )}
      </div>
    </div>
  );
}

function FilterSelect({ value, onChange, options, labels }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      style={{ padding:"9px 12px", borderRadius:8, border:"1px solid #e2e8f8", fontFamily:"inherit", fontSize:13.5, color:"#64748b", background:"#fff", outline:"none", cursor:"pointer" }}>
      {options.map((o, i) => <option key={o} value={o}>{labels[i]}</option>)}
    </select>
  );
}

function StudentRow({ student: s, isLast, onView }) {
  const [hovered, setHovered] = useState(false);
  const attendanceColor = s.att !== null ? attColor(s.att) : "#94a3b8";
  return (
    <tr
      onClick={() => onView(s)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ borderBottom: isLast ? "none" : "1px solid #f1f5fb", background: hovered ? "#f8faff" : "#fff", cursor:"pointer", transition:"background 0.12s" }}
    >
      <td style={{ padding:"13px 16px", verticalAlign:"middle" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <Avatar name={s.name} size={32} />
          <span style={{ fontWeight:600, fontSize:13.5 }}>{s.name}</span>
        </div>
      </td>
      <td style={{ padding:"13px 16px", verticalAlign:"middle" }}>
        <span style={{ fontFamily:"'DM Mono',monospace", fontSize:12, color:"#94a3b8" }}>{s.id}</span>
      </td>
      <td style={{ padding:"13px 16px", verticalAlign:"middle", fontSize:13.5 }}>Sem {s.sem}</td>
      <td style={{ padding:"13px 16px", verticalAlign:"middle", fontSize:13.5 }}>Sec {s.sec}</td>
      <td style={{ padding:"13px 16px", verticalAlign:"middle" }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <div style={{ flex:1, height:6, background:"#e2e8f8", borderRadius:3, overflow:"hidden", minWidth:60 }}>
            <div style={{ width: s.att !== null ? `${s.att}%` : "0%", height:"100%", background:attendanceColor, borderRadius:3, transition:"width 0.6s" }} />
          </div>
          <span style={{ fontSize:12, fontWeight:600, fontFamily:"'DM Mono',monospace", color:attendanceColor, minWidth:34 }}>{s.att !== null ? `${s.att}%` : "—"}</span>
        </div>
      </td>
      <td style={{ padding:"13px 16px", verticalAlign:"middle" }}><RiskBadge risk={s.risk} /></td>
      <td style={{ padding:"13px 16px", verticalAlign:"middle" }}>
        <button
          onClick={e => { e.stopPropagation(); onView(s); }}
          style={{ padding:"6px 14px", borderRadius:7, border:"1px solid #e2e8f8", background:"#fff", color:"#1e4db7", fontSize:12.5, fontWeight:600, cursor:"pointer", fontFamily:"inherit" }}
          onMouseEnter={e => { e.target.style.background="#e8f0fe"; e.target.style.borderColor="#3b82f6"; }}
          onMouseLeave={e => { e.target.style.background="#fff"; e.target.style.borderColor="#e2e8f8"; }}
        >
          View →
        </button>
      </td>
    </tr>
  );
}

// ─── STUDENT DETAIL PAGE ──────────────────────────────────────────────────────
function DetailPage({ student, onBack, allStudents = [], isMobile = false }) {
  // Ensure we have proper student data (handle both formats)
  const studentName = student.name || student.fullName || "Student";
  const studentId = student.id || student.studentId || "N/A";
  const studentSem = student.sem || student.semester || "N/A";
  const studentSec = student.sec || student.section || "N/A";
  const studentAtt = student.att ?? getAttendancePercent(student);
  const studentScore = student.score ?? getAverageScore(student);
  const studentRisk = student.risk || getRiskLevel(student);

  const riskScore = getRiskScore(student);
  const riskColor = studentRisk === "high" ? "#ef4444" : studentRisk === "medium" ? "#f59e0b" : "#10b981";

  const attHistory = getStudentAttendanceHistory(student);

  const classPerf = getSubjectPerformanceData(allStudents);
  const classMap = new Map(classPerf.map((item) => [item.name, item.classAvg]));

  const studentMarksEntries = getMarksEntries(student);
  const studentAggregates = studentMarksEntries.reduce((acc, entry) => {
    if (!acc[entry.subject]) acc[entry.subject] = { total: 0, count: 0 };
    acc[entry.subject].total += entry.score;
    acc[entry.subject].count += 1;
    return acc;
  }, {});

  const studentMap = new Map(
    Object.entries(studentAggregates).map(([subject, data]) => [
      subject,
      Math.round((data.total / data.count) * 10) / 10,
    ])
  );

  const radarSubjects = Array.from(new Set([...classMap.keys(), ...studentMap.keys()]));
  const perfData = radarSubjects.map((subject) => ({
    subject,
    student: studentMap.has(subject) ? studentMap.get(subject) : null,
    classAvg: classMap.has(subject) ? classMap.get(subject) : null,
  }));
  const subjectComparisonData = perfData
    .filter((entry) => entry.student !== null || entry.classAvg !== null)
    .map((entry) => ({
      subject: entry.subject,
      student: entry.student ?? 0,
      classAvg: entry.classAvg ?? 0,
    }));
  const recommendations = buildStudentRecommendations(student, allStudents);
  const trendLabel =
    riskScore === null
      ? "Unknown"
      : riskScore >= 70
        ? "Critical"
        : riskScore >= 40
          ? "Watch"
          : "Stable";

  const trendColor =
    riskScore === null
      ? "#94a3b8"
      : riskScore >= 70
        ? "#ef4444"
        : riskScore >= 40
          ? "#f59e0b"
          : "#10b981";

  return (
    <div style={{ animation:"fadeIn 0.25s ease" }}>
      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", gap:16, marginBottom:24, flexWrap: isMobile ? "wrap" : "nowrap" }}>
        <button onClick={onBack}
          style={{ display:"flex", alignItems:"center", gap:6, padding:"8px 14px", borderRadius:8, border:"1px solid #e2e8f8", background:"#fff", cursor:"pointer", fontSize:13, color:"#64748b", fontFamily:"inherit" }}
          onMouseEnter={e => e.currentTarget.style.borderColor="#3b82f6"}
          onMouseLeave={e => e.currentTarget.style.borderColor="#e2e8f8"}
        >
          ← Back
        </button>
        <Avatar name={studentName} size={50} />
        <div style={{ flex:1 }}>
          <div style={{ fontSize:18, fontWeight:700 }}>{studentName}</div>
          <div style={{ display:"flex", gap:14, marginTop:4, fontSize:12.5, color:"#64748b", flexWrap: isMobile ? "wrap" : "nowrap" }}>
            <span>🆔 {studentId}</span>
            <span>📅 Semester {studentSem}</span>
            <span>🏛 Section {studentSec}</span>
          </div>
        </div>
        <RiskBadge risk={studentRisk} />
      </div>

      {/* Charts Row */}
      <div style={{ display:"grid", gridTemplateColumns:isMobile ? "1fr" : "1.4fr 1fr", gap:16, marginBottom:16 }}>
        {/* Attendance History */}
        <div style={S.card}>
          <CardHeader title="Attendance History" subtitle="Last 6 months" />
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={attHistory}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize:12, fontFamily:"DM Sans" }} axisLine={false} tickLine={false} />
              <YAxis domain={[0,100]} tick={{ fontSize:11, fontFamily:"DM Mono, monospace" }} axisLine={false} tickLine={false} tickFormatter={v => v+"%"} />
              <Tooltip contentStyle={{ borderRadius:8, border:"1px solid #e2e8f8", fontSize:12 }} formatter={v => [v+"%","Attendance"]} />
              <Bar dataKey="att" radius={[5,5,0,0]}>
                {attHistory.map((entry, i) => (
                  <Cell key={i} fill={attColor(entry.att)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          {studentAtt === null && (
            <div style={{ marginTop: 8, textAlign: "center", fontSize: 12, color: "#94a3b8" }}>
              Attendance data not available
            </div>
          )}
        </div>

        {/* Risk Panel */}
        <div style={{ ...S.card }}>
          <CardHeader title="Risk Analysis" subtitle="Computed score" />
          <div style={{ textAlign:"center", padding:"8px 0 16px" }}>
            <div style={{ fontSize:48, fontWeight:700, fontFamily:"'DM Mono',monospace", lineHeight:1, color:riskColor }}>{riskScore !== null ? riskScore : "—"}</div>
            <div style={{ fontSize:12, color:"#94a3b8", marginTop:4 }}>Risk Score / 100</div>
          </div>
          {[
            { label:"Attendance Rate", val: studentAtt !== null ? `${studentAtt}%` : "—", color: studentAtt === null ? "#94a3b8" : studentAtt < 65 ? "#ef4444" : "#f59e0b" },
            { label:"Exam Average", val: studentScore !== null ? `${studentScore}/100` : "—", color: studentScore === null ? "#94a3b8" : studentScore < 50 ? "#ef4444" : "#f59e0b" },
            { label:"Subjects Scored", val: `${studentMarksEntries.length}`, color: "#1e4db7" },
            { label:"Weak Subjects", val: `${studentMarksEntries.filter((entry) => entry.score < 50).length}`, color: studentMarksEntries.some((entry) => entry.score < 50) ? "#ef4444" : "#10b981" },
            { label:"Trend", val: trendLabel, color: trendColor },
          ].map((r, i) => (
            <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 0", borderBottom: i < 4 ? "1px solid #f1f5fb" : "none", fontSize:13 }}>
              <span style={{ color:"#64748b" }}>{r.label}</span>
              <span style={{ fontWeight:600, color:r.color }}>{r.val}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom Row */}
      <div style={{ display:"grid", gridTemplateColumns:isMobile ? "1fr" : "1fr 1fr", gap:16 }}>
        {/* Radar */}
        <div style={S.card}>
          <CardHeader title="Subject Performance" subtitle="Score breakdown" />
          {subjectComparisonData.length >= 2 ? (
            <ResponsiveContainer width="100%" height={220}>
              <RadarChart data={subjectComparisonData}>
                <PolarGrid stroke="#e2e8f8" />
                <PolarAngleAxis dataKey="subject" tick={{ fontSize:11, fontFamily:"DM Sans" }} />
                <Radar name={studentName} dataKey="student" stroke="#2563eb" fill="#2563eb" fillOpacity={0.15} />
                <Radar name="Class Avg" dataKey="classAvg" stroke="#10b981" fill="#10b981" fillOpacity={0.08} strokeDasharray="4 3" />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize:11, fontFamily:"DM Sans" }} />
                <Tooltip contentStyle={{ borderRadius:8, border:"1px solid #e2e8f8", fontSize:12 }} />
              </RadarChart>
            </ResponsiveContainer>
          ) : subjectComparisonData.length === 1 ? (
            <>
              <div style={{ marginBottom: 8, fontSize: 12, color: "#64748b" }}>
                Showing single available subject: <strong>{subjectComparisonData[0].subject}</strong>
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart
                  data={[
                    { label: studentName, score: subjectComparisonData[0].student },
                    { label: "Class Avg", score: subjectComparisonData[0].classAvg },
                  ]}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fontFamily: "DM Sans" }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11, fontFamily: "DM Mono, monospace" }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f8", fontSize: 12 }} formatter={(v) => [`${v}/100`, "Score"]} />
                  <Bar dataKey="score" radius={[6, 6, 0, 0]}>
                    <Cell fill="#2563eb" />
                    <Cell fill="#10b981" />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </>
          ) : null}
          {subjectComparisonData.length === 0 && (
            <div style={{ marginTop: 8, textAlign: "center", fontSize: 12, color: "#94a3b8" }}>
              Subject performance data not available
            </div>
          )}
        </div>

        {/* AI Recommendations */}
        <div style={{ background:"linear-gradient(135deg,#eff6ff,#e0ecff)", border:"1px solid #bfdbfe", borderRadius:12, padding:22 }}>
          <CardHeader title="✦ AI Recommendations" subtitle="Personalized action plan" />
          {recommendations.map((rec, i) => (
            <div key={i} style={{ display:"flex", gap:10, padding:10, background:"#fff", borderRadius:8, border:"1px solid #dbeafe", marginBottom: i < 3 ? 8 : 0 }}>
              <span style={{ fontSize:18, flexShrink:0 }}>{rec.icon}</span>
              <div style={{ fontSize:13, color:"#64748b", lineHeight:1.5 }}>
                <strong style={{ color:"#0f1c3f", fontWeight:600 }}>{rec.title}</strong> — {rec.desc}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── ATTENDANCE PAGE ──────────────────────────────────────────────────────────
function AttendancePage({ students = [], toast, teacher, isMobile = false }) {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [status, setStatus] = useState({});
  const [selectedSubjectKey, setSelectedSubjectKey] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const subjectOptions = getAssignedSubjects(teacher);
  const selectedSubject = subjectOptions.find((subject) => subject.key === selectedSubjectKey) || null;
  const studentList = getStudentsForAssignedSubject(students || [], selectedSubject);

  const mark = (idx, s) => setStatus(prev => ({ ...prev, [idx]: s }));
  const presentCount = Object.values(status).filter(v => v === "P").length;

  useEffect(() => {
    if (!subjectOptions.length) {
      setSelectedSubjectKey("");
      return;
    }

    setSelectedSubjectKey((currentKey) =>
      subjectOptions.some((subject) => subject.key === currentKey) ? currentKey : subjectOptions[0].key
    );
  }, [teacher]);

  useEffect(() => {
    setStatus({});
  }, [selectedSubjectKey]);

  const submit = async () => {
    if (!selectedSubject) {
      toast("No subject assigned to this teacher");
      return;
    }

    const marked = Object.keys(status).length;
    if (marked < studentList.length) { 
      toast(`⚠️ Please mark all ${studentList.length} students`); 
      return; 
    }

    setSubmitting(true);
    try {
      // Submit attendance for each student
      const promises = studentList.map((student, idx) => {
        const studentId = student.studentId || student._id;
        const present = status[idx] === "P";
        
        return authFetch(`${API_BASE_URL}/teacher/attendance`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            studentId,
            subjectName: selectedSubject.name,
            date,
            present
          })
        });
      });

      const results = await Promise.all(promises);
      const allSuccess = results.every(r => r.ok);

      if (allSuccess) {
        toast("✅ Attendance submitted successfully!");
        setStatus({});
      } else {
        toast("⚠️ Some attendance records failed to submit");
      }
    } catch (error) {
      console.error("Error submitting attendance:", error);
      toast("❌ Failed to submit attendance");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ animation:"fadeIn 0.25s ease" }}>
      {/* Controls */}
      <div style={{ display:"flex", gap:12, marginBottom:20, alignItems:"center", flexWrap:isMobile ? "wrap" : "nowrap" }}>
        <input type="date" value={date} onChange={e => setDate(e.target.value)}
          style={{ padding:"9px 14px", borderRadius:8, border:"1px solid #e2e8f8", fontFamily:"inherit", fontSize:13.5, color:"#0f1c3f", background:"#fff", outline:"none", cursor:"pointer" }} />
        <select 
          value={selectedSubjectKey} 
          onChange={e => setSelectedSubjectKey(e.target.value)}
          style={{ padding:"9px 14px", borderRadius:8, border:"1px solid #e2e8f8", fontFamily:"inherit", fontSize:13.5, color:"#0f1c3f", background:"#fff", outline:"none", cursor:"pointer" }}
        >
          {subjectOptions.length === 0 ? (
            <option value="">No assigned subjects</option>
          ) : (
            subjectOptions.map((subject) => (
              <option key={subject.key} value={subject.key}>{subject.label}</option>
            ))
          )}
        </select>
        <div style={{ marginLeft:isMobile ? 0 : "auto", width:isMobile ? "100%" : "auto", fontSize:13, color:"#1e4db7", background:"#e8f0fe", padding:"8px 14px", borderRadius:8, border:"1px solid #bfdbfe", fontWeight:500 }}>
          <strong>{presentCount}</strong> / <strong>{studentList.length}</strong> marked present
        </div>
      </div>

      {/* Grid */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))", gap:12, marginBottom:20 }}>
        {studentList.length > 0 ? (
          studentList.map((s, i) => (
            <AttCard key={s.studentId || s._id} student={s} idx={i} status={status[i]} onMark={mark} />
          ))
        ) : (
          <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: "40px", color: "#94a3b8" }}>
            No students available
          </div>
        )}
      </div>

      <div style={{ display:"flex", justifyContent:isMobile ? "stretch" : "flex-end", gap:10, flexWrap:isMobile ? "wrap" : "nowrap" }}>
        <button onClick={() => setStatus({})}
          disabled={submitting}
          style={{ padding:"10px 20px", borderRadius:9, border:"1px solid #e2e8f8", background:"#fff", color:"#64748b", fontSize:14, fontWeight:600, cursor:submitting ? "not-allowed" : "pointer", fontFamily:"inherit", opacity: submitting ? 0.5 : 1 }}>
          Reset
        </button>
        <button onClick={submit}
          disabled={submitting}
          style={{ padding:"10px 24px", borderRadius:9, border:"none", background:submitting ? "#94a3b8" : "linear-gradient(135deg,#2563eb,#1e4db7)", color:"#fff", fontSize:14, fontWeight:600, cursor:submitting ? "not-allowed" : "pointer", fontFamily:"inherit", boxShadow:submitting ? "none" : "0 4px 12px rgba(30,77,183,0.3)" }}>
          {submitting ? "⏳ Submitting..." : "✓ Submit Attendance"}
        </button>
      </div>
    </div>
  );
}

function AttCard({ student, idx, status, onMark }) {
  const [hovered, setHovered] = useState(false);
  const studentName = student.fullName || student.name;
  const studentId = student.studentId || student.id;
  
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ background:"#fff", border:`1px solid ${status ? "#bfdbfe" : "#e2e8f8"}`, borderRadius:10, padding:"14px 16px", display:"flex", alignItems:"center", gap:12, transition:"all 0.15s", boxShadow: hovered ? "0 2px 8px rgba(15,28,63,0.08)" : "none" }}
    >
      <Avatar name={studentName} size={36} />
      <div style={{ flex:1 }}>
        <div style={{ fontSize:13.5, fontWeight:600 }}>{studentName}</div>
        <div style={{ fontSize:11.5, color:"#94a3b8", fontFamily:"'DM Mono',monospace" }}>{studentId}</div>
      </div>
      <div style={{ display:"flex", gap:6 }}>
        {["P","A"].map(s => (
          <button key={s} onClick={() => onMark(idx, s)}
            style={{
              padding:"5px 12px", borderRadius:6, fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:"inherit", transition:"all 0.12s",
              border: `1px solid ${s==="P" ? "#10b981" : "#ef4444"}`,
              background: status === s ? (s==="P" ? "#10b981" : "#ef4444") : "#fff",
              color: status === s ? "#fff" : (s==="P" ? "#10b981" : "#ef4444"),
            }}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── PERFORMANCE ENTRY PAGE ───────────────────────────────────────────────────
function PerformancePage({ students = [], toast, teacher, isMobile = false }) {
  const [selectedStudent, setSelectedStudent] = useState("");
  const [selectedSubjectKey, setSelectedSubjectKey] = useState("");

  const [internal1, setInternal1] = useState("");
  const [internal2, setInternal2] = useState("");
  const [assignment, setAssignment] = useState("");
  const [semesterMarks, setSemesterMarks] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const subjectOptions = getAssignedSubjects(teacher);
  const selectedSubject = subjectOptions.find((subject) => subject.key === selectedSubjectKey) || null;
  const filteredStudents = getStudentsForAssignedSubject(students || [], selectedSubject);

  const PERF = {
    shell: {
      ...S.card,
      borderRadius: 18,
      padding: 24,
      background: "linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)",
    },
    layout: {
      display: "grid",
      gridTemplateColumns: isMobile ? "1fr" : "2fr 1fr",
      gap: 18,
      alignItems: "start",
    },
    fieldsWrap: { display: "grid", gap: 12 },
    fieldLabel: {
      display: "block",
      fontSize: 12,
      fontWeight: 700,
      color: "#1f2a44",
      marginBottom: 6,
      letterSpacing: "0.02em",
      textTransform: "uppercase",
    },
    input: {
      width: "100%",
      padding: "11px 12px",
      borderRadius: 10,
      border: "1px solid #d5def0",
      fontSize: 14,
      fontFamily: "'DM Sans', 'Segoe UI', sans-serif",
      color: "#0f1c3f",
      background: "#ffffff",
      outline: "none",
      transition: "border-color 0.15s ease, box-shadow 0.15s ease",
    },
    summaryCard: {
      borderRadius: 14,
      border: "1px solid #dbe7ff",
      background: "linear-gradient(170deg, #f0f6ff 0%, #f7fbff 100%)",
      padding: 14,
      position: "sticky",
      top: 16,
    },
    summaryTitle: {
      fontSize: 13,
      fontWeight: 700,
      color: "#1f2a44",
      marginBottom: 10,
    },
    metricRow: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      padding: "8px 0",
      borderBottom: "1px dashed #c8d8fb",
      fontSize: 13,
    },
    metricLabel: { color: "#516189", fontWeight: 600 },
    metricValue: { color: "#0f1c3f", fontWeight: 700, fontFamily: "'DM Mono', monospace" },
    statusChip: {
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      fontSize: 12,
      fontWeight: 700,
      padding: "5px 10px",
      borderRadius: 999,
      marginTop: 8,
      letterSpacing: "0.02em",
      textTransform: "uppercase",
    },
    saveBtn: {
      width: "100%",
      marginTop: 8,
      padding: "12px 14px",
      border: "none",
      borderRadius: 11,
      background: "linear-gradient(135deg, #2f6bff 0%, #1e4db7 100%)",
      color: "#ffffff",
      fontSize: 15,
      fontWeight: 700,
      cursor: "pointer",
      boxShadow: "0 10px 22px rgba(30,77,183,0.26)",
      transition: "transform 0.15s ease, box-shadow 0.15s ease, opacity 0.15s ease",
    },
  };

  const internalAverage =
    internal1 && internal2
      ? (parseFloat(internal1) + parseFloat(internal2)) / 2
      : 0;

  const totalBeforeSem =
    internalAverage && assignment
      ? internalAverage + parseFloat(assignment)
      : 0;

  const eligibleForSem =
    internalAverage >= 12 &&
    parseFloat(assignment) >= 8 &&
    totalBeforeSem >= 20;

  const riskLevel = () => {
    if (!eligibleForSem) return "high";
    if (totalBeforeSem < 25) return "medium";
    return "low";
  };

  const risk = riskLevel();
  const riskStyleMap = {
    high: { bg: "#fff1f2", fg: "#b91c1c", dot: "#ef4444" },
    medium: { bg: "#fffbeb", fg: "#b45309", dot: "#f59e0b" },
    low: { bg: "#f0fdf4", fg: "#166534", dot: "#10b981" },
  };
  const riskStyle = riskStyleMap[risk];

  useEffect(() => {
    if (!subjectOptions.length) {
      setSelectedSubjectKey("");
      setSelectedStudent("");
      return;
    }

    setSelectedSubjectKey((currentKey) =>
      subjectOptions.some((subject) => subject.key === currentKey) ? currentKey : subjectOptions[0].key
    );
  }, [teacher]);

  useEffect(() => {
    setSelectedStudent((currentStudent) =>
      filteredStudents.some((student) => (student.studentId || student._id) === currentStudent) ? currentStudent : ""
    );
  }, [selectedSubjectKey, students]);

  const saveMarks = async () => {
    if (!selectedStudent || !selectedSubject) {
      toast("⚠️ Select student and subject");
      return;
    }

    if (!eligibleForSem && semesterMarks) {
      toast("❌ Student not eligible for Semester Marks");
      return;
    }

    setSubmitting(true);

    try {
      const response = await authFetch(
        `${API_BASE_URL}/teacher/performance`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            studentId: selectedStudent,
            subjectName: selectedSubject.name,
            internal1: parseFloat(internal1),
            internal2: parseFloat(internal2),
            internalAverage,
            assignment: parseFloat(assignment),
            totalBeforeSem,
            semesterMarks: semesterMarks
              ? parseFloat(semesterMarks)
              : null,
            eligibleForSem,
            riskStatus: riskLevel(),
          }),
        }
      );

      if (response.ok) {
        toast("✅ Marks saved successfully");
        setInternal1("");
        setInternal2("");
        setAssignment("");
        setSemesterMarks("");
      } else {
        const err = await response.json();
        toast(`❌ ${err.message || "Error saving marks"}`);
      }
    } catch {
      toast("❌ Server error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ animation: "fadeIn 0.25s ease" }}>
      <div style={PERF.shell}>
        <CardHeader
          title="Performance Entry"
          subtitle="Internal + Assignment + Semester Logic"
        />

        <div style={PERF.layout}>
          <div style={PERF.fieldsWrap}>
            <div>
              <label style={PERF.fieldLabel}>Student</label>
              <select
                style={PERF.input}
                value={selectedStudent}
                onChange={(e) => setSelectedStudent(e.target.value)}
              >
                <option value="">Select Student</option>
                {filteredStudents.map((s) => (
                  <option key={s.studentId || s._id} value={s.studentId || s._id}>
                    {s.fullName} - {s.studentId}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={PERF.fieldLabel}>Subject</label>
              <select
                style={PERF.input}
                value={selectedSubjectKey}
                onChange={(e) => setSelectedSubjectKey(e.target.value)}
              >
                <option value="">Select Subject</option>
                {subjectOptions.map((subject) => (
                  <option key={subject.key} value={subject.key}>
                    {subject.label}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12 }}>
              <div>
                <label style={PERF.fieldLabel}>Internal 1</label>
                <input
                  style={PERF.input}
                  type="number"
                  placeholder="Enter marks"
                  min="0"
                  max="25"
                  value={internal1}
                  onChange={(e) => setInternal1(e.target.value)}
                />
              </div>
              <div>
                <label style={PERF.fieldLabel}>Internal 2</label>
                <input
                  style={PERF.input}
                  type="number"
                  placeholder="Enter marks"
                  min="0"
                  max="25"
                  value={internal2}
                  onChange={(e) => setInternal2(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label style={PERF.fieldLabel}>Assignment Marks</label>
              <input
                style={PERF.input}
                type="number"
                placeholder="Enter assignment score"
                min="0"
                max="20"
                value={assignment}
                onChange={(e) => setAssignment(e.target.value)}
              />
            </div>

            <div>
              <label style={PERF.fieldLabel}>Semester Marks</label>
              <input
                style={{
                  ...PERF.input,
                  background: eligibleForSem ? "#ffffff" : "#eef2ff",
                  color: eligibleForSem ? "#0f1c3f" : "#94a3b8",
                  cursor: eligibleForSem ? "text" : "not-allowed",
                }}
                type="number"
                placeholder={eligibleForSem ? "Enter semester marks" : "Locked until eligible"}
                min="0"
                max="100"
                value={semesterMarks}
                onChange={(e) => setSemesterMarks(e.target.value)}
                disabled={!eligibleForSem}
              />
            </div>

            <button
              style={{
                ...PERF.saveBtn,
                opacity: submitting ? 0.7 : 1,
                cursor: submitting ? "wait" : "pointer",
                transform: submitting ? "none" : "translateY(0)",
              }}
              onClick={saveMarks}
              disabled={submitting}
            >
              {submitting ? "Saving..." : "Save Performance"}
            </button>
          </div>

          <aside style={PERF.summaryCard}>
            <div style={PERF.summaryTitle}>Live Evaluation</div>

            <div style={PERF.metricRow}>
              <span style={PERF.metricLabel}>Internal Average</span>
              <span style={PERF.metricValue}>{internalAverage.toFixed(2)}</span>
            </div>

            <div style={PERF.metricRow}>
              <span style={PERF.metricLabel}>Total Before Semester</span>
              <span style={PERF.metricValue}>{totalBeforeSem.toFixed(2)}</span>
            </div>

            <div style={PERF.metricRow}>
              <span style={PERF.metricLabel}>Eligibility</span>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: eligibleForSem ? "#166534" : "#b91c1c",
                }}
              >
                {eligibleForSem ? "ELIGIBLE" : "NOT ELIGIBLE"}
              </span>
            </div>

            <div style={{ paddingTop: 2 }}>
              <span
                style={{
                  ...PERF.statusChip,
                  background: riskStyle.bg,
                  color: riskStyle.fg,
                }}
              >
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    background: riskStyle.dot,
                    display: "inline-block",
                  }}
                />
                Risk Level: {risk}
              </span>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

// ─── RISK MONITORING PAGE ────────────────────────────────────────────────────
function RiskPage({ onViewDetail, students = [], isMobile = false }) {
  const [search, setSearch] = useState("");

  // Enrich students with risk data and sort by risk score
  const enrichedStudents = students
    .map((student) => {
      const att = getAttendancePercent(student);
      const score = getAverageScore(student);
      const risk = getRiskLevel(student);
      const riskScore = getRiskScore(student);

      return {
        id: student.studentId || student._id,
        name: student.fullName || student.name,
        sem: student.semester || student.sem,
        sec: student.section || student.sec,
        att,
        score,
        risk,
        riskScore,
        student,
      };
    })
    .filter((s) => s.risk === "high") // Only high-risk students
    .sort((a, b) => (b.riskScore ?? 0) - (a.riskScore ?? 0)); // Sort by risk score descending

  const filtered = enrichedStudents.filter(
    (s) =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.id.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ animation: "fadeIn 0.25s ease" }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: "#0f1c3f", marginBottom: 4 }}>Risk Monitoring</h2>
        <p style={{ color: "#94a3b8", fontSize: 13.5 }}>High-risk students requiring intervention — sorted by risk score</p>
      </div>

      {/* Summary Cards */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)", gap: 16, marginBottom: 24 }}>
        <div style={{ background: "#fff", borderRadius: 12, padding: 16, border: "1px solid #e2e8f8", boxShadow: "0 1px 3px rgba(15,28,63,0.06)" }}>
          <div style={{ fontSize: 12, color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Total High-Risk</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: "#ef4444" }}>{enrichedStudents.length}</div>
        </div>
        <div style={{ background: "#fff", borderRadius: 12, padding: 16, border: "1px solid #e2e8f8", boxShadow: "0 1px 3px rgba(15,28,63,0.06)" }}>
          <div style={{ fontSize: 12, color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Avg Risk Score</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: "#f59e0b" }}>
            {enrichedStudents.length > 0
              ? Math.round(enrichedStudents.reduce((sum, s) => sum + (s.riskScore ?? 0), 0) / enrichedStudents.length)
              : 0}
          </div>
        </div>
        <div style={{ background: "#fff", borderRadius: 12, padding: 16, border: "1px solid #e2e8f8", boxShadow: "0 1px 3px rgba(15,28,63,0.06)" }}>
          <div style={{ fontSize: 12, color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Avg Attendance</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: "#2563eb" }}>
            {enrichedStudents.length > 0
              ? Math.round(enrichedStudents.reduce((sum, s) => sum + (s.att ?? 0), 0) / enrichedStudents.length)
              : 0}
            %
          </div>
        </div>
      </div>

      {/* Search */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ position: "relative" }}>
          <span style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "#94a3b8", fontSize: 14 }}>🔍</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or student ID…"
            style={{
              width: "100%",
              padding: "9px 12px 9px 36px",
              borderRadius: 8,
              border: "1px solid #e2e8f8",
              fontFamily: "inherit",
              fontSize: 13.5,
              color: "#0f1c3f",
              outline: "none",
              background: "#fff",
            }}
            onFocus={(e) => {
              e.target.style.borderColor = "#3b82f6";
              e.target.style.boxShadow = "0 0 0 3px rgba(59,130,246,0.12)";
            }}
            onBlur={(e) => {
              e.target.style.borderColor = "#e2e8f8";
              e.target.style.boxShadow = "none";
            }}
          />
        </div>
      </div>

      {/* Risk Students Table */}
      <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f8", overflow: "hidden", boxShadow: "0 1px 3px rgba(15,28,63,0.06)" }}>
        <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: isMobile ? 860 : "unset" }}>
          <thead>
            <tr style={{ background: "#f8faff", borderBottom: "1px solid #e2e8f8" }}>
              {["Student", "Student ID", "Semester", "Attendance", "Avg Score", "Risk Score", ""].map((h) => (
                <th
                  key={h}
                  style={{
                    padding: "12px 16px",
                    textAlign: "left",
                    fontSize: 11.5,
                    fontWeight: 600,
                    color: "#94a3b8",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((s, i) => (
              <RiskStudentRow key={s.id} student={s} isLast={i === filtered.length - 1} onView={onViewDetail} />
            ))}
          </tbody>
        </table>
        </div>
        {filtered.length === 0 && (
          <div style={{ padding: "40px 0", textAlign: "center", color: "#94a3b8", fontSize: 14 }}>
            {enrichedStudents.length === 0 ? "No high-risk students" : "No matching students"}
          </div>
        )}
      </div>
    </div>
  );
}

function RiskStudentRow({ student: s, isLast, onView }) {
  const [hovered, setHovered] = useState(false);
  const attendanceColor = s.att !== null ? attColor(s.att) : "#94a3b8";
  const riskScoreColor = s.riskScore >= 75 ? "#dc2626" : s.riskScore >= 50 ? "#ea580c" : "#f59e0b";

  return (
    <tr
      onClick={() => onView(s.student)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        borderBottom: isLast ? "none" : "1px solid #f1f5fb",
        background: hovered ? "#fef2f2" : "#fff",
        cursor: "pointer",
        transition: "background 0.12s",
      }}
    >
      <td style={{ padding: "13px 16px", verticalAlign: "middle" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Avatar name={s.name} size={32} />
          <span style={{ fontWeight: 600, fontSize: 13.5 }}>{s.name}</span>
        </div>
      </td>
      <td style={{ padding: "13px 16px", verticalAlign: "middle" }}>
        <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 12, color: "#94a3b8" }}>{s.id}</span>
      </td>
      <td style={{ padding: "13px 16px", verticalAlign: "middle", fontSize: 13.5 }}>Sem {s.sem}</td>
      <td style={{ padding: "13px 16px", verticalAlign: "middle" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ flex: 1, height: 6, background: "#e2e8f8", borderRadius: 3, overflow: "hidden", minWidth: 60 }}>
            <div
              style={{
                width: s.att !== null ? `${s.att}%` : "0%",
                height: "100%",
                background: attendanceColor,
                borderRadius: 3,
                transition: "width 0.6s",
              }}
            />
          </div>
          <span style={{ fontSize: 12, fontWeight: 600, fontFamily: "'DM Mono',monospace", color: attendanceColor, minWidth: 34 }}>
            {s.att !== null ? `${s.att}%` : "—"}
          </span>
        </div>
      </td>
      <td style={{ padding: "13px 16px", verticalAlign: "middle", fontSize: 13.5 }}>{s.score !== null ? s.score.toFixed(1) : "—"}</td>
      <td style={{ padding: "13px 16px", verticalAlign: "middle" }}>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "4px 10px",
            borderRadius: 6,
            background: riskScoreColor + "15",
            color: riskScoreColor,
            fontWeight: 600,
            fontSize: 12,
            fontFamily: "'DM Mono',monospace",
          }}
        >
          {s.riskScore !== null ? Math.round(s.riskScore) : "—"}
        </div>
      </td>
      <td style={{ padding: "13px 16px", verticalAlign: "middle" }}>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onView(s.student);
          }}
          style={{
            padding: "6px 14px",
            borderRadius: 7,
            border: "1px solid #fecaca",
            background: "#fff",
            color: "#dc2626",
            fontSize: 12.5,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
          onMouseEnter={(e) => {
            e.target.style.background = "#fee2e2";
            e.target.style.borderColor = "#ef4444";
          }}
          onMouseLeave={(e) => {
            e.target.style.background = "#fff";
            e.target.style.borderColor = "#fecaca";
          }}
        >
          View
        </button>
      </td>
    </tr>
  );
}

// ─── PROFILE PAGE ─────────────────────────────────────────────────────────────
function ProfilePage({ toast, teacher, students = [], isMobile = false }) {
  const teacherName = teacher?.name || teacher?.fullName || "Teacher";
  const teacherEmail = teacher?.email || "Not available";
  const teacherDept = teacher?.dept || "Not available";
  const teacherId = teacher?.teacherId || teacher?._id || "N/A";
  const subjects = Array.isArray(teacher?.subjects) ? teacher.subjects : [];

  const subjectCards = subjects.map((subject) => {
    const semester = String(subject?.semester ?? "").trim();
    const section = String(subject?.section ?? "").trim();

    const studentsInGroup = students.filter((student) => {
      const semMatch = semester ? String(student?.semester ?? "") === semester : true;
      const secMatch = section ? String(student?.section ?? "") === section : true;
      return semMatch && secMatch;
    }).length;

    return {
      name: subject?.name || "Subject",
      code: [semester ? `Semester ${semester}` : "", section ? `Section ${section}` : ""]
        .filter(Boolean)
        .join(" · "),
      count: `${studentsInGroup} students`,
    };
  });

  return (
    <div style={{ animation:"fadeIn 0.25s ease" }}>
      {/* Profile Header */}
      <div style={{ background:"linear-gradient(135deg,#0f1c3f 0%,#1a2f5a 100%)", borderRadius:12, padding:isMobile ? 20 : 32, marginBottom:16, display:"flex", alignItems:"center", gap:20, position:"relative", overflow:"hidden", flexWrap:isMobile ? "wrap" : "nowrap" }}>
        <div style={{ position:"absolute", right:-60, top:-60, width:250, height:250, borderRadius:"50%", background:"radial-gradient(circle,rgba(59,130,246,0.15),transparent 70%)", pointerEvents:"none" }} />
        <Avatar name={teacherName} size={80} style={{ border:"3px solid rgba(255,255,255,0.25)" }} />
        <div>
          <div style={{ fontSize:22, fontWeight:700, color:"#fff" }}>{teacherName}</div>
          <div style={{ fontSize:14, color:"rgba(255,255,255,0.6)", marginTop:4 }}>{teacherDept !== "Not available" ? `Department of ${teacherDept}` : "Department info unavailable"}</div>
          <div style={{ display:"flex", gap:24, marginTop:14, flexWrap:isMobile ? "wrap" : "nowrap" }}>
            {[[String(students.length),"Students"],[String(subjects.length),"Subjects"],[String(new Set(students.map((student) => String(student.section))).size),"Sections"],[String(new Set(students.map((student) => String(student.semester))).size),"Semesters"]].map(([val,lbl]) => (
              <div key={lbl}>
                <div style={{ fontSize:20, fontWeight:700, color:"#fff", fontFamily:"'DM Mono',monospace" }}>{val}</div>
                <div style={{ fontSize:11, color:"rgba(255,255,255,0.45)", textTransform:"uppercase", letterSpacing:"0.06em" }}>{lbl}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:isMobile ? "1fr" : "1fr 1fr", gap:16 }}>
        {/* Info Form */}
        <div style={S.card}>
          <CardHeader title="Personal Information" />
          <div style={{ display:"grid", gap:14 }}>
            {[["Full Name", teacherName],["Email", teacherEmail],["Phone", teacher?.phone || "Not available"],["Department", teacherDept]].map(([label,val]) => (
              <div key={label} style={{ display:"flex", flexDirection:"column", gap:6 }}>
                <label style={{ fontSize:12.5, fontWeight:600, color:"#64748b", textTransform:"uppercase", letterSpacing:"0.05em" }}>{label}</label>
                <input defaultValue={val} style={{ padding:"10px 13px", borderRadius:8, border:"1px solid #e2e8f8", fontFamily:"inherit", fontSize:14, color:"#0f1c3f", outline:"none" }}
                  onFocus={e => { e.target.style.borderColor="#3b82f6"; e.target.style.boxShadow="0 0 0 3px rgba(59,130,246,0.12)"; }}
                  onBlur={e => { e.target.style.borderColor="#e2e8f8"; e.target.style.boxShadow="none"; }} />
              </div>
            ))}
            <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
              <label style={{ fontSize:12.5, fontWeight:600, color:"#64748b", textTransform:"uppercase", letterSpacing:"0.05em" }}>Employee ID</label>
              <input defaultValue={teacherId} readOnly style={{ padding:"10px 13px", borderRadius:8, border:"1px solid #e2e8f8", fontFamily:"'DM Mono',monospace", fontSize:14, color:"#94a3b8", background:"#f8faff", outline:"none" }} />
            </div>
            <div style={{ display:"flex", justifyContent:"flex-end" }}>
              <button onClick={() => toast("✅ Profile updated!")} style={{ padding:"10px 24px", borderRadius:9, border:"none", background:"linear-gradient(135deg,#2563eb,#1e4db7)", color:"#fff", fontSize:14, fontWeight:600, cursor:"pointer", fontFamily:"inherit", boxShadow:"0 4px 12px rgba(30,77,183,0.3)" }}>Save Changes</button>
            </div>
          </div>
        </div>

        {/* Subjects */}
        <div style={S.card}>
          <CardHeader title="Assigned Subjects" />
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {subjectCards.map((sub, i) => (
              <div key={i} style={{ padding:"13px 14px", borderRadius:9, border:"1px solid #e2e8f8", background:"#f8faff", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                <div>
                  <div style={{ fontWeight:600, fontSize:13.5 }}>{sub.name}</div>
                  <div style={{ fontSize:12, color:"#94a3b8", marginTop:2 }}>{sub.code || "Semester/Section not specified"}</div>
                </div>
                <span style={{ fontSize:11, padding:"4px 9px", borderRadius:20, background:"#e8f0fe", color:"#1e4db7", fontWeight:600, flexShrink:0 }}>{sub.count}</span>
              </div>
            ))}
            {subjectCards.length === 0 && (
              <div style={{ padding:"20px 0", textAlign:"center", color:"#94a3b8", fontSize:13 }}>
                No assigned subjects found
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── ROOT APP ─────────────────────────────────────────────────────────────────
export default function EFPSDashboard() {
  const [page, setPage] = useState("overview");
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [toastMsg, setToastMsg] = useState("");
  const [toastVisible, setToastVisible] = useState(false);
  const [students, setStudents] = useState([]);
  const [loadingStudents, setLoadingStudents] = useState(true);
  const [isMobile, setIsMobile] = useState(() => (typeof window !== "undefined" ? window.innerWidth <= 1024 : false));
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [teacherProfile, setTeacherProfile] = useState(null);
  const [teacherSession] = useState(() => {
    try {
      const rawTeacher = localStorage.getItem("teacher");
      return rawTeacher ? JSON.parse(rawTeacher) : null;
    } catch {
      return null;
    }
  });

  // Fetch students on component mount
  useEffect(() => {
    const fetchStudents = async () => {
      const teacherId = teacherSession?.teacherId;
      if (!teacherId) {
        console.error("Teacher session not found. Please login again.");
        setStudents([]);
        setTeacherProfile(null);
        setLoadingStudents(false);
        return;
      }

      try {
        setLoadingStudents(true);
        const [studentsResponse, profileResponse] = await Promise.all([
          authFetch(`${API_BASE_URL}/teacher/students/${teacherId}`),
          authFetch(`${API_BASE_URL}/teacher/profile/${teacherId}`),
        ]);

        if (studentsResponse.ok) {
          const data = await studentsResponse.json();
          const uniqueStudents = Array.from(
            new Map(data.map((student) => [student.studentId || student._id, student])).values()
          );
          setStudents(uniqueStudents);
        } else {
          console.error("Failed to fetch students");
          setStudents([]);
        }

        if (profileResponse.ok) {
          const profileData = await profileResponse.json();
          setTeacherProfile(profileData);
        } else {
          setTeacherProfile(null);
        }
      } catch (error) {
        console.error("Error fetching teacher dashboard data:", error);
        setStudents([]);
        setTeacherProfile(null);
      } finally {
        setLoadingStudents(false);
      }
    };

    fetchStudents();
  }, [teacherSession?.teacherId]);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 1024);
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (!isMobile) {
      setSidebarOpen(false);
    }
  }, [isMobile]);

  const showToast = useCallback((msg) => {
    setToastMsg(msg);
    setToastVisible(true);
    setTimeout(() => setToastVisible(false), 2800);
  }, []);

  const goToDetail = (student) => {
    setSelectedStudent(student);
    setPage("detail");
  };

  const handleNav = (id) => {
    setPage(id);
    if (id !== "detail") setSelectedStudent(null);
    if (isMobile) setSidebarOpen(false);
  };

  const handleLogout = () => {
    localStorage.removeItem("teacher");
    showToast("👋 Logging out…");
    setTimeout(() => {
      window.location.href = "/login";
    }, 300);
  };

  const teacherData = teacherProfile || teacherSession;
  const highRiskCount = students.reduce(
    (count, student) => (getRiskLevel(student) === "high" ? count + 1 : count),
    0
  );

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { overflow: hidden; }
        @keyframes fadeIn { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:translateY(0); } }
        ::-webkit-scrollbar { width: 5px; } 
        ::-webkit-scrollbar-track { background: transparent; } 
        ::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 3px; }
        .td-overlay {
          position: fixed;
          inset: 0;
          background: rgba(15, 28, 63, 0.35);
          z-index: 90;
        }
      `}</style>

      <div style={{ ...S.app, height: "100dvh" }}>
        {isMobile && sidebarOpen && <div className="td-overlay" onClick={() => setSidebarOpen(false)} />}
        <Sidebar
          active={page === "detail" ? "students" : page}
          onNav={handleNav}
          teacher={teacherData}
          highRiskCount={highRiskCount}
          isMobile={isMobile}
          isOpen={isMobile ? sidebarOpen : true}
          onClose={() => setSidebarOpen(false)}
        />

        <div style={S.main}>
          <Topbar page={page} studentCount={students.length} teacher={teacherData} onLogout={handleLogout} showMenuButton={isMobile} onMenuToggle={() => setSidebarOpen((v) => !v)} />

          <div style={{ ...S.content, padding: isMobile ? 14 : 28 }}>
            {page === "overview"    && <OverviewPage students={students} isMobile={isMobile} />}
            {page === "students"    && <StudentsPage students={students} onViewDetail={goToDetail} loading={loadingStudents} isMobile={isMobile} />}
            {page === "detail"      && selectedStudent && <DetailPage student={selectedStudent} allStudents={students} onBack={() => setPage("students")} isMobile={isMobile} />}
            {page === "attendance"  && <AttendancePage students={students} toast={showToast} teacher={teacherData} isMobile={isMobile} />}
            {page === "performance" && <PerformancePage students={students} toast={showToast} teacher={teacherData} isMobile={isMobile} />}
            {page === "risk"        && <RiskPage onViewDetail={goToDetail} students={students} isMobile={isMobile} />}
            {page === "profile"     && <ProfilePage toast={showToast} teacher={teacherData} students={students} isMobile={isMobile} />}
          </div>
        </div>
      </div>

      <Toast msg={toastMsg} visible={toastVisible} />
    </>
  );
}

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  PieChart, Pie, Cell, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, AreaChart, Area
} from "recharts";
import '../styling/admin_dashboard.css';

// ─── API BASE ──────────────────────────────────────────────────────────────────
const API = import.meta.env.VITE_API_BASE_URL || "http://localhost:10000";

const getStoredAdmin = () => {
  try {
    const raw = localStorage.getItem("admin");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const clearAdminSession = () => {
  localStorage.removeItem("admin");
};

const redirectToLogin = (message) => {
  clearAdminSession();
  if (message) {
    window.alert(message);
  }
  window.location.replace("/login");
};

const getAcademicYearLabel = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const startYear = month >= 5 ? year : year - 1;
  const endYear = startYear + 1;
  return `Academic Year ${startYear}-${String(endYear).slice(-2)}`;
};

const getAdminAuthHeaders = () => {
  const admin = getStoredAdmin();
  return admin?.token ? { Authorization: `Bearer ${admin.token}` } : {};
};

const authFetch = async (url, options = {}) => {
  const headers = {
    ...(options.headers || {}),
    ...getAdminAuthHeaders(),
  };
  const response = await fetch(url, { ...options, headers });

  if (response.status === 401 || response.status === 403) {
    let message = response.status === 401
      ? "Your admin session has expired. Please log in again."
      : "This account does not have admin access.";

    try {
      const errorData = await response.clone().json();
      if (errorData?.error) {
        message = errorData.error;
      }
    } catch {
      // Ignore parse failures and use the fallback message.
    }

    redirectToLogin(message);
    throw new Error(message);
  }

  return response;
};

const readJson = async (response, fallbackMessage) => {
  try {
    return await response.json();
  } catch {
    throw new Error(fallbackMessage);
  }
};

// ─── SMALL COMPONENTS ─────────────────────────────────────────────────────────
const Spinner = () => (
  <div className="state-loading">
    <div className="spinner" />
    Loading…
  </div>
);

const Empty = ({ message = "No data found." }) => (
  <div className="state-empty">
    <div className="state-empty-icon">📭</div>
    {message}
  </div>
);

const RiskBadge = ({ level }) => {
  const cls = { Low: "badge-low", Medium: "badge-medium", High: "badge-high" }[level] ?? "badge-low";
  return <span className={`badge ${cls}`}>{level ?? "Low"}</span>;
};

const AttBar = ({ pct }) => {
  if (!pct && pct !== 0) return <span style={{ color: "var(--text-muted)" }}>—</span>;
  const cls = pct >= 80 ? "high" : pct >= 65 ? "medium" : "low";
  return (
    <div className="att-bar-wrap">
      <div className="att-bar-track">
        <div className="att-bar-fill" style={{ width: `${pct}%` }} data-level={cls} />
      </div>
      <span className="att-pct">{pct}%</span>
    </div>
  );
};

const StatCard = ({ label, value, icon, accent, bg }) => (
  <div className="stat-card">
    <div className="stat-icon" style={{ background: bg }}>
      {icon}
    </div>
    <div>
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={{ color: accent }}>{value ?? "—"}</div>
    </div>
  </div>
);

const Card = ({ children, className = "", style = {} }) => (
  <div className={`card ${className}`} style={style}>{children}</div>
);

const Btn = ({ children, onClick, variant = "primary", className = "", style = {}, type = "button" }) => (
  <button type={type} className={`btn btn-${variant} ${className}`} onClick={onClick} style={style}>
    {children}
  </button>
);

const FormField = ({ label, value, onChange, placeholder, type = "text" }) => (
  <div className="form-field">
    <label className="form-label">{label}</label>
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="form-input"
    />
  </div>
);

// ─── MODAL ────────────────────────────────────────────────────────────────────
const Modal = ({ onClose, onAdd }) => {
  const [name, setName]   = useState("");
  const [email, setEmail] = useState("");
  const [dept, setDept]   = useState("");
  const [password, setPassword] = useState("");
  const [showCreds, setShowCreds] = useState(false);
  const [createdTeacher, setCreatedTeacher] = useState(null);

  const submit = async () => {
    if (!name.trim() || !email.trim() || !dept.trim()) {
      alert("Please fill all fields.");
      return;
    }
    try {
      const payload = {
        name: name.trim(),
        email: email.trim(),
        dept: dept.trim()
      };
      if (password.trim()) {
        payload.password = password.trim();
      }
      const res = await authFetch(`${API}/admin/teachers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const errorData = await readJson(res, "Failed to add teacher");
        throw new Error(errorData.error || "Failed to add teacher");
      }
      const added = await readJson(res, "Failed to read created teacher");
      setCreatedTeacher({
        ...added,
        password: password.trim() || "Teacher@123"
      });
      setShowCreds(true);
      setName("");
      setEmail("");
      setDept("");
      setPassword("");
    } catch (err) {
      console.error(err);
      alert(err.message || "Error adding teacher. Please try again.");
    }
  };

  const closeAndFinish = () => {
    if (createdTeacher) {
      onAdd(createdTeacher);
    }
    setCreatedTeacher(null);
    setShowCreds(false);
    onClose();
  };

  if (showCreds && createdTeacher) {
    return (
      <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) closeAndFinish(); }}>
        <div className="modal-box">
          <button className="modal-close" onClick={closeAndFinish}>×</button>
          <div className="modal-title">✅ Teacher Added Successfully</div>
          <div style={{ padding: "20px", backgroundColor: "#f0fdf4", borderRadius: "8px", marginBottom: "20px", border: "1px solid #86efac" }}>
            <p style={{ margin: "8px 0", fontSize: "14px" }}>
              <strong>Name:</strong> {createdTeacher.name}
            </p>
            <p style={{ margin: "8px 0", fontSize: "14px" }}>
              <strong>Email:</strong> {createdTeacher.email}
            </p>
            <p style={{ margin: "8px 0", fontSize: "14px" }}>
              <strong>Department:</strong> {createdTeacher.dept}
            </p>
            <p style={{ margin: "8px 0", fontSize: "14px", color: "#dc2626" }}>
              <strong>Password:</strong> <code style={{ backgroundColor: "#fff7ed", padding: "2px 6px", borderRadius: "4px" }}>{createdTeacher.password}</code>
            </p>
            <p style={{ margin: "12px 0 0 0", fontSize: "12px", color: "#666" }}>
              Share these credentials with the teacher so they can log in.
            </p>
          </div>
          <div className="modal-actions">
            <button 
              className="btn btn-primary" 
              onClick={closeAndFinish}
              style={{ width: "100%" }}
            >
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box">
        <button className="modal-close" onClick={onClose}>×</button>
        <div className="modal-title">Add New Teacher</div>
        <FormField label="Full Name"  value={name}  onChange={setName}  placeholder="Dr. Full Name" />
        <FormField label="Email"      value={email} onChange={setEmail} placeholder="email@college.edu" type="email" />
        <FormField label="Department" value={dept}  onChange={setDept}  placeholder="e.g. Computer Science" />
        <FormField label="Password (Optional)" value={password} onChange={setPassword} placeholder="Leave blank for default: Teacher@123" type="password" />
        <div className="modal-actions">
          <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary"   onClick={submit}>Add Teacher</Btn>
        </div>
      </div>
    </div>
  );
};

// ─── CHART TOOLTIP STYLE ───────────────────────────────────────────────────────
const tooltipStyle = {
  borderRadius: "12px",
  border: "none",
  boxShadow: "0 4px 20px rgba(7,18,46,0.12)",
  fontFamily: "'IBM Plex Sans', sans-serif",
  fontSize: "12px",
};

const getNumeric = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const getAttendancePercent = (student) => {
  const directAttendance =
    getNumeric(student?.attendance) ??
    getNumeric(student?.attendancePercentage);

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
  const directScore = getNumeric(student?.marks) ?? getNumeric(student?.score);
  if (directScore !== null) return Math.max(0, Math.min(100, directScore));

  const markEntries = Array.isArray(student?.marks) ? student.marks : [];
  const scores = markEntries
    .map((entry) => getNumeric(entry?.score ?? entry?.marks))
    .filter((score) => score !== null)
    .map((score) => Math.max(0, Math.min(100, score)));

  if (!scores.length) return null;

  return Math.round((scores.reduce((sum, score) => sum + score, 0) / scores.length) * 10) / 10;
};

const getRiskLevel = (student) => {
  const attendance = getAttendancePercent(student);
  const score = getAverageScore(student);

  if ((attendance !== null && attendance < 65) || (score !== null && score < 40)) return "High";
  if ((attendance !== null && attendance < 80) || (score !== null && score < 60)) return "Medium";
  return "Low";
};

const getRiskDistribution = (students = []) => {
  const buckets = students.reduce(
    (acc, student) => {
      const level = getRiskLevel(student);
      acc[level] += 1;
      return acc;
    },
    { Low: 0, Medium: 0, High: 0 }
  );

  return [
    { name: "Low", value: buckets.Low },
    { name: "Medium", value: buckets.Medium },
    { name: "High", value: buckets.High },
  ].filter((entry) => entry.value > 0);
};

const getAttendanceTrend = (students = []) => {
  const formatter = new Intl.DateTimeFormat("en-US", { month: "short" });
  const windows = Array.from({ length: 6 }, (_, index) => {
    const date = new Date();
    date.setDate(1);
    date.setMonth(date.getMonth() - (5 - index));
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    return {
      monthKey,
      month: formatter.format(date),
      present: 0,
      total: 0,
    };
  });

  students.forEach((student) => {
    const records = Array.isArray(student?.attendanceRecords) ? student.attendanceRecords : [];
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
  });

  const fromRecords = windows
    .map((bucket) => (bucket.total ? { month: bucket.month, att: Math.round((bucket.present / bucket.total) * 100) } : null))
    .filter((entry) => entry !== null);

  if (fromRecords.length) return fromRecords;

  const directAttendance = students
    .map((student) => getAttendancePercent(student))
    .filter((value) => value !== null);

  if (!directAttendance.length) return [];

  const avgAttendance = Math.round(directAttendance.reduce((sum, value) => sum + value, 0) / directAttendance.length);
  return windows.map((bucket) => ({ month: bucket.month, att: avgAttendance }));
};

const getPerformanceCategories = (students = []) => {
  const buckets = { Excellent: 0, Good: 0, Average: 0, "At Risk": 0 };

  students.forEach((student) => {
    const score = getAverageScore(student);
    if (score === null) return;
    if (score >= 85) buckets.Excellent += 1;
    else if (score >= 70) buckets.Good += 1;
    else if (score >= 50) buckets.Average += 1;
    else buckets["At Risk"] += 1;
  });

  return Object.entries(buckets)
    .map(([label, count]) => ({ label, count }))
    .filter((entry) => entry.count > 0);
};

const buildOverview = (students = [], teachers = []) => {
  const attendanceValues = students
    .map((student) => getAttendancePercent(student))
    .filter((value) => value !== null);

  const highRiskStudents = students.filter((student) => getRiskLevel(student) === "High").length;

  return {
    stats: {
      totalStudents: students.length,
      totalTeachers: teachers.length,
      highRiskStudents,
      avgAttendance: attendanceValues.length
        ? Math.round(attendanceValues.reduce((sum, value) => sum + value, 0) / attendanceValues.length)
        : null,
    },
    trend: getAttendanceTrend(students),
    risk: getRiskDistribution(students),
    perf: getPerformanceCategories(students),
  };
};

// ─── OVERVIEW ─────────────────────────────────────────────────────────────────
const Overview = () => {
  const [stats, setStats]     = useState(null);
  const [trend, setTrend]     = useState([]);
  const [risk, setRisk]       = useState([]);
  const [perf, setPerf]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  useEffect(() => {
    const load = async () => {
      try {
        const [studentsRes, teachersRes] = await Promise.all([
          authFetch(`${API}/admin/students`),
          authFetch(`${API}/admin/teachers`),
        ]);

        if (!studentsRes.ok || !teachersRes.ok) {
          throw new Error("Failed to fetch admin collections");
        }

        const [students, teachers] = await Promise.all([
          readJson(studentsRes, "Failed to read students"),
          readJson(teachersRes, "Failed to read teachers"),
        ]);
        const data = buildOverview(students, teachers);
        setStats(data.stats);
        setTrend(data.trend);
        setRisk(data.risk);
        setPerf(data.perf);
      } catch (e) {
        console.error(e);
        setError("Failed to load dashboard data.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const RISK_COLORS = ["#10b981", "#f59e0b", "#dc2626"];
  const PERF_COLORS = ["#1d4ed8", "#3b82f6", "#60a5fa", "#f59e0b", "#dc2626"];

  if (loading) return <Spinner />;
  if (error)   return <Empty message={error} />;

  return (
    <div className="page-body">
      {/* Stat Cards */}
      <div className="stats-grid">
        <StatCard label="Total Students"     value={stats?.totalStudents}     icon="📚" accent="var(--navy-600)"   bg="var(--blue-100)" />
        <StatCard label="Total Teachers"     value={stats?.totalTeachers}     icon="👩‍🏫" accent="var(--purple-500)" bg="var(--purple-100)" />
        <StatCard label="High Risk Students" value={stats?.highRiskStudents}  icon="⚠️" accent="var(--red-600)"    bg="var(--red-100)" />
        <StatCard label="Average Attendance" value={stats?.avgAttendance ? `${stats.avgAttendance}%` : null} icon="📊" accent="var(--green-600)" bg="var(--green-100)" />
      </div>

      {/* Pie + Trend */}
      <div className="grid-2">
        <Card>
          <div className="card-title">Risk Distribution</div>
          {risk.length === 0 ? <Empty message="No risk data." /> : (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={risk} cx="50%" cy="50%" innerRadius={52} outerRadius={82} paddingAngle={4} dataKey="value">
                    {risk.map((d, i) => <Cell key={i} fill={RISK_COLORS[i % RISK_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} formatter={(v, n) => [v + " students", n]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="legend-row">
                {risk.map((d, i) => (
                  <div key={d.name} className="legend-item">
                    <span className="legend-dot" style={{ background: RISK_COLORS[i % RISK_COLORS.length] }} />
                    {d.name}
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>

        <Card>
          <div className="card-title">Attendance Trend</div>
          {trend.length === 0 ? <Empty message="No trend data." /> : (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={trend}>
                <defs>
                  <linearGradient id="attGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#1d4ed8" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#1d4ed8" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize:11, fill:"#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis domain={[60,100]} tick={{ fontSize:11, fill:"#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={v => v+"%"} />
                <Tooltip contentStyle={tooltipStyle} formatter={v => [v+"%","Attendance"]} />
                <Area type="monotone" dataKey="att" stroke="#1d4ed8" strokeWidth={2.5} fill="url(#attGrad)" dot={{ r:4, fill:"#1d4ed8" }} activeDot={{ r:6 }} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      {/* Bar Chart */}
      <Card>
        <div className="card-title">Performance Categories</div>
        {perf.length === 0 ? <Empty message="No performance data." /> : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={perf} barSize={38}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize:11, fill:"#94a3b8" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize:11, fill:"#94a3b8" }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="count" radius={[7,7,0,0]}>
                {perf.map((d, i) => <Cell key={i} fill={PERF_COLORS[i % PERF_COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>
    </div>
  );
};

// ─── MANAGE STUDENTS ──────────────────────────────────────────────────────────
const ManageStudents = () => {
  const [students, setStudents] = useState([]);
  const [search, setSearch]     = useState("");
  const [semester, setSemester] = useState("");
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);

  useEffect(() => {
    authFetch(`${API}/admin/students`)
      .then((response) => {
        if (!response.ok) throw new Error("Failed to load students.");
        return readJson(response, "Failed to read students.");
      })
      .then((data) => {
        setStudents(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(e => { console.error(e); setError("Failed to load students."); setLoading(false); });
  }, []);

 const handleDelete = async (id) => {
  if (!window.confirm("Are you sure you want to delete this student?")) return;

  try {
    const res = await authFetch(`${API}/admin/students/${id}`, {
      method: "DELETE"
    });

    if (!res.ok) throw new Error("Delete failed");

    setStudents(prev => prev.filter(s => s._id !== id));

  } catch (err) {
    console.error(err);
    alert("Failed to delete student.");
  }
};

  const filtered = students.filter(s => {
    const q = search.toLowerCase();
    return (
      (!q || s.fullName?.toLowerCase().includes(q) || s.studentId?.toLowerCase().includes(q)) &&
      (!semester || String(s.semester) === semester)
    );
  });

  const semesterOptions = Array.from(
    new Set(students.map((student) => String(student.semester ?? "")).filter(Boolean))
  ).sort((a, b) => Number(a) - Number(b));

  return (
    <div className="page-body">
      <div className="page-header">
        <h2 className="section-title">Manage Students</h2>
        <div className="filter-bar">
          <input
            type="text"
            placeholder="Search by name or ID…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="filter-input"
          />
          <select
            value={semester}
            onChange={e => setSemester(e.target.value)}
            className="filter-select"
          >
            <option value="">All Semesters</option>
            {semesterOptions.map((sem) => (
              <option key={sem} value={sem}>{`Semester ${sem}`}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="table-wrap">
        {loading ? <Spinner /> : error ? <Empty message={error} /> : (
          <table className="efps-table">
            <thead>
              <tr>
                {["Name","Student ID","Semester","Section","Attendance","Risk","Action"].map(h => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={7}><Empty message="No students found." /></td></tr>
              ) : filtered.map(s => (
                <tr key={s._id ?? s.studentId}>
                  <td className="td-primary">{s.fullName}</td>
                  <td className="td-mono">{s.studentId}</td>
                  <td>{s.semester}</td>
                  <td>{s.section}</td>
                  <td><AttBar pct={getAttendancePercent(s)} /></td>
                  <td><RiskBadge level={getRiskLevel(s)} /></td>
                  <td>
                    <Btn variant="danger" onClick={() => handleDelete(s._id ?? s.studentId)}>
                      Delete
                    </Btn>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

// ─── MANAGE TEACHERS ──────────────────────────────────────────────────────────
const ManageTeachers = () => {
  const [teachers, setTeachers] = useState([]);
  const [modal, setModal]       = useState(false);
  const [subjectModal, setSubjectModal] = useState(false);
  const [selectedTeacher, setSelectedTeacher] = useState(null);
  const [subjectForm, setSubjectForm] = useState({
    subjectName: "",
    semester: "",
    section: ""
  });
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);

  useEffect(() => {
    authFetch(`${API}/admin/teachers`)
      .then((response) => {
        if (!response.ok) throw new Error("Failed to load teachers.");
        return readJson(response, "Failed to read teachers.");
      })
      .then((data) => {
        setTeachers(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(e => { console.error(e); setError("Failed to load teachers."); setLoading(false); });
  }, []);

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this teacher?")) return;
    try {
      const res = await authFetch(`${API}/admin/teachers/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setTeachers(prev => prev.filter(t => t.id !== id));
    } catch {
      alert("Failed to delete teacher. Please try again.");
    }
  };

  const handleAssignSubject = (teacher) => {
    setSelectedTeacher(teacher);
    setSubjectForm({ subjectName: "", semester: "", section: "" });
    setSubjectModal(true);
  };

  const submitSubjectAssignment = async () => {
    if (!subjectForm.subjectName.trim() || !subjectForm.semester.trim() || !subjectForm.section.trim()) {
      alert("Please fill all subject details.");
      return;
    }

    try {
      const res = await authFetch(`${API}/admin/assign-subject/${selectedTeacher.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subjectName: subjectForm.subjectName.trim(),
          semester: subjectForm.semester.trim(),
          section: subjectForm.section.trim()
        })
      });

      if (!res.ok) {
        const errData = await readJson(res, "Failed to assign subject");
        throw new Error(errData.error || "Failed to assign subject");
      }

      const data = await readJson(res, "Failed to read assigned subject");
      setTeachers(prev => prev.map(t => 
        t.id === selectedTeacher.id 
          ? { ...t, subjects: data.teacher.subjects || [] }
          : t
      ));
      alert("Subject assigned successfully!");
      setSubjectModal(false);
    } catch (err) {
      console.error(err);
      alert(err.message || "Error assigning subject.");
    }
  };

  const handleAdd = (teacher) => {
    setTeachers(prev => [...prev, teacher]);
  };

  return (
    <>
      <div className="page-body">
        <div className="page-header">
          <h2 className="section-title">Manage Teachers</h2>
          <Btn variant="primary" onClick={() => setModal(true)}>＋ Add Teacher</Btn>
        </div>

        <div className="table-wrap">
          {loading ? <Spinner /> : error ? <Empty message={error} /> : (
            <table className="efps-table">
              <thead>
                <tr>
                  {["Name","Email","Department","Subjects","Action"].map(h => <th key={h}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {teachers.length === 0 ? (
                  <tr><td colSpan={5}><Empty message="No teachers found." /></td></tr>
                ) : teachers.map(t => (
                  <tr key={t.id}>
                    <td>
                      <div className="teacher-cell">
                        <div className="teacher-avatar">
                          {t.name?.split(" ").pop()?.[0] ?? "?"}
                        </div>
                        <span className="td-primary">{t.name}</span>
                      </div>
                    </td>
                    <td style={{ color: "var(--text-muted)" }}>{t.email}</td>
                    <td><span className="badge badge-dept">{t.dept}</span></td>
                    <td>
                      <span style={{ color: "var(--text-muted)", fontSize: "13px" }}>
                        {t.subjects?.length ?? 0} subject(s)
                      </span>
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: "6px" }}>
                        <Btn variant="secondary" onClick={() => handleAssignSubject(t)} style={{ fontSize: "12px", padding: "6px 8px" }}>
                          📚 Assign
                        </Btn>
                        <Btn variant="danger" onClick={() => handleDelete(t.id)} style={{ fontSize: "12px", padding: "6px 8px" }}>
                          Delete
                        </Btn>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {modal && <Modal onClose={() => setModal(false)} onAdd={handleAdd} />}

      {subjectModal && selectedTeacher && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setSubjectModal(false); }}>
          <div className="modal-box">
            <button className="modal-close" onClick={() => setSubjectModal(false)}>×</button>
            <div className="modal-title">Assign Subject to {selectedTeacher.name}</div>
            <div className="form-field">
              <label className="form-label">Subject Name</label>
              <select
                value={subjectForm.subjectName}
                onChange={e => setSubjectForm(p => ({ ...p, subjectName: e.target.value }))}
                className="form-input"
              >
                <option value="">Select a subject...</option>
                <option value="Data Structures">Data Structures</option>
                <option value="Database Management">Database Management</option>
                <option value="Web Development">Web Development</option>
                <option value="Operating Systems">Operating Systems</option>
              </select>
            </div>
            <FormField 
              label="Semester" 
              value={subjectForm.semester} 
              onChange={v => setSubjectForm(p => ({ ...p, semester: v }))}
              placeholder="e.g. 4th"
            />
            <FormField 
              label="Section" 
              value={subjectForm.section} 
              onChange={v => setSubjectForm(p => ({ ...p, section: v }))}
              placeholder="e.g. A"
            />
            <div className="modal-actions">
              <Btn variant="secondary" onClick={() => setSubjectModal(false)}>Cancel</Btn>
              <Btn variant="primary" onClick={submitSubjectAssignment}>Assign Subject</Btn>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

// ─── ANALYTICS ────────────────────────────────────────────────────────────────
const Analytics = () => {
  const [trend, setTrend]   = useState([]);
  const [risk, setRisk]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState(null);

  const RISK_COLORS = ["#10b981", "#f59e0b", "#dc2626"];

  useEffect(() => {
    authFetch(`${API}/admin/students`)
      .then((response) => {
        if (!response.ok) throw new Error("Failed to load students");
        return readJson(response, "Failed to read students");
      })
      .then((students) => {
        setTrend(getAttendanceTrend(students));
        setRisk(getRiskDistribution(students));
      })
      .catch((error) => {
        console.error(error);
        setError("Failed to load analytics data.");
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner />;
  if (error)   return <Empty message={error} />;

  return (
    <div className="page-body">
      <h2 className="section-title" style={{ marginBottom: "var(--space-1)" }}>Analytics</h2>

      <div className="grid-2-equal">
        <Card>
          <div className="card-title">Monthly Attendance %</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={trend} barSize={30}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize:11, fill:"#94a3b8" }} axisLine={false} tickLine={false} />
              <YAxis domain={[60,100]} tick={{ fontSize:11, fill:"#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={v => v+"%"} />
              <Tooltip contentStyle={tooltipStyle} formatter={v => [v+"%","Attendance"]} />
              <Bar dataKey="att" fill="#1d4ed8" radius={[6,6,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card>
          <div className="card-title">Risk Breakdown</div>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={risk} cx="50%" cy="45%" outerRadius={80} paddingAngle={3} dataKey="value">
                {risk.map((d, i) => <Cell key={i} fill={RISK_COLORS[i % RISK_COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} formatter={(v, n) => [v+" students", n]} />
              <Legend iconType="circle" iconSize={10} wrapperStyle={{ fontSize:"12px", color:"#475569", fontFamily:"'IBM Plex Sans', sans-serif" }} />
            </PieChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <Card>
        <div className="card-title">Attendance Trend (Area View)</div>
        <ResponsiveContainer width="100%" height={210}>
          <AreaChart data={trend}>
            <defs>
              <linearGradient id="aGrad2" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#7c3aed" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#7c3aed" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize:11, fill:"#94a3b8" }} axisLine={false} tickLine={false} />
            <YAxis domain={[60,100]} tick={{ fontSize:11, fill:"#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={v => v+"%"} />
            <Tooltip contentStyle={tooltipStyle} formatter={v => [v+"%","Attendance"]} />
            <Area type="monotone" dataKey="att" stroke="#7c3aed" strokeWidth={2.5} fill="url(#aGrad2)" dot={{ r:4, fill:"#7c3aed" }} />
          </AreaChart>
        </ResponsiveContainer>
      </Card>
    </div>
  );
};

// ─── SETTINGS ─────────────────────────────────────────────────────────────────
const Settings = () => {
  // System defaults displayed as read-only information
  const systemDefaults = {
    institution: "EFPS Institution",
    email: "admin@efps.edu",
    highRisk: "65",
    medRisk: "75",
    year: getAcademicYearLabel(),
  };

  return (
    <div className="page-body">
      <h2 className="section-title" style={{ marginBottom: "var(--space-1)" }}>System Settings</h2>
      <Card className="settings-card">
        <div style={{ marginBottom: "var(--space-3)" }}>
          <strong>Institution Name:</strong> {systemDefaults.institution}
        </div>
        <div style={{ marginBottom: "var(--space-3)" }}>
          <strong>System Email:</strong> {systemDefaults.email}
        </div>
        <div style={{ marginBottom: "var(--space-3)" }}>
          <strong>High Risk Threshold (Att. %):</strong> {systemDefaults.highRisk}%
        </div>
        <div style={{ marginBottom: "var(--space-3)" }}>
          <strong>Medium Risk Threshold (Att. %):</strong> {systemDefaults.medRisk}%
        </div>
        <div style={{ marginBottom: "var(--space-3)" }}>
          <strong>Academic Year:</strong> {systemDefaults.year}
        </div>
        <p style={{ marginTop: "var(--space-6)", fontSize: "0.9rem", color: "var(--text-secondary)" }}>
          Settings are system defaults managed by the system configuration. Contact your system administrator to modify these values.
        </p>
      </Card>
    </div>
  );
};
// ─── PERFORMANCE PAGE ───────────────────────────────────────
const PerformancePage = () => {

  const [students, setStudents] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState("");
  const [selectedSubject, setSelectedSubject] = useState("");

  const [internal1, setInternal1] = useState("");
  const [internal2, setInternal2] = useState("");
  const [assignment, setAssignment] = useState("");
  const [semesterMarks, setSemesterMarks] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Load students
  useEffect(() => {
    authFetch(`${API}/admin/students`)
      .then((response) => {
        if (!response.ok) throw new Error("Failed to load students");
        return readJson(response, "Failed to read students");
      })
      .then((data) => {
        setStudents(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch((error) => {
        console.error(error);
        setLoading(false);
      });
  }, []);

  // Calculations
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
    if (!eligibleForSem) return "High";
    if (totalBeforeSem < 25) return "Medium";
    return "Low";
  };

  const savePerformance = async () => {

    if (!selectedStudent || !selectedSubject) {
      alert("Select student and subject.");
      return;
    }

    if (!eligibleForSem && semesterMarks) {
      alert("Student not eligible for semester exam.");
      return;
    }

    const scoreToSave = semesterMarks ? parseFloat(semesterMarks) : totalBeforeSem;
    if (!Number.isFinite(scoreToSave)) {
      alert("Please enter valid marks.");
      return;
    }

    setSaving(true);

    try {
      const res = await authFetch(`${API}/teacher/marks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: selectedStudent,
          subjectName: selectedSubject,
          score: Math.round(scoreToSave),
        }),
      });

      if (!res.ok) throw new Error();

      alert("Performance saved successfully!");

      setInternal1("");
      setInternal2("");
      setAssignment("");
      setSemesterMarks("");

    } catch {
      alert("Failed to save performance.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Spinner />;

  return (
    <div className="page-body">

      <Card>
        <div className="section-title" style={{ marginBottom: "var(--space-4)" }}>
          Enter Student Performance
        </div>

        <div className="performance-grid">

          <div className="form-field">
            <label className="form-label">Student</label>
            <select
              className="form-input"
              value={selectedStudent}
              onChange={e => setSelectedStudent(e.target.value)}
            >
              <option value="">Select student</option>
              {students.map(s => (
                <option key={s._id ?? s.studentId} value={s.studentId}>
                  {s.fullName} — {s.studentId}
                </option>
              ))}
            </select>
          </div>

          <div className="form-field">
            <label className="form-label">Subject</label>
            <select
              className="form-input"
              value={selectedSubject}
              onChange={e => setSelectedSubject(e.target.value)}
            >
              <option value="">Select subject</option>
              <option value="Data Structures">Data Structures</option>
              <option value="Database Management">Database Management</option>
              <option value="Web Development">Web Development</option>
              <option value="Operating Systems">Operating Systems</option>
            </select>
          </div>

          <FormField label="Internal 1" value={internal1} onChange={setInternal1} type="number" />
          <FormField label="Internal 2" value={internal2} onChange={setInternal2} type="number" />

          <div className="performance-full calculation-highlight">
            Internal Average: {internalAverage.toFixed(2)}
          </div>

          <FormField label="Assignment Marks" value={assignment} onChange={setAssignment} type="number" />

          <div className="performance-full performance-summary">

            <div className="performance-summary-item">
              <span>Total Before Semester</span>
              <span>{totalBeforeSem.toFixed(2)}</span>
            </div>

            <div className={`eligibility-box ${eligibleForSem ? "eligible" : "not-eligible"}`}>
              {eligibleForSem ? "Eligible for Semester Exam"
                : "Not Eligible (Avg ≥12, Assign ≥8, Total ≥20)"}
            </div>

            <RiskBadge level={riskLevel()} />

          </div>

          <div className="form-field performance-full">
            <label className="form-label">Semester Exam Marks</label>
            <input
              type="number"
              className="form-input"
              value={semesterMarks}
              onChange={e => setSemesterMarks(e.target.value)}
              disabled={!eligibleForSem}
            />
          </div>

        </div>

        <div style={{ marginTop: "var(--space-6)" }}>
          <Btn variant="primary" onClick={savePerformance}>
            {saving ? "Saving..." : "Save Performance"}
          </Btn>
        </div>

      </Card>

    </div>
  );
};

// ─── NAV CONFIG ───────────────────────────────────────────────────────────────
const NAV = [
  { key: "overview",  label: "Dashboard Overview", icon: "🏠", Page: Overview },
  { key: "students",  label: "Manage Students",    icon: "🎓", Page: ManageStudents },
  { key: "teachers",  label: "Manage Teachers",    icon: "👩‍🏫", Page: ManageTeachers },
  { key: "performance", label: "Performance Entry", icon: "📝", Page: PerformancePage }, // ✅ ADD THIS
  { key: "analytics", label: "Analytics",          icon: "📈", Page: Analytics },
  { key: "settings",  label: "Settings",           icon: "⚙️", Page: Settings },
];

// ─── ROOT APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [active, setActive] = useState("overview");
  const navigate = useNavigate();
  const [adminUser] = useState(() => getStoredAdmin());
  const current = NAV.find(n => n.key === active);
  const Page = current?.Page ?? Overview;

  useEffect(() => {
    if (!adminUser?.token || adminUser?.role !== "admin") {
      clearAdminSession();
      navigate("/login");
    }
  }, [adminUser, navigate]);

  const handleLogout = () => {
    clearAdminSession();
    navigate("/login");
  };

  return (
    <div className="app-shell">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">EF<br/>PS</div>
          <div className="sidebar-logo-text">
            <span className="sidebar-logo-name">EFPS</span>
            <span className="sidebar-logo-sub">Admin Portal</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          {NAV.map(n => (
            <button
              key={n.key}
              className={`nav-item ${active === n.key ? "active" : ""}`}
              onClick={() => setActive(n.key)}
            >
              <span className="nav-item-icon">{n.icon}</span>
              {n.label}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">© 2025 EFPS System</div>
      </aside>

      {/* Main Area */}
      <div className="main-area">
        {/* Topbar */}
        <header className="topbar">
          <div className="topbar-title">{current?.label ?? "Dashboard Overview"}</div>
          <div className="topbar-actions">
            <div className="topbar-user-info">
              <div className="topbar-user-name">{adminUser?.fullName || "Admin User"}</div>
              <div className="topbar-user-role">System Administrator</div>
            </div>
            <div className="topbar-avatar">{(adminUser?.fullName || "A").charAt(0).toUpperCase()}</div>
            <Btn variant="secondary" className="btn-logout" onClick={handleLogout}>
              Logout
            </Btn>
          </div>
        </header>

        {/* Page */}
        <main className="page-content">
          <Page />
        </main>
      </div>
    </div>
  );
}

import React, { useState, useEffect, useRef } from 'react';
import "../styling/student_dashboard.css";
import { useNavigate } from "react-router-dom";

import {
  LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer
} from "recharts";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "https://efps-ai-system.onrender.com";

const initialStudentState = {
  fullName: '',
  studentId: '',
  semester: '',
  section: '',
  attendance: null,
  cgpa: null,
  subjects: [],
  alerts: [],
  recommendations: [],
  risk: null,
  reasons: [] // ✅ NEW
};

const StudentDashboard = () => {
  const navigate = useNavigate();
  const alertsRef = useRef(null);
  const recommendationsRef = useRef(null);

  const [student, setStudent] = useState(initialStudentState);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchStudentDashboard = async () => {
      let storedStudent = null;

      try {
        storedStudent = JSON.parse(localStorage.getItem("student"));
      } catch {
        storedStudent = null;
      }

      if (!storedStudent) {
        navigate('/login');
        return;
      }

      const studentIdentifier = storedStudent.studentId || storedStudent.email;

      try {
        setIsLoading(true);

        const response = await fetch(
          `${API_BASE_URL}/student/dashboard/${encodeURIComponent(studentIdentifier)}`,
          {
            headers: storedStudent?.token
              ? { Authorization: `Bearer ${storedStudent.token}` }
              : {}
          }
        );

        const data = await response.json();

        if (!response.ok) throw new Error(data.error);

        setStudent({
          fullName: data.fullName || storedStudent.fullName || 'Student',
          studentId: data.studentId || storedStudent.studentId || '',
          semester: data.semester || storedStudent.semester || 'N/A',
          section: data.section || storedStudent.section || 'N/A',
          attendance: data.attendance ?? null,
          cgpa: data.cgpa ?? null,
          subjects: data.subjects || [],
          alerts: data.alerts || [],
          recommendations: data.recommendations || [],
          risk: data.risk || null,
          reasons: data.reasons || [] // ✅ NEW
        });

      } catch (err) {
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };

    fetchStudentDashboard();
  }, [navigate]);

  // ───── HELPERS ─────
  const getAttendanceStatus = (a) => a >= 80 ? 'good' : a >= 70 ? 'warning' : 'critical';
  const getCGPAStatus = (c) => c >= 8 ? 'excellent' : c >= 6.5 ? 'good' : 'warning';
  const getSubjectStatus = (a) => a >= 80 ? 'excellent' : a >= 70 ? 'good' : a >= 60 ? 'warning' : 'critical';
  const getRiskStatus = (r) => r === "Low" ? "good" : r === "Medium" ? "warning" : "critical";

  const scrollToSection = (ref) => ref.current?.scrollIntoView({ behavior: "smooth" });

  const handleLogout = () => {
    localStorage.removeItem("student");
    navigate("/login");
  };

  // 📊 GRAPH DATA
  const predictionData = student.subjects.map(s => ({
    name: s.name,
    score: s.average
  }));

  return (
    <div className="dashboard-container">

      {/* NAVBAR */}
      <nav className="dashboard-navbar">
        <div className="navbar-content">
          <h1 className="dashboard-title">EFPS Student Dashboard</h1>

          <div className="navbar-badges">
            {student.alerts.length > 0 && (
              <button className="badge-item badge-alert" onClick={() => scrollToSection(alertsRef)}>
                ⚠️ {student.alerts.length}
              </button>
            )}

            {student.recommendations.length > 0 && (
              <button className="badge-item badge-recommendation" onClick={() => scrollToSection(recommendationsRef)}>
                💡 {student.recommendations.length}
              </button>
            )}

            <button className="badge-item badge-logout" onClick={handleLogout}>
              🚪 Logout
            </button>
          </div>
        </div>
      </nav>

      <div className="dashboard-main">

        {/* HEADER */}
        <div className="welcome-card">
          <h2 className="welcome-title">Welcome, {student.fullName}</h2>
          <p className="student-info">{student.studentId} • {student.semester} • {student.section}</p>
        </div>

        {isLoading && <div className="state-loading">Loading...</div>}
        {error && <div className="state-empty">{error}</div>}

        {/* MAIN GRID */}
        {!isLoading && (
          <div className="academic-grid">

            <div className={`academic-card card-${getAttendanceStatus(student.attendance ?? 0)}`}>
              <div className="card-header">
                <h3>Attendance</h3>
                <span className="card-pill">Overall</span>
              </div>
              <div className="card-value">
                {student.attendance !== null ? `${student.attendance}%` : "—"}
              </div>
            </div>

            <div className={`academic-card card-${getCGPAStatus(student.cgpa ?? 0)}`}>
              <div className="card-header">
                <h3>CGPA</h3>
                <span className="card-pill">Academic</span>
              </div>
              <div className="card-value">{student.cgpa ?? "—"}</div>
            </div>

            <div className={`academic-card card-${getRiskStatus(student.risk)}`}>
              <div className="card-header">
                <h3>AI Risk</h3>
                <span className="card-pill">Prediction</span>
              </div>
              <div className="card-value">{student.risk || "—"}</div>
            </div>

            {student.subjects.map((sub, i) => (
              <div key={i} className={`academic-card card-${getSubjectStatus(sub.average)}`}>
                <div className="card-header">
                  <h3>{sub.name}</h3>
                  <span className="card-pill">Subject</span>
                </div>
                <div className="card-value">{sub.average}%</div>
              </div>
            ))}

          </div>
        )}

        {/* 📈 GRAPH */}
        {predictionData.length > 0 && (
          <div className="chart-card">
            <h3 className="chart-title">Performance Trend</h3>

            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={predictionData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis domain={[0, 100]} />
                <Tooltip />
                <Line type="monotone" dataKey="score" stroke="#3b82f6" strokeWidth={3} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* 🧠 WHY AT RISK */}
        {student.reasons.length > 0 && (
          <div className="notification-card reason-card">
            <div className="notification-header">
              <h3>Why am I at Risk?</h3>
            </div>
            <div className="notification-list">
              {student.reasons.map((r, i) => (
                <p className="notification-item" key={i}>{r}</p>
              ))}
            </div>
          </div>
        )}

        {(student.alerts.length > 0 || student.recommendations.length > 0) && (
          <div className="notifications-grid">
            {student.alerts.length > 0 && (
              <section ref={alertsRef} className="notification-card alert-card">
                <div className="notification-header">
                  <h3>Alerts</h3>
                </div>
                <div className="notification-list">
                  {student.alerts.map((a, i) => (
                    <p className="notification-item" key={i}>{a}</p>
                  ))}
                </div>
              </section>
            )}

            {student.recommendations.length > 0 && (
              <section ref={recommendationsRef} className="notification-card recommendation-card">
                <div className="notification-header">
                  <h3>Recommendations</h3>
                </div>
                <div className="notification-list">
                  {student.recommendations.map((r, i) => (
                    <p className="notification-item" key={i}>{r}</p>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}

      </div>
    </div>
  );
};

export default StudentDashboard;
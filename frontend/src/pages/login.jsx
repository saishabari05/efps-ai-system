import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "../styling/login.css";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "https://efps-ai-system.onrender.com";


const Login = () => {
  const navigate = useNavigate();
  const [selectedRole, setSelectedRole] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const roles = [
    {
      id: "student",
      title: "Student",
      icon: "🎓",
      description: "Access your courses and assignments",
      gradient: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)"
    },
    {
      id: "teacher",
      title: "Teacher",
      icon: "👨‍🏫",
      description: "Manage classes and grade students",
      gradient: "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)"
    },
    {
      id: "admin",
      title: "Admin",
      icon: "🛠",
      description: "System administration and settings",
      gradient: "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)"
    }
  ];

  const handleRoleSelect = (roleId) => {
    setSelectedRole(roleId);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!selectedRole) {
      alert("Please select your role");
      return;
    }
    if (!email || !password) {
      alert("Please enter email and password");
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ email, password })
      });

      const rawResponse = await response.text();
      let data = {};

      try {
        data = rawResponse ? JSON.parse(rawResponse) : {};
      } catch {
        throw new Error(
          rawResponse || "The server returned an invalid response. Please check the backend logs."
        );
      }

      if (response.ok) {
        if (selectedRole && data.role !== selectedRole) {
          alert(`This account is registered as ${data.role}, not ${selectedRole}. Please choose the correct role.`);
          return;
        }

        if (data.role === "admin") {
          localStorage.setItem("admin", JSON.stringify(data));
          navigate("/admin-dashboard");
        } else if (data.role === "student") {
          localStorage.setItem("student", JSON.stringify(data));
          navigate("/student-dashboard");
        } else if (data.role === "teacher") {
          localStorage.setItem("teacher", JSON.stringify(data));
          navigate("/teacher-dashboard");
        } else {
          alert(`${data.role} dashboard coming soon!`);
        }
      } else {
        alert(data.error || "Login failed");
      }
    } catch (error) {
      console.error("Error:", error);
      if (error instanceof TypeError) {
        alert(`Cannot connect to the server at ${API_BASE_URL}. Make sure the backend is running and CORS is configured correctly.`);
        return;
      }

      alert(error.message || "Something went wrong while trying to log in.");
    }
  };

  return (
    <div className="login-container">
      <div className="login-wrapper">
        <div className="login-header">
          <h1 className="login-title">Welcome Back</h1>
          <p className="login-subtitle">Select your role to access EFPS Dashboard</p>
        </div>

        {!selectedRole ? (
          <div className="role-cards-container">
            {roles.map((role) => (
              <div
                key={role.id}
                className="role-card"
                onClick={() => handleRoleSelect(role.id)}
              >
                <div className="role-card-inner">
                  <div 
                    className="role-card-gradient"
                    style={{ background: role.gradient }}
                  ></div>
                  <div className="role-card-content">
                    <div className="role-icon">{role.icon}</div>
                    <h3 className="role-title">{role.title}</h3>
                    <p className="role-description">{role.description}</p>
                  </div>
                  <div className="role-card-footer">
                    <span className="select-text">Click to continue</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="login-form-container">
            <div className="selected-role-badge">
              <span className="badge-icon">
                {roles.find(r => r.id === selectedRole)?.icon}
              </span>
              <span className="badge-text">
                {roles.find(r => r.id === selectedRole)?.title}
              </span>
              <button 
                className="change-role-btn"
                onClick={() => setSelectedRole("")}
                type="button"
              >
                Change
              </button>
            </div>

            <form className="login-form" onSubmit={handleLogin}>
              <div className="form-group">
                <label htmlFor="email">Email Address</label>
                <input
                  type="email"
                  id="email"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="password">Password</label>
                <input
                  type="password"
                  id="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>

              <button type="submit" className="login-btn">
                Login as {roles.find(r => r.id === selectedRole)?.title}
              </button>
            </form>
          </div>
        )}

      </div>

      <div className="background-animation">
        <div className="floating-shape shape-1"></div>
        <div className="floating-shape shape-2"></div>
        <div className="floating-shape shape-3"></div>
        <div className="floating-shape shape-4"></div>
      </div>
    </div>
  );
};

export default Login;



import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import "../styling/register.css";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:10000";


const Register = () => {
  const [formData, setFormData] = useState({
    fullName: '',
    studentId: '',
    semester: '',
    section: '',
    email: '',
    password: ''
  });
  const navigate = useNavigate();


const [errors, setErrors] = useState({});
const [success, setSuccess] = useState(false);

const handleChange = (e) => {
  const { name, value } = e.target;
  setFormData(prevState => ({
    ...prevState,
    [name]: value
  }));
};

const validateForm = () => {
    const newErrors = {};

    if (!formData.fullName.trim()) {
      newErrors.fullName = 'Full name is required';
    }

    if (!formData.studentId.trim()) {
      newErrors.studentId = 'Student ID is required';
    }

    if (!formData.semester.trim()) {
      newErrors.semester = 'Semester is required';
    }

    if (!formData.section.trim()) {
      newErrors.section = 'Section is required';
    }

    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Email is invalid';
    }

    if (!formData.password) {
      newErrors.password = 'Password is required';
    } else if (formData.password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters';
    }

    return newErrors;
  };

  const handleSubmit = async (e) => {
  e.preventDefault();

  const newErrors = validateForm();

  if (Object.keys(newErrors).length > 0) {
    setErrors(newErrors);
    return;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(formData)
    });

    const data = await response.json();

    console.log("Server Response:", data);

    if (response.ok) {
      alert(data.message);
      setSuccess(true);
      // Optionally navigate to login after 2 seconds
      setTimeout(() => {
        navigate("/login");
      }, 2000);
    } else {
      alert(data.error || "Registration failed");
    }

  } catch (error) {
    console.error("Error:", error);
    alert("Something went wrong!");
  }
};


  return (
    <div className="register-container">
      <div className="register-card">
        <div className="register-header">
          <h1 className="register-title">Student Registration</h1>
          <p className="register-subtitle">Create your EFPS account</p>
        </div>

        {success ? (
          <div className="success-message">
            🎉 Account Created Successfully! <br />
            You can now login.
          </div>
        ) : (
          <>
            <form className="register-form" onSubmit={handleSubmit}>
              
              <div className="register-form-group">
                <label htmlFor="fullName" className="register-form-label">
                  Full Name
                </label>
                <input
                  type="text"
                  id="fullName"
                  name="fullName"
                  className={`register-form-input ${errors.fullName ? 'input-error' : ''}`}
                  value={formData.fullName}
                  onChange={handleChange}
                  placeholder="Enter your full name"
                />
                {errors.fullName && (
                  <span className="register-error-message">{errors.fullName}</span>
                )}
              </div>

              <div className="register-form-group">
                <label htmlFor="studentId" className="register-form-label">
                  Student ID
                </label>
                <input
                  type="text"
                  id="studentId"
                  name="studentId"
                  className={`register-form-input ${errors.studentId ? 'input-error' : ''}`}
                  value={formData.studentId}
                  onChange={handleChange}
                  placeholder="Enter your student ID"
                />
                {errors.studentId && (
                  <span className="register-error-message">{errors.studentId}</span>
                )}
              </div>

              <div className="register-form-row">
                <div className="register-form-group register-form-group-half">
                  <label htmlFor="semester" className="register-form-label">
                    Semester
                  </label>
                  <input
                    type="text"
                    id="semester"
                    name="semester"
                    className={`register-form-input ${errors.semester ? 'input-error' : ''}`}
                    value={formData.semester}
                    onChange={handleChange}
                    placeholder="e.g., 5th Semester"
                  />
                  {errors.semester && (
                    <span className="register-error-message">{errors.semester}</span>
                  )}
                </div>

                <div className="register-form-group register-form-group-half">
                  <label htmlFor="section" className="register-form-label">
                    Section
                  </label>
                  <input
                    type="text"
                    id="section"
                    name="section"
                    className={`register-form-input ${errors.section ? 'input-error' : ''}`}
                    value={formData.section}
                    onChange={handleChange}
                    placeholder="e.g., Section A"
                  />
                  {errors.section && (
                    <span className="register-error-message">{errors.section}</span>
                  )}
                </div>
              </div>

              <div className="register-form-group">
                <label htmlFor="email" className="register-form-label">
                  Email
                </label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  className={`register-form-input ${errors.email ? 'input-error' : ''}`}
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="Enter your email"
                />
                {errors.email && (
                  <span className="register-error-message">{errors.email}</span>
                )}
              </div>

              <div className="register-form-group">
                <label htmlFor="password" className="register-form-label">
                  Password
                </label>
                <input
                  type="password"
                  id="password"
                  name="password"
                  className={`register-form-input ${errors.password ? 'input-error' : ''}`}
                  value={formData.password}
                  onChange={handleChange}
                  placeholder="Create a password"
                />
                {errors.password && (
                  <span className="register-error-message">{errors.password}</span>
                )}
              </div>

              <button type="submit" className="register-submit-button">
                Create Account
              </button>
            </form>

            <div className="register-footer">
              <p className="footer-text">
                Already have an account?{' '}
                <Link to="/login" className="login-link">
                  Login
                </Link>
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default Register;




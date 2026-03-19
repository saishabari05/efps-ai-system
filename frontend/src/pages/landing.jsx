import React, { useEffect, useRef, useState } from 'react';
import { Link } from "react-router-dom";
import '../styling/landing.css';

const LandingPage = () => {
  const featuresRef = useRef(null);
  const [featuresVisible, setFeaturesVisible] = useState(false);

  useEffect(() => {
    const section = featuresRef.current;
    if (!section) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setFeaturesVisible(true);
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.22 }
    );

    observer.observe(section);

    return () => observer.disconnect();
  }, []);

  return (
    <div className="landing-page">
      {/* Navbar */}
      <nav className="navbar">
        <div className="navbar-container">
          <div className="logo">
            <span className="logo-ef">EF</span>
            <span className="logo-ps">PS</span>
          </div>

          <div className="nav-menu">
            <a href="#home" className="nav-link">Home</a>
            <a href="#features" className="nav-link">Features</a>
            <a href="#about" className="nav-link">About</a>

            {/* ✅ Fixed Login Button */}
            <Link to="/login" className="btn-login">
              Login
            </Link>
            <Link to="/register" className="btn-secondary">
              Register
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="hero-section">
        <div className="background-wrapper">
          <div className="blob blob-1"></div>
          <div className="blob blob-2"></div>
          <div className="blob blob-3"></div>
        </div>

        <div className="hero-container">
          <div className="hero-grid">
            {/* Left Column */}
            <div className="hero-content">
              <h1 className="hero-heading">
                Early <span className="gradient-text">Failure Prevention</span> System
              </h1>

              <p className="hero-description">
                Transform student outcomes with intelligent early intervention.
                Our AI-powered platform identifies at-risk students before it's too late,
                enabling educators to provide targeted support and dramatically improve success rates.
              </p>

              <div className="hero-buttons">
                <Link to="/login" className="btn-primary">
                  Get Started
                </Link>

                <Link to="/login" className="btn-secondary">
                  Login
                </Link>
              </div>

              <div className="stats-row">
                <div className="stat-item">
                  <div className="stat-chip">Early Alerts</div>
                  <div className="stat-label">Get notified before performance drops critically.</div>
                </div>

                <div className="stat-item">
                  <div className="stat-chip">Actionable Guidance</div>
                  <div className="stat-label">Clear recommendations for students and faculty.</div>
                </div>

                <div className="stat-item">
                  <div className="stat-chip">Unified Insights</div>
                  <div className="stat-label">Attendance, marks, and risk trends in one view.</div>
                </div>
              </div>
            </div>

            {/* Right Column */}
            <div className="hero-visual">
              <div className="dashboard-card" tabIndex={0}>
                <div className="dashboard-content">
                  <div className="dashboard-icon-wrapper">
                    <svg
                      className="dashboard-icon"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                      />
                    </svg>
                  </div>

                  <h3 className="dashboard-title">Intelligent Monitoring</h3>
                  <p className="dashboard-subtitle">
                    Real-time insights and predictive analytics for proactive student support
                  </p>
                </div>

                <div className="dashboard-hover-info">
                  <h4>About EFPS</h4>
                  <p>
                    EFPS helps institutions detect academic risk early, track attendance and marks,
                    and guide timely interventions for better student success.
                  </p>
                  <ul>
                    <li>Early risk prediction and alerts</li>
                    <li>Role-based dashboards for admin, teacher, and student</li>
                    <li>Actionable recommendations for improvement</li>
                  </ul>
                </div>
              </div>

              <div className="float-decoration float-decoration-1"></div>
              <div className="float-decoration float-decoration-2"></div>
            </div>

          </div>
        </div>
      </section>

      <section
        id="features"
        ref={featuresRef}
        className={`features-section ${featuresVisible ? 'is-visible' : ''}`}
      >
        <div className="features-container">
          <div className="features-header">
            <p className="features-kicker">Why EFPS</p>
            <h2>Built for Early Action, Not Late Recovery</h2>
            <p>
              Turn student performance signals into clear decisions with a streamlined workflow
              for faculty and administrators.
            </p>
          </div>

          <div className="feature-grid">
            <article className="feature-card">
              <div className="feature-icon">⚡</div>
              <h3>Instant Risk Signals</h3>
              <p>
                Attendance, assessment trends, and behavior indicators are transformed into
                actionable alerts before outcomes worsen.
              </p>
            </article>

            <article className="feature-card">
              <div className="feature-icon">🎯</div>
              <h3>Targeted Intervention Plans</h3>
              <p>
                Get recommendation-driven support paths so teachers can prioritize students
                who need immediate guidance.
              </p>
            </article>

            <article className="feature-card">
              <div className="feature-icon">🧭</div>
              <h3>Unified Academic View</h3>
              <p>
                Consolidate marks, attendance, and progression insights into one reliable
                dashboard for better academic decisions.
              </p>
            </article>
          </div>
        </div>
      </section>
    </div>
  );
};

export default LandingPage;




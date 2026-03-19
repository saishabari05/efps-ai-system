import { Link } from "react-router-dom";

function Navbar() {
  return (
    <div style={{
      width: "100%",
      background: "white",
      padding: "20px 60px",
      boxShadow: "0 8px 30px rgba(0,0,0,0.05)",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center"
    }}>
      <h2 style={{ fontWeight: "700" }}>EFPS</h2>

      <div style={{ display: "flex", gap: "30px", fontWeight: "500" }}>
        <Link to="/">Home</Link>
        <Link to="/login">Login</Link>
        <Link to="/register">Register</Link>
        <Link to="/student-dashboard">Dashboard</Link>
      </div>
    </div>
  );
}

export default Navbar;



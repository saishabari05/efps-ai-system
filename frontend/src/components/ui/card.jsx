function Card({ children, title }) {
  return (
    <div style={styles.card}>
      {title && <h3>{title}</h3>}
      {children}
    </div>
  );
}

const styles = {
  card: {
    border: "1px solid #ccc",
    padding: "20px",
    borderRadius: "8px",
    maxWidth: "400px",
    margin: "20px auto",
    backgroundColor: "#fff",
  },
};

export default Card;

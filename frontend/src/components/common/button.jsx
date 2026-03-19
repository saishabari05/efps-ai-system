function Button({ text, onClick, type = "button" }) {
  return (
    <button type={type} onClick={onClick} style={styles.button}>
      {text}
    </button>
  );
}

const styles = {
  button: {
    padding: "10px 15px",
    backgroundColor: "#007bff",
    color: "white",
    border: "none",
    borderRadius: "5px",
    cursor: "pointer",
  },
};

export default Button;

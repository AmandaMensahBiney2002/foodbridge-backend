const express = require("express");
const pool = require("./db");

const app = express();

const PORT = 5000;

app.get("/", (req, res) => {
  res.send("FoodBridge backend is running!");
});

pool.query("SELECT NOW()", (err, result) => {
  if (err) {
    console.error("Database connection failed:", err.message);
  } else {
    console.log("Database connected successfully!");
  }
});

app.listen(PORT, () => {
  console.log(`FoodBridge backend running on port ${PORT}`);
});
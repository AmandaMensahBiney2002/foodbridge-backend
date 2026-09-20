
const express = require("express");
const cors = require("cors");
const pool = require("./db");
const authRoutes = require("./routes/auth");
const foodListingsRoutes = require("./routes/foodListings");
const foodRequestsRoutes = require("./routes/foodRequests");
const authenticateToken = require("./middleware/authMiddleware");

const app = express();

const PORT = 5000;

app.use(express.json());
app.use(cors());

// ======================================================
// ROUTES
// ======================================================

app.use("/api/auth", authRoutes);
app.use("/api/food-listings", foodListingsRoutes);
app.use("/api/food-requests", foodRequestsRoutes);

// ======================================================
// HOME
// ======================================================

app.get("/", (req, res) => {
  res.send("FoodBridge backend is running!");
});

// ======================================================
// PROTECTED TEST ROUTE
// ======================================================

app.get("/api/test-protected", authenticateToken, (req, res) => {
  res.json({
    message: "You accessed a protected route!",
    user: req.user
  });
});

// ======================================================
// USER PROFILE
// ======================================================

// Get the logged-in user's profile
app.get(
  "/api/profile",
  authenticateToken,
  async (req, res) => {
    try {
      const userId = req.user.id;

      const result = await pool.query(
        `
        SELECT
          id,
          first_name,
          last_name,
          email,
          phone,
          account_type,
          created_at
        FROM users
        WHERE id = $1
        `,
        [userId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          error: "User not found"
        });
      }

      res.json(result.rows[0]);
    } catch (error) {
      console.error(
        "Error fetching profile:",
        error.message
      );

      res.status(500).json({
        error: "Failed to fetch profile"
      });
    }
  }
);

// Update the logged-in user's profile
app.patch(
  "/api/profile",
  authenticateToken,
  async (req, res) => {
    try {
      const userId = req.user.id;

      const {
        first_name,
        last_name,
        phone
      } = req.body;

      // Validate required fields
      if (
        !first_name ||
        !first_name.trim() ||
        !last_name ||
        !last_name.trim()
      ) {
        return res.status(400).json({
          error: "First name and last name are required"
        });
      }

      const result = await pool.query(
        `
        UPDATE users
        SET
          first_name = $1,
          last_name = $2,
          phone = $3
        WHERE id = $4
        RETURNING
          id,
          first_name,
          last_name,
          email,
          phone,
          account_type,
          created_at
        `,
        [
          first_name.trim(),
          last_name.trim(),
          phone ? phone.trim() : null,
          userId
        ]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          error: "User not found"
        });
      }

      res.json({
        message: "Profile updated successfully",
        user: result.rows[0]
      });
    } catch (error) {
      console.error(
        "Error updating profile:",
        error.message
      );

      res.status(500).json({
        error: "Failed to update profile"
      });
    }
  }
);

// ======================================================
// DATABASE CONNECTION
// ======================================================

(async () => {
  try {
    await pool.query("SELECT NOW()");
    console.log("Database connected successfully!");
  } catch (error) {
    console.error(
      "Database connection failed:",
      error.message
    );
  }
})();

// ======================================================
// START SERVER
// ======================================================

app.listen(PORT, () => {
  console.log(
    `FoodBridge backend running on port ${PORT}`
  );
});


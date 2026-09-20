const express = require("express");
const cors = require("cors");
const pool = require("./db");

const authRoutes = require("./routes/auth");
const foodListingsRoutes = require("./routes/foodListings");
const foodRequestsRoutes = require("./routes/foodRequests");
const contactRoutes = require("./routes/contact");
const profileRoutes = require("./routes/profile");

const authenticateToken = require("./middleware/authMiddleware");

const app = express();

const PORT = process.env.PORT || 5000;

app.use(express.json());
app.use(cors());

// ======================================================
// ROUTES
// ======================================================

app.use("/api/auth", authRoutes);
app.use("/api/food-listings", foodListingsRoutes);
app.use("/api/food-requests", foodRequestsRoutes);
app.use("/api/contact", contactRoutes);

// Public profiles
app.use("/api/profiles", profileRoutes);

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

// Get the logged-in user's own profile
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
          profile_photo,
          display_name,
          profile_type,
          bio,
          location,
          is_verified,
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

      const profile = result.rows[0];

      res.json({
        ...profile,
        full_name: `${profile.first_name} ${profile.last_name}`
      });
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
        phone,
        profile_photo,
        display_name,
        profile_type,
        bio,
        location
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

      // Validate profile type if supplied
      const allowedProfileTypes = [
        "individual",
        "food_business",
        "organization"
      ];

      if (
        profile_type &&
        !allowedProfileTypes.includes(profile_type)
      ) {
        return res.status(400).json({
          error:
            "Profile type must be individual, food_business, or organization"
        });
      }

      const result = await pool.query(
        `
        UPDATE users
        SET
          first_name = $1,
          last_name = $2,
          phone = $3,
          profile_photo = $4,
          display_name = $5,
          profile_type = $6,
          bio = $7,
          location = $8
        WHERE id = $9
        RETURNING
          id,
          first_name,
          last_name,
          email,
          phone,
          account_type,
          profile_photo,
          display_name,
          profile_type,
          bio,
          location,
          is_verified,
          created_at
        `,
        [
          first_name.trim(),
          last_name.trim(),
          phone ? phone.trim() : null,
          profile_photo ? profile_photo.trim() : null,
          display_name ? display_name.trim() : null,
          profile_type || "individual",
          bio ? bio.trim() : null,
          location ? location.trim() : null,
          userId
        ]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          error: "User not found"
        });
      }

      const profile = result.rows[0];

      res.json({
        message: "Profile updated successfully",
        user: {
          ...profile,
          full_name: `${profile.first_name} ${profile.last_name}`
        }
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

if (require.main === module) {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(
      `FoodBridge backend running on port ${PORT}`
    );
  });
}

// ======================================================
// EXPORT EXPRESS APP FOR NETLIFY
// ======================================================

module.exports = app;
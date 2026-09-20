const express = require("express");
const pool = require("../db");

const router = express.Router();

// ======================================================
// GET PUBLIC PROFILE
// ======================================================

router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // Make sure the ID is a valid number
    const userId = Number(id);

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({
        error: "Invalid profile ID",
      });
    }

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
        error: "Profile not found",
      });
    }

    const profile = result.rows[0];

    res.json({
      profile: {
        ...profile,
        full_name: `${profile.first_name} ${profile.last_name}`,
      },
    });
  } catch (error) {
    console.error("Get public profile error:", error);

    res.status(500).json({
      error: "Failed to load profile",
    });
  }
});

module.exports = router;
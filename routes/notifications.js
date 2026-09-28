const express = require("express");
const router = express.Router();

const pool = require("../db");
const authenticateToken = require("../middleware/authMiddleware");

// =====================================================
// GET NOTIFICATIONS FOR CURRENT USER
// =====================================================

router.get("/", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT
        id,
        type,
        title,
        message,
        related_request_id,
        is_read,
        created_at
      FROM notifications
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 30;
      `,
      [req.user.id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching notifications:", error.message);
    res.status(500).json({
      message: "Failed to fetch notifications."
    });
  }
});

// =====================================================
// GET UNREAD NOTIFICATION COUNT
// =====================================================

router.get("/unread-count", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT COUNT(*) AS unread_count
      FROM notifications
      WHERE user_id = $1
        AND is_read = FALSE;
      `,
      [req.user.id]
    );

    res.json({
      unreadCount: Number(result.rows[0].unread_count)
    });
  } catch (error) {
    console.error(
      "Error fetching unread notification count:",
      error.message
    );

    res.status(500).json({
      message: "Failed to fetch unread notification count."
    });
  }
});

// =====================================================
// MARK ONE NOTIFICATION AS READ
// =====================================================

router.patch("/:id/read", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `
      UPDATE notifications
      SET is_read = TRUE
      WHERE id = $1
        AND user_id = $2
      RETURNING *;
      `,
      [req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Notification not found."
      });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error marking notification as read:", error.message);

    res.status(500).json({
      message: "Failed to mark notification as read."
    });
  }
});

// =====================================================
// MARK ALL NOTIFICATIONS AS READ
// =====================================================

router.patch("/read-all", authenticateToken, async (req, res) => {
  try {
    await pool.query(
      `
      UPDATE notifications
      SET is_read = TRUE
      WHERE user_id = $1
        AND is_read = FALSE;
      `,
      [req.user.id]
    );

    res.json({
      message: "All notifications marked as read."
    });
  } catch (error) {
    console.error(
      "Error marking all notifications as read:",
      error.message
    );

    res.status(500).json({
      message: "Failed to mark all notifications as read."
    });
  }
});

module.exports = router;
const express = require("express");
const pool = require("../db");
const authenticateToken = require("../middleware/authMiddleware");

const router = express.Router();

// ======================================================
// GET ALL FOOD LISTINGS
// ======================================================

router.get("/", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        food_listings.id,
        food_listings.donor_id,
        food_listings.food_name,
        food_listings.description,
        food_listings.quantity,
        food_listings.unit,
        food_listings.expiry_date,
        food_listings.pickup_location,
        food_listings.status,
        food_listings.created_at,

        users.first_name AS donor_first_name,
        users.last_name AS donor_last_name,

        (
          food_listings.quantity -
          COALESCE(
            SUM(
              CASE
                WHEN food_requests.status IN (
                  'pending',
                  'approved',
                  'completed'
                )
                THEN food_requests.quantity_requested
                ELSE 0
              END
            ),
            0
          )
        )::INTEGER AS available_quantity

      FROM food_listings

      JOIN users
        ON food_listings.donor_id = users.id

      LEFT JOIN food_requests
        ON food_listings.id = food_requests.food_listing_id

      GROUP BY
        food_listings.id,
        food_listings.donor_id,
        users.first_name,
        users.last_name

      ORDER BY food_listings.created_at DESC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error(
      "Error fetching food listings:",
      error.message
    );

    res.status(500).json({
      error: "Failed to fetch food listings",
      details: error.message
    });
  }
});

// ======================================================
// GET FOOD LISTINGS CREATED BY A SPECIFIC DONOR
// ======================================================

router.get(
  "/donor/:id",
  authenticateToken,
  async (req, res) => {
    try {
      const donorId = req.params.id;

      if (Number(req.user.id) !== Number(donorId)) {
        return res.status(403).json({
          error: "You are not authorized to view these listings"
        });
      }

      if (req.user.account_type !== "donor") {
        return res.status(403).json({
          error: "Only donor accounts can view donor listings"
        });
      }

      const result = await pool.query(
        `
        SELECT
          food_listings.id,
          food_listings.donor_id,
          food_listings.food_name,
          food_listings.description,
          food_listings.quantity,
          food_listings.unit,
          food_listings.expiry_date,
          food_listings.pickup_location,
          food_listings.status,
          food_listings.created_at,

          (
            food_listings.quantity -
            COALESCE(
              SUM(
                CASE
                  WHEN food_requests.status IN (
                    'pending',
                    'approved',
                    'completed'
                  )
                  THEN food_requests.quantity_requested
                  ELSE 0
                END
              ),
              0
            )
          )::INTEGER AS available_quantity

        FROM food_listings

        LEFT JOIN food_requests
          ON food_listings.id = food_requests.food_listing_id

        WHERE food_listings.donor_id = $1

        GROUP BY
          food_listings.id,
          food_listings.donor_id

        ORDER BY food_listings.created_at DESC
        `,
        [donorId]
      );

      res.json(result.rows);
    } catch (error) {
      console.error(
        "Error fetching donor listings:",
        error.message
      );

      res.status(500).json({
        error: "Failed to fetch donor listings"
      });
    }
  }
);

// ======================================================
// CREATE A FOOD LISTING
// ======================================================

router.post(
  "/",
  authenticateToken,
  async (req, res) => {
    try {
      const {
        food_name,
        description,
        quantity,
        unit,
        expiry_date,
        pickup_location
      } = req.body;

      const donor_id = req.user.id;

      if (req.user.account_type !== "donor") {
        return res.status(403).json({
          error: "Only donor accounts can create food listings"
        });
      }

      const donorCheck = await pool.query(
        "SELECT account_type FROM users WHERE id = $1",
        [donor_id]
      );

      if (donorCheck.rows.length === 0) {
        return res.status(404).json({
          error: "Donor not found"
        });
      }

      if (donorCheck.rows[0].account_type !== "donor") {
        return res.status(403).json({
          error: "Only donor accounts can create food listings"
        });
      }

      if (
        !donor_id ||
        !food_name ||
        !quantity ||
        !pickup_location
      ) {
        return res.status(400).json({
          error:
            "Donor, food name, quantity, and pickup location are required"
        });
      }

      if (Number(quantity) <= 0) {
        return res.status(400).json({
          error: "Quantity must be greater than 0"
        });
      }

      const result = await pool.query(
        `
        INSERT INTO food_listings (
          donor_id,
          food_name,
          description,
          quantity,
          unit,
          expiry_date,
          pickup_location
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *;
        `,
        [
          donor_id,
          food_name,
          description,
          quantity,
          unit,
          expiry_date,
          pickup_location
        ]
      );

      res.status(201).json(result.rows[0]);
    } catch (error) {
      console.error(
        "Error creating food listing:",
        error.message
      );

      res.status(500).json({
        error: "Failed to create food listing"
      });
    }
  }
);

// ======================================================
// EDIT A FOOD LISTING
// ======================================================

router.patch(
  "/:id",
  authenticateToken,
  async (req, res) => {
    try {
      const { id } = req.params;

      const {
        food_name,
        description,
        quantity,
        unit,
        expiry_date,
        pickup_location
      } = req.body;

      const donorId = req.user.id;

      if (req.user.account_type !== "donor") {
        return res.status(403).json({
          error: "Only donor accounts can edit food listings"
        });
      }

      const listingCheck = await pool.query(
        `
        SELECT
          id,
          donor_id,
          quantity
        FROM food_listings
        WHERE id = $1
        `,
        [id]
      );

      if (listingCheck.rows.length === 0) {
        return res.status(404).json({
          error: "Food listing not found"
        });
      }

      const listing = listingCheck.rows[0];

      if (Number(listing.donor_id) !== Number(donorId)) {
        return res.status(403).json({
          error: "You are not authorized to edit this listing"
        });
      }

      if (!food_name || !quantity || !pickup_location) {
        return res.status(400).json({
          error:
            "Food name, quantity, and pickup location are required"
        });
      }

      if (Number(quantity) <= 0) {
        return res.status(400).json({
          error: "Quantity must be greater than 0"
        });
      }

      const requestQuantityCheck = await pool.query(
        `
        SELECT
          COALESCE(
            SUM(
              CASE
                WHEN status IN (
                  'pending',
                  'approved',
                  'completed'
                )
                THEN quantity_requested
                ELSE 0
              END
            ),
            0
          ) AS reserved_quantity
        FROM food_requests
        WHERE food_listing_id = $1
        `,
        [id]
      );

      const reservedQuantity = Number(
        requestQuantityCheck.rows[0].reserved_quantity
      );

      if (Number(quantity) < reservedQuantity) {
        return res.status(400).json({
          error:
            `Quantity cannot be less than ${reservedQuantity} because that amount has already been requested`
        });
      }

      const result = await pool.query(
        `
        UPDATE food_listings
        SET
          food_name = $1,
          description = $2,
          quantity = $3,
          unit = $4,
          expiry_date = $5,
          pickup_location = $6
        WHERE id = $7
        RETURNING *;
        `,
        [
          food_name,
          description,
          quantity,
          unit,
          expiry_date,
          pickup_location,
          id
        ]
      );

      res.json(result.rows[0]);
    } catch (error) {
      console.error(
        "Error editing food listing:",
        error.message
      );

      res.status(500).json({
        error: "Failed to edit food listing"
      });
    }
  }
);

// ======================================================
// DELETE A FOOD LISTING
// ======================================================

router.delete(
  "/:id",
  authenticateToken,
  async (req, res) => {
    try {
      const { id } = req.params;
      const donorId = req.user.id;

      if (req.user.account_type !== "donor") {
        return res.status(403).json({
          error: "Only donor accounts can delete food listings"
        });
      }

      const listingCheck = await pool.query(
        `
        SELECT
          id,
          donor_id
        FROM food_listings
        WHERE id = $1
        `,
        [id]
      );

      if (listingCheck.rows.length === 0) {
        return res.status(404).json({
          error: "Food listing not found"
        });
      }

      const listing = listingCheck.rows[0];

      if (Number(listing.donor_id) !== Number(donorId)) {
        return res.status(403).json({
          error: "You are not authorized to delete this listing"
        });
      }

      const requestCheck = await pool.query(
        `
        SELECT COUNT(*) AS count
        FROM food_requests
        WHERE food_listing_id = $1
        `,
        [id]
      );

      const requestCount = Number(
        requestCheck.rows[0].count
      );

      if (requestCount > 0) {
        return res.status(400).json({
          error:
            "This listing cannot be deleted because it has food request history"
        });
      }

      await pool.query(
        `
        DELETE FROM food_listings
        WHERE id = $1
        `,
        [id]
      );

      return res.json({
        message: "Food listing deleted successfully"
      });
    } catch (error) {
      console.error(
        "Error deleting food listing:",
        error.message
      );

      res.status(500).json({
        error: "Failed to delete food listing"
      });
    }
  }
);

// ======================================================
// CLOSE A FOOD LISTING
// ======================================================

router.patch(
  "/:id/close",
  authenticateToken,
  async (req, res) => {
    try {
      const { id } = req.params;
      const donorId = req.user.id;

      if (req.user.account_type !== "donor") {
        return res.status(403).json({
          error: "Only donors can close food listings"
        });
      }

      const listingCheck = await pool.query(
        `
        SELECT
          id,
          donor_id,
          status
        FROM food_listings
        WHERE id = $1
        `,
        [id]
      );

      if (listingCheck.rows.length === 0) {
        return res.status(404).json({
          error: "Food listing not found"
        });
      }

      const listing = listingCheck.rows[0];

      if (Number(listing.donor_id) !== Number(donorId)) {
        return res.status(403).json({
          error: "You are not authorized to close this listing"
        });
      }

      if (listing.status === "closed") {
        return res.status(400).json({
          error: "This listing is already closed"
        });
      }

      const result = await pool.query(
        `
        UPDATE food_listings
        SET status = 'closed'
        WHERE id = $1
        RETURNING *;
        `
      );

      return res.json({
        message: "Food listing closed successfully",
        listing: result.rows[0]
      });
    } catch (error) {
      console.error(
        "Error closing food listing:",
        error.message
      );

      return res.status(500).json({
        error: "Failed to close food listing"
      });
    }
  }
);

module.exports = router;
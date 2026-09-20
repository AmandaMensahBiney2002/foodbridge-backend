
const express = require("express");
const pool = require("../db");
const authenticateToken = require("../middleware/authMiddleware");

const router = express.Router();

// ======================================================
// CREATE A FOOD REQUEST
// ======================================================

router.post(
  "/",
  authenticateToken,
  async (req, res) => {
    try {
      const {
        food_listing_id,
        quantity_requested
      } = req.body;

      const recipient_id = req.user.id;

      // Only recipients can request food
      if (req.user.account_type !== "recipient") {
        return res.status(403).json({
          error: "Only recipient accounts can request food"
        });
      }

      // Check recipient exists
      const recipientCheck = await pool.query(
        "SELECT account_type FROM users WHERE id = $1",
        [recipient_id]
      );

      if (recipientCheck.rows.length === 0) {
        return res.status(404).json({
          error: "Recipient not found"
        });
      }

      if (recipientCheck.rows[0].account_type !== "recipient") {
        return res.status(403).json({
          error:
            "Only recipient accounts can create food requests"
        });
      }

      // Validate requested quantity
      if (
        !quantity_requested ||
        Number(quantity_requested) <= 0
      ) {
        return res.status(400).json({
          error:
            "Requested quantity must be greater than 0"
        });
      }

      // Find listing and calculate available quantity
      const listingCheck = await pool.query(
        `
        SELECT
          food_listings.quantity,
          food_listings.status,

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
          ) AS requested_quantity

        FROM food_listings

        LEFT JOIN food_requests
          ON food_listings.id = food_requests.food_listing_id

        WHERE food_listings.id = $1

        GROUP BY
          food_listings.id,
          food_listings.quantity,
          food_listings.status
        `,
        [food_listing_id]
      );

      if (listingCheck.rows.length === 0) {
        return res.status(404).json({
          error: "Food listing not found"
        });
      }

      // A closed listing cannot receive new requests
      if (listingCheck.rows[0].status !== "available") {
        return res.status(400).json({
          error:
            "This food listing is no longer available"
        });
      }

      const availableQuantity =
        Number(listingCheck.rows[0].quantity) -
        Number(listingCheck.rows[0].requested_quantity);

      if (
        Number(quantity_requested) >
        availableQuantity
      ) {
        return res.status(400).json({
          error:
            `Only ${availableQuantity} portions are available`
        });
      }

      // Create request
      const result = await pool.query(
        `
        INSERT INTO food_requests (
          food_listing_id,
          recipient_id,
          quantity_requested
        )
        VALUES ($1, $2, $3)
        RETURNING *;
        `,
        [
          food_listing_id,
          recipient_id,
          quantity_requested
        ]
      );

      res.status(201).json(result.rows[0]);
    } catch (error) {
      console.error(
        "Error creating food request:",
        error.message
      );

      res.status(500).json({
        error: "Failed to create food request"
      });
    }
  }
);

// ======================================================
// GET ALL FOOD REQUESTS FOR A DONOR
// ======================================================

router.get(
  "/",
  authenticateToken,
  async (req, res) => {
    try {
      // Only donors can access the general request list
      if (req.user.account_type !== "donor") {
        return res.status(403).json({
          error: "Only donor accounts can view all food requests"
        });
      }

      const result = await pool.query(
        `
        SELECT
          food_requests.id,
          food_requests.quantity_requested,
          food_requests.status,
          food_requests.requested_at,

          food_listings.food_name,
          food_listings.description,
          food_listings.quantity AS listing_quantity,
          food_listings.unit,
          food_listings.expiry_date,
          food_listings.pickup_location,
          food_listings.status AS listing_status,

          (
            food_listings.quantity -
            COALESCE(
              SUM(
                CASE
                  WHEN other_requests.status IN (
                    'pending',
                    'approved',
                    'completed'
                  )
                  THEN other_requests.quantity_requested
                  ELSE 0
                END
              ),
              0
            )
          )::INTEGER AS available_quantity,

          users.first_name AS recipient_first_name,
          users.last_name AS recipient_last_name

        FROM food_requests

        JOIN food_listings
          ON food_requests.food_listing_id =
             food_listings.id

        JOIN users
          ON food_requests.recipient_id = users.id

        LEFT JOIN food_requests AS other_requests
          ON food_listings.id = other_requests.food_listing_id

        WHERE food_listings.donor_id = $1

        GROUP BY
          food_requests.id,
          food_listings.id,
          users.first_name,
          users.last_name

        ORDER BY food_requests.requested_at DESC
        `,
        [req.user.id]
      );

      res.json(result.rows);
    } catch (error) {
      console.error(
        "Error fetching food requests:",
        error.message
      );

      res.status(500).json({
        error: "Failed to fetch food requests"
      });
    }
  }
);

// ======================================================
// GET REQUESTS MADE BY A RECIPIENT
// ======================================================

router.get(
  "/recipient/:id",
  authenticateToken,
  async (req, res) => {
    try {
      const requestedRecipientId = req.params.id;

      // A recipient can only view their own requests
      if (
        Number(req.user.id) !==
        Number(requestedRecipientId)
      ) {
        return res.status(403).json({
          error:
            "You are not authorized to view these requests"
        });
      }

      if (req.user.account_type !== "recipient") {
        return res.status(403).json({
          error:
            "Only recipient accounts can view recipient requests"
        });
      }

      const result = await pool.query(
        `
        SELECT
          food_requests.id,
          food_requests.quantity_requested,
          food_requests.status,
          food_requests.requested_at,

          food_listings.food_name,
          food_listings.description,
          food_listings.quantity AS listing_quantity,
          food_listings.unit,
          food_listings.expiry_date,
          food_listings.pickup_location,
          food_listings.status AS listing_status,

          (
            food_listings.quantity -
            COALESCE(
              SUM(
                CASE
                  WHEN other_requests.status IN (
                    'pending',
                    'approved',
                    'completed'
                  )
                  THEN other_requests.quantity_requested
                  ELSE 0
                END
              ),
              0
            )
          )::INTEGER AS available_quantity

        FROM food_requests

        JOIN food_listings
          ON food_requests.food_listing_id =
             food_listings.id

        LEFT JOIN food_requests AS other_requests
          ON food_listings.id = other_requests.food_listing_id

        WHERE food_requests.recipient_id = $1

        GROUP BY
          food_requests.id,
          food_listings.id

        ORDER BY food_requests.requested_at DESC
        `,
        [requestedRecipientId]
      );

      res.json(result.rows);
    } catch (error) {
      console.error(
        "Error fetching recipient requests:",
        error.message
      );

      res.status(500).json({
        error: "Failed to fetch recipient requests"
      });
    }
  }
);

// ======================================================
// GET REQUESTS FOR A DONOR'S FOOD LISTINGS
// ======================================================

router.get(
  "/donor/:id",
  authenticateToken,
  async (req, res) => {
    try {
      const requestedDonorId = req.params.id;

      // A donor can only view their own requests
      if (
        Number(req.user.id) !==
        Number(requestedDonorId)
      ) {
        return res.status(403).json({
          error:
            "You are not authorized to view these requests"
        });
      }

      if (req.user.account_type !== "donor") {
        return res.status(403).json({
          error:
            "Only donor accounts can view donor requests"
        });
      }

      const result = await pool.query(
        `
        SELECT
          food_requests.id,
          food_requests.quantity_requested,
          food_requests.status,
          food_requests.requested_at,

          food_listings.food_name,
          food_listings.description,
          food_listings.quantity AS listing_quantity,
          food_listings.unit,
          food_listings.expiry_date,
          food_listings.pickup_location,
          food_listings.status AS listing_status,

          (
            food_listings.quantity -
            COALESCE(
              SUM(
                CASE
                  WHEN other_requests.status IN (
                    'pending',
                    'approved',
                    'completed'
                  )
                  THEN other_requests.quantity_requested
                  ELSE 0
                END
              ),
              0
            )
          )::INTEGER AS available_quantity,

          users.first_name AS recipient_first_name,
          users.last_name AS recipient_last_name

        FROM food_requests

        JOIN food_listings
          ON food_requests.food_listing_id =
             food_listings.id

        JOIN users
          ON food_requests.recipient_id = users.id

        LEFT JOIN food_requests AS other_requests
          ON food_listings.id = other_requests.food_listing_id

        WHERE food_listings.donor_id = $1

        GROUP BY
          food_requests.id,
          food_listings.id,
          users.first_name,
          users.last_name

        ORDER BY food_requests.requested_at DESC
        `,
        [requestedDonorId]
      );

      res.json(result.rows);
    } catch (error) {
      console.error(
        "Error fetching donor requests:",
        error.message
      );

      res.status(500).json({
        error: "Failed to fetch donor requests"
      });
    }
  }
);

// ======================================================
// UPDATE FOOD REQUEST STATUS
// ======================================================

router.patch(
  "/:id",
  authenticateToken,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;

      const donor_id = req.user.id;

      // Only donors can update request status
      if (req.user.account_type !== "donor") {
        return res.status(403).json({
          error:
            "Only donors can approve or reject requests"
        });
      }

      const allowedStatuses = [
        "pending",
        "approved",
        "rejected",
        "completed"
      ];

      if (!allowedStatuses.includes(status)) {
        return res.status(400).json({
          error: "Invalid status"
        });
      }

      // Find request and make sure it belongs
      // to one of this donor's listings
      const requestCheck = await pool.query(
        `
        SELECT
          food_requests.id,
          food_requests.food_listing_id,
          food_requests.quantity_requested,
          food_requests.status,

          food_listings.donor_id,
          food_listings.quantity,
          food_listings.status AS listing_status

        FROM food_requests

        JOIN food_listings
          ON food_requests.food_listing_id =
             food_listings.id

        WHERE food_requests.id = $1
        `,
        [id]
      );

      if (requestCheck.rows.length === 0) {
        return res.status(404).json({
          error: "Food request not found"
        });
      }

      const request = requestCheck.rows[0];

      if (
        Number(request.donor_id) !==
        Number(donor_id)
      ) {
        return res.status(403).json({
          error:
            "You are not authorized to update this request"
        });
      }

      // A closed listing should not receive new approvals
      if (
        status === "approved" &&
        request.listing_status !== "available"
      ) {
        return res.status(400).json({
          error:
            "This food listing is closed and cannot receive new approvals"
        });
      }

      // Check available quantity when approving
      if (status === "approved") {
        const quantityCheck = await pool.query(
          `
          SELECT
            fl.quantity -
            COALESCE(
              SUM(
                CASE
                  WHEN fr.status IN (
                    'approved',
                    'completed'
                  )
                  AND fr.id <> $1
                  THEN fr.quantity_requested
                  ELSE 0
                END
              ),
              0
            ) AS available_quantity

          FROM food_listings fl

          LEFT JOIN food_requests fr
            ON fl.id = fr.food_listing_id

          WHERE fl.id = $2

          GROUP BY
            fl.id,
            fl.quantity
          `,
          [id, request.food_listing_id]
        );

        const availableQuantity = Number(
          quantityCheck.rows[0].available_quantity
        );

        if (
          Number(request.quantity_requested) >
          availableQuantity
        ) {
          return res.status(400).json({
            error:
              `Only ${availableQuantity} portions are still available`
          });
        }
      }

      // Update request status
      const result = await pool.query(
        `
        UPDATE food_requests
        SET status = $1
        WHERE id = $2
        RETURNING *;
        `,
        [status, id]
      );

      res.json(result.rows[0]);
    } catch (error) {
      console.error(
        "Error updating food request:",
        error.message
      );

      res.status(500).json({
        error: "Failed to update food request"
      });
    }
  }
);

module.exports = router;


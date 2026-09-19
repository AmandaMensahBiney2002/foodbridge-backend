
const express = require("express");
const cors = require("cors");
const pool = require("./db");
const authRoutes = require("./routes/auth");
const authenticateToken = require("./middleware/authMiddleware");

const app = express();

const PORT = 5000;

app.use(express.json());
app.use(cors());

app.use("/api/auth", authRoutes);

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
// FOOD LISTINGS
// ======================================================

// Get all food listings
app.get("/api/food-listings", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        food_listings.id,
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
      error: "Failed to fetch food listings"
    });
  }
});

// Get food listings created by a specific donor
app.get(
  "/api/food-listings/donor/:id",
  authenticateToken,
  async (req, res) => {
    try {
      const donorId = req.params.id;

      // Make sure the donor can only view their own listings
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
          food_listings.id

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

// Create a food listing
app.post(
  "/api/food-listings",
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

      // Only donors can create listings
      if (req.user.account_type !== "donor") {
        return res.status(403).json({
          error: "Only donor accounts can create food listings"
        });
      }

      // Check that the donor exists
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

      // Validate required fields
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

      // Validate quantity
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

// Edit a food listing
app.patch(
  "/api/food-listings/:id",
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

      // Only donors can edit food listings
      if (req.user.account_type !== "donor") {
        return res.status(403).json({
          error: "Only donor accounts can edit food listings"
        });
      }

      // Check that the listing exists
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

      // Make sure the donor owns this listing
      if (Number(listing.donor_id) !== Number(donorId)) {
        return res.status(403).json({
          error: "You are not authorized to edit this listing"
        });
      }

      // Validate required fields
      if (!food_name || !quantity || !pickup_location) {
        return res.status(400).json({
          error:
            "Food name, quantity, and pickup location are required"
        });
      }

      // Validate quantity
      if (Number(quantity) <= 0) {
        return res.status(400).json({
          error: "Quantity must be greater than 0"
        });
      }

      // Find quantity already reserved by requests
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

      // Prevent donor from reducing the listing below
      // the amount already requested/reserved
      if (Number(quantity) < reservedQuantity) {
        return res.status(400).json({
          error:
            `Quantity cannot be less than ${reservedQuantity} because that amount has already been requested`
        });
      }

      // Update the listing
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

// Delete a food listing
app.delete(
  "/api/food-listings/:id",
  authenticateToken,
  async (req, res) => {
    try {
      const { id } = req.params;
      const donorId = req.user.id;

      // Only donors can delete food listings
      if (req.user.account_type !== "donor") {
        return res.status(403).json({
          error: "Only donor accounts can delete food listings"
        });
      }

      // Check that the listing exists
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

      // Make sure the donor owns this listing
      if (Number(listing.donor_id) !== Number(donorId)) {
        return res.status(403).json({
          error: "You are not authorized to delete this listing"
        });
      }

      // Check whether this listing has ANY request history
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

      // Do not delete listings that have request history
      if (requestCount > 0) {
        return res.status(400).json({
          error:
            "This listing cannot be deleted because it has food request history"
        });
      }

      // Delete the listing if it has never received a request
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
// CLOSE FOOD LISTING
// ======================================================

// Close a food listing
app.patch(
  "/api/food-listings/:id/close",
  authenticateToken,
  async (req, res) => {
    try {
      const { id } = req.params;
      const donorId = req.user.id;

      // Only donors can close food listings
      if (req.user.account_type !== "donor") {
        return res.status(403).json({
          error: "Only donor accounts can close food listings"
        });
      }

      // Check that the listing exists
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

      // Make sure the donor owns this listing
      if (Number(listing.donor_id) !== Number(donorId)) {
        return res.status(403).json({
          error: "You are not authorized to close this listing"
        });
      }

      // Check if already closed
      if (listing.status === "closed") {
        return res.status(400).json({
          error: "This listing is already closed"
        });
      }

      // Close the listing
      const result = await pool.query(
        `
        UPDATE food_listings
        SET status = 'closed'
        WHERE id = $1
        RETURNING *;
        `,
        [id]
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

// ======================================================
// FOOD REQUESTS
// ======================================================

// Create a food request
app.post(
  "/api/food-requests",
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
// GET ALL FOOD REQUESTS
// ======================================================

app.get(
  "/api/food-requests",
  authenticateToken,
  async (req, res) => {
    try {
      // Only donors can access the general request list
      if (req.user.account_type !== "donor") {
        return res.status(403).json({
          error: "Only donor accounts can view all food requests"
        });
      }

      const result = await pool.query(`
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
      [req.user.id]);

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

app.get(
  "/api/food-requests/recipient/:id",
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

        WHERE
          food_requests.recipient_id = $1

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

app.get(
  "/api/food-requests/donor/:id",
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

app.patch(
  "/api/food-requests/:id",
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



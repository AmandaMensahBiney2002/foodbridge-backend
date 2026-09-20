const express = require("express");
const pool = require("../db");
const authenticateToken = require("../middleware/authMiddleware");
const { sendEmail } = require("../services/emailService");

const router = express.Router();

// ======================================================
// PICKUP STATUS OPTIONS
// ======================================================

const allowedPickupStatuses = [
  "scheduled",
  "ready_for_pickup",
  "collected",
  "missed",
  "cancelled"
];

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
        `
        SELECT
          first_name,
          last_name,
          email,
          account_type
        FROM users
        WHERE id = $1
        `,
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
          food_listings.food_name,
          food_listings.unit,
          food_listings.pickup_location,
          users.first_name AS donor_first_name,
          users.last_name AS donor_last_name,
          users.email AS donor_email,

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

        JOIN users
          ON food_listings.donor_id = users.id

        LEFT JOIN food_requests
          ON food_listings.id = food_requests.food_listing_id

        WHERE food_listings.id = $1

        GROUP BY
          food_listings.id,
          food_listings.quantity,
          food_listings.status,
          food_listings.food_name,
          food_listings.unit,
          food_listings.pickup_location,
          users.first_name,
          users.last_name,
          users.email
        `,
        [food_listing_id]
      );

      if (listingCheck.rows.length === 0) {
        return res.status(404).json({
          error: "Food listing not found"
        });
      }

      const listing = listingCheck.rows[0];

      // A closed listing cannot receive new requests
      if (listing.status !== "available") {
        return res.status(400).json({
          error:
            "This food listing is no longer available"
        });
      }

      const availableQuantity =
        Number(listing.quantity) -
        Number(listing.requested_quantity);

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
      // Pickup starts as scheduled.
      // Date, time and instructions can be added later.
      const result = await pool.query(
        `
        INSERT INTO food_requests (
          food_listing_id,
          recipient_id,
          quantity_requested,
          pickup_status
        )
        VALUES ($1, $2, $3, 'scheduled')
        RETURNING *;
        `,
        [
          food_listing_id,
          recipient_id,
          quantity_requested
        ]
      );

      const newRequest = result.rows[0];

      // Notify donor by email
      try {
        await sendEmail({
          to: listing.donor_email,
          subject: "New FoodBridge food request",
          html: `
            <div style="font-family: Arial, sans-serif; line-height: 1.6;">
              <h2>New food request</h2>

              <p>
                Hello ${listing.donor_first_name},
              </p>

              <p>
                Someone has requested food from your FoodBridge listing.
              </p>

              <p>
                <strong>Food:</strong> ${listing.food_name}<br>
                <strong>Quantity requested:</strong> ${quantity_requested} ${listing.unit || "portions"}<br>
                <strong>Pickup location:</strong> ${listing.pickup_location}
              </p>

              <p>
                Please log in to FoodBridge to review and respond to this request.
              </p>

              <p>
                Thank you for helping reduce food waste and support your community.
              </p>

              <p>
                <strong>FoodBridge</strong><br>
                Born in Ghana. Built for Africa.
              </p>
            </div>
          `
        });
      } catch (emailError) {
        console.error(
          "Failed to notify donor by email:",
          emailError.message
        );
      }

      res.status(201).json(newRequest);
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
          food_requests.pickup_date,
          food_requests.pickup_time,
          food_requests.collection_instructions,
          food_requests.pickup_status,

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

          users.id AS recipient_id,
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
          users.id,
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
          food_requests.pickup_date,
          food_requests.pickup_time,
          food_requests.collection_instructions,
          food_requests.pickup_status,

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
          food_requests.pickup_date,
          food_requests.pickup_time,
          food_requests.collection_instructions,
          food_requests.pickup_status,

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

          users.id AS recipient_id,
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
          users.id,
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
          food_requests.recipient_id,

          food_requests.quantity_requested,
          food_requests.status,
          food_requests.pickup_date,
          food_requests.pickup_time,
          food_requests.collection_instructions,
          food_requests.pickup_status,

          food_listings.donor_id,
          food_listings.quantity,
          food_listings.food_name,
          food_listings.unit,
          food_listings.pickup_location,
          food_listings.status AS listing_status,

          recipient.first_name AS recipient_first_name,
          recipient.last_name AS recipient_last_name,
          recipient.email AS recipient_email

        FROM food_requests

        JOIN food_listings
          ON food_requests.food_listing_id =
             food_listings.id

        JOIN users AS recipient
          ON food_requests.recipient_id = recipient.id

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

          FROM food_listings AS fl

          LEFT JOIN food_requests AS fr
            ON fl.id = fr.food_listing_id

          WHERE fl.id = $2

          GROUP BY fl.id, fl.quantity
          `,
          [
            id,
            request.food_listing_id
          ]
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

      // If a request is rejected, cancel its pickup
      if (status === "rejected") {
        const result = await pool.query(
          `
          UPDATE food_requests
          SET
            status = $1,
            pickup_status = 'cancelled'
          WHERE id = $2
          RETURNING *;
          `,
          [status, id]
        );

        const updatedRequest = result.rows[0];

        await notifyRecipient(
          request,
          status
        );

        return res.json(updatedRequest);
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

      const updatedRequest = result.rows[0];

      // Notify recipient by email
      await notifyRecipient(
        request,
        status
      );

      res.json(updatedRequest);
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
// UPDATE PICKUP DETAILS
// ======================================================

router.patch(
  "/:id/pickup",
  authenticateToken,
  async (req, res) => {
    try {
      const { id } = req.params;

      const {
        pickup_date,
        pickup_time,
        collection_instructions,
        pickup_status
      } = req.body;

      // Only donors can manage pickup arrangements
      if (req.user.account_type !== "donor") {
        return res.status(403).json({
          error:
            "Only donors can manage pickup arrangements"
        });
      }

      // Validate pickup status if provided
      if (
        pickup_status &&
        !allowedPickupStatuses.includes(pickup_status)
      ) {
        return res.status(400).json({
          error: "Invalid pickup status"
        });
      }

      // Find request and verify ownership
      const requestCheck = await pool.query(
        `
        SELECT
          food_requests.id,
          food_requests.recipient_id,
          food_requests.status,
          food_requests.pickup_status,

          food_listings.donor_id,
          food_listings.food_name,
          food_listings.pickup_location,

          recipient.first_name AS recipient_first_name,
          recipient.email AS recipient_email

        FROM food_requests

        JOIN food_listings
          ON food_requests.food_listing_id =
             food_listings.id

        JOIN users AS recipient
          ON food_requests.recipient_id =
             recipient.id

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
        Number(req.user.id)
      ) {
        return res.status(403).json({
          error:
            "You are not authorized to manage this pickup"
        });
      }

      // Rejected requests cannot have active pickups
      if (request.status === "rejected") {
        return res.status(400).json({
          error:
            "A rejected request cannot have pickup arrangements"
        });
      }

      // Use existing values when a field is not supplied
      const finalPickupDate =
        pickup_date !== undefined
          ? pickup_date
          : null;

      const finalPickupTime =
        pickup_time !== undefined
          ? pickup_time
          : null;

      const finalInstructions =
        collection_instructions !== undefined
          ? collection_instructions
          : null;

      const finalPickupStatus =
        pickup_status ||
        request.pickup_status ||
        "scheduled";

      const result = await pool.query(
        `
        UPDATE food_requests
        SET
          pickup_date = $1,
          pickup_time = $2,
          collection_instructions = $3,
          pickup_status = $4
        WHERE id = $5
        RETURNING *;
        `,
        [
          finalPickupDate,
          finalPickupTime,
          finalInstructions,
          finalPickupStatus,
          id
        ]
      );

      const updatedRequest = result.rows[0];

      // Notify recipient when pickup details are changed
      try {
        await sendEmail({
          to: request.recipient_email,
          subject: "Your FoodBridge pickup details were updated",
          html: `
            <div style="font-family: Arial, sans-serif; line-height: 1.6;">
              <h2>Pickup details updated</h2>

              <p>
                Hello ${request.recipient_first_name},
              </p>

              <p>
                The pickup details for your
                <strong>${request.food_name}</strong>
                request have been updated.
              </p>

              <p>
                <strong>Pickup location:</strong>
                ${request.pickup_location}
              </p>

              ${
                finalPickupDate
                  ? `<p><strong>Pickup date:</strong> ${finalPickupDate}</p>`
                  : ""
              }

              ${
                finalPickupTime
                  ? `<p><strong>Pickup time:</strong> ${finalPickupTime}</p>`
                  : ""
              }

              ${
                finalInstructions
                  ? `<p><strong>Collection instructions:</strong> ${finalInstructions}</p>`
                  : ""
              }

              <p>
                <strong>Pickup status:</strong>
                ${formatPickupStatus(finalPickupStatus)}
              </p>

              <p>
                Please log in to FoodBridge for the latest information.
              </p>

              <p>
                <strong>FoodBridge</strong><br>
                Born in Ghana. Built for Africa.
              </p>
            </div>
          `
        });
      } catch (emailError) {
        console.error(
          "Failed to notify recipient about pickup update:",
          emailError.message
        );
      }

      res.json(updatedRequest);
    } catch (error) {
      console.error(
        "Error updating pickup details:",
        error.message
      );

      res.status(500).json({
        error: "Failed to update pickup details"
      });
    }
  }
);

// ======================================================
// HELPER: FORMAT PICKUP STATUS
// ======================================================

function formatPickupStatus(status) {
  const labels = {
    scheduled: "Scheduled",
    ready_for_pickup: "Ready for Pickup",
    collected: "Collected",
    missed: "Missed",
    cancelled: "Cancelled"
  };

  return labels[status] || status;
}

// ======================================================
// HELPER: NOTIFY RECIPIENT
// ======================================================

async function notifyRecipient(request, status) {
  let subject = "";
  let message = "";

  if (status === "approved") {
    subject = "Your FoodBridge request was approved";

    message = `
      <p>
        Good news! Your request for
        <strong>
          ${request.quantity_requested}
          ${request.unit || "portions"}
          of ${request.food_name}
        </strong>
        has been approved.
      </p>

      <p>
        <strong>Pickup location:</strong>
        ${request.pickup_location}
      </p>

      <p>
        Please log in to FoodBridge for the latest details about your request.
      </p>
    `;
  } else if (status === "rejected") {
    subject = "Your FoodBridge request was rejected";

    message = `
      <p>
        Your request for
        <strong>
          ${request.quantity_requested}
          ${request.unit || "portions"}
          of ${request.food_name}
        </strong>
        was not approved by the donor.
      </p>

      <p>
        You can continue browsing FoodBridge for other available food listings.
      </p>
    `;
  } else if (status === "completed") {
    subject = "Your FoodBridge request is completed";

    message = `
      <p>
        Your request for
        <strong>
          ${request.quantity_requested}
          ${request.unit || "portions"}
          of ${request.food_name}
        </strong>
        has been marked as completed.
      </p>

      <p>
        Thank you for using FoodBridge.
      </p>
    `;
  } else {
    subject = "Your FoodBridge request was updated";

    message = `
      <p>
        The status of your request for
        <strong>${request.food_name}</strong>
        has been updated to
        <strong>${status}</strong>.
      </p>
    `;
  }

  try {
    await sendEmail({
      to: request.recipient_email,
      subject,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6;">
          <h2>FoodBridge request update</h2>

          <p>
            Hello ${request.recipient_first_name},
          </p>

          ${message}

          <p>
            <strong>FoodBridge</strong><br>
            Born in Ghana. Built for Africa.
          </p>
        </div>
      `
    });
  } catch (emailError) {
    console.error(
      "Failed to notify recipient by email:",
      emailError.message
    );
  }
}

module.exports = router;
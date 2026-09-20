
const express = require("express");
const router = express.Router();

const { sendEmail } = require("../services/emailService");

router.post("/", async (req, res) => {
  console.log("CONTACT ROUTE REACHED");

  try {
    const {
      name,
      email,
      subject,
      message
    } = req.body;

    // Validate required fields
    if (!name || !email || !subject || !message) {
      return res.status(400).json({
        error: "Please complete all fields."
      });
    }

    // Basic email validation
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailPattern.test(email)) {
      return res.status(400).json({
        error: "Please enter a valid email address."
      });
    }

    console.log("Sending contact email to:", process.env.EMAIL_USER);

    await sendEmail({
      to: process.env.EMAIL_USER,
      replyTo: email,
      subject: `FoodBridge Contact: ${subject}`,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #3F352C;">

          <h2 style="color: #006B3F;">
            New FoodBridge Contact Message
          </h2>

          <p>
            <strong>Name:</strong> ${name}
          </p>

          <p>
            <strong>Email:</strong> ${email}
          </p>

          <p>
            <strong>Subject:</strong> ${subject}
          </p>

          <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;" />

          <p>
            <strong>Message:</strong>
          </p>

          <p>
            ${message}
          </p>

        </div>
      `
    });

    console.log("Contact email sent successfully");

    return res.status(200).json({
      message: "Your message has been sent successfully."
    });

  } catch (error) {
    console.error(
      "Contact form error:",
      error.message
    );

    return res.status(500).json({
      error: "Unable to send your message. Please try again later."
    });
  }
});

module.exports = router;


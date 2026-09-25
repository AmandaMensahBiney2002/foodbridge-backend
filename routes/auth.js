const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

console.log("AUTH START: loading User model");
const User = require("../models/User");
console.log("AUTH START: User model loaded");

console.log("AUTH START: loading email service");
const { sendEmail } = require("../services/emailService");
console.log("AUTH START: email service loaded");

const router = express.Router();


// ============================================================
// PASSWORD VALIDATION
// ============================================================

function validatePassword(password) {
  if (typeof password !== "string") {
    return "Password is required";
  }

  if (password.length < 8) {
    return "Password must be at least 8 characters long";
  }

  if (password.length > 128) {
    return "Password must not exceed 128 characters";
  }

  if (/\s/.test(password)) {
    return "Password must not contain spaces";
  }

  if (!/[A-Z]/.test(password)) {
    return "Password must contain at least one uppercase letter";
  }

  if (!/[a-z]/.test(password)) {
    return "Password must contain at least one lowercase letter";
  }

  if (!/[0-9]/.test(password)) {
    return "Password must contain at least one number";
  }

  if (!/[!@#$%^&*]/.test(password)) {
    return "Password must contain at least one special character";
  }

  return null;
}


// ============================================================
// SIGN UP
// ============================================================

router.post("/signup", async (req, res) => {
  try {
    const {
      first_name,
      last_name,
      email,
      password,
      phone,
      account_type,
      user_type
    } = req.body;

    if (
      !first_name ||
      !last_name ||
      !email ||
      !password ||
      !account_type
    ) {
      return res.status(400).json({
        error:
          "First name, last name, email, password, and account type are required"
      });
    }

    const passwordError = validatePassword(password);

    if (passwordError) {
      return res.status(400).json({
        error: passwordError
      });
    }

    if (!["donor", "recipient"].includes(account_type)) {
      return res.status(400).json({
        error: "Account type must be donor or recipient"
      });
    }

    if (
      user_type &&
      ![
        "individual",
        "food-business",
        "organization",
        "volunteer"
      ].includes(user_type)
    ) {
      return res.status(400).json({
        error:
          "User type must be individual, food-business, organization, or volunteer"
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    console.log("SIGNUP: About to check existing user");

    const existingUser = await User.findOne({
      where: {
        email: normalizedEmail
      }
    });

    console.log("SIGNUP: Existing user check completed");

    if (existingUser) {
      return res.status(409).json({
        error: "An account with this email already exists"
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const verificationToken = crypto
      .randomBytes(32)
      .toString("hex");

    const verificationTokenHash = crypto
      .createHash("sha256")
      .update(verificationToken)
      .digest("hex");

    const verificationExpires = new Date(
      Date.now() + 10 * 60 * 1000
    );

    const verificationUrl =
      `http://localhost:5173/verify-email?token=${verificationToken}`;

    console.log("SIGNUP: About to send verification email");

    await sendEmail({
      to: normalizedEmail,

      subject: "Verify your FoodBridge email address",

      html: `
        <div
          style="
            font-family: Arial, sans-serif;
            max-width: 600px;
            margin: 0 auto;
            padding: 30px;
            color: #3F352C;
          "
        >

          <h1 style="color: #006B3F;">
            Welcome to FoodBridge
          </h1>

          <p>
            Hello ${first_name.trim()},
          </p>

          <p>
            Thank you for creating a FoodBridge account.
            Please verify your email address to activate your account.
          </p>

          <p style="margin: 30px 0;">
            <a
              href="${verificationUrl}"
              style="
                display: inline-block;
                padding: 12px 22px;
                background-color: #006B3F;
                color: white;
                text-decoration: none;
                border-radius: 8px;
                font-weight: bold;
              "
            >
              Verify My Email
            </a>
          </p>

          <p>
            This verification link will expire in 10 minutes.
          </p>

          <p>
            If you did not create a FoodBridge account,
            you can ignore this email.
          </p>

          <p>
            — The FoodBridge Team
          </p>

        </div>
      `
    });

    console.log("SIGNUP: Verification email sent successfully");

    const user = await User.create({
      first_name: first_name.trim(),
      last_name: last_name.trim(),
      email: normalizedEmail,
      password: hashedPassword,
      phone: phone ? phone.trim() : null,
      account_type,
      user_type: user_type || null,
      created_at: new Date(),
      email_verified: false,
      email_verification_token: verificationTokenHash,
      email_verification_expires: verificationExpires
    });

    const userResponse = user.toJSON();

    delete userResponse.password;
    delete userResponse.email_verification_token;
    delete userResponse.email_verification_expires;
    delete userResponse.password_reset_token;
    delete userResponse.password_reset_expires;

    res.status(201).json({
      message:
        "Account created successfully. Please check your email to verify your account.",
      user: userResponse
    });

  } catch (error) {
    console.error(
      "Error creating account:",
      error.message
    );

    res.status(500).json({
      error: "Failed to create account"
    });
  }
});


// ============================================================
// VERIFY EMAIL
// ============================================================

router.get("/verify-email", async (req, res) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({
        error: "Verification token is required"
      });
    }

    const tokenHash = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    const user = await User.findOne({
      where: {
        email_verification_token: tokenHash
      }
    });

    if (!user) {
      return res.status(400).json({
        error: "Invalid or expired verification link"
      });
    }

    if (
      !user.email_verification_expires ||
      new Date() >
        new Date(user.email_verification_expires)
    ) {
      return res.status(400).json({
        error: "This verification link has expired"
      });
    }

    user.email_verified = true;

    user.email_verification_token = null;
    user.email_verification_expires = null;

    await user.save();

    res.json({
      message: "Email verified successfully"
    });

  } catch (error) {
    console.error(
      "Error verifying email:",
      error.message
    );

    res.status(500).json({
      error: "Failed to verify email"
    });
  }
});


// ============================================================
// RESEND VERIFICATION EMAIL
// ============================================================

router.post("/resend-verification", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        error: "Email address is required"
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const user = await User.findOne({
      where: {
        email: normalizedEmail
      }
    });

    if (!user) {
      return res.json({
        message:
          "If an account exists with this email address, a verification email has been sent."
      });
    }

    if (user.email_verified) {
      return res.status(400).json({
        error: "This email address has already been verified."
      });
    }

    const verificationToken = crypto
      .randomBytes(32)
      .toString("hex");

    const verificationTokenHash = crypto
      .createHash("sha256")
      .update(verificationToken)
      .digest("hex");

    const verificationExpires = new Date(
      Date.now() + 10 * 60 * 1000
    );

    const verificationUrl =
      `http://localhost:5173/verify-email?token=${verificationToken}`;

    await sendEmail({
      to: normalizedEmail,

      subject: "Verify your FoodBridge email address",

      html: `
        <div
          style="
            font-family: Arial, sans-serif;
            max-width: 600px;
            margin: 0 auto;
            padding: 30px;
            color: #3F352C;
          "
        >

          <h1 style="color: #006B3F;">
            Verify your FoodBridge email
          </h1>

          <p>
            Hello ${user.first_name},
          </p>

          <p>
            We received a request to verify your
            FoodBridge email address.
          </p>

          <p style="margin: 30px 0;">
            <a
              href="${verificationUrl}"
              style="
                display: inline-block;
                padding: 12px 22px;
                background-color: #006B3F;
                color: white;
                text-decoration: none;
                border-radius: 8px;
                font-weight: bold;
              "
            >
              Verify My Email
            </a>
          </p>

          <p>
            This verification link will expire in 10 minutes.
          </p>

          <p>
            If you did not request this email,
            you can safely ignore it.
          </p>

          <p>
            — The FoodBridge Team
          </p>

        </div>
      `
    });

    user.email_verification_token =
      verificationTokenHash;

    user.email_verification_expires =
      verificationExpires;

    await user.save();

    res.json({
      message:
        "A new verification email has been sent."
    });

  } catch (error) {
    console.error(
      "Error resending verification email:",
      error.message
    );

    res.status(500).json({
      error:
        "Failed to resend verification email"
    });
  }
});


// ============================================================
// FORGOT PASSWORD
// ============================================================

router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        error: "Email address is required"
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const user = await User.findOne({
      where: {
        email: normalizedEmail
      }
    });

    if (!user) {
      return res.json({
        message:
          "If an account exists with this email address, a password reset email has been sent."
      });
    }

    const resetToken = crypto
      .randomBytes(32)
      .toString("hex");

    const resetTokenHash = crypto
      .createHash("sha256")
      .update(resetToken)
      .digest("hex");

    const resetExpires = new Date(
      Date.now() + 10 * 60 * 1000
    );

    const resetUrl =
      `http://localhost:5173/reset-password?token=${resetToken}`;

    await sendEmail({
      to: normalizedEmail,

      subject: "Reset your FoodBridge password",

      html: `
        <div
          style="
            font-family: Arial, sans-serif;
            max-width: 600px;
            margin: 0 auto;
            padding: 30px;
            color: #3F352C;
          "
        >

          <h1 style="color: #006B3F;">
            Reset your FoodBridge password
          </h1>

          <p>
            Hello ${user.first_name},
          </p>

          <p>
            We received a request to reset the password
            for your FoodBridge account.
          </p>

          <p style="margin: 30px 0;">
            <a
              href="${resetUrl}"
              style="
                display: inline-block;
                padding: 12px 22px;
                background-color: #006B3F;
                color: white;
                text-decoration: none;
                border-radius: 8px;
                font-weight: bold;
              "
            >
              Reset My Password
            </a>
          </p>

          <p>
            This password reset link will expire in 10 minutes.
          </p>

          <p>
            If you did not request a password reset,
            you can safely ignore this email.
          </p>

          <p>
            — The FoodBridge Team
          </p>

        </div>
      `
    });

    user.password_reset_token = resetTokenHash;
    user.password_reset_expires = resetExpires;

    await user.save();

    res.json({
      message:
        "If an account exists with this email address, a password reset email has been sent."
    });

  } catch (error) {
    console.error(
      "Error requesting password reset:",
      error.message
    );

    res.status(500).json({
      error: "Failed to process password reset request"
    });
  }
});


// ============================================================
// RESET PASSWORD
// ============================================================

router.post("/reset-password", async (req, res) => {
  try {
    const {
      token,
      password
    } = req.body;

    if (!token || !password) {
      return res.status(400).json({
        error: "Reset token and new password are required"
      });
    }

    const passwordError = validatePassword(password);

    if (passwordError) {
      return res.status(400).json({
        error: passwordError
      });
    }

    const tokenHash = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    const user = await User.findOne({
      where: {
        password_reset_token: tokenHash
      }
    });

    if (!user) {
      return res.status(400).json({
        error: "Invalid or expired password reset link"
      });
    }

    if (
      !user.password_reset_expires ||
      new Date() >
        new Date(user.password_reset_expires)
    ) {
      return res.status(400).json({
        error: "This password reset link has expired"
      });
    }

    const hashedPassword = await bcrypt.hash(
      password,
      10
    );

    user.password = hashedPassword;

    user.password_reset_token = null;
    user.password_reset_expires = null;

    await user.save();

    res.json({
      message:
        "Your password has been reset successfully. You can now log in with your new password."
    });

  } catch (error) {
    console.error(
      "Error resetting password:",
      error.message
    );

    res.status(500).json({
      error: "Failed to reset password"
    });
  }
});


// ============================================================
// LOGIN
// ============================================================

router.post("/login", async (req, res) => {
  try {
    const {
      email,
      password
    } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: "Email and password are required"
      });
    }

    const normalizedEmail =
      email.trim().toLowerCase();

    const user = await User.findOne({
      where: {
        email: normalizedEmail
      }
    });

    if (!user) {
      return res.status(401).json({
        error: "Invalid email or password"
      });
    }

    const passwordMatches =
      await bcrypt.compare(
        password,
        user.password
      );

    if (!passwordMatches) {
      return res.status(401).json({
        error: "Invalid email or password"
      });
    }

    if (!user.email_verified) {
      return res.status(403).json({
        error:
          "Please verify your email address before logging in."
      });
    }

    const userResponse =
      user.toJSON();

    delete userResponse.password;
    delete userResponse.email_verification_token;
    delete userResponse.email_verification_expires;
    delete userResponse.password_reset_token;
    delete userResponse.password_reset_expires;

    const token = jwt.sign(
      {
        id: user.id,
        account_type: user.account_type
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "7d"
      }
    );

    res.json({
      message: "Login successful",
      token,
      user: userResponse
    });

  } catch (error) {
    console.error("LOGIN ERROR:", error);
    console.error("LOGIN ERROR STACK:", error.stack);

    res.status(500).json({
      error: error.message
    });
  }
});


module.exports = router;
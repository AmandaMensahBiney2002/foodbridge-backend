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

    const existingUser = await User.findOne({
      where: {
        email: normalizedEmail
      }
    });

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

    // TEMPORARY DIAGNOSTIC LOG
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

    // TEMPORARY DIAGNOSTIC LOG
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
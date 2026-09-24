const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 10000,
});

transporter.verify((error, success) => {
  if (error) {
    console.error("EMAIL VERIFY FAILED:", error.message);
  } else {
    console.log("EMAIL VERIFY SUCCESS:", success);
  }
});

const sendEmail = async ({ to, subject, html }) => {
  try {
    console.log("EMAIL: About to send");

    const info = await transporter.sendMail({
      from: `FoodBridge <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
    });

    console.log("EMAIL: Sent successfully:", info.messageId);

    return info;
  } catch (error) {
    console.error("EMAIL SERVICE ERROR:", error.message);
    throw new Error("Failed to send email");
  }
};

module.exports = {
  sendEmail,
};
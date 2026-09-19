const { Resend } = require("resend");

const resend = new Resend(process.env.RESEND_API_KEY);

const sendEmail = async ({ to, subject, html }) => {
  try {
    const { data, error } = await resend.emails.send({
      from: "FoodBridge <onboarding@resend.dev>",
      to,
      subject,
      html,
    });

    if (error) {
      console.error("Resend email error:", error);
      throw new Error("Failed to send email");
    }

    console.log("Email sent successfully:", data.id);

    return data;
  } catch (error) {
    console.error("Email service error:", error.message);
    throw error;
  }
};

module.exports = {
  sendEmail,
};
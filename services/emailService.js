const https = require("https");

const sendEmail = ({ to, subject, html }) => {
  return new Promise((resolve, reject) => {
    const apiKey = process.env.BREVO_API_KEY;

    if (!apiKey) {
      return reject(new Error("BREVO_API_KEY is not configured"));
    }

    const data = JSON.stringify({
      sender: {
        name: "FoodBridge",
        email: "foodbridge.notifications@gmail.com"
      },
      to: [
        {
          email: to
        }
      ],
      subject,
      htmlContent: html
    });

    const options = {
      hostname: "api.brevo.com",
      path: "/v3/smtp/email",
      method: "POST",
      headers: {
        "api-key": apiKey,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(data)
      }
    };

    const request = https.request(options, (response) => {
      let body = "";

      response.on("data", (chunk) => {
        body += chunk;
      });

      response.on("end", () => {
        if (response.statusCode >= 200 && response.statusCode < 300) {
          console.log("Email sent successfully through Brevo:", body);
          resolve(JSON.parse(body));
        } else {
          console.error("Brevo email error:", response.statusCode, body);
          reject(new Error(`Brevo email failed with status ${response.statusCode}`));
        }
      });
    });

    request.on("error", (error) => {
      console.error("Brevo request error:", error.message);
      reject(error);
    });

    request.write(data);
    request.end();
  });
};

module.exports = { sendEmail };
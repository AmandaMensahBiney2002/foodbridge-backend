const net = require("net");

const socket = net.createConnection({
  host: "smtp.gmail.com",
  port: 587,
  timeout: 10000,
});

socket.on("connect", () => {
  console.log("SMTP CONNECTION SUCCESS: smtp.gmail.com:587 is reachable");
  socket.end();
});

socket.on("timeout", () => {
  console.error("SMTP CONNECTION FAILED: connection timed out");
  socket.destroy();
});

socket.on("error", (error) => {
  console.error("SMTP CONNECTION FAILED:", error.message);
});

socket.on("close", () => {
  console.log("SMTP test finished");
});


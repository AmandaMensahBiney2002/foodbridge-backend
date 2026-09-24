const net = require("net");

function testPort(port) {
  return new Promise((resolve) => {
    console.log(`SMTP TEST: checking smtp.gmail.com:${port}`);

    const socket = net.createConnection({
      host: "smtp.gmail.com",
      port,
      timeout: 10000,
    });

    socket.on("connect", () => {
      console.log(`SMTP CONNECTION SUCCESS: smtp.gmail.com:${port}`);
      socket.end();
      resolve();
    });

    socket.on("timeout", () => {
      console.error(`SMTP CONNECTION TIMEOUT: smtp.gmail.com:${port}`);
      socket.destroy();
      resolve();
    });

    socket.on("error", (error) => {
      console.error(
        `SMTP CONNECTION ERROR: port=${port}, code=${error.code}, message=${error.message}`
      );
      resolve();
    });

    socket.on("close", () => {
      console.log(`SMTP TEST FINISHED: port=${port}`);
    });
  });
}

async function runTests() {
  await testPort(587);
  await testPort(465);
}

runTests();
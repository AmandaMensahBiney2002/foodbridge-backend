const serverless = require("serverless-http");

const app = require("../../server");

module.exports.handler = serverless(app, {
  request: (request) => {
    console.log("Netlify request path:", request.path);
    console.log("Netlify request URL:", request.url);
  }
});
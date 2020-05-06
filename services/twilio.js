const twilio = require("twilio");

const client = new twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);

module.exports = client;

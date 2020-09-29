const https = require("https");

const { post } = require("../utils/request");

const { KEYBASE_ALERTS_WEBHOOK_ID } = process.env;

const send = async (
  message,
  { critical = false, test = false, support = false, parse_mode = "HTML" } = {}
) => {
  try {
    await post({
      method: "POST",
      hostname: "bots.keybase.io",
      port: "443",
      path: `/webhookbot/${KEYBASE_ALERTS_WEBHOOK_ID}`,
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Simple Analytics KeyBase",
      },
      data: JSON.stringify({ msg: message }),
    });
  } catch (error) {
    console.error(error);
  }
};

module.exports.send = send;

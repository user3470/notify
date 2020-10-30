const https = require("https");
const twilio = require("./twilio");
const storage = require("./storage");

const {
  TWILIO_PHONE,
  TELEGRAM_ALERT_GROUP,
  TELEGRAM_CRITCAL_GROUP,
  TELEGRAM_SUPPORT_GROUP,
} = process.env;

const post = (custom) => {
  const options = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    ...custom,
  };
  return new Promise((resolve, reject) => {
    const req = https.request(options, async (res) => {
      const json = await getJSONBody(res);
      if (res.statusCode !== 200) {
        if (custom.data) console.error(custom.data);
        return reject(new Error(JSON.stringify(json)));
      }
      return resolve(json);
    });
    req.on("error", (e) => reject(e));
    if (options.data)
      req.write(
        typeof options.data === "string"
          ? options.data
          : JSON.stringify(options.data)
      );
    req.end();
  });
};

const getJSONBody = async (req) => {
  try {
    const body = await getPostBody(req);
    const json = JSON.parse(body);
    return Promise.resolve(json);
  } catch (err) {
    console.log(`getJSONBody: ${err.message}\n${body}`);
    return Promise.reject(err);
  }
};

const getPostBody = (req) => {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      resolve(body);
    });
  });
};

const telegram = async (action = "sendMessage", options = {}) => {
  try {
    const deleteMessage =
      typeof options.delete === "boolean"
        ? options.delete
        : action === "sendMessage";
    const data = {
      disable_web_page_preview: true,
      parse_mode: "Markdown",
      disable_notification: true,
      ...options,
    };
    const path = `/bot${encodeURIComponent(
      process.env.TELEGRAM_ADRIAAN_TOKEN
    )}/${action}`;
    const { result } = await post({
      hostname: "api.telegram.org",
      port: 443,
      path,
      data,
    });
    if (deleteMessage)
      setTimeout(() => {
        try {
          const {
            message_id,
            chat: { id: chat_id },
          } = result;
          telegram("deleteMessage", { chat_id, message_id });
        } catch (e) {
          /* nothing */
        }
      }, 30000);
  } catch (error) {
    console.error(error);
  }
};

module.exports.telegram = telegram;

const send = async (
  message,
  { critical = false, test = false, support = false, parse_mode = "HTML" } = {}
) => {
  try {
    if (support)
      return telegram("sendMessage", {
        chat_id: TELEGRAM_SUPPORT_GROUP,
        text: message,
        parse_mode,
        delete: false,
      });

    const doSendCritical = test || critical;

    // Always send message to non critical group
    telegram("sendMessage", {
      chat_id: TELEGRAM_ALERT_GROUP,
      text: message,
      parse_mode: "HTML",
      delete: false,
    });

    // Don't overspam critical's
    if (!doSendCritical)
      return console.error(`Not sending critical notification`);

    // Send message to critical group
    const text = `${message}${
      test
        ? "\nTest alerts skip the throttle"
        : `\nYou wouldn't be alerted for 30 minutes in this channel unless you type /reset`
    }`;
    telegram("sendMessage", {
      chat_id: TELEGRAM_CRITCAL_GROUP,
      text,
      parse_mode: "HTML",
      disable_notification: false,
      delete: false,
    });

    const phoneNumbers = JSON.parse(
      (await storage.getItem("phoneNumbers")) || "[]"
    );
    for (const phoneNumber of phoneNumbers) {
      twilio.calls
        .create({
          url: "https://cdn.simpleanalytics.io/twilio/voice.xml",
          fallbackUrl: "http://demo.twilio.com/docs/voice.xml",
          method: "GET",
          record: false,
          to: phoneNumber,
          from: TWILIO_PHONE,
        })
        .then((call) => console.log(`Successfully called (${call.sid})`))
        .catch((error) => {
          console.error("Error while calling via Twilio:", error);
          telegram("sendMessage", {
            chat_id: TELEGRAM_ALERT_GROUP,
            text: error,
            delete: false,
          });
        })
        .done();
    }
  } catch (error) {
    console.error(error);
  }
};

module.exports.send = send;

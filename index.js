const Koa = require("koa");
const bodyParser = require("koa-bodyparser");
const { send: sendTelegram } = require("./services/telegram");
const { send: sendKeybase } = require("./services/keybase");
const telegramHook = require("./routes/hook");
const { promisify } = require("util");
const moment = require("moment-timezone");

const storage = require("./services/storage");

const { PORT, GITHUB_IGNORE_USERNAMES } = process.env;

const port = PORT || 3000;
const app = new Koa();

const obfuscate = (email) => {
  let emailParts = email.split("@");
  emailParts[0] = emailParts[0].slice(0, -3) + "***";
  return emailParts.join("@");
};

const send = async (message, options) => {
  const lastCriticalNotification =
    (await storage.getItem("lastCriticalNotification")) || 0;
  const doSendCritical =
    options.critical && lastCriticalNotification < Date.now() - 1800000; // 1800000 = 1/2 hour

  console.log(
    `=> send("${message}", ${JSON.stringify(options)})`,
    "last:",
    lastCriticalNotification,
    "send:",
    doSendCritical
  );

  const params = [message, { ...options, critical: doSendCritical }];

  // Sent to Telegram and Twilio
  try {
    await sendTelegram(...params);
  } catch (error) {
    console.error(error);
  }

  // Sent to Keybase
  try {
    if (!options.support) await sendKeybase(...params);
  } catch (error) {
    console.error(error);
  }

  // Reset last notification time
  await storage.setItem("lastCriticalNotification", Date.now());
};

app.use(
  bodyParser({
    enableTypes: ["json", "form"],
  })
);

app.use(async (ctx, next) => {
  const method = ctx.request.method;
  const path = ctx.request.url;
  const body = ctx.request.body;

  if (method === "OPTIONS") {
    ctx.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    ctx.set("Access-Control-Allow-Origin", "*");
    ctx.set("Access-Control-Allow-Headers", "Content-Type");
    ctx.status = 204;
    return next();
  }

  if (body === {}) return next();

  switch (path) {
    case "/hyperping": {
      const {
        check: { url, status, down, downtime },
      } = body;
      const isDown = down === false ? false : true;
      const message = `${url} is <strong>${isDown ? "down" : "up"}</strong> ${
        isDown ? "for" : "after"
      } ${downtime} minutes <em>${status}</em>`;

      if (isDown) send(message, { critical: true });
      else send(message);

      return (ctx.body = { success: true });
    }
    case "/mailgun": {
      let sender =
        body["Reply-To"] || body["reply-to"] || body.sender || body.Sender;
      if (sender.match(/<(.*)>/)) sender = sender.match(/<(.*)>/)[1];
      const subject = body.subject || body.Subject;
      const text = body["stripped-text"];
      const message = `💌 ${subject}\n${obfuscate(sender)}\n${text.replace(
        /(?:\r\n|\r|\n)/g,
        " "
      )}`;
      send(message, { support: true });
      return (ctx.body = { success: true });
    }
    case "/message": {
      const message = body.message;
      const critical = body.critical || false;
      if (message) send(message, { critical });
      return (ctx.body = { success: !!message });
    }
    case "/github": {
      if (
        (GITHUB_IGNORE_USERNAMES || "")
          .split(/, ?/)
          .filter((username) => username)
          .indexOf(body.sender.login.toLowerCase()) > -1
      ) {
        return (ctx.body = { success: true });
      }

      const type = ctx.request.header["x-github-event"];
      let message;
      if (type === "issues") {
        if (body.action === "labeled") return (ctx.body = { success: true });
        message = `Issue [${body.issue.title}](${body.issue.html_url}) got ${body.action}`;
      } else if (type === "issue_comment") {
        if (body.action !== "created") return (ctx.body = { success: true });
        message = `Comment on [${body.issue.title}](${body.comment.html_url}) got ${body.action}`;
      } else if (type === "repository") {
        message = `Repository [${body.repository.full_name}](${body.repository.html_url}) got ${body.action}`;
      } else if (type === "pull_request") {
        if (body.action === "synchronize" || body.action === "labeled")
          return (ctx.body = { success: true });
        message = `Pull request [${body.pull_request.title}](${body.pull_request.html_url}) got ${body.action}`;
      } else {
        message = `Some ${type} just got ${body.action}`;
        if (body.issue) {
          message += ` ([${body.issue.title}](${body.issue.html_url}))`;
        } else if (body.repository) {
          message += ` ([${body.repository.full_name}](${body.repository.html_url}))`;
        }
      }

      if (body.sender && body.sender.login) {
        message += ` by [@${body.sender.login}](${body.sender.html_url})`;
      }

      send(message, { support: true, parse_mode: "Markdown" });
      return (ctx.body = { success: true });
    }
    case "/hook": {
      return telegramHook(ctx);
    }
    default:
      return next();
  }
});

app.listen(port, async () => {
  console.log("Server started on port", port);
});

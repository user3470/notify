const Koa = require("koa");
const fs = require("fs");
const { join } = require("path");
const bodyParser = require("koa-bodyparser");
const { send: sendTelegram } = require("./services/telegram");
const { send: sendKeybase } = require("./services/keybase");
const telegramHook = require("./routes/hook");

const storage = require("./services/storage");

const { PORT, GITHUB_IGNORE_USERNAMES } = process.env;

const THRESHOLD_MS = 1800000; // 30 minutes
const port = PORT || 3000;
const app = new Koa();

const BLOCK_REGEX =
  /(SEO|inquiry|Website Design|Website video|stainless|mailgun|appsumo|saasmantra|zoom.us|Users List|User List|invoice|scale your business|Manufacture)/i;

const SKIP_MESSAGES = [
  "Append page views: undefined",
  "Total page views: undefined",
];

const obfuscate = (email) => {
  let emailParts = email.split("@");
  emailParts[0] = emailParts[0].slice(0, -3) + "***";
  return emailParts.join("@");
};

const send = async (message, options = {}) => {
  const lastCriticalNotification =
    (await storage.getItem("lastCriticalNotification")) || 0;

  const hadRecentAlert = lastCriticalNotification > Date.now() - THRESHOLD_MS;
  const doSendCritical =
    options.critical && (!hadRecentAlert || message.includes("monthly test"));

  console.log("[NOTIFY] send params:\n", {
    ip: options.ip,
    critical: options.critical,
    doSendCritical,
    message,
    lastCriticalNotification,
    dateNow: Date.now(),
    threshold: THRESHOLD_MS,
    diff: Date.now() - THRESHOLD_MS,
    hadRecentAlert,
    send: lastCriticalNotification > Date.now() - THRESHOLD_MS,
  });

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
  if (doSendCritical)
    await storage.setItem("lastCriticalNotification", Date.now());
};

app.use(async (ctx, next) => {
  const body = ctx.request.body;

  try {
    if (body) JSON.parse(body);
  } catch ({ message }) {
    console.log(`[NOTIFY][JSON][ERROR] ${message}:`);
    console.log(body);
  }

  return next();
});

app.use(
  bodyParser({
    enableTypes: ["json", "form"],
  })
);

app.use(async (ctx, next) => {
  const method = ctx.request.method;
  const path = ctx.request.url;
  const body = ctx.request.body;
  const ip = ctx.request.ip;

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

      const isBlocked =
        BLOCK_REGEX.test(subject) ||
        BLOCK_REGEX.test(text) ||
        BLOCK_REGEX.test(sender);
      if (!isBlocked) send(message, { support: true });
      return (ctx.body = { success: true });
    }
    case "/message": {
      console.log("[NOTIFY][MESSAGE][IN]", JSON.stringify({ body }));
      const message = body.message;

      if (SKIP_MESSAGES.includes(message)) {
        return (ctx.body = {
          success: false,
          error: "This message is blocked",
        });
      }

      console.log(ctx.request.headers);

      const critical = body.critical || false;
      if (message) send(message, { critical, ip });
      return (ctx.body = { success: !!message });
    }
    case "/alertmanager": {
      console.log("[alertmanager]", JSON.stringify({ body }));
      fs.writeFileSync(
        join(__dirname, "alertmanager.log"),
        JSON.stringify(body, null, 2)
      );
      return (ctx.body = { success: true });
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

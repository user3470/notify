const { telegram, send } = require("../services/telegram");
const storage = require("../services/storage");
const twilio = require("../services/twilio");
const { createNewIssue } = require("../services/github");
const { createTodo } = require("../services/wip");

const {
  ALERT_PHONE,
  TELEGRAM_SUPPORT_GROUP,
  TELEGRAM_ALERT_GROUP,
  TELEGRAM_CRITCAL_GROUP,
  TELEGRAM_ID_DAVE,
  TELEGRAM_ID_ADRIAAN_PRIVATE,
  TELEGRAM_ID_ADRIAAN_BUSINESS,
  GITHUB_KEY_DAVE,
  GITHUB_KEY_ADRIAAN,
} = process.env;

const WHITELIST = [
  parseInt(TELEGRAM_SUPPORT_GROUP, 10),
  parseInt(TELEGRAM_ALERT_GROUP, 10),
  parseInt(TELEGRAM_CRITCAL_GROUP, 10),
];

const USERS = [
  {
    name: "Dave",
    telegramId: TELEGRAM_ID_DAVE,
    githubKey: GITHUB_KEY_DAVE,
  },
  {
    name: "Adriaan",
    telegramId: TELEGRAM_ID_ADRIAAN_PRIVATE,
    githubKey: GITHUB_KEY_ADRIAAN,
  },
  {
    name: "Adriaan",
    telegramId: TELEGRAM_ID_ADRIAAN_BUSINESS,
    githubKey: GITHUB_KEY_ADRIAAN,
  },
];

let lastMessageId;

module.exports = async (ctx) => {
  const body = ctx.request.body;

  const pickPhone = "Pick a phone number to remove";
  const wrongPhone = `You need to specify a phone number like \`/add ${ALERT_PHONE}\``;

  const message =
    body.message || body.channel_post || body.callback_query.message;

  const {
    message_id,
    chat: { id: chat_id },
    text,
    reply_markup,
  } = message;

  if (WHITELIST.indexOf(chat_id) === -1) {
    console.log(
      "Creapy user does this:",
      require("util").inspect(body, { depth: 10 })
    );
    ctx.body = { success: true };
    return;
  }

  try {
    const command = /^\/[^@ ]+/.exec(text) ? /^\/[^@ ]+/.exec(text)[0] : null;
    const content = command ? text.substr(text.indexOf(" ") + 1).trim() : null;

    if (command || reply_markup) {
      try {
        telegram("deleteMessage", { chat_id, message_id });
      } catch (e) {
        /* nothing */
      }
      telegram("sendChatAction", { chat_id, action: "typing" });
    } else {
      return (ctx.body = { success: true });
    }

    if (lastMessageId === message_id) {
      telegram("sendMessage", {
        chat_id,
        text: `You can't edit chat commands.`,
        delete: true,
      });
      return (ctx.body = { success: true });
    }

    lastMessageId = message_id;

    if (body.callback_query && text === pickPhone) {
      const { data: answer, id } = body.callback_query;
      if (answer === "cancel")
        telegram("answerCallbackQuery", { callback_query_id: id });
      else {
        const phoneNumbers = JSON.parse(
          (await storage.getItem("phoneNumbers")) || "[]"
        );
        await storage.setItem(
          "phoneNumbers",
          JSON.stringify(phoneNumbers.filter((number) => number !== answer))
        );
        telegram("answerCallbackQuery", { callback_query_id: id });
        telegram("sendMessage", {
          chat_id,
          text: `Removed ${answer}`,
          delete: false,
        });
      }
    } else if (command === "/reset") {
      await storage.setItem("lastCriticalNotification", 0);
      telegram("sendMessage", {
        chat_id,
        text: `Last critical notification time is reset. You now will get instand calls when something fails. Normally it's throttled per 30 minutes.`,
        delete: false,
      });
    } else if (command === "/add") {
      if (!content)
        return telegram("sendMessage", { chat_id, text: wrongPhone });

      const phoneNumbers = JSON.parse(
        (await storage.getItem("phoneNumbers")) || "[]"
      );
      const exists =
        phoneNumbers.filter((number) => number === content).length > 0;
      if (exists) {
        telegram("sendMessage", {
          chat_id,
          text: `Phone number is already listed, check /list`,
        });
      } else {
        try {
          const { phoneNumber } = await twilio.lookups
            .phoneNumbers(content)
            .fetch();
          phoneNumbers.push(phoneNumber);
          await storage.setItem("phoneNumbers", JSON.stringify(phoneNumbers));
          telegram("sendMessage", {
            chat_id,
            text: `Added \`${phoneNumber}\` to critical alerts`,
            delete: false,
          });
        } catch (error) {
          console.error(error);
          telegram("sendMessage", {
            chat_id,
            text: `${wrongPhone}, got \`${content}\``,
          });
        }
      }
    } else if (command === "/remove") {
      const phoneNumbers = JSON.parse(
        (await storage.getItem("phoneNumbers")) || "[]"
      );
      const buttons = phoneNumbers.map((phoneNumber) => ({
        text: phoneNumber,
        callback_data: phoneNumber,
      }));
      buttons.push({ text: "Cancel", callback_data: "cancel" });
      if (phoneNumbers.length)
        telegram("sendMessage", {
          chat_id,
          text: `Pick a phone number to remove`,
          reply_markup: JSON.stringify({ inline_keyboard: [buttons] }),
        });
      else
        telegram("sendMessage", {
          chat_id,
          text: `There are *no* phone numbers listed.`,
        });
    } else if (command === "/list") {
      const phoneNumbers = JSON.parse(
        (await storage.getItem("phoneNumbers")) || "[]"
      );
      telegram("sendMessage", {
        chat_id,
        text: phoneNumbers.length
          ? `Current phone numbers:\n- \`${phoneNumbers.join("`\n- `")}\``
          : `There are *no* phone numbers listed.`,
      });
    } else if (command === "/test") {
      send("☎️ Doing a test call...", { test: true });
    } else if (command === "/debug") {
      telegram("sendMessage", {
        chat_id,
        text: `\`\`\`\n${JSON.stringify(message, null, 2)}\n\`\`\``,
      });
    } else if (command === "/todo" || command === "/done") {
      const {
        text: textRaw,
        from: { id, first_name },
      } = message;

      const pre = message.entities.find(({ type }) => type === "pre");
      let text = pre
        ? textRaw.slice(0, pre.offset) +
          "\n```" +
          textRaw.slice(pre.offset, pre.offset + pre.length) +
          "\n```\n" +
          textRaw.slice(pre.offset + pre.length)
        : textRaw;
      text = text.replace(/\n{3,}/g, "\n\n");

      const user = USERS.find(({ telegramId }) => telegramId === id);
      if (!user) {
        telegram("sendMessage", {
          chat_id,
          text: `🤦‍♂️ User ${first_name} not found, ask Adriaan to add your id: \`${id}\`.`,
          delete: false,
        });
      } else {
        if (command === "/done" && user.name !== "Adriaan") {
          telegram("sendMessage", {
            chat_id,
            text: `🤦‍♂️ Command \`${command}\` not implemented.`,
          });
        } else {
          const parts = text.split("\n");
          const title = parts
            .shift()
            .slice(command.length + 1)
            .trim();
          const issue = await createNewIssue({
            title,
            body: parts.join("\n").trim(),
            key: user.githubKey,
            closed: command === "/done",
          });
          if (issue instanceof Error) {
            telegram("sendMessage", {
              chat_id,
              text: `🤦‍♂️ Error while creating issue \`${issue.message.replace(
                /[^a-z-_ 0-9., ]/gi,
                ""
              )}\`.`,
            });
          } else {
            if (command === "/done") await createTodo({ title });
            telegram("sendMessage", {
              chat_id,
              text: `Created [#${issue.id} ${title.replace(
                /[^a-z-_ 0-9., ]/gi,
                ""
              )}](${issue.url}) for you ${user.name}.`,
              delete: false,
            });
          }
        }
      }
    } else if (command) {
      telegram("sendMessage", {
        chat_id,
        text: `🤦‍♂️ Command \`${command}\` not implemented.`,
      });
    }
    return (ctx.body = { success: true });
  } catch (error) {
    try {
      telegram("sendMessage", {
        chat_id,
        text: `🤦‍♂️ Got an error: \`${error.message}\``,
      });
    } catch (e) {
      /* nothing */
    }
    ctx.status = 400;
    console.error(error);
    return (ctx.body = { success: false });
  }
};

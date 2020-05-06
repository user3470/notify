const querystring = require("querystring");
const { post } = require("../utils/request");
const { get } = require("../utils/tools");

const { WIP_KEY, USER_AGENT, WIP_HASHTAG } = process.env;

const wipchatOptions = {
  hostname: "wip.chat",
  port: "443",
  path: "/graphql",
  method: "POST",
  headers: {
    Authorization: `Bearer ${WIP_KEY}`,
    "Content-Type": "application/json",
    "User-Agent": USER_AGENT,
  },
};

module.exports.createTodo = async ({ title }) => {
  const mutation = `mutation createTodo {
    createTodo(input: { body: ${JSON.stringify(
      title + " #" + WIP_HASHTAG
    )}, completed_at: "${new Date().toISOString()}" }) {
      id
    }
  }`;

  const path = `${wipchatOptions.path}?${querystring.stringify({
    query: mutation,
  })}`;
  const json = await post({ ...wipchatOptions, path });

  const lastError = get(json, "errors[0].message");
  if (lastError) throw new Error(lastError);
  if (json instanceof Error) throw json;
  const id = get(json, "data.createTodo.id");
  if (!id) throw new Error("Something went wrong");
  return { id: Number(id) };
};

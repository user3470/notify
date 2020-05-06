const { post } = require("../utils/request");
const { get } = require("../utils/tools");

const { GITHUB_REPOSITORY_ID, GITHUB_PROJECT_ID } = process.env;

const httpsOptions = {
  hostname: "api.github.com",
  port: "443",
  path: "/graphql",
  method: "POST",
  headers: {
    Authorization: `Bearer ...`,
    "Content-Type": "application/json",
    "User-Agent": "Simple Analytics Todo Chat",
  },
};

module.exports.createNewIssue = async ({
  key,
  title,
  body,
  closed = false,
} = {}) => {
  if (!key || !title) throw new Error("Key nor title are defined");

  try {
    const mutation = `mutation CreateIssuePayload {
      createIssue(input: { repositoryId: "${GITHUB_REPOSITORY_ID}", title: ${JSON.stringify(
      title
    )}, body: ${JSON.stringify(body)}, projectIds: "${GITHUB_PROJECT_ID}" }) {
        issue {
          id
          url
        }
      }
    }`;

    const result = await post({
      ...httpsOptions,
      headers: {
        ...httpsOptions.headers,
        Authorization: `Bearer ${key}`,
      },
      data: JSON.stringify({ query: mutation }),
    });

    const githubId = get(result, "data.createIssue.issue.id");
    const url = get(result, "data.createIssue.issue.url");
    const firstError = get(result, "errors[0].message");
    const id = (url || "").split("/").pop();

    if (closed && githubId) {
      const mutation = `mutation CloseIssuePayload {
        closeIssue(input: {issueId: "${githubId}"}) {
          issue {
            id
          }
        }
      }`;

      await post({
        ...httpsOptions,
        headers: {
          ...httpsOptions.headers,
          Authorization: `Bearer ${key}`,
        },
        data: JSON.stringify({ query: mutation }),
      });
    }

    return url && id
      ? { url, id }
      : new Error(firstError ? firstError : "Something is wrong");
  } catch (error) {
    return error;
  }
};

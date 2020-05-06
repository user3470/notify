const https = require("https");
const http = require("http");

const getPost = (req) =>
  new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      resolve(body);
    });
  });

const getJSON = async (res) => {
  try {
    const body = await getPost(res);
    const json = JSON.parse(body);
    return json;
  } catch (err) {
    return err;
  }
};

module.exports.post = (custom) => {
  const options = { method: "POST", ...custom };

  return new Promise((resolve, reject) => {
    const request = options.port == 443 ? https.request : http.request;
    const req = request(options, async (res) => {
      try {
        const json = await getJSON(res);
        if (res.statusCode !== 200) reject(json);
        resolve(json);
      } catch (error) {
        reject(error);
      }
    });

    req.on("error", (e) => reject(e));

    if (options.data) req.write(options.data);

    req.end();
  });
};

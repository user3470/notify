const storage = require("node-persist");

(async () => {
  await storage.init();
})();

module.exports = storage;

/*
  src/routes/index.js

  Central route wiring.
*/

const registerAuthRoutes = require('./auth');
const registerProfileRoutes = require('./profile');
const registerUsersRoutes = require('./users');
const registerCounterRoutes = require('./counters');
const registerSettingsRoutes = require('./settings');
const registerEmbedRoutes = require('./embeds');

function registerAllRoutes(app, deps) {
  registerAuthRoutes(app, deps);
  registerProfileRoutes(app, deps);
  registerUsersRoutes(app, deps);
  registerCounterRoutes(app, deps);
  registerSettingsRoutes(app, deps);
  registerEmbedRoutes(app, deps);
}

module.exports = registerAllRoutes;

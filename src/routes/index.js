/*
  src/routes/index.js

  Central route wiring.
*/

const registerAuthRoutes = require('./auth/session');
const registerProfileRoutes = require('./auth/profile');
const registerUsersRoutes = require('./auth/users');
const registerCounterReadRoutes = require('./counters/read');
const registerCounterImportExportRoutes = require('./counters/importExport');
const registerCounterWriteRoutes = require('./counters/write');
const registerSettingsRoutes = require('./settings/general');
const registerEmbedRoutes = require('./counters/embeds');

function registerAllRoutes(app, deps) {
  registerAuthRoutes(app, deps);
  registerProfileRoutes(app, deps);
  registerUsersRoutes(app, deps);
  registerCounterReadRoutes(app, deps);
  registerCounterImportExportRoutes(app, deps);
  registerCounterWriteRoutes(app, deps);
  registerSettingsRoutes(app, deps);
  registerEmbedRoutes(app, deps);
}

module.exports = registerAllRoutes;

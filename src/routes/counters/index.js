/*
  src/routes/counters/index.js

  Counter route module wiring.
*/

const registerCounterReadRoutes = require('./read');
const registerCounterImportExportRoutes = require('./importExport');
const registerCounterWriteRoutes = require('./write');

function registerCounterRoutes(app, deps) {
  registerCounterReadRoutes(app, deps);
  registerCounterImportExportRoutes(app, deps);
  registerCounterWriteRoutes(app, deps);
}

module.exports = registerCounterRoutes;

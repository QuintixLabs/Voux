/*
  src/app.js

  Express app wiring helpers.
*/

function configureApp(app, deps) {
  const {
    express,
    resolveTrustProxySetting,
    createSecurityHeadersMiddleware,
    createCsrfGuard,
    getSessionToken,
    getBaseUrl
  } = deps;

  app.set('trust proxy', resolveTrustProxySetting(process.env.TRUST_PROXY));
  app.use(express.json({ limit: '3mb' }));
  app.use(createSecurityHeadersMiddleware());
  app.use(createCsrfGuard({ getSessionToken, getBaseUrl }));
}

/* -------------------------------------------------------------------------- */
/* Page Routes                                                                */
/* -------------------------------------------------------------------------- */
function registerPageRoutes(app, serveHtml, deps = {}) {
  const { countUsers } = deps;
  const setupRequired = () =>
    typeof countUsers === 'function' && countUsers() === 0;
  const redirectToSetupIfNeeded = (filename) => (req, res) => {
    if (setupRequired()) {
      return res.redirect('/setup');
    }
    return serveHtml(filename)(req, res);
  };
  const redirectSetupIfReady = (req, res) => {
    if (!setupRequired()) {
      return res.redirect('/dashboard');
    }
    return serveHtml('setup.html')(req, res);
  };

  app.get('/', redirectToSetupIfNeeded('index.html'));
  app.get('/index.html', redirectToSetupIfNeeded('index.html'));
  app.get('/dashboard', redirectToSetupIfNeeded('dashboard.html'));
  app.get('/settings', redirectToSetupIfNeeded('settings.html'));
  app.get('/profile', redirectToSetupIfNeeded('profile.html'));
  app.get('/setup', redirectSetupIfReady);
  app.get('/about', serveHtml('about.html'));
  app.get('/privacy', serveHtml('privacy.html'));
  app.get('/terms', serveHtml('terms.html'));
}

/* -------------------------------------------------------------------------- */
/* Static Assets + Fallbacks                                                  */
/* -------------------------------------------------------------------------- */
function registerStaticAndErrorHandlers(app, deps) {
  const {
    express,
    uploadsDir,
    staticDir,
    isDev,
    loadHtmlTemplate,
    notFoundPage
  } = deps;

  app.use(
    '/uploads',
    express.static(uploadsDir, {
      setHeaders: (res, filePath) => {
        if (
          filePath.endsWith('.png') ||
          filePath.endsWith('.jpg') ||
          filePath.endsWith('.jpeg') ||
          filePath.endsWith('.webp') ||
          filePath.endsWith('.gif')
        ) {
          if (isDev) {
            res.setHeader('Cache-Control', 'no-store');
          } else {
            res.setHeader(
              'Cache-Control',
              'public, max-age=31536000, immutable'
            );
          }
        }
      }
    })
  );

  app.use(
    express.static(staticDir, {
      extensions: ['html'],
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('.js') || filePath.endsWith('.css')) {
          if (isDev) {
            res.setHeader('Cache-Control', 'no-store');
          } else {
            res.setHeader(
              'Cache-Control',
              'public, max-age=31536000, immutable'
            );
          }
        }
      }
    })
  );

  app.use((req, res, next) => {
    if (req.accepts('html')) {
      const html = loadHtmlTemplate('404.html');
      if (html) {
        res.set('Cache-Control', 'no-store');
        return res.status(404).send(html);
      }
      return res.status(404).sendFile(notFoundPage);
    }
    return next();
  });

  app.use((req, res) => {
    res.status(404).json({ error: 'not_found' });
  });

  app.use((err, req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: 'internal_error' });
  });
}

module.exports = {
  configureApp,
  registerPageRoutes,
  registerStaticAndErrorHandlers
};

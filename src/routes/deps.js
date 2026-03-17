/*
  src/routes/deps.js

  Builds the dependency object passed to route registration.
*/

function buildRouteDeps(input) {
  return {
    /* -------------------------------------------------------------------------- */
    /* Auth + Request Context                                                     */
    /* -------------------------------------------------------------------------- */
    requireAdmin: input.requireAdmin,
    requireAuth: input.requireAuth,
    requireAuthOrKey: input.requireAuthOrKey,
    authenticateRequest: input.authenticateRequest,
    hasAdminPermission: input.hasAdminPermission,
    hasCounterAccess: input.hasCounterAccess,
    getOwnerId: input.getOwnerId,

    /* -------------------------------------------------------------------------- */
    /* Runtime Config                                                             */
    /* -------------------------------------------------------------------------- */
    getConfig: input.getConfig,
    updateConfig: input.updateConfig,
    normalizeAllowedModesPatch: input.normalizeAllowedModesPatch,
    backupService: input.backupService,
    htmlCache: input.htmlCache,
    setUnlimitedThrottle: input.setUnlimitedThrottle,
    getVersion: input.getVersion,

    /* -------------------------------------------------------------------------- */
    /* Limits + Constants                                                         */
    /* -------------------------------------------------------------------------- */
    DEFAULT_USERS_PAGE_SIZE: input.DEFAULT_USERS_PAGE_SIZE,
    DEFAULT_PAGE_SIZE: input.DEFAULT_PAGE_SIZE,
    INACTIVE_THRESHOLD_DAYS: input.INACTIVE_THRESHOLD_DAYS,
    DAY_MS: input.DAY_MS,

    /* -------------------------------------------------------------------------- */
    /* Users                                                                      */
    /* -------------------------------------------------------------------------- */
    serializeUser: input.serializeUser,
    getEffectiveAdminPermissions: input.getEffectiveAdminPermissions,
    listUsers: input.listUsers,
    createUser: input.createUser,
    updateUser: input.updateUser,
    deleteUser: input.deleteUser,
    countAdmins: input.countAdmins,
    getUserById: input.getUserById,
    resolveAvatarUrl: input.resolveAvatarUrl,

    /* -------------------------------------------------------------------------- */
    /* Query + Filters                                                            */
    /* -------------------------------------------------------------------------- */
    normalizeModeFilter: input.normalizeModeFilter,
    normalizeSort: input.normalizeSort,
    normalizeInactiveFilter: input.normalizeInactiveFilter,
    normalizeTagFilter: input.normalizeTagFilter,
    extractSearchQuery: input.extractSearchQuery,

    /* -------------------------------------------------------------------------- */
    /* Counters Read / Import / Export                                            */
    /* -------------------------------------------------------------------------- */
    countCounters: input.countCounters,
    listCountersPage: input.listCountersPage,
    isKnownOwner: input.isKnownOwner,
    serializeCounterWithStats: input.serializeCounterWithStats,
    exportCounters: input.exportCounters,
    exportDailyActivityFor: input.exportDailyActivityFor,
    exportDailyActivity: input.exportDailyActivity,
    normalizeCounterForExport: input.normalizeCounterForExport,
    listTagCatalog: input.listTagCatalog,
    exportCountersByIds: input.exportCountersByIds,
    normalizeIdsInput: input.normalizeIdsInput,
    importCounters: input.importCounters,
    importCountersForOwner: input.importCountersForOwner,
    mergeTagCatalog: input.mergeTagCatalog,
    importDailyActivity: input.importDailyActivity,
    importDailyActivityFor: input.importDailyActivityFor,
    seedLastHitsFromDaily: input.seedLastHitsFromDaily,

    /* -------------------------------------------------------------------------- */
    /* Counters Write                                                             */
    /* -------------------------------------------------------------------------- */
    getCounter: input.getCounter,
    deleteCounter: input.deleteCounter,
    updateCounterValue: input.updateCounterValue,
    validateCounterValue: input.validateCounterValue,
    updateCounterMetadata: input.updateCounterMetadata,
    LABEL_LIMIT: input.LABEL_LIMIT,
    NOTE_LIMIT: input.NOTE_LIMIT,
    filterTagIds: input.filterTagIds,
    deleteCountersByOwnerAndMode: input.deleteCountersByOwnerAndMode,
    deleteCountersByOwner: input.deleteCountersByOwner,
    deleteCountersByMode: input.deleteCountersByMode,
    deleteAllCounters: input.deleteAllCounters,
    isPrivateMode: input.isPrivateMode,
    getClientIp: input.getClientIp,
    checkCreationRate: input.checkCreationRate,
    CREATION_LIMIT_COUNT: input.CREATION_LIMIT_COUNT,
    CREATION_LIMIT_WINDOW_MS: input.CREATION_LIMIT_WINDOW_MS,
    getDefaultMode: input.getDefaultMode,
    parseRequestedMode: input.parseRequestedMode,
    isModeAllowed: input.isModeAllowed,
    createCounter: input.createCounter,
    recordCreationAttempt: input.recordCreationAttempt,
    getBaseUrl: input.getBaseUrl,
    serializeCounter: input.serializeCounter,

    /* -------------------------------------------------------------------------- */
    /* Tags + API Keys                                                            */
    /* -------------------------------------------------------------------------- */
    addTagToCatalog: input.addTagToCatalog,
    updateTagInCatalog: input.updateTagInCatalog,
    removeTagFromCatalog: input.removeTagFromCatalog,
    removeTagAssignments: input.removeTagAssignments,
    listApiKeys: input.listApiKeys,
    createApiKey: input.createApiKey,
    deleteApiKey: input.deleteApiKey,

    /* -------------------------------------------------------------------------- */
    /* Embeds + Auth Routes                                                       */
    /* -------------------------------------------------------------------------- */
    deleteInactiveCountersOlderThan: input.deleteInactiveCountersOlderThan,
    isPreviewRequest: input.isPreviewRequest,
    recordHit: input.recordHit,
    normalizeCounterValue: input.normalizeCounterValue,
    checkLoginBlock: input.checkLoginBlock,
    setRetryAfter: input.setRetryAfter,
    rateLimitPayload: input.rateLimitPayload,
    getUserByUsername: input.getUserByUsername,
    verifyPassword: input.verifyPassword,
    recordLoginFailure: input.recordLoginFailure,
    clearLoginFailures: input.clearLoginFailures,
    createSession: input.createSession,
    SESSION_TTL_MS: input.SESSION_TTL_MS,
    recordUserLogin: input.recordUserLogin,
    setSessionCookie: input.setSessionCookie,
    deleteSession: input.deleteSession,
    getSessionToken: input.getSessionToken,
    clearSessionCookie: input.clearSessionCookie
  };
}

module.exports = buildRouteDeps;

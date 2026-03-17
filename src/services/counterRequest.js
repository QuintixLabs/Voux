/*
  src/services/counterRequest.js

  Request parsing and normalization helpers for counter APIs.
*/

function createCounterRequestService(deps) {
  const {
    startValueDigitLimit,
    filterTagIds
  } = deps;

  function validateCounterValue(rawValue) {
    const normalizedRaw = rawValue === undefined || rawValue === null ? '0' : String(rawValue).trim();
    if (!normalizedRaw) {
      return { value: 0n };
    }
    if (!/^\d+$/.test(normalizedRaw)) {
      return { error: 'startValue must be a positive number', message: 'Starting value must be a positive number.' };
    }
    if (normalizedRaw.length > startValueDigitLimit) {
      return {
        error: 'startValue_too_large',
        message: `Starting value cannot exceed ${startValueDigitLimit} digits.`
      };
    }
    try {
      return { value: BigInt(normalizedRaw) };
    } catch {
      return { error: 'startValue must be a positive number', message: 'Starting value must be a positive number.' };
    }
  }

  function extractSearchQuery(value) {
    if (value === undefined || value === null) {
      return null;
    }
    const raw = Array.isArray(value) ? value[0] : value;
    const trimmed = String(raw).trim();
    if (!trimmed) {
      return null;
    }
    return trimmed.slice(0, 80);
  }

  function isPreviewRequest(req) {
    const previewParam = req.query.preview;
    if (previewParam === undefined) return false;
    const value = Array.isArray(previewParam) ? previewParam[0] : previewParam;
    if (value === undefined || value === null) return false;
    const normalized = String(value).trim().toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 'yes';
  }

  function normalizeIdsInput(value, limit = 200) {
    if (!Array.isArray(value)) return [];
    const normalized = [];
    const seen = new Set();
    value.forEach((entry) => {
      const id = typeof entry === 'string' ? entry.trim() : '';
      if (id && !seen.has(id)) {
        normalized.push(id.slice(0, 64));
        seen.add(id);
      }
    });
    return normalized.slice(0, limit);
  }

  function normalizeCounterValue(value) {
    if (value === undefined || value === null) {
      return '0';
    }
    if (typeof value === 'bigint') {
      return value < 0n ? '0' : value.toString();
    }
    if (typeof value === 'number') {
      if (!Number.isFinite(value) || value < 0) return '0';
      return Math.floor(value).toString();
    }
    const digits = String(value).replace(/[^\d]/g, '');
    return digits || '0';
  }

  function normalizeCounterForExport(counter) {
    if (!counter) return null;
    return {
      ...counter,
      value: normalizeCounterValue(counter.value),
      created_at: toSafeNumber(counter.created_at)
    };
  }

  function normalizeModeFilter(value) {
    if (value === undefined || value === null) return null;
    const raw = Array.isArray(value) ? value[0] : value;
    if (raw === undefined || raw === null) return null;
    const normalized = String(raw).trim().toLowerCase();
    if (normalized === 'unique' || normalized === 'unlimited') {
      return normalized;
    }
    return null;
  }

  function normalizeSort(value) {
    if (value === undefined || value === null) return null;
    const raw = Array.isArray(value) ? value[0] : value;
    if (raw === undefined || raw === null) return null;
    const normalized = String(raw).trim().toLowerCase();
    if (normalized === 'newest' || normalized === 'oldest' || normalized === 'views' || normalized === 'views_asc' || normalized === 'last_hit') {
      return normalized;
    }
    return null;
  }

  function normalizeInactiveFilter(value) {
    if (value === undefined || value === null) return null;
    const raw = Array.isArray(value) ? value[0] : value;
    if (raw === undefined || raw === null) return null;
    const normalized = String(raw).trim().toLowerCase();
    if (normalized === '1' || normalized === 'true' || normalized === 'yes') {
      return true;
    }
    if (normalized === '0' || normalized === 'false' || normalized === 'no') {
      return false;
    }
    return null;
  }

  function normalizeTagFilter(value, ownerId) {
    if (value === undefined || value === null) return [];
    const entries = Array.isArray(value) ? value : [value];
    const flattened = entries
      .flatMap((entry) => String(entry || '').split(','))
      .map((part) => part.trim())
      .filter(Boolean);
    if (!flattened.length) return [];
    return filterTagIds(flattened, ownerId);
  }

  function normalizeAllowedModesPatch(input) {
    if (!input || typeof input !== 'object') return null;
    const normalized = {
      unique: input.unique !== false,
      unlimited: input.unlimited !== false
    };
    if (!normalized.unique && !normalized.unlimited) {
      return null;
    }
    return normalized;
  }

  function toSafeNumber(value) {
    if (typeof value === 'bigint') {
      return Number(value);
    }
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
  }

  return {
    validateCounterValue,
    extractSearchQuery,
    isPreviewRequest,
    normalizeIdsInput,
    normalizeCounterValue,
    normalizeCounterForExport,
    normalizeModeFilter,
    normalizeSort,
    normalizeInactiveFilter,
    normalizeTagFilter,
    normalizeAllowedModesPatch
  };
}

module.exports = createCounterRequestService;

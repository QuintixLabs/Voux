/*
  src/services/avatars.js

  Avatar URL validation, file writes, and safe cleanup helpers.
*/

function createAvatarService(deps) {
  const {
    fs,
    path,
    avatarUploadsDir,
    staticDir,
    avatarMaxBytes
  } = deps;

  function isDataImageUrl(value) {
    return /^data:image\/(png|jpeg|jpg);base64,/.test(value || '');
  }

  function extractDataImage(value) {
    if (!isDataImageUrl(value)) return null;
    const match = /^data:image\/(png|jpeg|jpg);base64,(.*)$/s.exec(value);
    if (!match) return null;
    const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
    return { ext, data: match[2] || '' };
  }

  function sanitizeAvatarRelativePath(value) {
    const raw = String(value || '').trim().replace(/\\/g, '/');
    if (!raw || raw.includes('\0')) return null;
    const normalized = path.posix.normalize(`/${raw}`).replace(/^\/+/, '');
    if (!normalized || normalized.startsWith('..')) return null;
    return normalized;
  }

  function resolveSafeChildPath(baseDir, childRelativePath) {
    const root = path.resolve(baseDir);
    const target = path.resolve(root, childRelativePath);
    if (target === root) return null;
    if (!target.startsWith(`${root}${path.sep}`)) return null;
    return target;
  }

  function safeRemoveAvatarFile(avatarUrl) {
    if (!avatarUrl || typeof avatarUrl !== 'string') return;
    if (!avatarUrl.startsWith('/uploads/avatars/')) return;
    const relativePath = avatarUrl.replace(/^\/uploads\/avatars\//, '');
    const safeRelative = sanitizeAvatarRelativePath(relativePath);
    if (!safeRelative) return;
    const dataPath = resolveSafeChildPath(avatarUploadsDir, safeRelative);
    const publicAvatarUploadsDir = path.join(staticDir, 'uploads', 'avatars');
    const publicPath = resolveSafeChildPath(publicAvatarUploadsDir, safeRelative);
    if (!dataPath || !publicPath) return;
    try {
      fs.unlinkSync(dataPath);
    } catch {
      // ignore missing files
    }
    try {
      fs.unlinkSync(publicPath);
    } catch {
      // ignore missing files
    }
  }

  function resolveAvatarUrl(userId, avatarUrl, existingUrl) {
    if (avatarUrl === undefined) return { value: undefined };
    const trimmed = String(avatarUrl || '').trim();
    if (!trimmed) {
      safeRemoveAvatarFile(existingUrl);
      return { value: null };
    }
    // Only allow local uploaded avatars or supported raster uploads.
    if (!isDataImageUrl(trimmed)) {
      const isLocalAvatar =
        trimmed.startsWith('/uploads/avatars/') &&
        /\.(png|jpe?g)$/i.test(trimmed);
      if (!isLocalAvatar) return { error: 'invalid_avatar' };
      return { value: trimmed.slice(0, 2048) };
    }
    const extracted = extractDataImage(trimmed);
    if (!extracted) return { error: 'invalid_avatar' };
    const buffer = Buffer.from(extracted.data, 'base64');
    if (!buffer.length || buffer.length > avatarMaxBytes) {
      return { error: 'avatar_too_large' };
    }
    fs.mkdirSync(avatarUploadsDir, { recursive: true });
    safeRemoveAvatarFile(existingUrl);
    const filename = `${userId}-${Date.now()}.${extracted.ext}`;
    const filePath = path.join(avatarUploadsDir, filename);
    fs.writeFileSync(filePath, buffer);
    return { value: `/uploads/avatars/${filename}` };
  }

  return {
    resolveAvatarUrl
  };
}

module.exports = createAvatarService;

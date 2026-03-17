/*
  src/routes/embeds.js

  Counter embed endpoints.
*/

function registerEmbedRoutes(app, deps) {
  const {
    getCounter,
    getBaseUrl,
    serializeCounterWithStats,
    isPreviewRequest,
    recordHit,
    getClientIp,
    normalizeCounterValue
  } = deps;

  /* -------------------------------------------------------------------------- */
  /* Counter Details + Snippets                                                 */
  /* -------------------------------------------------------------------------- */
  app.get('/api/counters/:id', (req, res) => {
    const counter = getCounter(req.params.id);
    if (!counter) {
      return res.status(404).json({ error: 'counter_not_found' });
    }
    const baseUrl = getBaseUrl(req);
    const embedUrl = `${baseUrl}/embed/${counter.id}.js`;
    const embedCode = `<script async src="${embedUrl}"></script>`;
    const embedSvgUrl = `${baseUrl}/embed/${counter.id}.svg`;
    const embedSvgCode = `<img src="${embedSvgUrl}" alt="Voux counter">`;
    return res.json({
      counter: serializeCounterWithStats(counter, { includeTags: false }),
      embedCode,
      embedUrl,
      embedSvgCode,
      embedSvgUrl
    });
  });

  /* -------------------------------------------------------------------------- */
  /* Embed Script (.js)                                                         */
  /* -------------------------------------------------------------------------- */
  app.get('/embed/:id.js', (req, res) => {
    res.type('application/javascript');
    res.set('Cache-Control', 'no-store');

    const isPreview = isPreviewRequest(req);
    let result = null;
    if (isPreview) {
      const counter = getCounter(req.params.id);
      if (!counter) {
        return res.send(`console.warn(${JSON.stringify(`Counter "${String(req.params.id || '')}" not found`)});`);
      }
      result = { counter, incremented: false };
    } else {
      result = recordHit(req.params.id, getClientIp(req));
      if (!result) {
        return res.send(`console.warn(${JSON.stringify(`Counter "${String(req.params.id || '')}" not found`)});`);
      }
    }

    const { counter } = result;
    const data = {
      id: counter.id,
      value: normalizeCounterValue(counter.value),
      label: counter.label
    };

    const payload = JSON.stringify(data);
    // Embed script
    //
    // If you want to pretty-print (deminify) this code:
    // 1. Copy everything inside the template string (remove the starting const script = ` and the ending `;).
    // 2. Paste the code into a JS formatter such as:
    //    https://beautifier.io/
    //    https://prettier.io/playground
    // 3. After formatting, you can wrap it back in const script = ` ... `;
    // -------------------------------------------------------------------------------------------------------
    const script = `(function(){try{var data=${payload};var doc=document;var formatValue=function(v){var str=String(v==null?'0':v);return str.replace(/\\B(?=(\\d{3})+(?!\\d))/g, ',');};var scriptEl=doc.currentScript;if(!scriptEl){return;}var host=scriptEl.parentElement;var wrapper; if(host&&host.classList&&host.classList.contains('counter-widget')){wrapper=host;host.innerHTML='';scriptEl.remove();}else{wrapper=doc.createElement('span');wrapper.className='counter-widget';scriptEl.replaceWith(wrapper);}wrapper.setAttribute('role','status');wrapper.setAttribute('aria-live','polite');if(data.label){var labelEl=doc.createElement('span');labelEl.className='counter-widget__label';labelEl.textContent=data.label;labelEl.setAttribute('aria-hidden','true');wrapper.appendChild(labelEl);wrapper.appendChild(doc.createTextNode(' '));}var valueEl=doc.createElement('span');valueEl.className='counter-widget__value';valueEl.textContent=formatValue(data.value);wrapper.appendChild(valueEl);}catch(err){if(console&&console.warn){console.warn('counter embed failed',err);}}})();`;
    return res.send(script);
  });

  /* -------------------------------------------------------------------------- */
  /* Embed SVG (.svg)                                                           */
  /* -------------------------------------------------------------------------- */
  app.get('/embed/:id.svg', (req, res) => {
    res.type('image/svg+xml');

    const isPreview = isPreviewRequest(req);
    const ua = String(req.get('user-agent') || '').toLowerCase();
    const isGitHubCamo = ua.includes('github-camo') || ua.includes('github');

    const renderErrorSvg = (message) => {
      const safe = String(message || 'Counter not found').replace(/[<>&'"]/g, (char) => ({
        '<': '&lt;',
        '>': '&gt;',
        '&': '&amp;',
        "'": '&apos;',
        '"': '&quot;'
      }[char]));
      return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="320" height="48" viewBox="0 0 320 48">
  <style>
    text { font-family: Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; font-size: 14px; fill: #9ca3af; }
  </style>
  <text x="12" y="28">${safe}</text>
</svg>`;
    };

    let result = null;
    if (isPreview) {
      const counter = getCounter(req.params.id);
      if (!counter) {
        return res.status(200).send(renderErrorSvg('Counter not found'));
      }
      result = { counter, incremented: false };
    } else {
      const counter = getCounter(req.params.id);
      if (!counter) {
        return res.status(200).send(renderErrorSvg('Counter not found'));
      }
      let hitIp = isGitHubCamo ? 'github-camo' : getClientIp(req);
      if (!hitIp) {
        hitIp = 'unknown-svg';
      }
      result = recordHit(req.params.id, hitIp);
      if (!result) {
        return res.status(404).send('Counter not found');
      }
    }

    const { counter } = result;
    const labelRaw = typeof counter.label === 'string' ? counter.label.trim() : '';
    const valueRaw = normalizeCounterValue(counter.value);
    const valueFormatted = String(valueRaw).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const label = labelRaw.replace(/[<>&'"]/g, (char) => ({
      '<': '&lt;',
      '>': '&gt;',
      '&': '&amp;',
      "'": '&apos;',
      '"': '&quot;'
    }[char]));
    const valueText = valueFormatted.replace(/[<>&'"]/g, (char) => ({
      '<': '&lt;',
      '>': '&gt;',
      '&': '&amp;',
      "'": '&apos;',
      '"': '&quot;'
    }[char]));
    const queryValue = (key) => {
      const raw = req.query[key];
      return Array.isArray(raw) ? raw[0] : raw;
    };
    const parseBool = (raw, fallback = false) => {
      if (raw === undefined || raw === null) return fallback;
      const normalized = String(raw).trim().toLowerCase();
      if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
      if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
      return fallback;
    };
    const parseHexColor = (raw, fallback) => {
      if (!raw) return fallback;
      const normalized = String(raw).trim().replace(/^#/, '');
      if (/^[0-9a-fA-F]{3}$/.test(normalized)) {
        return `#${normalized}`;
      }
      if (/^[0-9a-fA-F]{6}$/.test(normalized)) {
        return `#${normalized}`;
      }
      return fallback;
    };
    const parseSize = (raw, fallback) => {
      const num = Number(raw);
      if (!Number.isFinite(num)) return fallback;
      return Math.min(48, Math.max(12, Math.round(num)));
    };
    const parseAlign = (raw) => {
      if (!raw) return 'left';
      const normalized = String(raw).trim().toLowerCase();
      if (normalized === 'center' || normalized === 'right' || normalized === 'left') {
        return normalized;
      }
      return 'left';
    };

    const showLabel = parseBool(queryValue('label'), true);
    const inlineLabel = parseBool(queryValue('inline'), false);
    const wrapEnabled = parseBool(queryValue('wrap'), inlineLabel ? false : true);
    const align = parseAlign(queryValue('align'));
    const baseColor = parseHexColor(queryValue('color'), '#8A8F98');
    const valueColor = parseHexColor(queryValue('valueColor'), baseColor);
    const labelColor = parseHexColor(queryValue('labelColor'), baseColor);
    const bgColor = parseHexColor(queryValue('bg'), 'transparent');
    const baseSize = parseSize(queryValue('size'), 20);
    const valueSize = parseSize(queryValue('sizeValue'), baseSize);
    const labelSize = parseSize(queryValue('sizeLabel'), Math.max(10, Math.round(baseSize * 0.6)));
    const labelFontSize = labelSize;
    const radius = Math.max(0, Math.min(24, Math.round(Number(queryValue('radius')) || 0)));
    const maxWidthRaw = Math.round(Number(queryValue('maxWidth')) || 0);
    const maxWidthDefault = wrapEnabled ? Math.round(360 * (valueSize / 20)) : 900;
    const maxWidth = Math.max(160, Math.min(900, maxWidthRaw > 0 ? maxWidthRaw : maxWidthDefault));
    const padX = Math.max(4, Math.min(64, Math.round(Number(queryValue('padX')) || 10)));
    const padY = Math.max(4, Math.min(64, Math.round(Number(queryValue('padY')) || 8)));
    const anchor = align === 'center' ? 'middle' : align === 'right' ? 'end' : 'start';

    const hasLabel = Boolean(label) && showLabel;
    const inlineLabelText = hasLabel && inlineLabel ? label : label;
    const inlineText = hasLabel && inlineLabel
      ? `${inlineLabelText}${inlineLabelText ? ' ' : ''}${valueText}`
      : valueText;
    const labelLine = hasLabel && !inlineLabel ? label : '';

    const wrapText = (text, maxChars) => {
      if (!wrapEnabled || !text || maxChars <= 0 || text.length <= maxChars) {
        return [text];
      }
      const words = text.split(/\s+/).filter(Boolean);
      if (!words.length) return [text];
      const lines = [];
      let line = '';
      words.forEach((word) => {
        const next = line ? `${line} ${word}` : word;
        if (next.length <= maxChars) {
          line = next;
        } else if (line) {
          lines.push(line);
          line = word;
        } else {
          lines.push(word.slice(0, maxChars));
          line = word.slice(maxChars);
        }
      });
      if (line) lines.push(line);
      return lines.slice(0, 3);
    };

    const valueCharWidth = valueSize * 0.6;
    const labelCharWidth = labelFontSize * 0.6;
    const labelLineHeight = labelFontSize + 2;
    const valueLineHeight = valueSize + 2;
    const maxValueChars = Math.floor((maxWidth - padX * 2) / valueCharWidth);
    const maxLabelChars = Math.floor((maxWidth - padX * 2) / labelCharWidth);

    let labelLines = [];
    let valueLines = [];
    let inlineSplit = false;

    if (hasLabel && !inlineLabel) {
      labelLines = wrapText(labelLine, maxLabelChars);
      valueLines = wrapText(valueText, maxValueChars);
    } else if (hasLabel && inlineLabel && wrapEnabled && inlineText.length > maxValueChars) {
      inlineSplit = true;
      labelLines = wrapText(inlineLabelText, maxLabelChars);
      valueLines = wrapText(valueText, maxValueChars);
    } else {
      valueLines = [inlineText];
    }

    const longestLine = Math.max(
      ...labelLines.map((line) => line.length),
      ...valueLines.map((line) => line.length),
      inlineText.length
    );
    const width = Math.max(
      160,
      Math.min(maxWidth, padX * 2 + Math.round(longestLine * valueCharWidth))
    );
    const labelBlockHeight = labelLines.length ? labelLines.length * labelLineHeight + 6 : 0;
    const valueBlockHeight = valueLines.length * valueLineHeight - 2;
    const height = padY * 2 + labelBlockHeight + valueBlockHeight;
    const labelY = padY + labelFontSize;
    const valueY = padY + labelBlockHeight + valueSize;
    const textX = align === 'center' ? Math.round(width / 2) : align === 'right' ? width - padX : padX;

    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <style>
    text { font-family: Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; fill: ${baseColor}; }
    .label { font-size: ${labelFontSize}px; font-weight: 500; fill: ${labelColor}; }
    .value { font-size: ${valueSize}px; font-weight: 600; fill: ${valueColor}; }
  </style>
  ${bgColor !== 'transparent' ? `<rect x="0" y="0" width="${width}" height="${height}" rx="${radius}" ry="${radius}" fill="${bgColor}"/>` : ''}
  ${
    labelLines.length
      ? `<text class="label" x="${textX}" y="${labelY}" text-anchor="${anchor}">
  ${labelLines.map((line, idx) => `<tspan x="${textX}" dy="${idx === 0 ? 0 : labelLineHeight}">${line}</tspan>`).join('')}
</text>`
      : ''
  }
  ${
    hasLabel && inlineLabel && !inlineSplit
      ? `<text class="value" x="${textX}" y="${valueY}" text-anchor="${anchor}">
  <tspan fill="${labelColor}" font-weight="500" font-size="${labelFontSize}px">${inlineLabelText}${inlineLabelText ? ' ' : ''}</tspan><tspan fill="${valueColor}">${valueText}</tspan>
</text>`
      : `<text class="value" x="${textX}" y="${valueY}" text-anchor="${anchor}">
  ${valueLines.map((line, idx) => `<tspan x="${textX}" dy="${idx === 0 ? 0 : valueLineHeight}">${line}</tspan>`).join('')}
</text>`
  }
</svg>`;

    if (isGitHubCamo && counter.count_mode === 'unlimited') {
      res.set('Cache-Control', 'max-age=0, no-cache, no-store, must-revalidate');
    } else if (!isGitHubCamo) {
      res.set('Cache-Control', 'no-store');
    }
    return res.send(svg);
  });
}

module.exports = registerEmbedRoutes;

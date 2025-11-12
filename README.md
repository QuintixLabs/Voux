# Voux Counter Service

Voux is a self-hosted view counter you can embed on any site. Each counter increments only once per visitor IP (unless you set a cooldown window), and the output HTML uses predictable classes so anyone can override the styling.

## Features

- JSON API + dashboard to create counters and fetch their metadata.
- One-line `<script async src="...">` embed; wrap it with your own element (e.g. `<span class="counter-widget">…</span>`) when you need classes for styling.
- SQLite storage (lives in `data/counters.db`) so you can run it entirely on your own machine.
- Separate `hits` table tracks the IP + last-hit timestamp used for deduplication.

## Getting started

```bash
npm install
cp .env.example .env
# edit .env and set ADMIN_TOKEN to something secret
npm run dev
# open http://localhost:8787
```

For production or when running on your Arch host:

```bash
npm install --production
npm start
```

## Configuration

Environment variables (used as defaults the first time you run Voux). After the service starts you can tweak the same
options from `/settings.html` without editing `.env`.

| Name | Default | Description |
| ---- | ------- | ----------- |
| `PORT` | `8787` | HTTP port |
| `PUBLIC_BASE_URL` | derived from request | Force embed URLs to use a specific origin (e.g. `https://counter.example.com`) |
| `ADMIN_TOKEN` | `unset` | Required secret for admin APIs and the `/admin.html` dashboard |
| `PRIVATE_MODE` | `false` | Initial value for whether counter creation is admin-only |
| `ADMIN_PAGE_SIZE` | `20` | How many counters to show per page on `/admin.html` |
| `SHOW_PUBLIC_GUIDES` | `true` | Initial value for showing the public guide cards |
| `ADMIN_TOKEN` | `unset` | When set, `GET /api/counters` requires header `x-voux-admin: <token>` |

SQLite lives in `data/counters.db`. Back it up occasionally if you care about the numbers.

When `PRIVATE_MODE=true`, the public builder hides the “Generate counter” form and all creation/deletion happens through `/admin.html` with your admin token.

## API quick reference

- `GET /api/config` – returns `{ privateMode, adminPageSize }` so UIs know how to behave.
- `POST /api/counters` – body: `{ "label": "Blog Views", "startValue": 25, "ipCooldownHours": "never" }` (requires `X-Voux-Admin` when `PRIVATE_MODE` is `true`).
- `GET /api/counters?page=1&pageSize=20` – paginated list (admin only).
- `GET /api/counters/:id` – metadata and embed snippet for a specific counter.
- `GET /embed/:id.js` – script users place on their site.
- `DELETE /api/counters/:id` – remove one counter (admin only).
- `DELETE /api/counters` – remove every counter (admin only).
- `GET /api/settings` – current runtime config (admin only).
- `POST /api/settings` – toggle private mode or guide cards (admin only).
- Admin dashboard: open `/admin.html`, paste your admin token, and manage counters through the UI (includes pagination controls).

If `ADMIN_TOKEN` is set, include `X-Voux-Admin: <token>` when calling any admin endpoint.

Use the browser dashboard at `/admin.html` for a token-protected UI to list and delete counters.
When `PRIVATE_MODE=true`, that dashboard is also where you create new counters.

### Styling embeds

Default embed snippet:

```html
<script async src="https://your-host/embed/abc123.js"></script>
```

Wrap it yourself when you need styling:

```html
<span class="counter-widget">
  <script async src="https://your-host/embed/abc123.js"></script>
</span>
```

When the script runs it replaces the inner script with the label/value spans, so you can target them with CSS:

```css
.counter-widget {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 0.45rem;
  font-family: 'Space Grotesk', 'Inter', sans-serif;
  letter-spacing: 0.15em;
  text-transform: uppercase;
}

.counter-widget__label {
  opacity: 0.65;
}

.counter-widget__value {
  font-weight: 700;
}
```

Leave `label` empty when creating a counter if you only want the bare number.

### Clearing IP dedupe data

The `hits` table only stores `counter_id`, `ip`, and the last timestamp for deduplication. To wipe it (for privacy or to reset the cooldown), run:

```bash
npm run clear-hits
```

Counters remain untouched; only the IP records used for dedupe are removed.
### Settings dashboard

Visit `/settings.html` (authenticate with the admin token) to toggle private mode or the public guide cards at runtime.
Changes persist to `data/config.json`.

### Counting modes

- `"unique"` – each IP can increment once.
- `"unlimited"` – every visit increments (no dedupe).

Counters store this per ID, and the admin dashboard lists the mode for each counter.

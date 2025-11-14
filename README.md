<h1 align="center">
  <a href="http://voux.fr0st.xyz" target="_blank"><img src="https://github.com/QuintixLabs/Voux/blob/master/public/assets/banner-2.png" alt="Voux" width="900"></a>
</h1>
<p align="center"><strong>Simple Free & Open Source Hit Counter for Blogs and Websites</strong></p>


<p align="center">
<a href="#-features">Features</a> •
  <a href="#-getting-started">Getting Started</a> •
<a href="#-clearing-ip-dedupe-data">Clearing IP dedupe data</a> •
<a href="#-counting-modes">Counting modes</a>
</p>

## ✨ Features

- JSON API + dashboard to create counters and fetch their metadata.
- One-line `<script async src="...">` embed; wrap it with your own element (e.g. `<span class="counter-widget">…</span>`) when you need classes for styling.
- SQLite storage (lives in `data/counters.db`) so you can run it entirely on your own machine.
- Separate `hits` table tracks the IP + last-hit timestamp used for deduplication.
- Admin dashboard has pagination, search, inline edits for label/value, optional cooldowns for every-visit counters, and private notes so you can tag each counter.
- Runtime settings let you toggle private mode, hide/show public guides, and choose the default counting mode for everyone using your instance.
- Instance owners can allow/disallow each counting mode and bulk-delete all counters that use a specific mode.

## 🚀 Getting started

Make sure you are running Node.js 22 (the version we test with). If you use [fnm](https://github.com/Schniz/fnm):

```bash
fnm install 22
fnm use 22
node -v
```

Then install and start Voux:

```bash
npm install
cp .env.example .env
# edit .env and set ADMIN_TOKEN to something secret
npm run dev
# open http://localhost:8787
```

For production or when running on your machine:

```bash
npm install --production
npm start
```

## ⚙️ Configuration

Environment variables. You can tweak some of these options later from `/settings.html` without editing `.env`.


| Name | Default | What it does |
| ---- | -------- | ------------ |
| `PORT` | `8787` | The web server port number. |
| `PUBLIC_BASE_URL` | based on request | Lets you set a fixed site URL (like `https://counter.yourdomain.com`). |
| `ADMIN_TOKEN` | `unset` | A secret key needed to access admin tools and the `/admin.html` page. |
| `PRIVATE_MODE` | `false` | If `true`, only admins can create new counters. |
| `ADMIN_PAGE_SIZE` | `5` | How many counters show on each page in the admin panel. |
| `SHOW_PUBLIC_GUIDES` | `true` | Controls if public guide cards are shown on the main page. |
| `DEFAULT_ALLOWED_MODES` | `unique,unlimited` | Comma-separated list of modes to allow (`unique`, `unlimited`). This just seeds the runtime setting; you can change it later in the dashboard. |

SQLite lives in `data/counters.db`. Back it up occasionally if you care about the numbers (or download a JSON backup from `/settings.html`). If you delete the DB file, Voux creates a fresh empty one on the next start, but all counters are wiped unless you restore from a backup.

When `PRIVATE_MODE=true`, the public builder hides the “Generate counter” form and all creation/deletion happens through `/admin.html` with your admin token.
You can choose which counting modes are available (unique vs every visit) at any time from `/settings.html`; only the allowed modes show up when users generate counters, and the admin dashboard can bulk-delete all counters that belong to a given mode.

## 🧩 API quick reference

- `GET /api/config` – tells the UI what's enabled: `{ privateMode, showGuides, allowedModes, defaultMode, adminPageSize }`.
- `POST /api/counters` – create a counter (admin token required when private mode is on). Body at minimum: `{ "label": "Blog Views", "startValue": 0, "mode": "unique" }`.
- `GET /api/counters?page=1&pageSize=20&mode=unique` – paginated list of counters (admin only). Pass `mode=unique` or `mode=unlimited` to filter by counting mode.
- `GET /api/counters/:id` – fetch a single counter plus its embed snippet (public; notes are omitted).
- `GET /embed/:id.js` – the script you drop into your site.
- `DELETE /api/counters/:id` – delete a single counter (admin only).
- `DELETE /api/counters?mode=unique` – delete every counter that uses the given mode (admin only). Omit `mode` to delete everything.
- `PATCH /api/counters/:id` – edit a counter's label, value, or note (admin only).
- `POST /api/counters/:id/value` – set a counter's value directly (admin only).
- `GET /api/settings` – fetch the current runtime config (admin only).
- `POST /api/settings` – update runtime flags (private mode, guide cards, allowed modes, etc.).
- `GET /api/counters/export` – download every counter as JSON (admin only).
- `POST /api/counters/import` – restore counters from a JSON backup (admin only).

Every admin request needs the `X-Voux-Admin: <token>` header. For day-to-day management, just visit `/admin.html`, sign in once, and use the dashboard (it already calls these endpoints under the hood).

### 🎨 Styling embeds

Styling your counter with **Voux** is super simple. All you need to do is wrap your counter script inside an element. We'll use a `<span>` in this example:

```html
<span class="counter-widget">
  <!---------------------replace this with urs--------------------->
  <script async src="https://your-domain/embed/abc123.js"></script>
</span>
```

When the script runs it replaces the inner script with the label/value spans, so you can target them with CSS:

```css
.counter-widget {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
  color: black;
  font-weight: 600;
  font-size: 3rem;
  font-family: system-ui, sans-serif;
}
```
And that's it. Your counter is now styled and ready to use. You can change the font, colors, or layout any way you like.

### 🧹 Clearing saved IPs

Voux keeps a simple list of "which IP hit which counter, and when" so it can avoid double-counting unique visitors. To wipe that list (for privacy or to give everyone a fresh start), run:

```bash
npm run clear-hits
```

This keeps your counters and their values. It only clears the saved IP/timestamp pairs so future visits count again.

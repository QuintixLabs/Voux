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

## 🚀 Getting started

Make sure you are running **Node.js** `22` (the version we test with). If you use [fnm](https://github.com/Schniz/fnm):

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

SQLite lives in `data/counters.db`. Back it up occasionally if you care about the numbers.

When `PRIVATE_MODE=true`, the public builder hides the “Generate counter” form and all creation/deletion happens through `/admin.html` with your admin token.

## 🧩 API quick reference

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

### 🧹 Clearing IP dedupe data

The `hits` table only stores `counter_id`, `ip`, and the last timestamp for deduplication. To wipe it (for privacy or to reset the cooldown), run:

```bash
npm run clear-hits
```

Counters remain untouched; only the IP records used for dedupe are removed.

### 🧮 Counting modes

- `"unique"` – each IP can increment once.
- `"unlimited"` – every visit increments (no dedupe).

Counters store this per ID, and the admin dashboard lists the mode for each counter.

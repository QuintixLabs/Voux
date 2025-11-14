<h1 align="center">
  <a href="http://voux.fr0st.xyz" target="_blank"><img src="https://github.com/QuintixLabs/Voux/blob/master/public/assets/banner-2.png" alt="Voux" width="900"></a>
</h1>
<p align="center"><strong>Simple Free & Open Source Hit Counter for Blogs and Websites</strong></p>


<p align="center">
<a href="#-features">Features</a> •
  <a href="#-self-hosting-voux">Self hosting Voux</a> •
<a href="#-configuration">Configuration</a> •
<a href="#-api-quick-reference">API quick reference</a> 
<!--<a href="#-styling-embeds">Styling embeds</a> •
<a href="#-clearing-saved-ips">Clearing saved IPs</a>--->
</p>

## ✨ Features

- Generate counters easily and embed them with one `<script>`.
- Data lives in `data/counters.db` or a JSON backup.
- Admin UI handles search, pagination, inline edits, notes, mode filters, and auto-refreshing stats.
- Toggle the instance between `public/private` however you like.

So yeah... it's pretty good `:)`

## 🏡 Self hosting Voux

First, download Voux and enter the project folder:
```bash
git clone https://github.com/QuintixLabs/Voux.git
cd Voux
```

Make sure you are running `Node.js 22`. If you use [fnm](https://github.com/Schniz/fnm). :

```bash
fnm install 22
fnm use 22
node -v
```

## 1. Install Voux
Use one of these:

```bash
npm install                # normal install
npm install --production   # for production installs
```

## 2. Create your .env file

```bash
cp .env.example .env
```

Open `.env` and set your settings.
This is where you configure your admin token, site URL, port, and other options.
You must set `ADMIN_TOKEN` to something secret before running the server.

## 3. Start Voux
**Development (auto-reload) :**
```bash
npm run dev
```

**Production:**
```bash
npm start
```

By default, both commands run at:
```
http://localhost:8787
```

You can change this by setting the **PORT** value in `.env`.

## 🔧 Configuration

Environment variables. You can tweak some of these options later from `/settings.html` without editing `.env`.


| Name | Default | What it does |
| ---- | -------- | ------------ |
| `PORT` | `8787` | The web server port number. |
| `PUBLIC_BASE_URL` | based on request | Lets you set a fixed site URL (like `https://counter.yourdomain.com`). |
| `ADMIN_TOKEN` | `unset` | A secret key is needed to access admin tools and the `/admin.html` page. |
| `PRIVATE_MODE` | `false` | If `true`, only admins can create new counters. |
| `ADMIN_PAGE_SIZE` | `5` | How many counters show on each page in the admin panel. |
| `SHOW_PUBLIC_GUIDES` | `true` | Controls if public guide cards are shown on the main page. |
| `DEFAULT_ALLOWED_MODES` | `unique,unlimited` | Comma-separated list of modes to allow (`unique`, `unlimited`) for counters. You can change it later in the dashboard. |

SQLite lives in `data/counters.db`. Back it up occasionally if you care about the numbers (or download a JSON backup from `/settings.html`). If you delete the DB file, **Voux** creates a fresh empty one on the next start, but all counters are wiped unless you restore from a backup.

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

#


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

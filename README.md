# Sylvain Leupen — DTS Bosbaan live tracker

A tiny, database-free public timing viewer for Sylvain Leupen at DTS Bosbaan on 26 September 2026.

The server-side endpoint discovers the event and athlete from public MSS Live and Sporthive sources. It does not contain a fixed event ID, race ID, participant ID, or bib number. Browser requests go through the endpoint because both upstream providers block cross-origin browser access.

## Run locally

Node.js 20 or newer is required.

```sh
npm run dev
```

Open `http://localhost:4173`.

## Verify

```sh
npm test
npm run check
```

## Deploy

- **Netlify:** import this directory. `netlify.toml` publishes `public/` and maps `/api/tracker` to the included function.
- **Vercel:** import this directory. Vercel serves `public/` and detects `api/tracker.mjs` automatically.

No environment variables, account credentials, API keys, or database are needed.

See [RESEARCH.md](./RESEARCH.md) for the endpoint research, verified requests, CORS behaviour, update model, and known limitations.

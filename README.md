# ClefCraft Frontend

Angular 22 client for ClefCraft: boards, calendar, comments and notifications. It talks to the
ASP.NET Core API in the `ClefCraft-Backend` repo.

## Prerequisites

- **Node.js 24** (24.15.0 or a later 24.x, the Node 24 range Angular 22 supports; CI uses Node 24)
  with npm.
- The **backend API running locally**. See the backend README for its setup, including the
  development accounts and demo data.

## Setup

```bash
npm ci
```

## Run

```bash
npm start
```

This runs `ng serve` on `http://localhost:4200/` and reloads on changes. The API's CORS policy
allows this origin.

The API address is set in `src/environments/environment.ts`:

```ts
apiUrl: 'https://localhost:7287/api'
```

That is the backend's HTTPS launch profile. The browser must trust the ASP.NET Core development
certificate, or every API call fails. On the backend machine, run once:

```bash
dotnet dev-certs https --trust
```

`src/environments/environment.prod.ts` (used by `ng build`) assumes the API is served from the same
origin under `/api`; there is no deployment target yet.

## Test

```bash
npm test
```

This runs the Karma/Jasmine unit tests in watch mode. For a single headless run, as CI does:

```bash
npx ng test --watch=false --browsers=ChromeHeadless
```

## End-to-end smoke tests

A Playwright smoke suite in `e2e/` covers sign-in, token refresh and sign-out, the theme toggle,
board drag, the @mention and reminder toasts, the calendar (create, drag, resize, recurrence edit)
and screenshot comparisons of the calendar, the calendar dialog, the board and the item dialog.

Before the first run, install the browser once:

```bash
npx playwright install chromium
```

Each run needs:

- The **API running on its `https` launch profile** (`https://localhost:7287`) with the normal token
  lifetimes. The setup fails if access tokens last less than 10 minutes, for example when the API
  was started with short test lifetimes.
- `ng serve` on `http://localhost:4200`. Playwright starts it if it isn't running and reuses it if
  it is.

The AI attendance service doesn't need to run; the visual tests fix the score they show.

```bash
npm run e2e                          # the whole suite
npx playwright test calendar.spec.ts # one spec file (the setup still runs first)
npm run e2e:update-snapshots         # regenerate the screenshot baselines
npm run e2e:report                   # open the HTML report of the last run
```

Things to know:

- **Each run registers 4 new users** and creates boards, items, comments and events for them in the
  development database (`clefcraft_db`). Nothing is cleaned up.
- **Start runs at least a minute apart**, single-file runs included. Login and register are limited
  to 10 requests per minute per IP, and one run makes up to 8 of them.
- **The screenshot baselines** (`e2e/visual.spec.ts-snapshots/*-smoke-win32.png`) were made on
  Windows, and Playwright only compares against baselines for the same platform. After
  `npm run e2e:update-snapshots`, look at every changed image before committing it.
- **The calendar-dialog baseline will change** when the AI attendance feature is replaced (step 6 of
  the backend's `docs/PLAN.md`). Regenerate it then, and accept the difference deliberately.

> **Backend state.** The suite and its baselines were last verified against backend branch
> `test-n552vx`, commit `7d4d2f8`, with the frontend on Angular 22. Update this line whenever the
> baselines are regenerated, so a later baseline difference can be traced to a backend change.

## Build

```bash
npx ng build
```

The output goes to `dist/`.

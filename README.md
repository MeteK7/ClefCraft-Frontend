# ClefCraft Frontend

Angular 18 client for ClefCraft: boards, calendar, comments and notifications. It talks to the
ASP.NET Core API in the `ClefCraft-Backend` repo.

## Prerequisites

- **Node.js 20** (20.11.1 or later, as Angular 18 requires; CI uses Node 20) with npm.
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

## Build

```bash
npx ng build
```

The output goes to `dist/`.

# Deploy To GitHub Pages

This app is already a static site, so GitHub Pages is a straightforward way to host it on a real URL for Mac, iPad, and iPhone.

## What is already set up

- GitHub Actions workflow:
  - `.github/workflows/deploy-pages.yml`
- `.nojekyll` so Pages serves the site as plain static files
- PWA manifest uses a relative app id:
  - `manifest.webmanifest`

## 1. Enable GitHub Pages in the repository

In GitHub:

1. Open the repository:
   - `RBG-AI26/performance-calculators`
2. Go to `Settings`
3. Go to `Pages`
4. Under `Build and deployment`, choose:
   - `Source: GitHub Actions`

## 2. Push this project to `main`

The workflow deploys on:

- pushes to `main`
- manual `workflow_dispatch`

Once pushed, GitHub will build and publish the site automatically.

## 3. Find the Pages URL

For this repository, the Pages URL will typically be:

```text
https://rbg-ai26.github.io/performance-calculators/
```

After the workflow completes, open that URL and confirm the app loads.

## 4. Update Supabase auth URLs

In Supabase:

1. Go to `Authentication`
2. Go to `URL Configuration`
3. Set:

`Site URL`
```text
https://rbg-ai26.github.io/performance-calculators/
```

4. Add these `Redirect URLs`

```text
https://rbg-ai26.github.io/performance-calculators/**
http://127.0.0.1:3000/**
http://localhost:3000/**
```

Keep the local URLs if you still want local testing.

## 5. Test sync

1. Open the hosted Pages URL on the Mac
2. Sign in through `Scenario Sync`
3. Save a named scenario
4. Click `Sync Now`
5. Open the same Pages URL on the iPad
6. Sign in with the same email
7. Click `Sync Now`

The same named scenarios should then appear on both devices.

## Notes

- `sync-config.js` is intentionally public and contains only the Supabase project URL and publishable key.
- Do not place the Supabase secret key in this app.
- After deployment updates, close and reopen the installed PWA once if an old service worker shell is still showing.

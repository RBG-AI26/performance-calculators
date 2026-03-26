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

## 4. Configure Dropbox OAuth redirect URIs

In the Dropbox App Console for your app:

1. Open your app
2. Go to the OAuth / Redirect URI section
3. Add these redirect URIs:

```text
https://rbg-ai26.github.io/performance-calculators/
http://127.0.0.1:3000
http://localhost:3000
```

If you do not need local testing, you can keep only the GitHub Pages URL.

## 5. Add the Dropbox app key to the app

Open:

- `sync-config.js`

Set:

```js
window.SYNC_CONFIG = window.SYNC_CONFIG || {
  dropboxAppKey: "YOUR_DROPBOX_APP_KEY",
  dropboxSyncFilePath: "/performance-calculators-scenarios.json",
};
```

Do not place a Dropbox app secret in this app.

## 6. Test sync

1. Open the hosted Pages URL on the Mac or iPad
2. Click `Connect Dropbox`
3. Authorize the app in Dropbox
4. Click `Push to Dropbox` to upload your local scenarios
5. Open the same hosted Pages URL on the other device
6. Click `Connect Dropbox`
7. Click `Pull from Dropbox`

The same named scenarios should then appear on both devices.

## Notes

- `sync-config.js` is intentionally public and contains only the Dropbox app key and sync file path.
- The app stores one shared Dropbox sync bundle:
  - `/performance-calculators-scenarios.json`
- After deployment updates, close and reopen the installed PWA once if an old service worker shell is still showing.

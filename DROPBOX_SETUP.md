# Dropbox Sync Setup

This app now uses Dropbox for cross-device scenario sync.

## 1. Create a Dropbox app

In the Dropbox App Console:

1. Click `Create apps`
2. Choose:
   - `Scoped access`
   - `App folder`
3. Give the app a name

`App folder` is recommended here because the sync file can stay isolated from the rest of your Dropbox.

## 2. Enable the required scopes

In your Dropbox app settings, enable these scopes:

- `account_info.read`
- `files.content.read`
- `files.content.write`

## 3. Add redirect URIs

Add the URLs you want to use to connect Dropbox:

```text
https://rbg-ai26.github.io/performance-calculators/
http://127.0.0.1:3000
http://localhost:3000
```

If you only use the hosted app, the GitHub Pages URL is enough.

## 4. Copy the app key into the app

Open:

- `sync-config.js`

Paste your Dropbox app key:

```js
window.SYNC_CONFIG = window.SYNC_CONFIG || {
  dropboxAppKey: "YOUR_DROPBOX_APP_KEY",
  dropboxSyncFilePath: "/performance-calculators-scenarios.json",
};
```

Do not place a Dropbox app secret in this app.

## 5. How sync works

- `Connect Dropbox`
  - signs this device into Dropbox sync
- `Push to Dropbox`
  - uploads your current named scenarios bundle
- `Pull from Dropbox`
  - downloads the bundle and merges it with local scenarios
- `Disconnect`
  - removes the Dropbox sync session from this device

Merge rule:
- for the same scenario name, the most recent `savedAt` wins

## 6. Sync file

The app stores one shared JSON bundle in Dropbox:

```text
/performance-calculators-scenarios.json
```

You can change that path in `sync-config.js` if you want a different filename.

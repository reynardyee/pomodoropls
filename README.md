# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.

## Deploying to GitHub Pages

The `main` branch is built and deployed to GitHub Pages by the workflow in `.github/workflows/deploy.yml`.
In the repository settings, set **Pages → Build and deployment → Source** to **GitHub Actions**.
The Vite base path is configured for this repository's project site at `/pomodoropls/`.

The always-on-top mini-player renders its image and timer to a canvas-backed video and uses the browser's native video Picture-in-Picture API. It is available on desktop in browsers that support video Picture-in-Picture, and intentionally hidden on mobile.

## Coffee rewards and timer sounds

The timer awards 100 coffee beans when a Pomodoro of at least 25 minutes completes. Each completed Pomodoro earns at most 100 beans, regardless of its length. Short and long breaks earn no beans and are not saved as study sessions, and focus time from unfinished sessions does not carry over. The coffee-bean balance is saved in the current browser. Timer settings include three synthesized ringtone options and an adjustable alarm volume, with a preview button.

The editable study-status badge appears above the timer and saves its label and color in the current browser. At the end of a completed Pomodoro, add a reflection to save the session. Open **Completed study sessions** in the background menu to review each session's date, time, focus duration, status, and reflection; this history is stored in the current browser.

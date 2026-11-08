# Deploy Strength Tracker to GitHub Pages

The production build is configured for this repository's project-site path:

`https://vadimkqa.github.io/strength-tracker/`

This is the expected URL after deployment, not a claim that the site is already published. Do not change the repository name or use a custom domain without updating Vite's base and the PWA scope/start URL/id together.

## Enable deployment

1. Review and merge the deployment pull request into `main`. Existing workout UI, training logic and storage code are unchanged.
2. In **vadimkqa/strength-tracker → Settings → Pages**, set **Build and deployment → Source → GitHub Actions**. You need repository administration access. GitHub Pages must be available for the repository's visibility/account plan.
3. In **Actions**, enable workflows if GitHub asks. The repository/organization must allow the official `actions/checkout`, `actions/setup-node`, `actions/upload-pages-artifact` and `actions/deploy-pages` actions.
4. Open **Actions → Deploy GitHub Pages**. The merge/push to `main` triggers a build and deployment. If Pages was enabled afterward, select **Run workflow** on `main` to deploy again.
5. Wait for both **build** and **deploy** jobs to succeed. The deployment job's environment URL and **Settings → Pages** show the actual published URL. If the `github-pages` environment has approval rules, approve that deployment through GitHub.

The workflow uses Node 24, `npm ci`, `npm test`, and `npm run build`, then uploads only `dist/`. Pull requests to `main` run unit tests and the production build but do not deploy. Deployments run only from `main`; the deploy job has `pages: write` and `id-token: write` permissions. No personal access token, AI key, paid service, login or backend is required.

## Install on iPhone

1. Open the published HTTPS URL in **Safari** and wait for the initial online load to finish.
2. Tap **Share → Add to Home Screen**, enable **Open as Web App** if shown, then tap **Add**.
3. Launch Strength Tracker from its Home Screen icon. Open it online once to finish caching, then verify that Train and the workout images load with Airplane Mode enabled.
4. Keep periodic JSON exports in Files or another safe location. PWA installation/offline caching does not protect against browser storage deletion or device loss.

## Transfer your training data safely

The deployment does not rename or clear the IndexedDB database or legacy localStorage key. Data already stored on the same origin remains available, and the existing v1 migration is unchanged.

However, localhost on your Mac, GitHub Pages, Safari and an installed iPhone PWA can have separate device/origin/storage contexts. There is no server sync, so existing Mac data cannot appear on the phone automatically.

- Before changing hosts or devices, open the current working app on your Mac and use **Settings → Export JSON backup**.
- Transfer that JSON file securely to the iPhone, for example through Files/AirDrop.
- Install/open the Pages PWA, then use **Settings → Restore & merge backup** inside that installed app. Review the restore confirmation. If Safari and the installed PWA have separate storage, restore inside the PWA you intend to use.
- Verify history, PRs, imported rotation/templates and any active workout before retiring the original installation. Keep the original app/site storage and exported file until verified. Do not clear storage or uninstall the old PWA as a troubleshooting step.

The backup contains the existing state, including imported templates/rotation, history and active-workout data. Restore retains the app's current merge behavior; this deployment changes no training or persistence code.

## Verify locally

```sh
npm ci
npm test
npm run build
npm run preview -- --port 4173 --strictPort
```

Open the printed preview address **including `/strength-tracker/`** on the same machine. In another terminal, `npm run test:e2e` runs all mobile Chromium browser checks against that server, including `tests/pages.spec.ts` for manifest/icon URLs, exact worker scope, offline reload, offline images/navigation and preserved history. Chromium defaults to `/usr/bin/chromium` in the cloud; use the existing `CHROMIUM_PATH` override on other machines.

The UI uses in-page tabs, not separate pathname routes, so navigation remains at `/strength-tracker/`. No server-side routing or custom 404 redirect is needed. The worker is served at `/strength-tracker/sw.js` and scopes to `/strength-tracker/`; manifest id, scope and start URL use the same prefix. Photos and icons are bundled locally and precached along with the production JS/CSS/HTML.

## Troubleshooting

- **404 before the first deployment:** confirm Source is GitHub Actions, a deployment on `main` completed, and the URL includes `/strength-tracker/` with its trailing slash.
- **Blank page or missing images:** inspect the build/deploy logs and asset requests. The root `/` of `vadimkqa.github.io` is not the app's project path.
- **Build passes, deployment fails:** inspect Pages availability, repository action restrictions, environment approvals and Pages configuration. A local successful build does not establish a successful hosted deployment.
- **Old version after an update:** finish/safely save an active workout and export a backup, then close/reopen the PWA online to allow the new scoped service worker/assets to activate. Do not erase IndexedDB or website data.

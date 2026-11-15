# Graphite & Muted Lavender

Presentation-only refresh: graphite background `#101114`, surfaces `#1B1C21`, borders `#33313A`, lavender `#A695C2`, primary text `#F0EFF2`, secondary text `#9996A2` and completed states `#83AF9B`. Primary controls use dark text for readable contrast. Muted warning/error colors retain their meaning.

Removed colored glows and the achievement-frame radial gradient. Preserved the existing layout, logo assets, workout photographs, achievement originals and image treatments. No application logic, stored data, import behavior, timers or streak calculations changed. Browser/PWA launch colors match the new background.

## iPhone-sized screenshots

These are Chromium mobile emulation captures of the production build, not physical iPhone captures. The existing streak fixture provides representative history and artwork. Reproduce with `npx playwright test tests/graphite-theme.spec.ts` after building.

| Screen | 390 × 844 | 375 × 667 |
| --- | --- | --- |
| Home | [View](screenshots/graphite-lavender/home-390.png) | [View](screenshots/graphite-lavender/home-375.png) |
| Strength Streak | [View](screenshots/graphite-lavender/streak-390.png) | [View](screenshots/graphite-lavender/streak-375.png) |
| Progress | [View](screenshots/graphite-lavender/progress-390.png) | [View](screenshots/graphite-lavender/progress-375.png) |
| Settings | [View](screenshots/graphite-lavender/settings-390.png) | [View](screenshots/graphite-lavender/settings-375.png) |
| Active workout | [View](screenshots/graphite-lavender/workout-390.png) | [View](screenshots/graphite-lavender/workout-375.png) |

The theme tests verify the background, navigation, primary control contrast, absence of card glow, manifest colors and horizontal fit. Existing branding checks now expect the requested lavender wordmark accent; their layout, asset and persistence checks remain intact.

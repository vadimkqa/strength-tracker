# Approved streak artwork

The source is the user's **Streak Achievements.zip**. Every numbered PNG was copied byte-for-byte; no artwork was generated, converted, resized, cropped, redrawn, recolored, recompressed or stripped of metadata. The ZIP uses uppercase `.PNG` extensions, retained for case-sensitive GitHub Pages paths. macOS resource forks and `.DS_Store` files are excluded.

| File | Display artwork | Existing milestone ID | Qualifying weeks |
| --- | --- | --- | --- |
| 01.PNG | Empty dumbbell | basic | 0 |
| 02.PNG | Dumbbell with 1 plate per side | first-plates | 2 |
| 03.PNG | Dumbbell with 2 plates per side | growing | 4 |
| 04.PNG | Empty barbell | heavy | 6 |
| 05.PNG | Barbell with 1 plate per side | barbell | 8 |
| 06.PNG | Barbell with 2 plates per side | double | 10 |
| 07.PNG | Black barbell with 3 plates per side | triple | 12 |
| 08.PNG | Silver metallic barbell | silver | 16 |
| 09.PNG | Golden barbell | gold | 24 |
| 10.PNG | Diamond barbell | diamond | 36 |
| 11.PNG | Purple crystal barbell | crystal | 52 |
| 12.PNG | Secret unlocked red winged pose | Separate secret view | Verified longest streak ≥52 |
| 13.PNG | Secret locked chained question mark | Separate secret view | Verified longest streak <52 |

The one-/two-plate barbell mapping is the corrected mapping, confirmed against the actual ZIP images. The ordinary progression still has **11 levels**. The two secret images are states of **one separate achievement**, not two additional progression levels.

Existing milestone IDs and unlock thresholds are unchanged. Labels are presentation metadata so existing award records remain valid. Secret state is derived from the existing verified history report's longest consecutive streak, not from an unverified imported `valid` award flag. A missed subsequent week does not remove it; corrections to supporting history are rechecked. Neither workout history, calendar rotation, normal streak calculations nor JSON/database schemas change.

Locked UI renders only `13.PNG`, with a generic secret title and alternative text; it includes no hidden pose image or revealing description. A pose celebration requires both a new verified 52-week unlock and a successful database save. Startup/reload does not replay it. Both secret image states and all normal images are precached so an earned reveal also works offline. These are local public PWA assets; the lock controls their appearance in the interface.

`tests/fixtures/streak-originals.json` records the original PNG dimensions and SHA-256 hashes. Unit and production browser tests verify mapping/order, all original hashes, correct Pages paths, image decoding, `object-fit: contain`, offline delivery, secret gating, failed saves, history corrections and backup restoration. Screenshot captures wait for complete PNG decoding to avoid recording partially painted images.

Review screenshots:

- [Home badge](screenshots/approved-streak-home.png)
- [Normal collection](screenshots/approved-streak-collection.png)
- [Locked secret](screenshots/approved-streak-secret-locked.png)
- [Unlocked secret](screenshots/approved-streak-secret-unlocked.png)

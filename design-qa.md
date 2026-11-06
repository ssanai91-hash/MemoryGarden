# Entry screen design QA

Final result: **passed** for the selected entry screen and its settings/identity flow.
Date: 2026-11-06. Source baseline: `5b773d3`.

The approved third portrait mockup was compared at the same 390 × 844 aspect ratio with the rendered implementation. Evidence: [`comparison.jpg`](docs/entry-qa/comparison.jpg), approved source on the left and browser implementation on the right; [`entry-screen-mobile.png`](docs/entry-qa/entry-screen-mobile.png).

| Area | Result |
| --- | --- |
| Layout | Dusk forest/lantern, boy, black curly poodle and fire above a cream sheet with rounded upper corners. Same ordering and two-column controls. |
| Type and colour | Korean title, green heading/CTA, cream background, underlined existing-code action and tiny bottom-right `ver 0.1`. Live form text remains editable/selectable. |
| Requested copy | `강아지`, `고양이`, `남자`, `여자`; default dog selection is black poodle. |
| Mobile fit | Browser checked 390 × 844 and 320 × 568 iframe viewports against the real page. No form overflow: at 320 × 568 the primary button ends at y496 and helper at y546. Short screens reduce the illustration area. |
| Existing identity | Local saved code loads server nickname, gender and companion into settings. Entry waits for the main button in a new tab; only an existing visit in the same tab resumes automatically. Existing-code import first loads settings, then requires another explicit entry press. |
| New identity | Unique server reservation is saved locally before settings. Pending reservation survives response loss/reload; no duplicate registration on retry. |
| Read-only preview | Preview does not create visits/presence, replace another device, or mutate stored prayer/counter/halo state. Explicit entry may update the displayed profile edits. |
| Accessibility | Native labelled input/select/radio controls, visible focus indication, disabled pending submit, status text and semantic fieldsets. |

Checks: `npm test` (27 passed); JS syntax checks; real pinned Three r170 upgrade compatibility test; `git diff --check`.

Known visual differences: generated hero artwork has small differences in character/fire proportions from the approved bitmap; thumbnails reuse existing male/female/cat art. Form geometry, colour and text remain native responsive UI. This is a close implementation rather than a pixel-identical screenshot.

Scope limit: this QA verifies the entry UI and identity protocol. The local preview uses disposable memory-backed profile handlers; no production room data was written. Actual garden WebGL rendering and physical-phone keyboard/system-bar behaviour remain device checks. Existing garden rendering, prayer rules and admin controls are preserved. Prior candle QA is archived at [`docs/candle-design-qa.md`](docs/candle-design-qa.md).

## Scene/admission regression checks (baseline `b025bdf`)

The previous module-level admission await stopped all Three initialization until code allocation/profile loading and submission succeeded. Admission now waits inside its own asynchronous task. Scene construction and the frame loop proceed independently; statue prefetch remains at the start of the page. The entry controller retains its form handlers until admission, so scene startup cannot overwrite retry/import controls. Saved codes are reused; only the same-tab visit resumes automatically; a failed request or failed local save cannot admit a visitor.

Automated: `npm test` covers pending/failed allocation without blocking scene startup, admission/form-handler handoff, saved-visit restore before connecting, saved-code settings, failed local save, same allocation request on retry and importing admin code `99999`. Existing server tests cover the admin welcome and exclusion from ordinary allocation. These are code/controller checks, not a WebGL pixel test.

Actual browser checks to run against a **static-only server**, with no personal/room backend (for example `python3 -m http.server 4173`):

- Clear site storage and open the page. Keep Three.js CDN/static assets reachable. `/personal/allocate` should fail, the entry button should say `다시 시도`, and no room WebSocket should open.
- Check that canvas `#c` has a WebGL 2 context and the garden keeps rendering beneath the entry overlay. For inspection only, temporarily hide `#welcome` in DevTools; the garden should contain scenery, rather than a blank canvas. Restore the overlay afterward. This does not admit a visitor.
- Hold the allocation response pending and repeat the canvas check before the 12-second timeout. Statue preview/HQ downloads should already have started.
- Restore the backend and press retry. Confirm that the allocation request identifier is unchanged, the code is saved before admission, and the existing canvas continues rendering. A first visitor still confirms the settings; a saved identity confirms its settings with the entry button, while a same-tab visit resumes automatically.
- Import `99999` through `새로운 코드로 입장`, check settings, then enter. Confirm `welcome.admin === 1` and that ordinary allocation never returns `99999`.

Browser status for this change: not executed successfully here. Chromium launch was blocked by the execution environment's socket permission restriction, and elevated execution was unavailable. No production deployment or production room writes were performed.

## Implementation follow-up (user-owned verification)

- Main `입장하기` uses the saved code and displayed settings. `새로운 코드로 입장` opens another-code input, with a separate `새 코드 발급받기` action and `내 코드로 돌아가기`. A lookup failure no longer replaces the saved code.
- Automatic admission is limited to a valid saved visit in the same tab; a saved identity in a new tab stays on settings.
- Fixed the admin kick button's out-of-scope `peersById` reference to use the scene's `peers` map, allowing the click handler to reach confirmation and `kick_all` dispatch.
- Per the user's updated instructions, this follow-up implements and commits changes only. Tests, browser/device checks, builds and Cloudflare deployment are assigned to the user and were not run for this follow-up. Earlier results above describe the prior work only.

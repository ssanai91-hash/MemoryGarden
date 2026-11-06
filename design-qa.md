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
| Existing identity | Local saved code loads server nickname, gender and companion into settings; refresh remains on settings until explicit entry. Existing-code import first loads settings, then requires another explicit entry press. |
| New identity | Unique server reservation is saved locally before settings. Pending reservation survives response loss/reload; no duplicate registration on retry. |
| Read-only preview | Preview does not create visits/presence, replace another device, or mutate stored prayer/counter/halo state. Explicit entry may update the displayed profile edits. |
| Accessibility | Native labelled input/select/radio controls, visible focus indication, disabled pending submit, status text and semantic fieldsets. |

Checks: `npm test` (27 passed); JS syntax checks; real pinned Three r170 upgrade compatibility test; `git diff --check`.

Known visual differences: generated hero artwork has small differences in character/fire proportions from the approved bitmap; thumbnails reuse existing male/female/cat art. Form geometry, colour and text remain native responsive UI. This is a close implementation rather than a pixel-identical screenshot.

Scope limit: this QA verifies the entry UI and identity protocol. The local preview uses disposable memory-backed profile handlers; no production room data was written. Actual garden WebGL rendering and physical-phone keyboard/system-bar behaviour remain device checks. Existing garden rendering, prayer rules and admin controls are preserved. Prior candle QA is archived at [`docs/candle-design-qa.md`](docs/candle-design-qa.md).

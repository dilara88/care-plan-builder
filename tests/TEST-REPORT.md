# Care Plan Builder Release Test Report

Date: 16 July 2026  
Production file: `care-plan-builder.html`  
SHA-256: `EF34F97A2A287F5E4D0F612C3EC8EDD3DC6C5037447D16604BA3A46AAA796DED`

This report covers the exact HTML build identified above. The automated suites, real-browser checks and bilingual PDFs were regenerated after the final standards, security, accessibility, documentation and heading title-case changes.

## Summary

| Suite | Passed | Failed | Status |
|---|---:|---:|---|
| Static, data, translation, privacy, security and regression checks | 48 | 0 | Passed |
| English and Turkish functional simulation | 57 | 0 | Passed |
| Staged first-open experience | 6 | 0 | Passed |
| Automated total | 111 | 0 | Passed |
| Chrome release browser check | 1 | 0 | Passed |
| Edge release browser check | 1 | 0 | Passed |
| English PDF pages visually inspected | 7 | 0 | Passed |
| Turkish PDF pages visually inspected | 7 | 0 | Passed |

## Release Hardening Verified

- The document uses `<!doctype html>` and standards mode.
- Static browser and Open Graph titles use **Care Plan Builder** title case.
- Section and plan headings, care-option labels and titled controls follow standard title case in both languages: the first and last words are capitalized and internal minor words stay lowercase (English `for`/`the`/`and`/`of`, Turkish `ve`/`ya da`/`için`). The heading test enforces this convention.
- The bilingual example is explicitly identified as a fictionalized composite household. Its recipient, schedules, duties, shopping guide, meals and blank measurement design are generic, deliberately altered and protected by regression checks against former household details.
- Every CSS custom property is defined, including `--mint`.
- Small faint text and amber notice text meet WCAG AA contrast for their tested backgrounds.
- The MIT copyright owner and embedded font list match the chosen public name and current fonts.
- Fraunces is no longer used or listed as a bundled font.
- The README accurately describes offline glossary translation and preserved unmatched wording.
- Local development and visual-test artifacts are excluded through `.gitignore`.
- At phone width, Shopping Guide items, current-list actions and custom measurement rows reflow within their frames; the 768 px tablet and desktop layouts retain their original row and table presentation.
- The creator credit is centered on the webpage and in both PDF languages.

## Backup Security Coverage

The backup importer now constructs a new whitelisted plan rather than trusting imported objects. Tests verify:

- Required object and array shapes, primitive types and allowed enum values.
- Maximum file size, collection sizes and text lengths.
- Fresh safe numeric IDs for roles, duties, shopping items, meals, tables, columns and rows.
- Remapping of role, coverage, meal-plan and measurement-column references.
- Palette-only role colours.
- Removal of unknown fields.
- Safe rendering of hostile markup and attribute-injection strings.
- Rejection of malformed nested data without replacing the current plan.
- Rejection of oversized files before they are read.
- Continued migration of the legacy free-text coverage format.

## Real-Browser Results

The release browser script opened the final local HTML directly from disk with installed Chrome and Edge.

- Chrome and Edge loaded the app in standards mode and completed bilingual example-plan smoke tests.
- Chrome emulated 390 × 844 mobile and 768 × 900 tablet viewports with no horizontal overflow.
- The 390 px pass opened the Turkish Shopping Guide and Custom Measurement Tables, checked every relevant child against its container, and visually captured the guide, current list and a populated measurement row.
- The 768 px pass explicitly confirmed that shopping items remain rows, measurement tables remain tables and the original module spacing is preserved.
- The English and Turkish example result views remained readable at both tested widths.
- Native disclosure controls toggled from the keyboard.
- A care option could be chosen with Enter.
- Tab order moved logically from a section summary into its first role action.
- Keyboard focus was visibly styled.
- Dialogs exposed a title and description, closed with Escape, trapped Tab within their buttons and restored focus afterward.
- Offline mode was enabled before reload; the complete app reopened with zero HTTP or HTTPS resources.

These are browser viewport emulations, not physical-device tests. A brief real-phone and real-tablet check remains sensible after the public page is live.

## Accessibility Audit

The current fictionalized example plan was inspected through Chrome's accessibility tree with all sections open.

- 356 visible interactive controls were found.
- All 356 had accessible names.
- Main, header and footer landmarks were present.
- The page language was exposed as English during the audit and continues to switch with the interface language.
- One defect was found and corrected during testing: the 21 weekly meal-planner dropdowns now receive bilingual day-and-meal accessible names.
- Dialog labeling, Escape behavior, focus trapping, focus visibility and focus restoration passed.
- Static contrast tests passed for the revised faint and amber text colours.

This provides a useful screen-reader semantic proxy, but it is not a substitute for a short hands-on NVDA or VoiceOver session.

## Current PDF Results

Fresh PDFs were created from the exact release build after loading the complete example plan and closing every screen section first. The test confirmed that printing temporarily opened every section, rendered the complete plan and restored the collapsed screen state afterward.

- English: 7 A4 pages, 437,265 bytes.
- Turkish: 7 A4 pages, 472,626 bytes.
- Browser-generated headers and footers were disabled.
- All 14 pages were opened in Chrome's PDF viewer and visually inspected.
- No content clipping, overlap, distorted glyphs or broken table continuation was found.
- Coverage arrangements and the workload chart appeared in both languages.
- Turkish percentage placement and workload amounts remained correct and readable.
- Shopping tables continued across pages with their headers.
- The blank measurement design contained no values or personal information.
- The bilingual privacy, medical-boundary, creator and copyright footer content was present.
- Creator and copyright lines were centered in both regenerated PDFs.

Current artifacts are stored locally in `visual tests/current-release/` and are excluded from publication by `.gitignore`.

## Environment Limits And Post-Launch Checks

- Firefox was not installed in this Windows environment, so a Firefox smoke test was not possible.
- Safari is not available on Windows. The README no longer promises universal “any modern browser” compatibility.
- A physical mobile/tablet check can be completed after the builder is live; pre-launch browser emulation passed.
- A short real assistive-technology session with NVDA, VoiceOver or equivalent would still add confidence beyond the accessibility-tree audit.

## Test Files

- `care-plan-builder.test.mjs` — source, data, security, privacy, licensing, accessibility-colour and regression suite.
- `functional-simulation.test.mjs` — bilingual state and interaction suite using the actual embedded application functions.
- `staged-entry.test.mjs` — first-open, care-selection and toolbar-visibility regression suite.
- `browser-release-check.mjs` — Chrome/Edge responsive, keyboard, accessibility-tree, offline and PDF release check.
- `TEST-MATRIX.md` — current coverage matrix.

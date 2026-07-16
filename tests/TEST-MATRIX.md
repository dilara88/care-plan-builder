# Care Plan Builder bilingual test matrix

Production file under test: `care-plan-builder.html`

The complete suite is run once in English and once in Turkish, followed by cross-language state tests.

## Interactive suites

1. Staged empty startup, language switching, ten care templates and custom recipient.
2. Independent native Show/Hide controls, context-specific default states, language-state preservation and complete printing from collapsed sections.
3. Day selection, Every day and As needed controls.
4. Role add/edit/cancel/remove, days off and standby availability.
5. Duty add/edit/cancel/remove, workload fields, owner and coverage.
6. Suggestions, add-all, duplicate prevention and clear-all.
7. Coverage gaps and weighted workload transfer to covering roles.
8. Styled alerts and confirmations, including cancel, confirm, Escape and backdrop.
9. Neutral shopping categories, bilingual care-specific opt-in prompts, custom categories, item editing and category moves, all stock states and current list.
10. Non-writing meal prompts, meal editing, shopping integration and all weekly meal slots.
11. Unlimited predefined and explicitly custom measurement tables, date picker, editable titles, columns, rows and values.
12. Complete fictionalized example plan, explicit bilingual privacy disclosure and regression checks against former household details, plus repeated whole-state language switching after edits, including offline manual meal and ingredient terms.
13. JSON export/import, strict field whitelisting, safe regenerated IDs, hostile/malformed/oversized files and legacy migration.
14. Standards-mode doctype, complete CSS variables, accessible colour contrast, font/license metadata and public-name consistency.
15. Web and PDF creator credit, copyright, A4 print layout, footer branding, colours and wrapping.
16. Desktop, 768 px tablet and 390 px mobile browser layouts, keyboard access, focus and dialog semantics.
17. Accessibility-tree names and landmarks, including all 21 weekly meal-plan dropdowns.
18. Privacy: no network requests, no automatic storage and a real-browser offline reload.
19. Exact-build seven-page English and Turkish PDFs generated from fully collapsed screen sections and visually inspected page by page.

## Regression checks

- Turkish percentage sign precedes the number everywhere.
- Care Plan Builder / Bakım Planı Oluşturucu capitalization is preserved.
- Turkish PDF load amounts stay on one line.
- Initial demo has no Nobody yet / Henüz kimse yok workload bucket.
- Full-width introduction, workload explanation and medical notice.
- Every destructive operation requires a styled confirmation.
- Example measurement table contains no values or personal information.
- Ingredients transferred from meals to shopping always begin with a capital letter.

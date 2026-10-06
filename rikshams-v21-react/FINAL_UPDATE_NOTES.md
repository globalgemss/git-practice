# RikshaMS V26.1.12 — Modern Modal & Form System Final

This version standardizes the user-facing dialog/form experience across the system.

## Main changes
- Fixed the root modal bug where `.modal-body` inherited an accidental two-column grid, leaving large empty space on the right.
- Introduced responsive modal sizes: Small, Medium, Large and XL.
- Desktop modals use the available width correctly; sections are full-width with balanced internal columns.
- Tablet dialogs become compact bottom sheets.
- Phone dialogs become keyboard-safe full-screen work surfaces with sticky action footer.
- All fields use consistent 44px controls, readable labels, focus states, spacing and error treatment.
- FormSection and legacy modal sections now share the same modern visual language.
- Add Customer uses a content-sized medium modal.
- Add Vehicle uses a balanced 2-column section layout on desktop and 1-column layout on smaller screens.
- New Enquiry uses balanced two-column sections instead of a narrow left-side strip.
- Receive & Pay transaction form uses a compact large dialog and full-width sections.
- New/Edit Notice has a dedicated form + live preview two-pane layout on desktop and a clean single-column mobile layout.
- Footer buttons now wrap safely without clipping on narrow screens.
- Existing business logic, Supabase operations and workflows are unchanged.

## Backend
No new Supabase migration is required. V26.1.10/V26.1.11 backend remains compatible.

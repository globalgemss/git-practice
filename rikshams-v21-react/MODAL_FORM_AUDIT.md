# Modal/Form Audit — V26.1.12

The source contains 30 `<Modal>` render paths across shared masters, lead/enquiry, orders, dispatch, fleet, customers, finance, access, notices, public forms, slips, audit and agent portal workflows.

The root cause of the large empty right-side space was the legacy global `.modal-body { display:grid; grid-template-columns:1fr 1fr }` rule. V26.1.12 explicitly changes the V26 modal body to a single normal content flow and lets each form own its internal grid.

All dialogs now inherit the same responsive shell, field geometry, section treatment and mobile behavior. Complex forms receive dedicated layouts where required.

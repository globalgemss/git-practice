# V26.1.11 Migration Checklist

- No new SQL migration is required.
- Keep the already-applied V26.1.10 dispatch assignment migration.
- Existing Supabase tables used: orders, jobs, transactions, slips, order_events.
- Test one customer advance, one partial receipt, one final balance receipt, one partner payment and one labour payment.
- Confirm Receipt / Payment Voucher opens from the success dialog.
- Confirm Order Timeline receives the payment event with date/time.

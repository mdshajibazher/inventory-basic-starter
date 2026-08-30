# Approved Sales Invoice Customer Email Design

## Summary

Send a branded customer email only after a sales invoice is approved. The email contains the complete approved product list and a customer-safe PDF attachment. When an approved invoice is edited and approved again, the email also compares the new approved revision with the preceding approved revision.

Delivery is controlled by the existing `customer_sales_invoice_mail_notification_enabled` setting. If the setting is disabled or the current customer has no email address, no customer email is sent. Email delivery failure never rolls back invoice approval.

## User Experience

### First approval

The subject is `Sales Invoice Approved: {reference_no}`. The branded HTML body includes:

- Company branding and customer greeting.
- Invoice reference, invoice date, approval status, and grand total.
- Every current product line with product name/code, variant or batch where applicable, quantity, unit, unit price, discount, tax, and line total.
- A note that the approved PDF is attached.

### Approval after an edit

The subject is `Updated Sales Invoice Approved: {reference_no}`. The body includes the complete current product table followed by a comparison with the last approved revision:

- Added products use a light-green row.
- Removed products remain visible in a light-red, struck-through row.
- Modified products use a light-amber row with before/after values.
- Modified values cover quantity, unit, unit price, discount, tax rate/tax, and line total.
- Previous and new invoice totals are shown together, including subtotal, order discount, coupon discount, order tax, shipping cost, and grand total where changed.

Several edits made while the invoice is pending are combined into one net comparison against the most recent approved revision. Edits made before the first approval still result in a first-approval email, not an update email.

### PDF attachment and download

The A4 PDF uses the approved green visual design and includes company/customer details, approval information, the complete current product table, subtotal, discount, order tax, carrying cost, grand total, amount in words, and customer note.

The customer PDF must never expose `unit_cost`, `total_cost`, line profit, or total profit. The same customer-safe renderer is used by the email attachment and the authorized sales-invoice PDF endpoint, avoiding divergent document content.

## Architecture and Data Flow

### Immutable invoice revisions

Add a `sales_invoice_revisions` table and corresponding model. Each record contains:

- `sale_id` foreign key with cascade delete.
- `revision_number` unsigned integer, unique per sale.
- `kind`: `created` or `updated`.
- `before_snapshot` nullable JSON.
- `after_snapshot` JSON.
- `changes` nullable JSON containing the normalized customer-visible comparison.
- `recipient_email` nullable string, finalized at approval.
- `approved_at`, `queued_at`, `sent_at` nullable timestamps.
- `delivery_status`: `pending`, `skipped`, `queued`, `sent`, or `failed`.
- `failure_message` nullable text and standard timestamps.

Snapshots contain only customer-visible invoice, customer, biller/company, totals, and product-line data. They exclude internal costs and profit. Product lines use stable identity composed from product, variant, batch, and unit identifiers; duplicate identities are compared in deterministic line order so additions, removals, and modifications remain unambiguous.

On creation, create or update the sale's single pending `created` revision after its lines exist. On update:

- If no revision has ever been approved, refresh the pending `created` revision's `after_snapshot`.
- Otherwise, create or refresh one pending `updated` revision. Its `before_snapshot` remains the latest approved snapshot, while `after_snapshot` and `changes` are refreshed after every successful edit.
- Snapshot/revision writes occur inside the same database transaction as invoice writes.

### Approval and delivery

After `ApprovalService::approveSale` commits successfully, finalize the pending revision from the just-approved invoice, capture the current customer email, and evaluate the existing customer-email setting.

- Missing email or disabled setting marks the revision `skipped` without queueing.
- Otherwise, atomically transition the revision from `pending` to `queued` and dispatch one job after commit. The status transition prevents duplicate sends.
- The queued job loads the immutable revision, renders the branded Mailable and customer PDF from `after_snapshot`, sends to `recipient_email`, and records the result in both the revision and the existing `email_logs` table.
- Successful delivery sets `sent`; exceptions set `failed`, preserve the error message, write Laravel error context, and allow normal queue retry behavior.
- Repeated approval requests cannot resend because only pending invoices can be approved and only a `pending` revision can transition to `queued`.

The existing internal `salesInvoiceApproved` notification remains separate and unchanged. The current create-time customer notification remains active for SMS only, preserving `customer_sales_invoice_sms_notification_enabled`; its email branch moves to the approval workflow.

## Components and Interfaces

- A focused snapshot/diff service builds customer-safe immutable data and normalized added/removed/modified changes.
- A revision service owns pending-revision creation, refresh, approval finalization, and idempotent queue dispatch.
- A queued customer-invoice Mailable owns subject selection, branded HTML rendering, and PDF attachment.
- A shared customer PDF renderer returns the PDF bytes and filename for both the Mailable and controller download.
- `RecordNotificationService` remains the integration point invoked by the sales approval controller; its customer approval method delegates revision delivery rather than using `Mail::raw`.

No API request or response shape changes. The existing general-setting field continues to control the feature, so web and mobile settings contracts require only label text to change from “On Create” to “On Approval” where applicable.

## Failure Handling and Operations

- Invoice creation, update, and approval responses are not delayed by SMTP or PDF rendering.
- Queue dispatch happens only after commit, so jobs cannot observe uncommitted invoice data.
- A failed send is logged with sale ID, revision ID, recipient, and exception; no sensitive snapshot is written to Laravel logs.
- Existing deployment requirements apply: configured SMTP, migrated database tables, and an active Laravel queue worker.
- Existing historical approved invoices have no revision baseline. Their first edit captures the currently approved invoice as `before_snapshot`, and their next approval sends a correct update email. Merely deploying the feature does not email historical invoices.

## Test and Acceptance Criteria

- First approval with the setting enabled and a customer email queues exactly one created-invoice Mailable with the correct recipient, subject, product lines, and PDF.
- First approval with a missing email or disabled setting queues nothing and records `skipped`.
- Editing an approved invoice resets it to pending; re-approval queues an updated-invoice email.
- Added, removed, and modified product lines are classified correctly and rendered with green, red/strikethrough, and amber styles.
- Product/amount comparisons exclude all cost and profit fields.
- Multiple pending edits produce one email showing the net difference from the last approved revision.
- Editing before first approval still sends the created-invoice email without a revision comparison.
- PDF output includes customer-visible invoice details and excludes unit cost, total cost, and profit text/values.
- Approval commits even when mail delivery fails; the revision becomes `failed`, the existing email log records the failure, and retrying the queue job cannot create duplicate successful sends.
- Existing internal approval notifications and invoice API responses continue to work.

# Approved Sales Invoice Customer Email Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Email customers a branded, PDF-attached sales invoice after first approval and an accurate visual product/amount comparison after approval of an edited invoice.

**Architecture:** Persist customer-safe before/after invoice snapshots in immutable revision records, update one pending revision through any number of pre-approval edits, and finalize it on approval. After commit, an at-least-once queued job sends a Blade Mailable and a PDF rendered from the approved snapshot, then records delivery without coupling SMTP success to invoice approval. Final-review amendments require transactional finalization under the sale lock, durable outbox recovery, deterministic message identity, and an explicit rare duplicate window after SMTP acceptance but before `sent` persistence.

**Tech Stack:** Laravel 12, PHP 8.2, Eloquent/MySQL, Laravel database queues, Blade Mailables, Barryvdh DomPDF 3.1, PHPUnit 11, React/Next.js, React Native/Expo.

**Spec:** `docs/superpowers/specs/2026-08-30-sales-invoice-customer-email-design.md`

## Global Constraints

- Send customer email only after approval; never on create/update submission.
- Gate both first-approval and updated-approval delivery with `customer_sales_invoice_mail_notification_enabled` and skip a missing customer email.
- Never expose `unit_cost`, `total_cost`, or profit in snapshots, email, PDF, or customer-facing logs.
- Removed lines are light red with strikethrough; added lines are light green; modified lines are light amber with before/after values.
- Collapse multiple pending edits into one net comparison with the most recent approved snapshot.
- SMTP/PDF failure must not roll back or change invoice approval.
- Preserve the existing uncommitted invoice-tax work. Before every commit, inspect `git diff --cached`; stage only task-owned new files and task-owned hunks in already-modified files.

---

### Task 1: Customer-safe snapshot and diff engine

**Files:**
- Create: `inventory-api/app/Services/SalesInvoiceSnapshotService.php`
- Create: `inventory-api/tests/Unit/SalesInvoiceSnapshotServiceTest.php`

**Interfaces:**
- Produces: `SalesInvoiceSnapshotService::snapshot(Sale $sale): array`
- Produces: `SalesInvoiceSnapshotService::diff(array $before, array $after): array`
- Snapshot keys: `schema_version`, `invoice`, `company`, `customer`, `lines`
- Diff keys: `added_lines`, `removed_lines`, `modified_lines`, `changed_totals`

- [ ] **Step 1: Write failing snapshot tests**

Create a focused unit test using Mockery model/relationship doubles. Assert that `snapshot()` returns invoice identity/date/status, current customer/company contact data, customer-visible totals, and normalized lines containing:

```php
[
    'key' => '4:null:null:1:1',
    'product_id' => 4,
    'product_name' => 'Face Wash',
    'product_code' => 'FW-101',
    'variant' => null,
    'batch' => null,
    'unit' => 'pc',
    'qty' => 12.0,
    'unit_price' => 550.0,
    'discount' => 0.0,
    'tax_rate' => 10.0,
    'tax' => 600.0,
    'total' => 6600.0,
]
```

Assert recursively that the serialized snapshot has no `unit_cost`, `total_cost`, or `profit` key. The final key segment is the one-based occurrence count, making duplicate product/variant/batch/unit lines deterministic.

- [ ] **Step 2: Write failing diff tests**

Cover one unchanged line, one added line, one removed line, one modified line, and changed invoice totals. Assert the modified payload is shaped as:

```php
[
    'key' => '4:null:null:1:1',
    'before' => ['qty' => 10.0, 'total' => 5500.0 /* complete old line */],
    'after' => ['qty' => 12.0, 'total' => 6600.0 /* complete new line */],
    'fields' => [
        'qty' => ['before' => 10.0, 'after' => 12.0],
        'total' => ['before' => 5500.0, 'after' => 6600.0],
    ],
]
```

Use strict two-decimal normalization for money and four decimals for quantity. Verify internal cost changes alone cannot appear because those values are absent from snapshots.

- [ ] **Step 3: Run the tests and verify failure**

Run:

```bash
cd inventory-api
php artisan test tests/Unit/SalesInvoiceSnapshotServiceTest.php
```

Expected: FAIL because `SalesInvoiceSnapshotService` does not exist.

- [ ] **Step 4: Implement the snapshot and diff service**

Load these relations when missing:

```php
[
    'customer:id,name,email,phone_number,address,city,state,postal_code,country',
    'biller:id,name,company_name,email,phone_number,address,city,state,postal_code,country',
    'warehouse:id,name',
    'approver:id,name',
    'products.product:id,name,code',
    'products.variant:id,name',
    'products.batch:id,batch_no',
    'products.unit:id,unit_code,unit_name',
]
```

Read company defaults from the latest `GeneralSetting`. Store ISO dates, numeric IDs, display strings, currency `BDT`, all customer-visible invoice totals, notes, and approval metadata. Build line keys from product/variant/batch/unit IDs plus an occurrence counter. Compute customer `unit_price` as `(total + discount) / qty` for inclusive-tax (`tax_method = 2`) lines and `net_unit_price` otherwise, matching the existing invoice resource. In `diff()`, index by key, use `array_diff_key` for additions/removals, and compare only `qty`, `unit`, `unit_price`, `discount`, `tax_rate`, `tax`, and `total` for modifications. Compare `total_price`, `total_discount`, `order_discount`, `coupon_discount`, `order_tax`, `shipping_cost`, and `grand_total` for changed totals.

- [ ] **Step 5: Run the focused tests**

Run the Task 1 test command. Expected: PASS.

- [ ] **Step 6: Commit Task 1**

```bash
git add inventory-api/app/Services/SalesInvoiceSnapshotService.php inventory-api/tests/Unit/SalesInvoiceSnapshotServiceTest.php
git diff --cached --check
git commit -m "feat: build customer-safe sales invoice snapshots"
```

---

### Task 2: Persist and refresh invoice revisions

**Files:**
- Create: `inventory-api/database/migrations/2026_08_30_000002_create_sales_invoice_revisions_table.php`
- Create: `inventory-api/app/Models/SalesInvoiceRevision.php`
- Create: `inventory-api/app/Services/SalesInvoiceRevisionService.php`
- Modify: `inventory-api/app/Models/Sale.php`
- Modify: `inventory-api/app/Actions/Sales/StoreSalesInvoiceAction.php`
- Modify: `inventory-api/app/Http/Controllers/Api/SalesInvoiceController.php`
- Create: `inventory-api/tests/Feature/SalesInvoiceRevisionServiceTest.php`

**Interfaces:**
- Consumes: Task 1 `snapshot()` and `diff()`.
- Produces: `Sale::customerEmailRevisions(): HasMany`
- Produces: `SalesInvoiceRevisionService::syncPending(Sale $sale): SalesInvoiceRevision`
- Produces: revision status constants `pending`, `skipped`, `queued`, `sent`, `failed` and kind constants `created`, `updated`.

- [ ] **Step 1: Write the failing migration/model test**

Assert the migration creates `sales_invoice_revisions` with the exact columns from the design, JSON/timestamp casts work, `revision_number` is unique with `sale_id`, and deleting a sale cascades its revisions. The migration schema is:

```php
$table->id();
$table->foreignId('sale_id')->constrained('sales')->cascadeOnDelete();
$table->unsignedInteger('revision_number');
$table->string('kind', 16);
$table->json('before_snapshot')->nullable();
$table->json('after_snapshot');
$table->json('changes')->nullable();
$table->string('recipient_email')->nullable();
$table->string('delivery_status', 16)->default('pending')->index();
$table->timestamp('approved_at')->nullable();
$table->timestamp('queued_at')->nullable();
$table->timestamp('sent_at')->nullable();
$table->text('failure_message')->nullable();
$table->timestamps();
$table->unique(['sale_id', 'revision_number']);
```

- [ ] **Step 2: Write failing revision lifecycle tests**

Using an in-memory schema fixture, verify:

1. A new pending sale gets revision 1, kind `created`, null `before_snapshot`, and current `after_snapshot`.
2. Re-editing before first approval updates revision 1 instead of inserting another row.
3. After revision 1 has `approved_at`, the next edit creates revision 2, kind `updated`, with revision 1's `after_snapshot` as its immutable baseline.
4. A second pending edit updates only revision 2's `after_snapshot` and `changes`; its baseline stays unchanged.
5. An already-approved historical sale with no revision first captures the pre-edit snapshot as revision 1's baseline before lines are replaced, then refreshes its after snapshot after replacement.

For case 5, define and test `SalesInvoiceRevisionService::beginUpdate(Sale $sale): void`; it no-ops for a never-approved sale and seeds a pending updated revision for an approved legacy sale before mutation.

- [ ] **Step 3: Run tests and verify failure**

```bash
cd inventory-api
php artisan test tests/Feature/SalesInvoiceRevisionServiceTest.php
```

Expected: FAIL for missing migration/model/service.

- [ ] **Step 4: Implement migration, model, relationship, and service**

Give the model guarded fillable fields and casts for snapshots/changes arrays and timestamps. Implement `beginUpdate()` and `syncPending()` inside short database transactions using `lockForUpdate()` on the sale's revision rows. Select the latest finalized revision by `approved_at`, keep at most one unapproved revision, and calculate `max(revision_number) + 1` only while locked.

- [ ] **Step 5: Integrate revision synchronization into writes**

Inject `SalesInvoiceRevisionService` into `StoreSalesInvoiceAction`; call `syncPending($sale)` after all `ProductSale` records and payments are written but before returning from the existing transaction.

Inject the service into `SalesInvoiceController::update`. Call `beginUpdate($sale)` immediately after entering the update transaction and before `resetSaleApproval()` or deleting lines. Call `syncPending($sale)` after replacement lines/payments are complete. Keep the create-time `salesInvoiceCreatedForCustomer()` call, but in Task 3 make that method SMS-only so existing customer SMS behavior remains unchanged while email moves to approval.

- [ ] **Step 6: Run revision and existing tax tests**

```bash
php artisan test tests/Feature/SalesInvoiceRevisionServiceTest.php tests/Unit/InvoiceLineTaxCalculatorTest.php tests/Unit/InvoiceLineTaxSnapshotResourceTest.php
```

Expected: PASS, proving the new revision hooks preserve the in-progress tax calculation behavior.

- [ ] **Step 7: Commit Task 2 without staging unrelated tax hunks**

Stage all new task files normally. For `Sale.php`, `StoreSalesInvoiceAction.php`, and `SalesInvoiceController.php`, use `git add -p`, accept only revision/email lifecycle hunks, then inspect the staged patch:

```bash
git diff --cached --check
git diff --cached
git commit -m "feat: track approved sales invoice revisions"
```

---

### Task 3: Finalize approval and dispatch at-least-once delivery

**Files:**
- Create: `inventory-api/app/Jobs/SendApprovedSalesInvoiceEmail.php`
- Modify: `inventory-api/app/Services/SalesInvoiceRevisionService.php`
- Modify: `inventory-api/app/Services/RecordNotificationService.php`
- Modify: `inventory-api/app/Http/Controllers/Api/SalesInvoiceController.php`
- Create: `inventory-api/tests/Feature/ApprovedSalesInvoiceDispatchTest.php`

**Interfaces:**
- Produces: `SalesInvoiceRevisionService::finalizeApproved(Sale $sale): SalesInvoiceRevision`
- Produces: `SalesInvoiceRevisionService::queueCustomerDelivery(SalesInvoiceRevision $revision): void`
- Produces: `RecordNotificationService::salesInvoiceApprovedForCustomer(Sale $sale): void`
- Produces: queued job constructor `SendApprovedSalesInvoiceEmail::__construct(public int $revisionId)`.

- [ ] **Step 1: Write failing approval policy tests**

Use `Queue::fake()` and assert:

- Enabled setting + customer email finalizes the revision, captures the email, atomically changes `pending` to `queued`, and pushes exactly one job with `afterCommit` semantics.
- Disabled setting marks `skipped` and pushes no job.
- Missing/blank customer email marks `skipped` and pushes no job.
- Calling the customer approval method twice does not push twice.
- A finalized revision's `after_snapshot`, `approved_at`, and recipient do not change if the live sale is edited later.

- [ ] **Step 2: Run dispatch tests and verify failure**

```bash
cd inventory-api
php artisan test tests/Feature/ApprovedSalesInvoiceDispatchTest.php
```

Expected: FAIL for missing finalization/dispatch methods.

- [ ] **Step 3: Implement finalization and queue transition**

`finalizeApproved()` must require `approval_status === approved`, refresh the pending revision's `after_snapshot` once from the approved sale, calculate changes against its preserved baseline, set `approved_at`/recipient, and save. `queueCustomerDelivery()` reads the latest general setting and performs a conditional update:

```php
$updated = SalesInvoiceRevision::query()
    ->whereKey($revision->id)
    ->where('delivery_status', SalesInvoiceRevision::STATUS_PENDING)
    ->update([
        'delivery_status' => SalesInvoiceRevision::STATUS_QUEUED,
        'queued_at' => now(),
    ]);

if ($updated === 1) {
    SendApprovedSalesInvoiceEmail::dispatch($revision->id)->afterCommit();
}
```

Set `skipped` with an explanatory `failure_message` (`Customer email missing.` or `Customer sales invoice email disabled.`) when appropriate.

- [ ] **Step 4: Wire customer delivery after approval**

Add `salesInvoiceApprovedForCustomer()` to `RecordNotificationService`, delegating only to the revision service. In `SalesInvoiceController::approve`, keep the existing internal `$notifications->salesInvoiceApproved($sale)` call and then call the new customer method. This controller point runs after `approveSale()` has committed.

Refactor `salesInvoiceCreatedForCustomer()` to retain only its existing SMS branch. It must still honor `customer_sales_invoice_sms_notification_enabled` and the customer's phone number, but it must never call mail; approval is now the sole customer-email trigger.

- [ ] **Step 5: Implement the final job contract against the planned mail/PDF interfaces**

Implement `ShouldQueue` with `Queueable`, `tries = 3`, and `backoff(): array` returning `[60, 300]`. Define the final `handle(SalesInvoicePdfRenderer $renderer): void` flow now: load the revision, return for `sent`/`skipped`, render bytes from `after_snapshot`, send `ApprovedSalesInvoiceMail`, conditionally mark `sent`, and write the success `EmailLog`. Catch exceptions to mark `failed`, write the error log, and rethrow. The Mailable and renderer classes are added in Tasks 4 and 5; dispatch tests use `Queue::fake()` and therefore verify this job's queue contract without executing its future collaborators. Implement `failed(Throwable $exception)` to update any non-sent revision to `failed`, truncate `failure_message` to 4,000 characters, and log sale/revision/recipient context without snapshot contents.

- [ ] **Step 6: Run dispatch tests**

Run the Task 3 test command. Expected: PASS.

- [ ] **Step 7: Commit Task 3**

Stage new files and only task-owned hunks in overlapping controller/service files, inspect `git diff --cached`, then:

```bash
git commit -m "feat: queue customer invoice delivery after approval"
```

---

### Task 4: Branded Mailable and delivery logging

**Files:**
- Create: `inventory-api/app/Mail/ApprovedSalesInvoiceMail.php`
- Create: `inventory-api/resources/views/emails/sales-invoice-approved.blade.php`
- Modify: `inventory-api/app/Jobs/SendApprovedSalesInvoiceEmail.php`
- Create: `inventory-api/tests/Feature/ApprovedSalesInvoiceMailTest.php`

**Interfaces:**
- Produces: `ApprovedSalesInvoiceMail::__construct(public SalesInvoiceRevision $revision, public string $pdfBytes, public string $pdfFilename)`.
- Mailable `envelope()` selects created/updated subject; `content()` uses `emails.sales-invoice-approved`; `attachments()` returns one PDF attachment from bytes.

- [ ] **Step 1: Write failing Mailable rendering tests**

Build created and updated revision fixtures and assert:

- Created subject is `Sales Invoice Approved: SR-2026-1042`.
- Updated subject is `Updated Sales Invoice Approved: SR-2026-1042`.
- HTML contains customer name, reference, every current product, quantities/prices/totals, and no change section for `created`.
- Updated HTML contains the full current table plus `REMOVED`, `ADDED`, and `CHANGED` rows.
- Removed HTML includes `background:#fde8e8` and `text-decoration:line-through`; added includes `background:#e4f6e9`; modified includes `background:#fff5d9`.
- HTML does not contain `Cost Price`, `Total Cost`, `Profit`, `unit_cost`, or `total_cost`.
- The Mailable declares exactly one `application/pdf` attachment with filename `sales-invoice-SR-2026-1042.pdf`.

- [ ] **Step 2: Run mail tests and verify failure**

```bash
cd inventory-api
php artisan test tests/Feature/ApprovedSalesInvoiceMailTest.php
```

Expected: FAIL because the Mailable/view do not exist.

- [ ] **Step 3: Implement the Mailable and responsive Blade HTML**

Use table-based email markup and inline styles for SMTP client compatibility. Follow the approved green header, invoice summary, full product table, and conditional revision table. Escape all snapshot strings with Blade `{{ }}`. Format BDT values with two decimals and quantities without unnecessary trailing zeroes. Render `before → after` only for keys present in each modified line's `fields` map.

- [ ] **Step 4: Exercise the queued job against the real Mailable contract**

Mock the PDF renderer defined in Task 5 to return `%PDF-test` bytes, invoke the Task 3 job's `handle()` method, and assert it sends the real Mailable synchronously inside the already-queued job:

```php
Mail::to($revision->recipient_email)->send(
    new ApprovedSalesInvoiceMail($revision, $pdfBytes, $filename)
);
```

Assert success conditionally updates non-sent status to `sent`, sets `sent_at`, clears `failure_message`, and creates one `EmailLog` with `record_type = customer_sales_invoice`, `record_id = sale_id`, `status = submitted`, subject, recipient, provider, and a plain summary message. Assert an exception sets `failed`, writes an `EmailLog` with `status = error`, logs safe context, and is rethrown for normal queue retry. Assert a revision already marked `sent` exits before another `Mail::send`. Correct the Task 3 job only if these real-contract tests expose a mismatch.

- [ ] **Step 5: Run mail tests**

Run the Task 4 test command. Expected: PASS except the PDF renderer dependency, which Task 5 completes; use a mocked renderer in this test.

- [ ] **Step 6: Commit Task 4**

```bash
git add inventory-api/app/Mail/ApprovedSalesInvoiceMail.php inventory-api/resources/views/emails/sales-invoice-approved.blade.php inventory-api/app/Jobs/SendApprovedSalesInvoiceEmail.php inventory-api/tests/Feature/ApprovedSalesInvoiceMailTest.php
git diff --cached --check
git commit -m "feat: render approved invoice customer emails"
```

---

### Task 5: Shared customer-safe PDF renderer

**Files:**
- Create: `inventory-api/app/Services/SalesInvoicePdfRenderer.php`
- Create: `inventory-api/resources/views/invoices/customer-sales.blade.php`
- Modify: `inventory-api/app/Http/Controllers/Api/SalesInvoiceController.php`
- Create: `inventory-api/tests/Feature/SalesInvoiceCustomerPdfTest.php`

**Interfaces:**
- Consumes: Task 1 snapshot arrays.
- Produces: `SalesInvoicePdfRenderer::render(array $snapshot): string`
- Produces: `SalesInvoicePdfRenderer::filename(array $snapshot): string`

- [ ] **Step 1: Write failing renderer and endpoint tests**

Assert `filename()` sanitizes the reference and returns `sales-invoice-SR-2026-1042.pdf`. Render a fixture snapshot and use `Pdf::fake()` if supported; otherwise render real DomPDF bytes and assert the `%PDF` header plus extracted/view HTML content. Verify the source view contains customer/company details, `APPROVED`, all product lines, subtotal/discount/order tax/carrying cost/grand total, amount in words, and note. Assert the rendered view contains none of the internal cost/profit labels or keys.

For the authenticated endpoint, assert pending invoices still return 403 and approved invoices return `application/pdf` with the renderer filename.

- [ ] **Step 2: Run PDF tests and verify failure**

```bash
cd inventory-api
php artisan test tests/Feature/SalesInvoiceCustomerPdfTest.php
```

Expected: FAIL because the renderer/view do not exist.

- [ ] **Step 3: Implement the PDF renderer**

Render `invoices.customer-sales` with `['snapshot' => $snapshot, 'generatedAt' => now()]`, use A4 portrait, and return `$pdf->output()`. Sanitize the reference with `preg_replace('/[^A-Za-z0-9_-]+/', '-', $reference)` and fall back to the sale ID.

- [ ] **Step 4: Implement the approved A4 layout**

Reproduce the approved design with DomPDF-compatible CSS: green top bar/header, company block, right-aligned invoice reference and approved badge, bill-to/meta grid, item table, totals, amount in words, note, and footer. Include product code, variant/batch, quantity, unit, unit price, discount, tax, and total. Do not calculate or render cost/profit.

- [ ] **Step 5: Switch the controller PDF endpoint to the shared renderer**

Keep the existing branch authorization and approved-only guard. Replace direct `Pdf::loadView('invoices.sales', ...)` use with `SalesInvoiceSnapshotService::snapshot($sale)` and `SalesInvoicePdfRenderer`; return `response($bytes, 200)` with `Content-Type: application/pdf` and `Content-Disposition: attachment; filename="..."`. Remove now-unused `GeneralSetting` and `Pdf` imports from the controller.

- [ ] **Step 6: Run PDF and mail tests**

```bash
php artisan test tests/Feature/SalesInvoiceCustomerPdfTest.php tests/Feature/ApprovedSalesInvoiceMailTest.php
```

Expected: PASS.

- [ ] **Step 7: Commit Task 5**

Stage all new files and only the PDF endpoint hunk in the already-modified controller; inspect the cached diff, then:

```bash
git commit -m "feat: generate customer-safe sales invoice PDFs"
```

---

### Task 6: End-to-end approval behavior and settings wording

**Files:**
- Modify: `inventory-api/tests/Feature/ApprovedSalesInvoiceDispatchTest.php`
- Modify: `web/src/features/general-settings-page.tsx`
- Modify: `mobile/app/(drawer)/general-settings.tsx`

**Interfaces:**
- No API field changes; both clients continue posting `customer_sales_invoice_mail_notification_enabled`.

- [ ] **Step 1: Add failing end-to-end lifecycle tests**

Extend the dispatch feature test with real revision services and `Mail::fake()`/`Queue::fake()` boundaries to cover:

1. Create → edit while pending → first approval sends one created email with the latest lines and no diff.
2. Approved → edit removing one line, adding one line, and changing quantity/price on one line → re-approval sends one updated email with all three classifications and old/new totals.
3. Two edits while pending → one re-approval email comparing the final state to the last approved snapshot.
4. A simulated mail exception leaves the sale approved, marks the revision failed, creates an error email log, and permits a retry; a sent revision exits without another `Mail::send`.

- [ ] **Step 2: Run lifecycle tests and fix only integration defects**

```bash
cd inventory-api
php artisan test tests/Feature/ApprovedSalesInvoiceDispatchTest.php
```

Expected before integration fixes: at least one lifecycle assertion fails. Make the smallest corrections in the services/controller/job, then rerun to PASS.

- [ ] **Step 3: Change settings labels without changing payloads**

In web and mobile, rename the customer notification section from `Customer Notifications On Create` to the neutral `Customer Notifications`. Rename the toggle label to `Email Approved Sales Invoices to Customers`. Leave the state key and API field unchanged.

- [ ] **Step 4: Run backend regression tests**

```bash
php artisan test tests/Unit/SalesInvoiceSnapshotServiceTest.php tests/Feature/SalesInvoiceRevisionServiceTest.php tests/Feature/ApprovedSalesInvoiceDispatchTest.php tests/Feature/ApprovedSalesInvoiceMailTest.php tests/Feature/SalesInvoiceCustomerPdfTest.php
```

Expected: PASS.

- [ ] **Step 5: Run frontend/mobile static checks**

```bash
cd ../web
npm run typecheck
npm run build
cd ../mobile
npx tsc --noEmit
```

Expected: all commands exit 0.

- [ ] **Step 6: Commit Task 6**

Stage only task-owned test/integration hunks and the two settings-label files, inspect the cached diff, then:

```bash
git commit -m "feat: complete approved invoice customer notifications"
```

---

### Task 7: Migration and full verification

**Files:**
- Verify only; no planned source changes.

**Interfaces:**
- Deployment requires SMTP configuration, migrated `sales_invoice_revisions`, the pre-existing `jobs` table, and a running queue worker.

- [ ] **Step 1: Inspect migration ordering and dry-run SQL**

```bash
cd inventory-api
php artisan migrate:status
php artisan migrate --pretend
```

Expected: the new revision migration appears after the existing `2026_08_30_000001` tax migration, and pretend output creates the specified table/index/foreign key without altering invoice data.

- [ ] **Step 2: Run code formatting on task-owned PHP files**

```bash
./vendor/bin/pint app/Jobs/SendApprovedSalesInvoiceEmail.php app/Mail/ApprovedSalesInvoiceMail.php app/Models/SalesInvoiceRevision.php app/Services/SalesInvoiceSnapshotService.php app/Services/SalesInvoiceRevisionService.php app/Services/SalesInvoicePdfRenderer.php tests/Unit/SalesInvoiceSnapshotServiceTest.php tests/Feature/SalesInvoiceRevisionServiceTest.php tests/Feature/ApprovedSalesInvoiceDispatchTest.php tests/Feature/ApprovedSalesInvoiceMailTest.php tests/Feature/SalesInvoiceCustomerPdfTest.php
```

Expected: exit 0; review any formatting-only changes before staging.

- [ ] **Step 3: Run the full backend suite**

```bash
php artisan test
```

Expected: all tests pass.

- [ ] **Step 4: Run final web/mobile checks**

```bash
cd ../web && npm run typecheck && npm run build
cd ../mobile && npx tsc --noEmit
```

Expected: all commands exit 0.

- [ ] **Step 5: Inspect security-sensitive rendered output**

Render one created and one updated email plus one PDF fixture. Search the outputs case-insensitively for `unit_cost`, `total_cost`, `cost price`, and `profit`; expected: no matches. Confirm the updated email contains the approved red/green/amber inline styles and that the PDF product/totals tables remain legible on A4.

- [ ] **Step 6: Review deployment configuration**

Confirm production has non-log `MAIL_MAILER`, valid `MAIL_FROM_ADDRESS`/`MAIL_FROM_NAME`, `QUEUE_CONNECTION=database` (or the deployment's supported async driver), and a supervised `php artisan queue:work --tries=3` process. Do not change secrets or production configuration in source control.

- [ ] **Step 7: Commit final formatting/integration changes if present**

If Task 7 changed task-owned files, stage only those changes, inspect `git diff --cached`, and commit:

```bash
git commit -m "test: verify approved invoice customer delivery"
```

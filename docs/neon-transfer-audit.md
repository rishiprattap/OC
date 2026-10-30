# Neon transfer audit — 30 October 2026

Repository: `rishiprattap/OC`. Baseline/production commit: `40c9176ed5c6ef256e505f01e236630de10bd6b1`.
Review branch: `fix/neon-transfer-audit`. No production database connection, migrations, deletions, reset, or production deployment was performed.

## Findings and evidence

The principal code-level cause is **repeated reads of inline media**, amplified by broad queries and uncached page loads. Storage size is not monthly transfer: the same stored bytes count again each time they are returned from PostgreSQL. For illustration, a 20 MB response fetched 278 times is 5.56 GB. This is an example, not a measurement of your traffic.

1. `server/routes/gallery.js` converts uploaded image buffers to Base64 data URLs and inserts them into `gallery_images.image_url` (TEXT). Both public and admin lists formerly selected every column and every matching image. `public/js/main.js` fetched that entire list and only then sliced it to four homepage photos. The alternate public event-gallery and admin event-gallery routes repeated the same pattern. This is a high-confidence transfer amplification mechanism.
2. `server/routes/adminEvents.js` stores uploaded artwork as data URLs on Vercel. `events` contains poster, banner, logo, venue, QR, certificate background and receipt fields. Public event APIs and SSR read entire event rows; JSON repeats the same artwork under several compatibility keys. SQL projections are necessary: removing a field in JavaScript after fetching it does not save Neon transfer.
3. `server/routes/payments.js` stores proof images in `registrations.payment_screenshot_url` as Base64 on Vercel. Admin lists requested 500 complete rows and eagerly rendered proof thumbnails. Exports fetched the same media before replacing it with a link. Certificate, OTP, scanner, registration and payment lookups also fetched media they did not use.
4. Admin overview and filtered registration totals fetched all matching status/fee rows for JavaScript aggregation. Admin events made three count queries per event; admin users read every user including password hashes and performed a separate count per user.
5. `server/db.js` called schema initialization on module load and again lazily on the first query, executing DDL, seed inserts and column changes per serverless instance. This is unnecessary request overhead, though likely much smaller in bytes than images.
6. Vercel metadata confirms `POSTGRES_URL`, `DATABASE_URL` and integration connection variables target BOTH preview and production. Three older previews exist on `feature/user-accounts-and-auth`. No secret values were decrypted. This proves shared configuration, not how much traffic previews generated.
7. No Vercel cron schedule, server-side recurring job, or recurring database-fetch timer was found. The two `setInterval` calls are local OTP countdown displays. Search debounces, explicit dashboard tab loads, initial page fetches and click-triggered requests are not continuous polling. No external monitoring jobs can be ruled out from repository inspection alone.

Production is paused, so exact historical byte attribution and the actual current number/size of inline images remain unverified. The supplied 5.56 GB / 5 GB figures are user-reported. The repository's local snapshot is not a trustworthy substitute for production; it was not used to claim production media sizes.

## Implemented changes

| Area | Change |
|---|---|
| Gallery | SQL selects metadata and short media links rather than Base64. Public pages default to 24 photos with Load more, maximum 100; homepage requests four. Image bytes load individually, lazily. All alternate gallery list routes omit inline media. |
| Public event artwork | Explicit event projections replace inline artwork with allowlisted, published-only image/PDF routes. Admin edit reads retain original fields, so saving an event cannot overwrite its original artwork with a proxy URL. |
| Admin registrations | 50-row UI pages, API maximum 100, deterministic ordering and Previous/Next controls. Proof buttons fetch images only on demand using authenticated requests. |
| Other registration queries | Explicit projection removes inline proofs from admin actions/exports, certificates, OTP, scanner, registration status and payment lookups. Original proof values remain unchanged in PostgreSQL. |
| Dashboard totals | Filtered COUNT/SUM aggregates return one row and preserve zero-fee registrations, approval/payment status rules and certificate eligibility. |
| Admin events/users | Event counts use one grouped query. User pages select non-password fields and calculate registration counts in the same SQL statement. User pagination is 50 rows with Next/Previous. |
| Caching | Event helper reads coalesce concurrent requests and cache for 15 seconds in each instance, up to 32 entries; responses above 1 MB are not retained. Successful/failed writes clear this instance's cache. Cross-instance updates may take 15 seconds to appear. |
| Media caching | Published media permits browser caching for 60 seconds and shared caching for 300 seconds. Unpublishing/replacing media can therefore leave a previously cached public image visible for up to five minutes. Private proof/draft-image responses use `private, no-store`. |
| Preview isolation | Vercel previews ignore shared production URLs and require a dedicated `PREVIEW_DATABASE_URL`. With none configured, all API routes explicitly return 503, while static UI can be reviewed. No production fallback. |
| Paused DB safety | Hosted database failures throw generic errors rather than acknowledging writes against a local snapshot. No hosted schema initialization or seeding. Existing hosted schema is assumed; fresh test databases need an explicit separately reviewed schema setup. |
| Monitoring | Optional `DB_METRICS=1` records endpoint fingerprint, fixed route group, query count, result row count, estimated result JSON bytes, duration and error count. No query text, values, credentials, names, emails, URLs, IDs, cookies, or result bodies are logged by this monitoring. |

All IDs, records and stored media are preserved. No schema migration is needed for this patch. Existing admin upload and editing functions remain available. New uploads still use the existing storage implementation until an external image store is approved and configured.

## Remaining costs and deliberately retained behavior

- Opening an existing inline image on a cache miss still reads that image from Neon. This patch reduces repetition; it does not migrate images.
- The account history endpoint (`server/routes/user.js`) still retrieves that user's complete registration history and proof field. It is authenticated and user-scoped, not a site-wide dump; it remains a candidate if monitoring shows substantial traffic. Changing that response and adding an owner-authorized proof endpoint should be tested as a separate change.
- Admin event editing still reads complete artwork. Large raw event objects exceeding the cache cap are not retained. Certificate generation legitimately needs background artwork; bulk certificate processing may still cause substantial reads.
- Exports, certificate participant/bulk operations, campaign recipient selection, promo/referral reporting and meet recipient lists intentionally still return all applicable records when requested. Their selected columns and inline-media removal reduce bytes without silently truncating exports, winners or recipients. They are action-triggered, not cron/polling operations. Large export/dispatch jobs can later be chunked with explicit progress semantics.
- Promo validation reads the matching code and its usage records to retain existing per-user rules. Small auth/OTP/settings queries remain uncached to avoid stale authorization or verification decisions.
- Old preview deployments are immutable and retain old code/configuration. The new branch's guard does not repair those older previews. Their removal or access restriction needs separate approval.
- Existing application business logs were not redesigned. The new monitoring itself is free of personal values; do not treat that as a claim that every pre-existing log is free of personal information.

## Expected reduction (conditional, not a monthly guarantee)

- Metadata list responses no longer transfer the inline gallery/selected-event/proof payload from PostgreSQL. The removed inline-media component is reduced by **100% on these list reads**; small metadata still transfers.
- Example: 30 equal-size gallery images formerly fetched for a homepage showing four now require four image reads on a cold cache: approximately **86.7% less image transfer** before repeat-cache savings. With N images, reduction is approximately `1 - 4/N`, excluding metadata.
- Admin list proof bytes fall to zero until a proof is opened; normal table metadata is also limited to 50 rather than 500 rows (up to 90% fewer returned rows for that request).
- Summary transfer falls from N rows to one aggregate row. Admin event query count falls from `1 + 3E` to 2; user list/count queries fall from `1 + U` to 1 per page.
- A public image cache hit can avoid a database read entirely. Vercel cache eligibility and actual hit rate must be verified after approved deployment; the supplied headers are not evidence of a measured cache hit.
- A new unconfigured preview makes zero database queries. Existing previews are not changed.

Do not sum these percentages or promise the whole site will stay below 5 GB without real request/size measurements. Current monthly usage is not refunded by changing code; this patch does not resume Neon.

## Monitoring operation

After approval, enable `DB_METRICS=1` for the intended deployment. Sum `resultBytes` and `queries` by `group` and `endpoint`, and compare the change in Neon usage over matching time windows. The byte estimate is serialized result data, not PostgreSQL wire/TLS bytes, and does not include requests, external tools, old deployments, or other database clients. All instrumented queries go through `server/services/dbMetrics.js`.

The endpoint fingerprint is the first 12 hexadecimal characters of SHA-256 of `METHOD:GROUP:ROUTE_TEMPLATE`. GROUP is a fixed prefix such as `/api/admin`; ROUTE_TEMPLATE is Express's static pattern such as `/registrations/:id`, never the actual ID. Aggregate SQL runs under the original request's fingerprint. A route inventory is included in `neon-query-inventory.md`.

## Free-tier image storage recommendation

Use **Cloudflare R2 Standard** for large public gallery/event assets, storing only stable object URLs/keys in PostgreSQL. Its current free allowance includes 10 GB-month storage, 1 million Class A operations and 10 million Class B operations each month, with no direct egress charge. Usage beyond allowances is billable; setup requires an R2 subscription/checkout. Sources: [R2 pricing](https://developers.cloudflare.com/r2/pricing/) and [setup](https://developers.cloudflare.com/r2/get-started/), checked 30 October 2026.

Public event photos can use a public asset domain. Payment proofs must use a separate private bucket with authenticated access/short-lived signed URLs, never the public gallery bucket. Migration should copy in small resumable batches, verify hashes and counts, and only then switch each URL with a conditional update preserving its row ID. Keep the original bytes/backup until verified and explicitly approved for cleanup. No such migration or storage account creation was performed.

## Validation and approval gates

- All 11 existing regression suites passed against a temporary local fixture copy with email delivery disabled and production credentials excluded.
- Embedded PostgreSQL/PGlite tests passed for real SQL projection/aggregation, 55 registrations, 55 users, gallery pagination, free-fee totals, private/public media authorization, cache coalescing/invalidation, failure safety and monitoring privacy. Synthetic data only.
- Preview isolation test passed: shared production URL ignored; no Pool created; API reads/writes unavailable; static admin page loads.
- No Chromium or browser installation/testing was required. Browser layout, cross-instance sessions, real cache hits and a full hosted workflow with an isolated test database still need review.
- The dependency lockfile and production dependencies are unchanged. PGlite was installed only into a temporary test-tools directory; the test accepts `PGLITE_MODULE` pointing to it.

Approval is required before production release, configuring live monitoring, changing old previews, creating/configuring external storage, or any data migration. A full functional hosted preview requires a separate test database (prefer synthetic data in a separate project; a Neon branch in the same project may still share allowances). Do not copy production credentials into `PREVIEW_DATABASE_URL`.

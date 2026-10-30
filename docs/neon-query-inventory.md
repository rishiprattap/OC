# Query and request inventory

Static call-site inventory of the final review branch. Line references are relative to this commit. Includes parameterized/dynamic SQL calls; business assessment and exceptions are in neon-transfer-audit.md. Local SQL emulation in db.js is development-only. No queries were run against production.

## Database calls

| File | Line | Wrapper | SQL operation / tables (static) |
|---|---:|---|---|
| server/db.js | 390 | rawRun | dynamic; see caller |
| server/db.js | 437 | rawRun | ALTER; see caller |
| server/db.js | 1877 | rawRun | CREATE; events |
| server/db.js | 1939 | rawRun | CREATE; see caller |
| server/db.js | 1940 | rawRun | CREATE; see caller |
| server/db.js | 1941 | rawRun | CREATE; see caller |
| server/db.js | 1943 | rawRun | ALTER; events |
| server/db.js | 1944 | rawRun | ALTER; events |
| server/db.js | 1945 | rawRun | ALTER; events |
| server/db.js | 1946 | rawRun | ALTER; events |
| server/db.js | 1947 | rawRun | ALTER; events |
| server/db.js | 1948 | rawRun | ALTER; events |
| server/db.js | 1949 | rawRun | ALTER; events |
| server/db.js | 1953 | rawRun | INSERT; events |
| server/db.js | 2005 | rawRun | CREATE; registrations |
| server/db.js | 2072 | rawRun | CREATE; see caller |
| server/db.js | 2073 | rawRun | CREATE; see caller |
| server/db.js | 2074 | rawRun | CREATE; see caller |
| server/db.js | 2075 | rawRun | CREATE; see caller |
| server/db.js | 2076 | rawRun | CREATE; see caller |
| server/db.js | 2077 | rawRun | CREATE; see caller |
| server/db.js | 2078 | rawRun | CREATE; see caller |
| server/db.js | 2079 | rawRun | CREATE; see caller |
| server/db.js | 2082 | rawRun | CREATE; users |
| server/db.js | 2115 | rawRun | CREATE; see caller |
| server/db.js | 2116 | rawRun | CREATE; see caller |
| server/db.js | 2117 | rawRun | CREATE; see caller |
| server/db.js | 2120 | rawRun | CREATE; promo_codes |
| server/db.js | 2151 | rawRun | ALTER; promo_codes |
| server/db.js | 2152 | rawRun | ALTER; promo_codes |
| server/db.js | 2154 | rawRun | CREATE; see caller |
| server/db.js | 2155 | rawRun | CREATE; see caller |
| server/db.js | 2158 | rawRun | CREATE; password_resets |
| server/db.js | 2170 | rawRun | CREATE; see caller |
| server/db.js | 2171 | rawRun | CREATE; see caller |
| server/db.js | 2174 | rawRun | CREATE; otp_sessions |
| server/db.js | 2190 | rawRun | CREATE; see caller |
| server/db.js | 2191 | rawRun | CREATE; see caller |
| server/db.js | 2194 | rawRun | CREATE; email_logs |
| server/db.js | 2207 | rawRun | CREATE; see caller |
| server/db.js | 2208 | rawRun | CREATE; see caller |
| server/db.js | 2211 | rawRun | CREATE; unsubscribed_emails |
| server/db.js | 2219 | rawRun | CREATE; see caller |
| server/db.js | 2222 | rawRun | CREATE; email_campaigns |
| server/db.js | 2235 | rawRun | CREATE; see caller |
| server/db.js | 2238 | rawRun | CREATE; legacy_certificates |
| server/db.js | 2260 | rawRun | INSERT; legacy_certificates |
| server/db.js | 2267 | rawRun | CREATE; app_settings |
| server/db.js | 2276 | rawRun | CREATE; gallery_images |
| server/db.js | 2289 | rawRun | CREATE; see caller |
| server/db.js | 2290 | rawRun | CREATE; see caller |
| server/db.js | 2291 | rawRun | CREATE; see caller |
| server/db.js | 2307 | get | SELECT; events |
| server/db.js | 2309 | get | SELECT; events |
| server/db.js | 2326 | get | SELECT; events |
| server/db.js | 2348 | all | dynamic; see caller |
| server/db.js | 2353 | get | SELECT; app_settings |
| server/db.js | 2362 | run | INSERT; app_settings, SET |
| server/routes/admin.js | 235 | all | dynamic; see caller |
| server/routes/admin.js | 351 | all | dynamic; see caller |
| server/routes/admin.js | 356 | all | SELECT; events |
| server/routes/admin.js | 398 | get | SELECT; registrations |
| server/routes/admin.js | 456 | get | SELECT; registrations |
| server/routes/admin.js | 488 | get | SELECT; registrations |
| server/routes/admin.js | 502 | run | UPDATE; registrations |
| server/routes/admin.js | 531 | run | UPDATE; registrations |
| server/routes/admin.js | 538 | run | UPDATE; registrations |
| server/routes/admin.js | 564 | get | SELECT; registrations |
| server/routes/admin.js | 572 | run | UPDATE; registrations |
| server/routes/admin.js | 588 | run | UPDATE; registrations |
| server/routes/admin.js | 595 | run | UPDATE; registrations |
| server/routes/admin.js | 621 | get | SELECT; registrations |
| server/routes/admin.js | 630 | run | UPDATE; registrations |
| server/routes/admin.js | 664 | get | SELECT; registrations |
| server/routes/admin.js | 669 | run | UPDATE; registrations |
| server/routes/admin.js | 691 | get | SELECT; registrations |
| server/routes/admin.js | 702 | run | UPDATE; registrations |
| server/routes/admin.js | 721 | get | SELECT; registrations |
| server/routes/admin.js | 743 | run | UPDATE; registrations |
| server/routes/admin.js | 815 | run | UPDATE; events |
| server/routes/admin.js | 835 | get | SELECT; registrations |
| server/routes/admin.js | 861 | get | SELECT; registrations |
| server/routes/admin.js | 899 | all | SELECT; registrations |
| server/routes/admin.js | 941 | get | SELECT; registrations |
| server/routes/admin.js | 1026 | get | SELECT; registrations |
| server/routes/admin.js | 1032 | run | UPDATE; registrations |
| server/routes/admin.js | 1394 | all | dynamic; see caller |
| server/routes/admin.js | 1420 | get | SELECT; registrations |
| server/routes/admin.js | 1426 | get | SELECT; registrations |
| server/routes/admin.js | 1509 | get | SELECT; registrations |
| server/routes/admin.js | 1625 | get | SELECT; registrations |
| server/routes/admin.js | 1763 | all | dynamic; see caller |
| server/routes/admin.js | 1844 | get | SELECT; registrations |
| server/routes/admin.js | 1847 | get | SELECT; registrations |
| server/routes/admin.js | 1941 | get | SELECT; registrations |
| server/routes/admin.js | 2010 | run | UPDATE; registrations |
| server/routes/admin.js | 2015 | run | INSERT; email_logs |
| server/routes/admin.js | 2035 | run | UPDATE; registrations |
| server/routes/admin.js | 2044 | run | UPDATE; registrations |
| server/routes/admin.js | 2049 | run | INSERT; email_logs |
| server/routes/admin.js | 2114 | all | dynamic; see caller |
| server/routes/admin.js | 2141 | get | SELECT; email_campaigns |
| server/routes/admin.js | 2191 | run | INSERT; email_campaigns |
| server/routes/admin.js | 2282 | all | dynamic; see caller |
| server/routes/admin.js | 2288 | get | SELECT; registrations |
| server/routes/admin.js | 2318 | get | SELECT; users |
| server/routes/admin.js | 2324 | all | SELECT; registrations |
| server/routes/admin.js | 2378 | get | SELECT; users |
| server/routes/admin.js | 2396 | run | UPDATE; users |
| server/routes/admin.js | 2407 | get | SELECT; users |
| server/routes/admin.js | 2430 | get | SELECT; users |
| server/routes/admin.js | 2438 | run | UPDATE; users |
| server/routes/admin.js | 2449 | get | SELECT; users |
| server/routes/admin.js | 2539 | all | SELECT; promo_codes |
| server/routes/admin.js | 2540 | all | SELECT; registrations |
| server/routes/admin.js | 2591 | all | SELECT; promo_codes |
| server/routes/admin.js | 2592 | all | SELECT; registrations |
| server/routes/admin.js | 2705 | get | SELECT; promo_codes |
| server/routes/admin.js | 2766 | run | INSERT; promo_codes |
| server/routes/admin.js | 2780 | get | SELECT; promo_codes |
| server/routes/admin.js | 2782 | get | SELECT; promo_codes |
| server/routes/admin.js | 2826 | get | SELECT; promo_codes |
| server/routes/admin.js | 2838 | get | SELECT; promo_codes |
| server/routes/admin.js | 2938 | run | UPDATE; promo_codes |
| server/routes/admin.js | 2963 | get | SELECT; promo_codes |
| server/routes/admin.js | 2965 | get | SELECT; promo_codes |
| server/routes/admin.js | 2988 | get | SELECT; promo_codes |
| server/routes/admin.js | 2999 | run | UPDATE; promo_codes |
| server/routes/admin.js | 3019 | get | SELECT; promo_codes |
| server/routes/admin.js | 3022 | get | SELECT; promo_codes |
| server/routes/admin.js | 3029 | all | SELECT; registrations |
| server/routes/adminEvents.js | 174 | all | SELECT; events |
| server/routes/adminEvents.js | 176 | all | SELECT; registrations |
| server/routes/adminEvents.js | 185 | get | SELECT; registrations |
| server/routes/adminEvents.js | 186 | get | SELECT; registrations |
| server/routes/adminEvents.js | 187 | get | SELECT; registrations |
| server/routes/adminEvents.js | 307 | run | INSERT; gallery_images |
| server/routes/adminEvents.js | 345 | all | SELECT; gallery_images |
| server/routes/adminEvents.js | 388 | run | INSERT; gallery_images |
| server/routes/adminEvents.js | 420 | run | DELETE; gallery_images |
| server/routes/adminEvents.js | 456 | get | SELECT; registrations |
| server/routes/adminEvents.js | 457 | get | SELECT; registrations |
| server/routes/adminEvents.js | 532 | get | SELECT; events |
| server/routes/adminEvents.js | 553 | run | UPDATE; events |
| server/routes/adminEvents.js | 589 | run | INSERT; events |
| server/routes/adminEvents.js | 679 | run | UPDATE; events |
| server/routes/adminEvents.js | 723 | run | UPDATE; events |
| server/routes/adminEvents.js | 823 | get | SELECT; events |
| server/routes/adminEvents.js | 832 | run | INSERT; events |
| server/routes/adminEvents.js | 901 | run | UPDATE; events |
| server/routes/adminEvents.js | 902 | run | UPDATE; events |
| server/routes/adminEvents.js | 934 | run | UPDATE; events |
| server/routes/adminEvents.js | 952 | get | SELECT; registrations |
| server/routes/adminEvents.js | 970 | run | DELETE; registrations |
| server/routes/adminEvents.js | 973 | run | UPDATE; registrations |
| server/routes/adminEvents.js | 976 | run | DELETE; gallery_images |
| server/routes/adminEvents.js | 977 | run | DELETE; events |
| server/routes/auth.js | 70 | get | SELECT; users |
| server/routes/auth.js | 144 | get | SELECT; users |
| server/routes/auth.js | 169 | run | UPDATE; users |
| server/routes/auth.js | 178 | run | INSERT; users |
| server/routes/auth.js | 229 | get | SELECT; users |
| server/routes/auth.js | 271 | run | UPDATE; users |
| server/routes/auth.js | 279 | run | UPDATE; registrations |
| server/routes/auth.js | 291 | get | SELECT; users |
| server/routes/auth.js | 316 | get | SELECT; users |
| server/routes/auth.js | 332 | run | UPDATE; users |
| server/routes/auth.js | 370 | get | SELECT; users |
| server/routes/auth.js | 401 | run | UPDATE; users |
| server/routes/auth.js | 431 | run | UPDATE; registrations |
| server/routes/auth.js | 478 | get | SELECT; users |
| server/routes/auth.js | 532 | get | SELECT; users |
| server/routes/auth.js | 550 | run | UPDATE; password_resets |
| server/routes/auth.js | 558 | run | INSERT; password_resets |
| server/routes/auth.js | 605 | get | SELECT; password_resets |
| server/routes/auth.js | 615 | run | UPDATE; password_resets |
| server/routes/auth.js | 627 | run | UPDATE; users |
| server/routes/auth.js | 628 | run | UPDATE; password_resets |
| server/routes/certificate.js | 109 | get | SELECT; registrations |
| server/routes/certificate.js | 145 | get | SELECT; registrations |
| server/routes/certificate.js | 195 | all | SELECT; registrations |
| server/routes/certificate.js | 218 | get | SELECT; legacy_certificates |
| server/routes/certificate.js | 262 | get | SELECT; registrations |
| server/routes/email.js | 105 | run | INSERT; unsubscribed_emails, SET |
| server/routes/email.js | 132 | run | DELETE; unsubscribed_emails |
| server/routes/events.js | 221 | get | SELECT; events |
| server/routes/gallery.js | 57 | all | SELECT; gallery_images |
| server/routes/gallery.js | 92 | all | SELECT; gallery_images |
| server/routes/gallery.js | 97 | all | SELECT; gallery_images |
| server/routes/gallery.js | 145 | run | INSERT; gallery_images |
| server/routes/gallery.js | 170 | run | INSERT; gallery_images |
| server/routes/gallery.js | 209 | get | SELECT; gallery_images |
| server/routes/gallery.js | 218 | run | UPDATE; gallery_images |
| server/routes/gallery.js | 240 | get | SELECT; gallery_images |
| server/routes/gallery.js | 243 | run | DELETE; gallery_images |
| server/routes/gallery.js | 263 | run | UPDATE; gallery_images |
| server/routes/gallery.js | 283 | get | SELECT; gallery_images |
| server/routes/gallery.js | 287 | get | SELECT; gallery_images |
| server/routes/meet.js | 40 | get | SELECT; meet_sessions |
| server/routes/meet.js | 41 | get | SELECT; meet_email_logs |
| server/routes/meet.js | 65 | all | SELECT; meet_sessions |
| server/routes/meet.js | 87 | get | SELECT; meet_sessions |
| server/routes/meet.js | 92 | all | SELECT; meet_email_logs |
| server/routes/meet.js | 134 | all | dynamic; see caller |
| server/routes/meet.js | 297 | all | dynamic; see caller |
| server/routes/meet.js | 309 | run | INSERT; meet_sessions |
| server/routes/meet.js | 346 | run | INSERT; meet_email_logs |
| server/routes/meet.js | 355 | run | INSERT; meet_email_logs |
| server/routes/meet.js | 365 | run | INSERT; meet_email_logs |
| server/routes/meet.js | 401 | get | SELECT; meet_sessions |
| server/routes/meet.js | 406 | all | SELECT; meet_email_logs |
| server/routes/meet.js | 436 | run | UPDATE; meet_email_logs |
| server/routes/meet.js | 447 | run | UPDATE; meet_email_logs |
| server/routes/meet.js | 457 | run | UPDATE; meet_email_logs |
| server/routes/otp.js | 31 | get | SELECT; registrations |
| server/routes/otp.js | 142 | get | SELECT; registrations |
| server/routes/otp.js | 151 | run | UPDATE; registrations |
| server/routes/otp.js | 165 | run | UPDATE; registrations |
| server/routes/otp.js | 177 | get | SELECT; registrations |
| server/routes/otp.js | 208 | run | UPDATE; registrations |
| server/routes/otp.js | 228 | run | UPDATE; registrations |
| server/routes/otp.js | 235 | run | UPDATE; registrations |
| server/routes/payments.js | 76 | get | SELECT; registrations |
| server/routes/payments.js | 105 | run | UPDATE; registrations |
| server/routes/payments.js | 135 | run | UPDATE; registrations |
| server/routes/payments.js | 165 | get | SELECT; registrations |
| server/routes/payments.js | 180 | run | UPDATE; registrations |
| server/routes/payments.js | 225 | get | SELECT; registrations |
| server/routes/payments.js | 243 | run | UPDATE; registrations |
| server/routes/registrations.js | 48 | get | SELECT; users |
| server/routes/registrations.js | 88 | get | SELECT; users |
| server/routes/registrations.js | 166 | get | SELECT; registrations |
| server/routes/registrations.js | 184 | run | UPDATE; users |
| server/routes/registrations.js | 226 | get | SELECT; registrations |
| server/routes/registrations.js | 248 | get | SELECT; registrations |
| server/routes/registrations.js | 263 | run | UPDATE; registrations |
| server/routes/registrations.js | 286 | run | INSERT; registrations |
| server/routes/registrations.js | 322 | run | UPDATE; registrations |
| server/routes/registrations.js | 366 | get | SELECT; registrations |
| server/routes/registrations.js | 373 | run | UPDATE; registrations |
| server/routes/registrations.js | 389 | run | INSERT; registrations |
| server/routes/registrations.js | 583 | get | SELECT; registrations |
| server/routes/scanner.js | 41 | get | SELECT; registrations |
| server/routes/scanner.js | 47 | get | SELECT; registrations |
| server/routes/scanner.js | 132 | get | SELECT; registrations |
| server/routes/scanner.js | 166 | run | UPDATE; registrations |
| server/routes/user.js | 23 | get | SELECT; users |
| server/routes/user.js | 68 | get | SELECT; users |
| server/routes/user.js | 71 | run | UPDATE; users |
| server/routes/user.js | 78 | get | SELECT; users |
| server/routes/user.js | 96 | get | SELECT; users |
| server/routes/user.js | 102 | all | SELECT; registrations |
| server/services/email.js | 106 | run | INSERT; email_logs |
| server/services/email.js | 121 | get | SELECT; unsubscribed_emails |
| server/services/otp.js | 114 | run | DELETE; otp_sessions |
| server/services/otp.js | 116 | run | INSERT; otp_sessions |
| server/services/otp.js | 130 | get | SELECT; otp_sessions |
| server/services/otp.js | 160 | get | SELECT; otp_sessions |
| server/services/otp.js | 171 | run | DELETE; otp_sessions |
| server/services/otp.js | 177 | run | DELETE; otp_sessions |
| server/services/otp.js | 187 | run | UPDATE; otp_sessions |
| server/services/otp.js | 195 | run | DELETE; otp_sessions |
| server/services/otp.js | 214 | run | UPDATE; otp_sessions |
| server/services/otp.js | 234 | run | DELETE; otp_sessions |
| server/services/otp.js | 242 | get | SELECT; otp_sessions |
| server/services/promo.js | 107 | get | SELECT; promo_codes |
| server/services/promo.js | 151 | all | SELECT; registrations |
| server/services/registrationStats.js | 17 | get | SELECT; registrations |
| server/services/registrationStats.js | 20 | all | SELECT; registrations |

## HTTP route registrations

| File | Line | Method | Static route declaration |
|---|---:|---|---|
| server/index.js | 39 | use | `'/api'` |
| server/index.js | 118 | use | `'/assets', express.static(path.join(publicDir, 'assets')));` |
| server/index.js | 121 | get | `['/_vercel/insights/script.js', '/_vercel/speed-insights/script.js']` |
| server/index.js | 128 | use | `'/uploads', express.static(uploadsDir));` |
| server/index.js | 131 | use | `'/api/registrations', registrationLimiter, registrationsRouter);` |
| server/index.js | 132 | use | `'/api/otp', otpLimiter, otpRouter);` |
| server/index.js | 133 | use | `'/api/auth', authRouter);` |
| server/index.js | 134 | use | `'/api/user', userRouter);` |
| server/index.js | 135 | use | `'/api/payments', paymentsRouter);` |
| server/index.js | 136 | use | `'/api/scanner', scannerRouter);` |
| server/index.js | 137 | use | `'/api/certificate', certificateRouter);` |
| server/index.js | 138 | use | `'/api/admin/login', adminLoginLimiter);  // rate limit login specifically` |
| server/index.js | 139 | use | `'/api/admin', adminRouter);` |
| server/index.js | 140 | use | `'/api/admin/events', adminEventsRouter);` |
| server/index.js | 141 | use | `'/api/events', eventsRouter);` |
| server/index.js | 142 | use | `'/api/email', emailRouter);` |
| server/index.js | 143 | use | `'/api/gallery', galleryRouter);` |
| server/index.js | 144 | use | `'/api/admin/gallery', galleryRouter);` |
| server/index.js | 145 | use | `'/api/admin/meet', meetRouter);` |
| server/index.js | 148 | get | `'/api/config'` |
| server/index.js | 243 | get | `'/'` |
| server/index.js | 244 | get | `['/events', '/all-events']` |
| server/index.js | 245 | get | `['/register', '/registration']` |
| server/index.js | 246 | get | `'/registration/:id'` |
| server/index.js | 247 | get | `['/registration/success', '/success']` |
| server/index.js | 248 | get | `'/certificate'` |
| server/index.js | 249 | get | `['/gallery', '/event-gallery']` |
| server/index.js | 250 | get | `'/scanner'` |
| server/index.js | 251 | get | `['/account', '/login', '/signup', '/reset-password']` |
| server/index.js | 252 | get | `'/admin'` |
| server/index.js | 255 | get | `'/event/:slug'` |
| server/index.js | 256 | get | `'/event/:slug/register'` |
| server/index.js | 257 | get | `'/event/:slug/gallery'` |
| server/index.js | 258 | get | `'/event/:slug/certificate'` |
| server/index.js | 261 | get | `'*'` |
| server/routes/admin.js | 60 | post | `'/login'` |
| server/routes/admin.js | 123 | post | `'/logout'` |
| server/routes/admin.js | 136 | get | `'/session'` |
| server/routes/admin.js | 148 | get | `'/overview'` |
| server/routes/admin.js | 192 | get | `'/registrations'` |
| server/routes/admin.js | 308 | get | `['/registrations/export', '/registrations/export.xlsx']` |
| server/routes/admin.js | 395 | get | `'/registrations/:id'` |
| server/routes/admin.js | 453 | get | `'/registrations/:id/screenshot'` |
| server/routes/admin.js | 485 | post | `'/approve/:id'` |
| server/routes/admin.js | 559 | post | `'/reject/:id'` |
| server/routes/admin.js | 616 | post | `'/revoke/:id'` |
| server/routes/admin.js | 658 | post | `['/registrations/:id/status', '/registrations/status/:id']` |
| server/routes/admin.js | 688 | post | `'/checkin/:id'` |
| server/routes/admin.js | 716 | post | `'/certificate/winner'` |
| server/routes/admin.js | 783 | get | `'/events/:slug/certificate-settings'` |
| server/routes/admin.js | 797 | post | `'/events/:slug/certificate-settings'` |
| server/routes/admin.js | 832 | get | `'/certificate/preview/:regId'` |
| server/routes/admin.js | 858 | get | `'/certificate/download/:regId'` |
| server/routes/admin.js | 886 | get | `'/certificate/bulk-download'` |
| server/routes/admin.js | 936 | post | `'/certificate/send-email'` |
| server/routes/admin.js | 1021 | post | `'/certificate/:id'` |
| server/routes/admin.js | 1344 | get | `'/settings'` |
| server/routes/admin.js | 1354 | post | `'/settings/registration-status'` |
| server/routes/admin.js | 1371 | get | `'/email-history'` |
| server/routes/admin.js | 1415 | post | `'/email/preview'` |
| server/routes/admin.js | 1487 | post | `'/email/custom-send'` |
| server/routes/admin.js | 1593 | post | `'/email/meet-send'` |
| server/routes/admin.js | 1744 | get | `'/emails/certificate/recipients'` |
| server/routes/admin.js | 1830 | post | `'/emails/certificate/preview'` |
| server/routes/admin.js | 1901 | post | `'/emails/certificate/send'` |
| server/routes/admin.js | 2083 | get | `'/email/domain-status'` |
| server/routes/admin.js | 2093 | post | `'/email/campaign'` |
| server/routes/admin.js | 2250 | get | `'/users'` |
| server/routes/admin.js | 2311 | get | `'/users/:id'` |
| server/routes/admin.js | 2369 | post | `'/users/:id/block'` |
| server/routes/admin.js | 2422 | post | `'/users/:id/unblock'` |
| server/routes/admin.js | 2537 | get | `'/promo-codes'` |
| server/routes/admin.js | 2589 | get | `'/promo-codes/referrers'` |
| server/routes/admin.js | 2691 | get | `'/promo-codes/analytics/referrers'` |
| server/routes/admin.js | 2696 | post | `'/promo-codes'` |
| server/routes/admin.js | 2819 | put | `'/promo-codes/:id'` |
| server/routes/admin.js | 2981 | patch | `'/promo-codes/:id/toggle'` |
| server/routes/admin.js | 3014 | get | `'/promo-codes/:id/registrations'` |
| server/routes/adminEvents.js | 172 | get | `'/'` |
| server/routes/adminEvents.js | 272 | post | `'/upload'` |
| server/routes/adminEvents.js | 342 | get | `'/:slug/gallery'` |
| server/routes/adminEvents.js | 366 | post | `'/:slug/gallery'` |
| server/routes/adminEvents.js | 417 | delete | `'/:slug/gallery/:id'` |
| server/routes/adminEvents.js | 429 | get | `'/:slug'` |
| server/routes/adminEvents.js | 521 | post | `'/'` |
| server/routes/adminEvents.js | 657 | put | `'/:slug'` |
| server/routes/adminEvents.js | 811 | post | `'/:slug/duplicate'` |
| server/routes/adminEvents.js | 896 | post | `'/:slug/set-active'` |
| server/routes/adminEvents.js | 919 | post | `'/:slug/status'` |
| server/routes/adminEvents.js | 989 | post | `'/:slug/delete', handleDeleteEvent);` |
| server/routes/adminEvents.js | 990 | delete | `'/:slug', handleDeleteEvent);` |
| server/routes/auth.js | 108 | post | `'/register'` |
| server/routes/auth.js | 214 | post | `'/verify-email'` |
| server/routes/auth.js | 307 | post | `'/resend-verification'` |
| server/routes/auth.js | 361 | post | `'/login'` |
| server/routes/auth.js | 451 | post | `'/logout'` |
| server/routes/auth.js | 471 | get | `'/me'` |
| server/routes/auth.js | 523 | post | `'/forgot-password'` |
| server/routes/auth.js | 590 | post | `'/reset-password'` |
| server/routes/certificate.js | 321 | post | `'/verify', handleVerify);` |
| server/routes/certificate.js | 322 | get | `'/verify', handleVerify);` |
| server/routes/certificate.js | 325 | get | `'/download/:id', handleDownload);` |
| server/routes/certificate.js | 326 | get | `'/svg/:id', handleDownload);` |
| server/routes/email.js | 11 | get | `'/unsubscribe'` |
| server/routes/email.js | 95 | post | `'/unsubscribe'` |
| server/routes/email.js | 124 | post | `'/resubscribe'` |
| server/routes/events.js | 167 | get | `'/active'` |
| server/routes/events.js | 184 | get | `'/'` |
| server/routes/events.js | 202 | get | `'/all'` |
| server/routes/events.js | 217 | get | `'/:slug/media/:field'` |
| server/routes/events.js | 232 | get | `'/:slug'` |
| server/routes/events.js | 254 | get | `'/:slug/gallery'` |
| server/routes/gallery.js | 279 | get | `'/image/:id'` |
| server/routes/gallery.js | 302 | get | `'/'` |
| server/routes/gallery.js | 322 | get | `['/admin', '/admin/list', '/list']` |
| server/routes/gallery.js | 323 | get | `['/event/:eventId'], handlePublicList);` |
| server/routes/gallery.js | 324 | post | `['/upload', '/admin/upload']` |
| server/routes/gallery.js | 325 | put | `['/:id', '/admin/:id']` |
| server/routes/gallery.js | 326 | delete | `['/:id', '/admin/:id']` |
| server/routes/gallery.js | 327 | post | `['/reorder', '/admin/reorder']` |
| server/routes/meet.js | 38 | get | `'/overview'` |
| server/routes/meet.js | 63 | get | `'/sessions'` |
| server/routes/meet.js | 85 | get | `'/sessions/:id'` |
| server/routes/meet.js | 106 | get | `'/eligible-recipients'` |
| server/routes/meet.js | 143 | post | `'/render-preview'` |
| server/routes/meet.js | 176 | post | `'/send-test'` |
| server/routes/meet.js | 228 | post | `'/send'` |
| server/routes/meet.js | 394 | post | `'/retry-failed'` |
| server/routes/otp.js | 16 | post | `'/send'` |
| server/routes/otp.js | 109 | post | `'/verify'` |
| server/routes/payments.js | 56 | get | `'/info'` |
| server/routes/payments.js | 68 | post | `'/confirm-free'` |
| server/routes/payments.js | 155 | post | `'/submit-proof', upload.single('screenshot')` |
| server/routes/registrations.js | 35 | post | `'/'` |
| server/routes/registrations.js | 493 | post | `'/validate-promo'` |
| server/routes/registrations.js | 575 | get | `'/:id'` |
| server/routes/scanner.js | 30 | post | `'/lookup'` |
| server/routes/scanner.js | 119 | post | `'/check-in'` |
| server/routes/user.js | 21 | get | `'/profile'` |
| server/routes/user.js | 41 | put | `'/profile'` |
| server/routes/user.js | 94 | get | `'/registrations'` |

## Frontend network calls and timers

| File | Network call lines | setInterval lines | setTimeout lines |
|---|---|---|---|
| public/events.html | 1068 |  |  |
| public/gallery.html | 491, 545 |  |  |
| public/js/account.js | 182, 262, 392, 458, 507, 546, 589, 640, 688, 724 |  |  |
| public/js/admin.js | 18, 27, 163, 182, 211, 416, 535, 665, 740, 845, 881, 908, 931, 950, 968, 1081, 1295, 1353, 1517, 1588, 1670, 1703, 1960, 2030, 2112, 2171, 2214, 2480, 2558, 2585, 2819, 2837, 2860, 2891, 2905, 3322, 3502, 3543, 3630, 3714, 3945, 3951, 3979, 4007, 4027, 4086, 4127, 4192, 4218, 4255, 4435, 4481, 4564, 4693, 4879, 4907, 4954, 5158, 5443, 5467, 5515 |  | 718, 2539, 3350, 3566, 4542 |
| public/js/certificate.js | 845, 1063 |  | 382, 948 |
| public/js/main.js | 257, 285 |  |  |
| public/js/register.js | 84, 258, 293, 699, 797, 866, 958, 1022, 1088 | 489, 511 | 592, 605 |
| public/js/registration.js | 149, 292 |  | 316 |
| public/js/scanner.js | 73, 163 |  |  |
| public/js/success.js | 138, 196 |  |  |
| public/success.html |  |  | 44 |

The OTP intervals update UI counters only. The gallery Load more and admin Next/Previous requests are user-triggered. Repository scripts are validation/search utilities, not scheduled database jobs. vercel.json has no crons. The test_live_production.js script was inspected but not executed.

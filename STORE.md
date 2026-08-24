# Store listing & review notes — fourtillfour Check-In

OTP / SMS verification is intentionally **skipped for now** (`SKIP_SMS_OTP=true`). Login matches name + phone to an existing GoHighLevel contact.

## Legal URLs (paste into App Store Connect & Play Console)

| Page | URL |
|------|-----|
| Privacy Policy | https://dashboard.nouraiz.com/legal/privacy.html |
| Terms of Use | https://dashboard.nouraiz.com/legal/terms.html |
| Support | https://dashboard.nouraiz.com/legal/support.html |
| Account deletion | https://dashboard.nouraiz.com/legal/delete-account.html |

## App identifiers

- iOS bundle ID: `com.fourtillfour.checkin`
- Android package: `com.fourtillfour.checkin`
- Display name: fourtillfour Check-In
- Version: `1.0.0` (EAS remote versioning)

## Play feature graphic

File: `apps/member/assets/play-feature-graphic.png` (1024×500). Upload in Play Console → Store presence → Main store listing.

## Listing copy

### Short description (Play ≤80 chars)

```
Member check-in and loyalty QR for fourtillfour cafe & car club.
```

### Subtitle (App Store ≤30 chars)

```
Loyalty check-in QR
```

### Full description

```
fourtillfour Check-In is the member app for the fourtillfour cafe and car club loyalty program.

Sign in with the name and phone number on your loyalty account. Generate a QR code at the counter so staff can check you in, update your points, and record your visit.

Features
• Sign in with your existing loyalty contact
• Instant QR for staff scanning
• Points and visit history synced to your member profile
• Account deletion from Home → Account

Need help? Email support@fourtillfour.com or visit the shop.
```

### Keywords (App Store, comma-separated)

```
loyalty,check-in,cafe,car club,qr,points,member,fourtillfour
```

### Category suggestions

- Primary: Lifestyle (or Food & Drink if preferred)
- Secondary: Utilities

## App Review / Play review notes (paste into review form)

```
DEMO ACCOUNT
Use a prepared GoHighLevel loyalty contact. Provide the exact first/last name and phone (E.164, e.g. +1…) in this notes field before submission.

LOGIN
1. Open the app → Get started
2. Enter the demo member’s name and phone
3. Continue — SMS OTP is currently disabled; a session is issued after a successful GHL contact match

CHECK-IN FLOW
1. After login, confirm check-in (including car question if shown)
2. Show the QR to staff / reviewer using the staff scanner at https://dashboard.nouraiz.com/scanner/
3. Staff PIN is configured on the production server (ask the developer for the current PIN in a secure channel — do not commit it here)

ACCOUNT DELETION
Home → Account → Delete account
Also documented at https://dashboard.nouraiz.com/legal/delete-account.html

NOTES FOR REVIEWERS
• New users cannot self-register; they must already exist as a GHL contact
• Square loyalty redemption is a manual staff POS step (“Loyalty Comp”), not in-app payments
• No camera permission is required in the member app (QR is displayed, not scanned)
```

## Still needed from the client (cannot automate)

1. Apple Developer Program + App Store Connect app record  
2. Google Play Console account  
3. A dedicated **demo GHL contact** (name + phone) for reviewers  
4. Device screenshots (iPhone 6.7" / 6.5", Android phone) — capture from TestFlight / internal testing  
5. Confirm `support@fourtillfour.com` is monitored  
6. Change production `STAFF_PIN` if still default  

## Build commands (when accounts are ready)

```bash
cd apps/member
npm run build:ios:production
npm run build:android:production
# then submit via EAS / Console
```

# Inanolab

This is the website of the i-Nano Research Facility, De La Salle University Manila

## Google Sign‑In & Form Validation

- Email verification: The Service Request form requires Google Sign‑In. The email field (`#email`) is read‑only and is auto‑filled after a successful Google Identity Services (GIS) sign‑in. Submissions are gated: validation runs top‑to‑bottom and stops if the email is not Google‑verified.
- GIS client: Configured via the script `https://accounts.google.com/gsi/client` and initialized with the provided Client ID inside `index.html`.
- Stored token policy: The Google ID token is collected client‑side and included in the submitted metadata for record‑keeping (“store only”). No server‑side verification is performed at this time.
- Phone number input: Enforced by HTML `pattern` and a live sanitizer allowing digits, space, parentheses, hyphen, and a single leading plus. Length must be 7–20 characters.
- Conditional EDX requirement: “EDX Target Elements” is required only when the characterization selection is “SEM and EDX”. Inline errors clear as the user changes inputs.
- Inline helper hints: Validation attaches small inline messages next to the first invalid field and scrolls the page to it; hints are removed automatically as the user corrects input.

## Voucher & Totals Summary

- Voucher code: Enter `promo` to apply a 10% discount. The summary block shows Subtotal, Discount (negative), and Total.
- Totals reflect the selected service (“Basic SEM” vs “SEM and EDX”) and number of samples; pricing tables are loaded from CSV assets.

## Files & Assets

- Client‑side uploads: Files are uploaded individually to the configured Google Apps Script endpoint. Only the returned Drive `fileId` values are retained client‑side and submitted as metadata.
- Sample gallery: The gallery probes for `Images/sample<N>.(png|jpg|webp)` (and common variants) and builds a lightbox with back‑button support.

## Optional Next Steps

- Server‑side token verification (optional): Validate the Google ID token in Apps Script (e.g., using Google’s tokeninfo endpoint) and match the payload email against the submitted, read‑only email.
- Additional UI polish: Success state styling for verified email and more granular per‑field validation messages if needed.

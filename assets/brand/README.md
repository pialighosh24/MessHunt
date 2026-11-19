# Mess Hunt – Brand Assets

## Official identity
- **Application name:** Mess Hunt
- **Tagline:** Find Your Perfect Mess
- **Master logo source:** `mess-hunt-logo-master.jpg` (copied from supplied official asset `mess .jpeg`)

## Usage rules
- Use the supplied official Mess Hunt logo as the primary brand mark.
- Do **not** replace it with an unrelated logo or redesign its central identity.
- Preserve meaning/elements: house/accommodation, student identity (graduation cap), location (pin), searching/discovery (magnifying glass), and the Mess Hunt wordmark/tagline.
- Do **not** stretch, distort, or crop important elements.
- Maintain clear space, appropriate image quality, and suitable backgrounds (transparent/solid) per placement.
- User-facing branding must always use **`Mess Hunt`** and **`Find Your Perfect Mess`** consistently.

## Prepared asset copies (Phase 2 scaffold)
These are initial copies of the master asset placed for project wiring; they should be refined into properly cropped/optimized variants as needed while preserving the original visual identity:

| File | Intended use |
|---|---|
| `assets/brand/mess-hunt-logo-master.jpg` | Canonical master/reference |
| `mobile/assets/brand/mess-hunt-logo.jpg` | Mobile in-app logo/header usage (derive compact/full variants as needed) |
| `mobile/assets/brand/icon.jpg` | Mobile app icon candidate (should be replaced/exported as a proper square icon, preferably PNG, with safe margins) |
| `mobile/assets/brand/splash.jpg` | Mobile splash candidate (should be adapted to splash dimensions/background requirements) |
| `web/src/assets/brand/mess-hunt-logo.jpg` | Web dashboard in-app branding |
| `web/public/mess-hunt-logo.jpg` | Web/public branding asset |

## Recommended derived variants (to finalize in implementation)
- Full logo with wordmark and tagline
- Compact logo for app/dashboard headers
- Icon-only mark for mobile app icon/favicon (clean crop, preserved proportions)
- Splash-screen composition on brand background (`#FFFDF8` / light cream as appropriate)

## Brand design tokens (baseline)
Defined in code/docs for consistency (tune to match the supplied logo as needed):
- Deep Navy: `#102B4E`
- Primary Navy: `#173B63`
- Golden Orange: `#F5A623`
- Warm Orange: `#E98B16`
- Warm White: `#FFFDF8`
- Light Cream: `#F7F3EA`
- Soft Grey: `#E9EDF2`
- Body Text: `#263445`
- Muted Text: `#718096`
- Success: `#287C60`
- Error: `#C44949`

**Usage:** Navy for trust/primary identity; golden orange for primary actions and key accents (not overused); warm white/cream backgrounds; grey for secondary UI; green/red only for meaningful states.

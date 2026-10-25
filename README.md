# SafeHer

A private safety toolkit for women in India, built as a Progressive Web App (PWA) for iPhone. On the home screen and in the app switcher it looks like an ordinary calculator. Typing a secret PIN on the calculator and pressing `=` opens the real app.

SafeHer has three core tools:

- **Room Check**: a guided search for hidden cameras in hotel rooms, bathrooms, trial rooms, PGs and homestays, with a lens-reflection camera scan.
- **Evidence Vault**: a private, on-device record of incidents with photos, evidence checklists, complaint tracking and a printable report.
- **SOS**: setup guides for a one-press emergency shortcut on iPhone, plus a Call 112 button.

Everything stays on the phone. There is no server, no account, no analytics and no network requests after the first load.

> **Not legal advice.** The Action Protocol inside the app is general information about Indian law and procedure. Laws and procedures change. Users should talk to a lawyer, a legal aid service or the National Commission for Women (NCW) about their own situation.

---

## Contents

- [How the disguise works](#how-the-disguise-works)
- [Features](#features)
- [Tech stack](#tech-stack)
- [Project structure](#project-structure)
- [Running locally](#running-locally)
- [Deploying](#deploying)
- [Installing on iPhone](#installing-on-iphone)
- [Configuration](#configuration)
- [Data and privacy](#data-and-privacy)
- [Security model and limitations](#security-model-and-limitations)
- [Offline support and updates](#offline-support-and-updates)
- [Design and accessibility](#design-and-accessibility)
- [Testing](#testing)
- [Icons](#icons)
- [Known limitations](#known-limitations)
- [Legal content sources](#legal-content-sources)
- [Contributing](#contributing)

---

## How the disguise works

| What someone sees | What it shows |
| --- | --- |
| Home screen icon and name | A calculator icon named **Calculator** |
| App switcher | The calculator screen (the app covers itself when it goes to the background) |
| Opening the app | A working calculator |
| Browser tab title | **Calculator** |

**First launch.** The user sets a 4-digit PIN (entered twice) and sees a short explanation of how to unlock. The app then shows the calculator.

**Unlocking.** On the calculator, type the PIN and press `=`. For example, with PIN `2580`: press `2`, `5`, `8`, `0`, `=`. A wrong PIN just behaves like normal maths, so nothing looks unusual.

**Returning to the calculator:**

- **Quick exit** in the bottom tab bar switches to the calculator immediately and closes the screen you were on.
- **Lock now** in Settings does the same.
- **Auto-lock.** When the app goes to the background, the calculator covers the screen straight away. If the user comes back within the auto-lock time (default 1 minute, configurable in Settings), the app is restored where they left it. After that, the PIN is needed again.

**Forgot PIN.** A PIN cannot be recovered. Holding **AC** on the calculator for 5 seconds asks for confirmation and then erases all data, so a new PIN can be set. This is explained on the first-launch screen and in Settings.

**Brute-force throttle.** After 5 wrong PIN attempts in a row on the calculator, PIN entry is silently ignored for 30 seconds. The calculator keeps working normally, so this is invisible to an onlooker.

**The calculator is real.** It handles operator precedence (`12 + 7 × 2 = 26`), decimals, percentages, sign change, division by zero (`Error`) and thousands separators, so it holds up if someone else picks up the phone.

---

## Features

### Home

Three large cards (Room Check, Evidence Vault, SOS) and a full-width red **Call 112** button fixed above the tab bar. The button is a plain `tel:112` link; iOS shows its own "Call 112?" confirmation. It never appears on the calculator.

The gear icon in the top bar opens **Settings**.

### Room Check

1. **Accuracy warning.** The user must tap "I understand" after reading: *"This tool helps you look for hidden cameras but cannot guarantee a room is safe. Results may not be accurate."*
2. **Room type.** Hotel room, Bathroom, Changing / trial room, PG or rental, Airbnb / homestay. Each type has its own list of common hiding spots (8 to 15).
3. **Checklist.** Each spot has a "How to check" tip and **Looks fine** / **Suspicious** buttons, with a progress bar (for example `7/13 checked`). Progress is remembered.
4. **Mirror tab.** The two-way mirror fingernail test, with caveats and a second check.
5. **Lens scan.** Opens the rear camera. The user turns off the lights and shines a torch from beside their eyes. Each video frame is analysed on a canvas: small, very bright, round spots that stand out from their surroundings and persist across several frames are circled in red. A sensitivity slider (1 to 10) adjusts the thresholds. If the phone exposes a torch control, a Torch button appears.
6. **Infrared tab.** Opens the front camera with instructions to look for purple or white glowing dots, and a TV-remote test to confirm the camera can see infrared.
7. **Advice.** Marking anything Suspicious, or tapping **I found something**, opens advice: don't touch it, photograph it from a distance, leave, report to management and police (112). **Take photos and save to vault** opens a new Hidden camera incident, pre-filled with the room type, the spot and the date and time, and opens the camera.

### Evidence Vault

Incidents are stored only on the device, in IndexedDB.

**Categories.** Each category has its own fields, icon and evidence checklist:

| Category | Category-specific fields |
| --- | --- |
| Online harassment | Platform, profile link or username, message screenshots |
| Stalking | Dates and places seen, how they followed or contacted, pattern over time |
| Hidden camera / voyeurism | Location, room type, where the device was, photos |
| Physical harassment or assault | Place, witnesses, injuries, medical visit |
| Workplace harassment | Organisation, person's role, dates, whether reported to the Internal Committee |
| Threats or blackmail | What was threatened, demands, how it was sent |
| Other | Shared fields only |

All incidents also have: date and time (auto-filled), location, person involved (optional), description, photos (camera or photo library), and police complaint details (FIR number, police station, officer name, date filed, other acknowledgement number).

**Vault home.** Filter buttons with a count for each category plus **All**. Adding an incident while a filter is selected starts in that category. Each incident card shows its thumbnail, date, location, photo count and complaint progress (for example "Police complaint: 4 of 9 steps done").

**Evidence guide.** Each category has a "What counts as evidence" checklist (for online harassment: screenshots showing username, date and time; profile URL; full chat export; emails with headers; payment requests; links to posts; platform report number). Ticks can be made in the form or on the incident screen and are saved with the incident.

**What to do next.** Each incident has a button that opens the matching Action Protocol section: online harassment opens Section C, workplace harassment opens Section D, and everything else opens Section B.

**Export.** **Export report** builds a printable report and opens the print dialog, so the user can save it as a PDF on iPhone. The report has:

- a summary timeline of all incidents at the top
- incidents grouped by category, in date order
- every field, complaint details, checklist progress, evidence collected, and photos

**Helplines.** Tap-to-call 112, 181 and 1930, and a link to cybercrime.gov.in.

### Action Protocol

A step-by-step guide for India inside the Vault, with collapsible sections and the disclaimer at the top.

| Section | Content |
| --- | --- |
| A. If you are in danger right now | Call 112, get to a safe place, tell someone, then record |
| B. File a police complaint | Interactive 9-step checklist, plus a summary of your rights |
| C. Online and cyber crimes | Interactive 9-step checklist (cybercrime.gov.in, 1930, platform reporting) |
| D. Workplace harassment (POSH Act 2013) | Interactive 9-step checklist (Internal Committee, Local Committee, timelines) |
| E. Relevant laws | BNS 74, 75, 77, 78, 79, 351, 308 with old IPC numbers; IT Act 66E, 67, 67A |
| F. Strengthen your case | Evidence handling, CCTV, medical examination, BSA Section 63 certificate |
| G. Help and support | 112, 181, 1930, NCW helpline and complaint portal, free legal aid (15100 / DLSA) |

**Checklists.** Each step has a checkbox and a title; tapping the title shows a one-line explanation.

- **Opened from an incident:** progress is saved with that incident. The "Save the FIR details" step has fields for FIR number, police station, officer name and date filed, saved straight into the incident. The cyber and POSH checklists have an acknowledgement number field. "Gather your evidence" links to the incident's evidence checklist.
- **Opened on its own** (from the Vault): a general guide with a **Reset** button. Its progress is stored separately from any incident.

### SOS

- **Install SOS shortcut** opens the iCloud link for the "SOS Alert" shortcut.
- After-install steps: add recipients, turn off Show When Run, run once and choose Always Allow.
- Guides for five triggers: Action Button, Back Tap, Home Screen widget, Lock Screen control, Siri.
- A backup note about iPhone's built-in Emergency SOS.
- A 10-item test checklist that is remembered.

### Settings

- **Security:** Change PIN, Auto-lock (Immediately, 30 seconds, 1 minute, 5 minutes), Lock now.
- **How it works:** unlocking, Quick exit, Forgot PIN.
- **Storage:** confirms nothing is uploaded, and shows the number of incidents and photos and approximate space used.
- **Delete all data:** shows a confirmation panel first, then erases the PIN, all incidents and photos, checklists and settings, and returns to first-launch setup.

---

## Tech stack

- Plain **HTML, CSS and vanilla JavaScript**. No framework, no build step, no dependencies.
- **Service worker** for offline use, **Web App Manifest** for installation.
- **IndexedDB** for incidents and photos, **localStorage** for small settings.
- **getUserMedia** and **canvas** for the camera scans.
- A small **pure-JavaScript SHA-256** implementation for the PIN hash, so it works the same on HTTPS and plain HTTP during local testing.

The whole app is static files and can be hosted anywhere that serves HTTPS.

---

## Project structure

```
SafeHer/
├── index.html        All screens: calculator, PIN setup, and the app views
├── styles.css        Design tokens, light and dark themes, all component styles
├── app.js            All app logic (see below)
├── sw.js             Service worker: precache and stale-while-revalidate
├── manifest.json     PWA manifest (name "Calculator", icons, colours)
└── icons/
    ├── icon-source.webp        Source image for all icons
    ├── apple-touch-icon.png    180×180, opaque, for iOS home screen
    ├── icon-192.png            192×192, transparent background
    ├── icon-512.png            512×512, transparent background
    ├── icon-maskable-512.png   512×512, artwork inside the 80% safe zone
    └── favicon-32.png          32×32 browser tab icon
```

`app.js` is organised top to bottom as:

| Section | Purpose |
| --- | --- |
| Config | `SOS_SHORTCUT_URL`, `AUTO_LOCK_MS` |
| Helpers | DOM shortcuts, HTML escaping, localStorage wrapper, date formatting, photo object URLs |
| SHA-256 and `PIN` | Salted, iterated PIN hashing |
| `Lock` | First-launch PIN setup and Change PIN screen |
| `Calc` | The calculator, PIN unlock, throttle, hold-AC reset |
| `Privacy` | Covers the app with the calculator when backgrounded, restores or locks on return |
| `go()` | Screen navigation |
| Room check | Room types, hiding spots, checklist, mirror test, advice sheet |
| Cameras | `detectBrightSpots()`, `Lens` scan, `IR` check |
| `DB` | IndexedDB wrapper |
| `CATEGORIES`, `CHECKLISTS` | Vault categories, fields, evidence lists, protocol checklists |
| `Vault` | List, filters, form, detail, evidence ticks, report export |
| `Protocol` | Action Protocol rendering and checklist state |
| Settings, SOS | Settings screen, SOS checklist |
| `init()` | Event wiring and start-up |

---

## Running locally

Any static file server works. From the project folder:

```bash
# Python 3
python -m http.server 8000

# or Node
npx serve .
```

Open <http://localhost:8000> in Chrome, Edge or Safari. In Chrome or Edge DevTools, turn on device emulation (Ctrl+Shift+M) and choose an iPhone.

`localhost` counts as a secure context, so the camera and the service worker work there. They will **not** work if you open the app from another device using your computer's LAN IP over plain `http://`. Use one of the HTTPS options below to test on a phone.

---

## Deploying

The app must be served over **HTTPS** for the camera, the service worker (offline mode) and installation to work.

**Netlify Drop:** drag the project folder onto <https://app.netlify.com/drop>.

**GitHub Pages:** push to GitHub, then in the repository go to Settings → Pages and serve from the `main` branch root.

**Temporary tunnel for testing:** run a local server, then `npx localtunnel --port 8000` or `ngrok http 8000`.

> **Disguise note.** Everything in the deployed folder is publicly readable. If you deploy this repository as-is, `README.md` will be served alongside the app and explains what it is. The site address (for example `username.github.io/SafeHer`) is also visible in Safari before installation. For real use, deploy only the app files (`index.html`, `styles.css`, `app.js`, `sw.js`, `manifest.json`, `icons/`) to a neutral address.

All paths in the app are relative, so it works from a sub-folder such as a GitHub Pages project URL.

---

## Installing on iPhone

1. Open the HTTPS address in **Safari**.
2. Tap **Share**, then **Add to Home Screen**. The name is pre-filled as "Calculator".
3. Open it from the home screen. It runs full-screen, without Safari's address bar.
4. Set a PIN on first launch.
5. Load each screen once while online. After that it works fully offline.

If a previous version was installed, delete it from the home screen and add it again to pick up a new name or icon. iOS stores these at install time.

---

## Configuration

Both settings are constants at the top of `app.js`.

| Constant | Default | Purpose |
| --- | --- | --- |
| `SOS_SHORTCUT_URL` | iCloud link to the SOS Alert shortcut | Target of the **Install SOS shortcut** button. If it contains `REPLACE`, the SOS screen shows a "not set up yet" note. |
| `AUTO_LOCK_MS` | `60000` (1 minute) | Default auto-lock time. Users can change it in Settings. |

The shortcut itself is built in the iOS Shortcuts app and shared as an iCloud link. The in-app instructions assume it is named **SOS Alert** and has a **Recipients** setting.

---

## Data and privacy

**Nothing leaves the device.** The app makes no network requests apart from loading its own files. There is no backend, analytics, crash reporting or third-party script.

**Where data is stored:**

| Storage | Key or name | Contents |
| --- | --- | --- |
| IndexedDB | database `safeher`, store `incidents` | Incidents: category, date, location, person, description, category fields (`details`), evidence ticks (`evidence`), complaint details (`complaint`), checklist progress (`protocol`), photos |
| localStorage | `safeher.pinHash`, `safeher.pinSalt` | Salted PIN hash (the PIN itself is never stored) |
| localStorage | `safeher.pinFails`, `safeher.lockedUntil` | Wrong-PIN throttle state |
| localStorage | `safeher.autoLockMs` | Auto-lock setting |
| localStorage | `safeher.room`, `safeher.sensitivity` | Room check progress and lens scan sensitivity |
| localStorage | `safeher.sosChecks`, `safeher.protocolChecks` | SOS test checklist and standalone protocol checklists |

**Photos** are stored as raw bytes (`ArrayBuffer` plus MIME type) rather than `Blob` objects, because Safari has historically had bugs with Blobs saved in IndexedDB. They are turned back into Blobs for display and released when you leave a screen.

**Persistence.** After the first save, the app asks the browser for persistent storage (`navigator.storage.persist()`). Home-screen web apps on iOS are not subject to Safari's 7-day storage limit, but deleting the app or clearing Safari website data deletes everything. Users should export a report regularly.

**Older records.** Incidents saved by earlier versions (which kept room type and spot at the top level) are read correctly and converted when next saved.

---

## Security model and limitations

SafeHer is designed to protect against **someone casually picking up or looking at the phone**: a partner, family member, colleague or stranger. It is **not** designed to resist a determined attacker with forensic tools or unlocked access to the phone's files.

- **PIN strength.** A 4-digit PIN has 10,000 combinations. The hash is salted and iterated (1,000 rounds of SHA-256), but anyone who can read the app's storage could try every PIN in seconds. The 30-second throttle only slows guessing through the calculator.
- **Data is not encrypted.** Incidents and photos are stored in the browser's normal storage. They are protected by the phone's own passcode and iOS data protection, not by the app's PIN.
- **The disguise is visual.** The app is still a web app from a web address. Anyone who checks Settings → Safari → Advanced → Website Data, or sees the address before installation, could find it.
- **App switcher.** The app covers itself with the calculator as soon as it is hidden. Whether iOS takes its app-switcher snapshot before or after that happens has not been confirmed on a real device.
- **Forgot PIN erases everything.** This is deliberate. A recovery method would also be a way in for someone else.

---

## Offline support and updates

`sw.js` precaches every app file on install. Requests are served **stale-while-revalidate**: the cached copy is returned immediately (so the app opens offline) and a fresh copy is fetched in the background when online.

When you change files:

1. **Bump `CACHE_NAME`** in `sw.js` (for example `calc-v6` → `calc-v7`). Old caches are deleted when the new service worker activates.
2. If you add, rename or remove a file, update the `ASSETS` list in `sw.js`.

Installed copies pick up changes after one or two launches while online.

---

## Design and accessibility

- **Palette:** solid colours only, defined as CSS custom properties in `styles.css`. Light mode uses `#F7F7F5` background, white surfaces, `#1C1C1E` text and a deep teal accent (`#0F6E6E`). Dark mode uses `#111113` background, `#1C1C1F` surfaces and `#F2F2F4` text. Red (`#C62828`) is reserved for warnings, SOS and destructive actions.
- **No gradients, glows, shadows or emojis.** Icons are inline SVG line icons with one stroke width.
- **Typography:** the system font stack (`-apple-system, "SF Pro Text", system-ui, sans-serif`). Hierarchy uses size and weight. Body text is 17px.
- **Layout:** list-style sections like iOS Settings, 16px side padding, an 8px spacing scale, 12px card radius with 1px borders.
- **Buttons:** one primary (solid teal, white text), one secondary (outlined), one destructive (solid red). Every tap target is at least 44px; Call 112 is 56px.
- **Contrast:** all text and colour pairs meet WCAG AA (4.5:1) in both themes.
- **Focus:** visible `:focus-visible` outlines on all interactive elements.
- **Motion:** transitions are under 200ms and are disabled when the user has "Reduce Motion" turned on.
- **Dark mode:** follows the system setting.

---

## Testing

There is no automated test suite in this repository. During development the app was tested by driving headless Microsoft Edge at iPhone size (390×844) through the Chrome DevTools Protocol, covering 76 checks across the disguise, calculator, settings, room check, vault, action protocol, report, quick exit, auto-lock, throttling, offline loading, reduced motion and data deletion.

### Manual test checklist

Run through this on a real iPhone after deploying over HTTPS:

**Disguise**
- [ ] The home-screen icon and name show a calculator called "Calculator".
- [ ] First launch: set a PIN twice, read the explanation, land on the calculator.
- [ ] Normal sums work (`12 + 7 × 2 = 26`, `10 ÷ 4 = 2.5`, `5 ÷ 0 = Error`).
- [ ] A wrong PIN followed by `=` stays on the calculator.
- [ ] The right PIN followed by `=` opens the app.
- [ ] Quick exit returns to the calculator instantly.
- [ ] Swipe to the home screen and back within the auto-lock time: the app is restored. Wait longer: the calculator shows.
- [ ] The app switcher shows the calculator, not the app.
- [ ] Holding AC for 5 seconds offers to erase everything.

**Room Check**
- [ ] The accuracy warning appears first.
- [ ] Lens scan: in a dark room, point at a phone camera lens with a torch beside your eyes; red circles should follow the glint. Try the sensitivity slider.
- [ ] Infrared: a TV remote's light is visible on the front camera.
- [ ] Marking a spot Suspicious → **Take photos and save to vault** opens the camera and a pre-filled incident.

**Evidence Vault**
- [ ] Each category shows its own fields and evidence list.
- [ ] Filter counts are correct.
- [ ] **What to do next** opens the right protocol section; ticks and FIR details are saved and appear on the incident card.
- [ ] **Export report** opens the print dialog; pinching out on the preview saves a PDF with the timeline, category groups and photos.

**Other**
- [ ] Call 112 shows the iOS call confirmation.
- [ ] Turn on Airplane Mode and open the app from the home screen: it loads.
- [ ] Settings → Delete all data asks for confirmation, then returns to PIN setup.
- [ ] Dark mode and Reduce Motion look correct.

---

## Icons

All icons are generated from `icons/icon-source.webp` (a 545×640 calculator illustration with a transparent background):

| File | Size | Background | Artwork height |
| --- | --- | --- | --- |
| `icon-192.png`, `icon-512.png` | 192, 512 | Transparent | 94% |
| `favicon-32.png` | 32 | Transparent | 100% |
| `apple-touch-icon.png` | 180 | `#F7F7F5` (iOS needs an opaque square) | 78% |
| `icon-maskable-512.png` | 512 | `#F7F7F5` | 60% (inside the 80% safe circle) |

The generation script is not part of the repository. Any image tool can reproduce these sizes from the source file. If you change the icons, bump `CACHE_NAME` in `sw.js`.

The source image appears to be stock clip art. Check its licence before publishing the app publicly.

---

## Known limitations

- **Camera scans are aids, not detectors.** The lens scan flags any small bright reflection, including screws, LEDs and glossy plastic. Many iPhone rear cameras filter infrared. A clean result does not mean a room is safe; the app says so.
- **`window.print()` in a home-screen web app** may not open the print dialog on every iOS version. The report screen has a **Print or save as PDF** button, and Share → Print also works.
- **Camera permission** may be asked again on each launch of a home-screen web app on iOS.
- **Taking a photo** from the incident form may briefly send the app to the background on some iOS versions. With auto-lock set to "Immediately", this could lock the app; the form's contents are kept.
- **The SOS shortcut** runs in Apple's Shortcuts app. SafeHer can only link to it and explain setup; it cannot trigger or test it.
- **iOS caches the installed name and icon.** Reinstall after changing them.

---

## Legal content sources

The Action Protocol summarises:

- **Bharatiya Nyaya Sanhita, 2023 (BNS)**, which replaced the Indian Penal Code from 1 July 2024: Sections 74, 75, 77, 78, 79, 308, 351.
- **Bharatiya Nagarik Suraksha Sanhita, 2023 (BNSS)**, which replaced the Code of Criminal Procedure: Section 173 (FIR, Zero FIR, e-FIR, free copy of the FIR, woman officer, written complaint to the Superintendent of Police).
- **Bharatiya Sakshya Adhiniyam, 2023 (BSA)**, which replaced the Indian Evidence Act: Section 63 (electronic records).
- **Information Technology Act, 2000**: Sections 66E, 67, 67A.
- **Sexual Harassment of Women at Workplace (Prevention, Prohibition and Redressal) Act, 2013 (POSH Act)**: Internal and Local Committees, 3-month complaint window (extendable by 3 months), interim relief, 90-day inquiry.

Helpline numbers listed: 112 (emergency), 181 (women helpline), 1930 (cyber crime), 7827 170 170 (NCW helpline), 15100 (NALSA free legal aid), plus the NCW online complaint portal and cybercrime.gov.in.

All of this content should be reviewed by a qualified lawyer or legal aid service, and the helpline numbers checked, before public release.

---

## Contributing

- Keep it dependency-free: no frameworks, no build step.
- Match the existing style: solid colours, no gradients or emojis, inline SVG line icons, the CSS variables in `styles.css`, plain and direct copy.
- Nothing visible before unlock may mention SafeHer, safety, SOS or anything similar.
- Escape all user-entered text with `esc()` before inserting it into HTML.
- Bump `CACHE_NAME` in `sw.js` with every change to app files.
- Commit messages are short and plain and describe the change.

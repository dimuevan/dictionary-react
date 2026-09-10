# Dictionearch — Πώς το τρέχεις (Play)

Οδηγός για να σηκώσεις το project τοπικά και να το δεις στον browser.
Όλα τα βήματα είναι δοκιμασμένα σε Node v22 / npm 10.

---

## 1. Προαπαιτούμενα

| Τι | Έκδοση | Έλεγχος |
|---|---|---|
| Node.js | 18+ (δοκιμασμένο σε 22) | `node -v` |
| npm | 9+ | `npm -v` |

Αν δεν έχεις Node: https://nodejs.org (LTS) ή με `nvm install 22`.

---

## 2. Setup (μία φορά)

```bash
git clone https://github.com/dimuevan/dictionary-react.git
cd dictionary-react
npm install
```

Το `npm install` παίρνει λίγα δευτερόλεπτα. Το project έφυγε από το Create React
App και χτίζεται πλέον με **Vite**.

---

## 3. Play — development mode

```bash
npm start
```

- **http://localhost:3000** — ο dev server σηκώνεται σε κλάσματα του δευτερολέπτου
- Hot reload: κάθε αλλαγή σε `src/` ανανεώνει τη σελίδα μόνη της
- Σταμάτημα: `Ctrl + C`

Αν η θύρα 3000 είναι πιασμένη: `npm start -- --port 3001`

### Τι να δοκιμάσεις μόλις ανοίξει
1. Γράψε `keyboard` και πάτα **Enter** (ή το εικονίδιο lupa)
2. Πάτα το μωβ ▶ για την προφορά
3. Πάτα ένα συνώνυμο για να ανοίξει σαν νέα αναζήτηση, μετά το «πίσω» του browser
4. Γύρνα τον διακόπτη πάνω δεξιά για dark mode
5. Γράψε μια ανύπαρκτη λέξη (π.χ. `zzzzqqq`) — εμφανίζεται μαύρο toast «Word not found»
6. Γύρνα στην αρχική — οι πρόσφατες λέξεις σε περιμένουν ως chips

---

## 4. Play — production build (αυτό που ανεβαίνει στο server)

Το `vite.config.js` ορίζει `base: '/challenges/react/dictionearch/'`, οπότε το
κανονικό build βάζει **απόλυτα paths** (`/challenges/react/dictionearch/assets/...`).
Αν το ανοίξεις τοπικά στη ρίζα, θα δεις **λευκή σελίδα** — δεν είναι bug, είναι η
βάση. Ο dev server δεν επηρεάζεται: σερβίρει πάντα από τη ρίζα.

**Για τοπικό preview:**

```bash
VITE_BASE=/ npm run build
npm run preview
# → http://localhost:4173
```

**Για ανέβασμα στο πραγματικό hosting:**

```bash
npm run build
npm run check:build   # ελέγχει ότι το build δουλεύει εκεί που πάει
# ανέβασε ΟΛΟ το build/ στο /challenges/react/dictionearch/ του server
```

Το `check:build` διαβάζει το `build/index.html` και επιβεβαιώνει ότι κάθε
asset path ξεκινά από τη σωστή βάση, ότι τα αρχεία υπάρχουν όντως, και ότι ο
service worker κάνει cache τον φάκελο που το build παράγει. Είναι οι δύο
παγίδες που έχουν ήδη βγάλει λευκή σελίδα, και τώρα φαίνονται σε ένα
δευτερόλεπτο αντί για μετά το ανέβασμα.

---

## 4β. Αυτόματο deploy

Το `.github/workflows/deploy.yml` κάνει το ίδιο μόνο του: τρέχει **μόνο** αφού
το CI περάσει σε `main`, χτίζει με τη σωστή βάση, τρέχει το `check:build`,
ανεβάζει το `build/` με `lftp` πάνω από FTPS, και μετά ζητάει την πραγματική
σελίδα για να δει ότι όντως αναφέρει το bundle που μόλις χτίστηκε.

Χρειάζεται τέσσερα secrets (Settings → Secrets and variables → Actions):

| Secret | Τι είναι |
|---|---|
| `DEPLOY_FTP_HOST` | ο FTP host, π.χ. `ftp.iamevandimu.com` |
| `DEPLOY_FTP_USER` | ο χρήστης |
| `DEPLOY_FTP_PASSWORD` | ο κωδικός του |
| `DEPLOY_FTP_DIR` | ο φάκελος προορισμού, π.χ. `/public_html/challenges/react/dictionearch` |

Χωρίς αυτά το job **δεν αποτυγχάνει**: χτίζει, ελέγχει, και γράφει στο summary
τι λείπει. Δεν σβήνει ποτέ αρχεία στον server — μόνο προσθέτει και
αντικαθιστά.

---

## 5. Tests

```bash
npm test           # 60 unit tests, μία φορά
npm run test:watch # watch mode
npm run e2e        # 20 έλεγχοι σε πραγματικό browser, desktop και κινητό
npm run check:build # ότι το build δουλεύει στον υποφάκελο του server
```

Το `src/App.test.jsx` κρατάει καταγεγραμμένη κάθε διαδρομή που έχει σπάσει
κάποια στιγμή. Οι browser έλεγχοι πιάνουν αυτά που τα unit tests δεν βλέπουν:
layout που ξεχειλίζει στο κινητό, ηχητικό αρχείο που δεν κατεβαίνει, και τη
σελίδα να ανοίγει με το δίκτυο κατεβασμένο.

Και τα δύο τρέχουν αυτόματα σε κάθε push μέσω `.github/workflows/ci.yml`.
Ξεχωριστά, ένα ημερήσιο job (`.github/workflows/api-contract.yml`) χτυπά τις
**πραγματικές** υπηρεσίες και ελέγχει ότι δεν άλλαξε το σχήμα τους.

---

## 6. Troubleshooting

| Σύμπτωμα | Αιτία / Λύση |
|---|---|
| Λευκή σελίδα στο production preview | Έκανες `npm run build` χωρίς `VITE_BASE=/` — δες §4 |
| `Port 3000 is in use` | `npm start -- --port 3001` |
| Οι αναζητήσεις δεν φέρνουν τίποτα | Έλεγξε δίκτυο/firewall προς `api.dictionaryapi.dev` (public API, χωρίς key) |
| `Module not found` μετά από git pull | Ξανατρέξε `npm install` |
| Το build σταματά σε CI | Τρέξε `npm run build` τοπικά για να δεις το ίδιο σφάλμα |

---

## 7. Δομή του project

```
src/
├── index.jsx           # entry point, mount του App, εγγραφή του service worker
├── index.css           # CSS variables + light/dark themes (body.light / body.dark)
├── App.jsx / .css      # layout και τι δείχνει η οθόνη
├── useDictionary.js    # η αναζήτηση: πηγές, προθεσμίες, cache, είδη αποτυχίας
├── wiktionary.js       # δεύτερη πηγή, σε σχήμα ίδιο με την πρώτη
├── datamuse.js         # προτάσεις ορθογραφίας, συμπληρώσεις, συχνότητα, ρίμες
├── etymology.js        # η ενότητα «Origin», από σελίδα του Wiktionary
├── wordCache.js        # αποθηκευμένες λέξεις — και το ιστορικό μαζί
├── favourites.js       # αστεράκια, export σε CSV και Anki
├── studySchedule.js    # κουτιά Leitner για την επανάληψη
├── backup.js           # export/restore σε JSON
├── urlTerm.js          # η λέξη και η γλώσσα στη γραμμή διευθύνσεων
├── usePreferences.js   # θέμα και γραμματοσειρά
├── useWordRequest.js   # η λέξη στην οθόνη και το ιστορικό του browser
├── useSuggestions.js   # «μήπως εννοούσες» μετά από 404
├── Search.jsx          # φόρμα αναζήτησης, combobox με βελάκια
├── WordDisplay.jsx     # ομαδοποίηση σημασιών, προφορά, ρίμες, ετυμολογία
├── StudyCards.jsx      # οι κάρτες επανάληψης
├── StudyProgress.jsx   # η κατανομή στα κουτιά
├── RecentWords.jsx     # πρόσφατες και αποθηκευμένες λέξεις
├── App.test.jsx        # τα unit tests
└── …                   # Header, ErrorBoundary, ResultSkeleton, icons, stylesheets

e2e/                    # οι έλεγχοι σε πραγματικό browser
scripts/                # check-apis.mjs, check-build.mjs
public/service-worker.js # το app shell που ανοίγει χωρίς δίκτυο
```

**Πλοήγηση:** η λέξη ζει στο URL ως `?w=<word>`. Κάθε αναζήτηση, κλικ σε
συνώνυμο ή σε πρόσφατη λέξη γράφει νέα εγγραφή στο ιστορικό του browser, οπότε
το «πίσω» γυρίζει στην προηγούμενη λέξη και κάθε ορισμός είναι κοινοποιήσιμος.

**Ροή δεδομένων:** `Search` → `onSearch(query)` → `App` κρατάει
`{ term, nonce }` → `useDictionary` κάνει `fetch` στο
`https://api.dictionaryapi.dev/api/v2/entries/en/<word>` και επιστρέφει
`{ status, data, error }` → `WordDisplay`.

Το `nonce` αυξάνεται σε κάθε submit, ώστε η ίδια λέξη να μπορεί να αναζητηθεί
δύο φορές στη σειρά. Κάθε νέα αναζήτηση ακυρώνει την προηγούμενη με
`AbortController`, οπότε μια αργή απάντηση δεν προλαβαίνει να γράψει πάνω σε
μια νεότερη.

Το θέμα εφαρμόζεται με `document.body.className = theme` και το υπόλοιπο
γίνεται από CSS variables στο `index.css`. Η αρχική τιμή έρχεται από το
`localStorage` και, αν δεν υπάρχει αποθηκευμένη, από το
`prefers-color-scheme` του συστήματος.

# NONOLAND Audio Repair Status Report

**Updated:** 2026-11-26T21:49:00Z
**Mode:** Approved 45 Missing Academy MP3 Integration (`generated_audio_name_itemid/`) + 28 Arabic Letter Names + 219 Sheet2 + Manifest Sync & Verification

---

## 1. Executive Summary & Asset Counts

| Metric | Count | Verification Status |
|---|---:|---|
| Preserved Baseline Disk Assets | **1,109 / 1,109** | Verified intact (**24,635,147 bytes**, 100% SHA-256 parity against `NONOLAND_AUDIO_PRESERVATION_REPORT.md`) |
| `generated_audio_sheet2/` Approved MP3s | **219 / 219** | **133** AR + **86** EN preserved & SHA-256 verified |
| `arabic_letter/` Approved Letter-Name MP3s | **28 / 28** | `public/assets/audio/arabic-letters/names/nonoland_ar_*.mp3` verified |
| `generated_audio_name_itemid/` Approved 45 MP3s | **45 / 45** | **27** AR + **18** EN newly copied (`0` collisions, `0` overwrites, `45/45` passed `ffprobe` + `volumedetect`, SHA-256 parity verified) |
| Total Audio Files on Disk (`public/assets/audio/**`) | **1,402** | `1,109` baseline + `220` sheet2/extra + `28` Arabic letter names + `45` newly integrated Academy MP3s |
| Registered Client Lookup Entries (`src/data/academyAudioLookup.json`) | **291** | **185** AR + **106** EN, synced 1:1 with valid `data/academy-audio-manifest.json` assets (up from **246**) |
| Manifest Unique Items (`data/academy-audio-manifest.json`) | **1,500** | **291** `valid` (up from **246**), **1,209** `missing` (down from **1,254**), **0** `invalid`, **4** `needs-review` |
| Unapproved Group D (`Pink Ballet Dress` EN) | **1** | `en_b89f44855c685577.mp3` intentionally unmapped and absent on disk (returns HTTP `404` / `UNAVAILABLE`) |

### `generated_audio_name_itemid/` Integration Summary (45 Files)
| Category | Language | Count | Manifest & Lookup Status |
|---|---|---:|---|
| Arabic Canonical Numbers (`11..20`) | AR | 10 | Valid (`10/10` registered) |
| Geometric Shapes (`Circle..Hexagon`) | AR + EN | 10 (5 AR + 5 EN) | Valid (`10/10` registered) |
| Daily Offline Activities | AR + EN | 6 (3 AR + 3 EN) | Valid (`6/6` registered) |
| CVC Word Builder (`BAT, MAP, PEN, CUP`) | EN | 4 | Valid (`4/4` registered) |
| Deep Color AR Intro & Examples (incl. Pink AR) | AR | 5 | Valid (`5/5` registered) |
| ReadingAdventure P3 Phonics & Story Cues | AR + EN | 8 (4 AR + 4 EN) | Valid (`8/8` registered) |
| SmartAdaptiveAssessment P3 Phonics Cues | EN | 2 | Valid (`2/2` registered) |
| **Total Integrated** | **AR + EN** | **45 (27 AR + 18 EN)** | **45 / 45 Valid & Active** |

---

## 2. Preservation & Authorization Boundary Verification

- **1,109 Baseline Files Untouched:** All `1,004` Foundations MP3s (combined SHA-256 `de7ab266800381d974994283b3e21ed6721dfd94f88fec14122c5cc8a7b01813`), `28` legacy Arabic letter-name MP3s (`arabic-letters/`), `41` Quran story MP3s (`stories/`), `35` baseline Academy MP3s (`academy/`), and `1` WAV diagnostic chime verified byte-for-byte unchanged (`24,635,147` bytes).
- **219 Sheet2 + 28 Arabic Letter-Name Recordings Untouched:** Zero existing files modified or overwritten (`0` destination collisions across all 45 new files).
- **Strict Scope Enforcement:** Unapproved Group D (`Pink Ballet Dress` / `en_b89f44855c685577`) remains absent from disk and returns HTTP `404` / `UNAVAILABLE`; `POST /api/academy/tts` remains disabled (`410 Gone`).

---

## 3. `ERR-001` through `ERR-015` Exact Status

| Error ID | Summary | Code Status | Audio / Runtime Status |
|---|---|---|---|
| **ERR-001** | AR01–AR28 Level 1 Stage 5 & Q10 letter names | Fixed & Verified | **RESOLVED** — Routes through `resolveArabicLetterNameAudioUrl` (`arabic-letters/names/`, 28/28 valid) |
| **ERR-002** | Arabic Numbers 11–20 | Fixed & Integrated | **RESOLVED (10/10)** — Canonical `11..20` AR MP3s integrated under `academy/ar/` (Western & Arabic-Indic digits) |
| **ERR-003** | CVC Word Builder (10 words) | Fixed & Integrated | **RESOLVED (10/10)** — `6` in Foundations + `BAT, MAP, PEN, CUP` integrated under `academy/en/` |
| **ERR-004** | 9 English Alphabet Anchors (E,G,N,P,R,T,V,W,X) | Fixed & Verified | **RESOLVED** — 2-clip existing Foundations sequences via `englishAlphabetAudioMap.ts` |
| **ERR-005** | Geometric Shapes (AR + EN) | Fixed & Integrated | **RESOLVED (12/12)** — `star` in Foundations + `10/10` (`circle..hexagon` AR+EN) integrated under `academy/{ar,en}/` |
| **ERR-006** | Daily Offline Activities (3x2) | Fixed & Integrated | **RESOLVED (6/6)** — Integrated under `academy/{ar,en}/` |
| **ERR-007** | Deep Journey (Color, Arabic, English, Math) | Fixed & Wired | **291 READY** across `academy/{ar,en}/` (incl. `5` Deep Color AR items + `شريط وردي` / `فستان باليه وردي`); `Pink Ballet Dress` EN (`en_b89f44855c685577`) intentionally unapproved/absent |
| **ERR-008** | 4 `needs-review` bare Arabic letters (`ب, ش, ل, و`) | Bypassed in Level 1 | **MANUAL REVIEW PENDING** — Preserved untouched in `academy/ar/`; flagged `needs-review` in manifest |
| **ERR-009** | `StudentHomeworkSection.tsx` `q.audioUrl` | Fixed & Verified | **RESOLVED (Code)** — Plays `q.audioUrl` with `playsinline` & visible error alert |
| **ERR-010** | `AssignedExamsSection.tsx` silent `catch` | Fixed & Verified | **RESOLVED (Code)** — Managed `audioRef`, `playsinline`, visible `role="alert"` |
| **ERR-011** | `AdminCmsPanel`, URL safety & `ExamsScreen` | Fixed & Verified | **RESOLVED (Code)** — Relative `/assets/` & `/uploads/` URLs supported & validated |
| **ERR-012** | `soundEngine.speak` P3 cues (10/10) | Fixed & Integrated | **RESOLVED (10/10)** — `4` AR + `4` EN ReadingAdventure + `2` EN SmartAdaptiveAssessment cues integrated under `academy/{ar,en}/` |
| **ERR-013** | `POST /api/academy/tts` disabled | Verified (`410 Gone`) | **INTENTIONAL** — Academy runtime TTS stays permanently disabled (`410 Gone`) |
| **ERR-014** | Missing audio HTTP 404 fail-closed | Verified | **RESOLVED** — Missing assets return HTTP 404 & `UNAVAILABLE`; `291/291` integrated items return HTTP 200/206 |
| **ERR-015** | Live Browser DOM / Android WebView playback | Not Tested | **NOT TESTED** — No Chromium/Playwright browser binary or Android WebView runtime in sandbox |

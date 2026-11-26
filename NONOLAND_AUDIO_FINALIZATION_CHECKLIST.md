# NONOLAND Audio Finalization Checklist

**Updated:** 2026-11-26T11:24:00Z

The **219** approved MP3 files from `generated_audio_sheet2/` (`133` AR + `86` EN) are integrated, mapped 1:1 in `data/academy-audio-manifest.json` and `src/data/academyAudioLookup.json` (`246` valid total), and verified over Express HTTP (`219/219` HTTP `200`, `audio/mpeg`, `206 Range`). Remaining items to reach 100% completion:

1. **Restore / Re-Supply the 45 Pre-Snapshot Nov 25 MP3s Absent on Disk**
   - In the Nov 26 container snapshot, `45` MP3s previously produced on Nov 25 were absent from `public/assets/audio/academy/{ar,en}/`:
     - `10` Arabic canonical numbers `11..20` (`ar_d41e9709e9ea2e5b`..`ar_5ddf71193434bb33`) — causes `tests/verify-academy-regression.ts` `[3/7]` to fail
     - `10` Geometric Shapes (`circle, square, triangle, pentagon, hexagon` AR + EN)
     - `6` Daily Offline Activities (`3` AR + `3` EN)
     - `4` CVC words (`BAT, MAP, PEN, CUP`)
     - `10` P3 cues (`8` `ReadingAdventureScreen` + `2` `SmartAdaptiveAssessmentPanel`)
     - `3` Deep Color intros/examples (`ar_2cb89b55f55e1d0c`, `ar_5ce638df43ce7dbd`, `ar_7e481c05b10efdf8`)
     - `2` Deep Color Pink AR (`ar_18d87bc9fe20bbde`, `ar_240faf3d808ea53e`)
   - Once those `.mp3` files are supplied/restored into `public/assets/audio/academy/{ar,en}/`, run manifest sync (`syncAndValidateAcademyManifest`) and re-run `npx tsx tests/verify-academy-regression.ts`.

2. **Content Decision for `Pink Ballet Dress` (Group D — Remaining Unapproved Item)**
   - `en_b89f44855c685577` (`Pink Ballet Dress`) remains excluded and absent from disk.
   - Decide whether to approve & provide `en_b89f44855c685577.mp3` or replace it in `src/data/deepCurriculum.ts` with an existing Foundations asset.

3. **Human Listening & Pronunciation Audit (Group F — `ERR-008`)**
   - Review the **4** flagged `needs-review` bare Arabic letters in `public/assets/audio/academy/ar/` (`ar_a1297edee10476b6.mp3` `ب`, `ar_124315331f64f556.mp3` `ش`, `ar_24be271a98354ce7.mp3` `ل`, `ar_42f9bf089dc3e0e5.mp3` `و`).

4. **Real-Device Browser & Android WebView Smoke Test (`ERR-015` — Currently NOT TESTED)**
   - Test tap-triggered `HTMLAudioElement.play()`, switching clips, repeated taps, and fail-closed errors on **Desktop Chrome** and **Android WebView**:
     - Deep Learning Paths (`color`, `arabic`, `english`, `math`) for the `219` newly activated recordings
     - Level 1 Lessons AR01–AR28 Stage 5 & Stage 10 Q10
     - Academy Alphabets, Teacher Homework, Assigned Exams, Admin CMS, and Quran Stories

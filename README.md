# Unconscious Mind — subliminal priming experiment

Do pictures you can't consciously see change what you prefer?
Participants watch a short flicker that hides beach-related pictures, football-related pictures,
or nothing, and then choose between 10 pairs of pictures (one beach option, one football option).

## How to run it (nothing to install)

1. On GitHub: **Code → Download ZIP**, then unzip it. Keep the whole folder together.
2. Double-click **`index.html`** — it must open in **Google Chrome**. (If it opens in another browser:
   right-click → Open with → Chrome.)
3. The setup screen appears. Type the laptop name (`L1`, `L2`, …), leave the condition on **Automatic**,
   and check that it says *all 92 loaded* and *60 Hz → 2 frames ≈ 33 ms*.
4. Click **Start participant**, turn the laptop to the participant, and let them do the rest (about 3 minutes).
5. At the end a file `result_L1-001.csv` downloads automatically. Click **Experimenter: next participant**.
6. After the session, also click **Download all results** on the setup screen as a backup.
   Send all the CSV files to whoever does the analysis.

Works offline: React is included in `lib/`, there is no server and no internet needed.

**Before every session:** laptop plugged in (battery saver changes timing), brightness up, notifications off,
other apps closed, Chrome only. Try **Demo mode** once (pictures shown slowly, nothing saved) to see what is
actually hidden in the flicker.

## What the participant sees

| Step | What happens | Time |
|---|---|---|
| Consent | Bullet points (voluntary, anonymous, can leave anytime with *Withdraw* or Esc, class use only, flicker warning) + 2 checkboxes | — |
| Demographics | Age, gender, nationality, year of study, vision | — |
| Instructions | Look at the +, then pick the picture you like more | — |
| Main flicker | + for 2 s, then 72 flashes: 24 pictures × 3, each **33 ms** followed by a **100 ms** scrambled mask | ~12 s |
| 10 choices | Before each pair: + then 8 more flashes (~1 s), then "Which one do you like more?" | ~1 min |
| Awareness check | "Did you notice any pictures?", "What did you see?", "What was this study testing?" | — |
| Recognition test | 4 pairs (one beach prime, one football prime): "which was hidden in the flicker?" | — |
| Debrief | Explains the study, asks them not to tell other students | — |

Leaving full screen or pressing Esc at any point = withdrawn, nothing is saved.

## Design

* **Independent variable:** prime condition — A beach, B football, C no prime (identical flicker and masks,
  gray frames instead of pictures). Assigned automatically in shuffled blocks of 3 per laptop, so groups stay balanced.
* **Dependent variable:** number of beach choices out of 10 (`beach_choices`). `primed_choices` = choices that
  match the participant's prime.
* **Prediction:** beach group > no-prime group > football group in `beach_choices`.
* **Subliminality check:** `noticed_images`, `saw_description` and `recog_correct` (out of 4; chance = 2).
  If the A/B groups score clearly above 2, the pictures were not fully subliminal.
* **Suggested analysis:** one-way ANOVA (or Kruskal–Wallis) on `beach_choices` across the 3 groups, or a
  chi-square on beach vs football choices × condition. Report `prime_ms_mean` and `dropped_frames` to show the
  timing was correct.

## Why 33 ms and not 1 ms?

A laptop screen redraws 60 times a second, so nothing can be shown for less than one frame (16.7 ms).
What makes a picture subliminal is the **backward mask** right after it: masked pictures shown for up to
~50 ms are typically not consciously seen but are still processed. The app counts screen refreshes
(not milliseconds), adapts to 120 Hz screens, and logs the real duration of every flash.

## Stimuli

| Folder | Contents |
|---|---|
| `images/` | Original downloads (full size, untouched) |
| `stimuli/beach`, `stimuli/football` | 19 photos + 5 generated patterns each, cropped to 512×512 |
| `stimuli/choices` | The 20 choice pictures, 640×640 |
| `stimuli/masks` | 24 scrambled mosaics made from both prime sets (same masks for every group) |

Left out: `beach/20.jpg` (watermelon — same object as a choice option) and `football/12.jpg`
(watermelon — a beach item). `choices/10.jpg` was renamed to `10a.jpg`.

Choice pairs (matched by category, edit in `config.js`):
flip-flops vs football boot · sun hat vs cap · coconut vs sports bottle · ice cream vs burger ·
beach bar vs sports bar · hammock vs park bench · tropical beach vs ball on pitch · swimmer vs football game ·
pool vs running track · watermelon vs jerseys.

If you change photos, run `python3 tools/prepare_stimuli.py` (needs `pip install pillow numpy`).

## Files

* `index.html` — open this
* `app.js` — the experiment (React via `lib/`, no build step)
* `config.js` — timings, picture lists, pairs: **the only file you should need to edit**
* `tools/prepare_stimuli.py` — makes `stimuli/` from `images/`

## Data columns (one row per participant)

`participant_id, laptop, condition, started_at, finished_at, duration_s, age, gender, nationality, study_year,
vision_ok`, then for each pair `pairN_<category>` (beach/football), `pairN_rt_ms`, `pairN_order`,
`pairN_beach_side`, then `beach_choices, football_choices, primed_choices, noticed_images, saw_description,
purpose_guess, recog_beach_picks, recog_correct, recog_trials, refresh_hz, prime_frames, prime_ms_target,
prime_ms_mean, prime_ms_min, prime_ms_max, mask_ms_mean, dropped_frames, total_flashes, screen, browser`.

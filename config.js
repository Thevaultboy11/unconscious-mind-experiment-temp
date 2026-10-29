// =====================================================================
//  EXPERIMENT SETTINGS — the only file you should need to edit.
//  (Plain JS, not JSON, because Chrome blocks reading .json from file://)
// =====================================================================
window.EXPERIMENT_CONFIG = {
  courseName: "Unconscious Mind",

  timing: {
    primeMs: 17,          // how long each hidden picture is on screen (rounded to whole screen refreshes: 60 Hz -> 1 frame = 16.7 ms, 120 Hz -> 2 frames)
    maskMs: 83,           // scrambled mosaic shown after every picture (this is what hides it). 60 Hz -> 5 frames
    fixationMs: 2000,     // "+" before the main flicker
    reprimeFixationMs: 800,
    mainRepetitions: 2,   // every prime picture appears this many times in the main flicker (24 x 2 = 48 flashes ~ 5 s)
    reprimeFlashes: 6,    // short flicker before each choice (~0.6 s)
    stimulusPx: 480,      // size of the flashed square on screen (CSS pixels)
    demoPrimeMs: 400,     // demo mode: slow enough to SEE the pictures (for checking / screenshots)
    demoMaskMs: 300,
  },

  // Conditions. "none" = identical flicker, but gray frames instead of pictures.
  conditions: {
    beach:    { label: "A — Beach prime" },
    football: { label: "B — Football prime" },
    none:     { label: "C — No prime (control)" },
  },

  primes: {
    beach: ["1.jpg","2.jpg","3.jpg","4.jpg","5.jpg","6.jpg","7.jpg","8.jpg","9.jpg","10.jpg",
            "11.jpg","12.jpg","13.jpg","14.jpg","15.jpg","16.jpg","17.jpg","18.jpg","19.jpg",
            "p1.png","p2.png","p3.png","p4.png","p5.png"],
    football: ["1.jpg","2.jpg","3.jpg","4.jpg","5.jpg","6.jpg","7.jpg","8.jpg","9.jpg","10.jpg",
               "11.jpg","13.jpg","14.jpg","15.jpg","16.jpg","17.jpg","18.jpg","19.jpg","20.jpg",
               "p1.png","p2.png","p3.png","p4.png","p5.png"],
  },

  maskCount: 24, // stimuli/masks/m1.jpg ... m24.jpg

  // Choice pairs: beach option vs football option, matched by category.
  // Left/right position and pair order are randomised for every participant.
  pairs: [
    { id: 1, category: "Footwear", beach: "5a.jpg", football: "9b.jpg"  }, // flip-flops vs football boot
    { id: 2, category: "Hats",     beach: "4a.jpg", football: "1b.jpg"  }, // sun hat vs cap
    { id: 3, category: "Drinks",   beach: "7a.jpg", football: "8b.jpg"  }, // coconut vs sports bottle
    { id: 4, category: "Food",     beach: "6a.jpg", football: "4b.jpg"  }, // ice cream vs burger
    { id: 5, category: "Places",   beach: "1a.jpg", football: "10b.jpg" }, // tropical beach vs ball on pitch
  ],

  // Not used. Move any of these into "pairs" above to swap a pair (keep ids unique).
  sparePairs: [
    { id: 6,  category: "Bars",     beach: "8a.jpg",  football: "2b.jpg" }, // beach bar vs sports bar
    { id: 7,  category: "Relaxing", beach: "9a.jpg",  football: "7b.jpg" }, // hammock vs park bench
    { id: 8,  category: "Activity", beach: "2a.jpg",  football: "5b.jpg" }, // swimmer vs football game
    { id: 9,  category: "Venues",   beach: "10a.jpg", football: "3b.jpg" }, // pool vs running track
    { id: 10, category: "Misc",     beach: "3a.jpg",  football: "6b.jpg" }, // watermelon vs jerseys
  ],

  recognitionTrials: 4, // awareness check: "which of these was hidden in the flicker?"
};

# Storyboard v3: realistic 3D plus clean 2D

The audience is a curious 15-year-old with no biology. Every hard idea is shown happening, slowly, at the moment the voice says it. The cue numbers match `script.json`, and exact cue times are in `build/timings.json`.

## What goes in 3D and what goes in 2D

- **3D (realistic, lit, cinematic):** anything physical the viewer should feel is real.
  - The chest, the hits, the real heart (from the NIH model) beating, squeezing, quivering and being shocked.
  - Camera flights into the heart wall, cells as real 3D objects, the cell skin with doors as 3D proteins and ions as glowing spheres.
  - The rowing protein strands, the AED.
- **Clean 2D (flat, crisp, diagram-like):** anything that is logic the viewer has to follow step by step.
  - The blood figure-8 loop, voltage graphs, the cell row with knocks and padlocks.
  - The rule table, the ECG, the cell grids for the patchwork, the re-entry loop and the shock.
- **Transitions between them must be physical.** For example, a 3D patch of heart wall lifts off and flattens into the 2D grid, or a 3D cell skin flattens into the 2D membrane strip. That way the viewer always knows the 2D diagram is the same tissue.

## Global rules (every scene)

1. **One colour key with only three cell states**, the same everywhere. A padlock icon changes with the colour.
   - **Ready**: teal-blue, open padlock.
   - **Locked**: red, closed padlock.
   - **Firing**: yellow-white flash.
   - There is no half-unlocked or amber state anywhere. The colour of the electrical glow (yellow-white) is never used for anything else: the fat on the 3D heart is muted cream.
   - Show a small key in the corner whenever cell states are on screen.
2. **Blood colours (blue/red) appear only in the pump scene.** Elsewhere the heart is realistic muscle tone, so red never means two things.
3. **No heat-map or colour-blob tissue panels anywhere.** Tissue is always drawn as discrete cells (bricks) in rows or grids, with padlocks.
4. **One idea on screen at a time.** No label appears unless the voice is saying it. Fade the old panel out before the new one comes in. Insets stay at least 3 s.
5. **Slow motion** is shown as a corner badge "slow motion", never under a fact like "0.1 s".
6. **Text** is large, at least 30 px for labels, and never overlaps. Nothing goes in the caption band (y > 950). No empty or black frames between cues.
7. **Captions** never split a word or an acronym.

## 1. A blow that stops a heart (3D)

- 0: Three quick 3D shots, each matching its word. A cricket ball hits a translucent torso. A bent knee (a recognisable leg) hits it. An arm with the elbow leading hits it. Each has an impact flash, and the real heart is visible faintly inside the ribcage.
- 1: The camera inside the chest. All the ribs glow intact together, with a tick "No broken ribs". The heart beats calmly, with a tick "Heart not damaged".
- 2: A calm ECG strip beside the heart. A hit lands, the heart stops squeezing and quivers, and the ECG turns into a chaotic squiggle.
- 3: Title "COMMOTIO CORDIS" with the subtitle "Latin: commotion of the heart". Two stamps: "Injury ✗" and "Electrical fault ✓".
- 4: The real heart rotates slowly. Glowing electrical paths trace over it (no labels). Title "The heart's wiring".

## 2. The pump (3D heart, then a 2D loop)

- 0: The real 3D heart, cut away to show the four chambers. A small person silhouette faces the viewer to explain "their right is on your left". Label right and left.
- 1: Highlight and label the atrium (small, top) and the ventricle (big, muscly, bottom) on each side.
- 2: **Clean 2D figure-8 loop** (heart in the middle, lungs drawn once at the top, body drawn once at the bottom). A blob of used blood (blue) travels right pump → lungs, turns red, → left pump → body, turns blue, → back to the right pump. Only the leg being described is bright, and the others are dimmed. A small key: "blue = used, red = fresh (real blood is always red)".
- 3: Back to the 3D heart. The bottom chambers fill by themselves (a fill level rises to about 75%), the top chambers give a small squeeze (topping up to 100%), then the bottom chambers squeeze hard. Short labels "fills by itself", "top-up", "real pumping".
- 4: The heart sits still, its wall glowing faintly. "Who gives the order?"

## 3. The spark (3D zoom, then 2D membrane and graph)

- 0: The 3D heart. A glowing dot in the right atrium, labelled "Sinoatrial node: natural pacemaker". It pulses rhythmically. "60 to 100 a minute, all by itself".
- 1: One continuous 3D camera push from the heart to the glowing node, a cluster of cells, one cell, then its skin. The skin shows 3D door proteins and glowing ions. It then flattens into the 2D membrane strip (outside on top, inside below). Labels "cell skin", "doors". A legend of three balls: sodium, potassium, calcium, "all positive".
- 2: Sodium and calcium crowd outside, and potassium inside. Then a simple battery icon morphs over the cell: minus inside, plus outside. Label "like a tiny battery: inside negative".
- 3: The leaky door trickles sodium in. A 2D graph (axis labels "negative", "0", "positive", no mV numbers) creeps towards a dashed "tipping point".
- 4: Calcium doors fling open with a green rush, and the graph spikes. "SPARK!"
- 5: Potassium doors open, purple flows out, and the graph drops. Then the loop repeats, with the trace coloured by phase (orange creep, yellow spike, purple reset) and the words CREEP, SPARK, RESET lighting up in time. The graph clears and redraws each cycle (no scrolling).
- 6: Three stacked mini traces: "normal", "adrenaline: faster", "calming nerves: slower".

## 4. The wiring (2D cells, then 3D heart)

- 0: 2D row of brick cells joined by tunnels. The left cell fires, and a glowing knock travels through the tunnel to its neighbour. Label "a knock".
- 1: Dominoes from left to right: each fires and knocks the next. Then a 2D grid of about 12 by 8 bricks: one flagged "one spark" cell fires, and a ring of firing spreads outward over 2 s ("one spark becomes a wave"). No lock or ignored labels here.
- 2: The real 3D heart. A golden wave spreads from the SA node across both top chambers, which squeeze.
- 3: A translucent grey barrier plate between the top and bottom chambers, with X marks where the signal is blocked. The AV node glows as the one gateway, with a "0.1 s" timer. "Top first, then bottom".
- 4: Bright fast-wiring lines race down the middle wall and around the inside of the bottom chambers (only there).
- 5: The whole bottom lights up quickly and the 3D heart squeezes hard. "Whole bottom fires in 0.1 s".

## 5. The muscle cell (3D zoom, 2D membrane and graph, 3D strands)

- 0: 3D push into the bottom-chamber wall, through striped muscle cells, to one cell. Flatten into the 2D membrane with fast sodium, calcium and potassium doors. Flat graph: "no leak, just waiting". Key in the corner.
- 1: A knock arrives from the neighbour (shown at the edge). Sodium doors fling open, a yellow flood, the graph shoots up. "FIRE".
- 2: Calcium pours in (green) and the graph holds high. Then a **3D close-up**: calcium pops the locks off the strand, two or three myosin heads row along the actin strand, and it visibly slides. "Calcium = squeeze". Pull back to the 3D heart squeezing.
- 3: Back to 2D. Potassium pours out, the graph falls back, the calcium is pumped away and the strands slide back: "reset, relax".
- 4: Summary card with coloured balls and full words: SODIUM = GO, CALCIUM = SQUEEZE, POTASSIUM = RESET, with GO, SQUEEZE, RESET labelled on the graph curve.

## 6. The lockout (2D, key teaching scene)

- 0: One big 2D sodium door. It opens, sodium rushes in, and the hinged lid swings shut and plugs it. A closed padlock appears, and knocks bounce off: "Locked. Knocks ignored."
- 1: Potassium leaves and the graph returns to negative. The lid pops open and the padlock opens: "ready again". A timeline bar: "locked about a quarter of a second". Then a simple line: locked + knock = ignored, ready + knock = fires (shown as two tiny animated examples, not a table).
- 2: **Cell row** of about 8 big cells, played slowly:
  - The signal arrives at cell 1 from the left (hold 2 s).
  - Cell 2 fires and knocks both ways. The backward knock hits cell 1, which is red and locked, and bounces off ("ignored: it just fired"). The forward knock fires cell 3.
  - Repeat. A red trail behind and blue ahead. "Only forwards".
- 3: The last cell knocks into nothing ("nothing left") and the wave dies. Two timer bars: "wave crosses: 0.1 s" (short) and "cells stay locked: 0.25 s" (long). The whole row is still red when the wave dies, then turns blue later with no wave left.
- 4: The same row firing again, but some cells are tagged "fast" and some "slow", each with a small lock-time bar. They turn blue in a mixed order, ending in a mixed red and blue row: "they don't all unlock together".

## 7. The vulnerable window (2D ECG and cell grid, 3D locator)

- 0: A monitor-style 2D ECG. The tall spike is labelled "bottom chambers fire", the bump after it "T wave: resetting". A small 3D heart beside it beats in sync.
- 1: A cursor moves partway up the T wave. Below it, a short row of about 8 big cells (the same style as scene 6): just after the spike all are red, and at the cursor some have turned blue and some are still red. A bracket on two neighbours: "right next to each other". Label "patchwork".
- 2: A red band on that part of the T wave: "VULNERABLE WINDOW". A bar for one heartbeat (about 1 s) with the window drawn about 2% wide: "a few hundredths of a second".
- 3: A warning icon on the band: "a blow here = danger".

## 8. The split second (3D blow, then 2D logic: the most important scene)

Keep it SIMPLE. The only point to land is: the wave gets blocked, goes round, comes back when the blocked cells are ready, and then chases its own tail.

- 0: 3D: the ball hits the chest at the moment the ECG cursor is in the red band. Freeze-frame.
- 1: 3D: the camera pushes into the heart wall under the hit. Cells squash and stretch. Stretch doors (proteins with spring-like coils) pop open on the 3D cell skin, and glowing positive ions pour in. "A fake knock".
- 2: Two tiny 2D rows of 5 big cells side by side. "All locked": the fake knock bounces off ("ignored"). "All ready": one wave sweeps out and dies at both ends ("one extra beat, harmless").
- 3: A **small patch of about 12 big cells**. The hit fires the cell under it (impact ring). On one side, 2 or 3 cells are red and padlocked, each with a small timer bar emptying ("still locked"). The knock into them bounces off ("ignored"). A bright arrow shows the wave escaping the other way and **going around** them.
- 4: As the wave travels round, the red cells' timers run out and they turn blue ("now ready"). The wave reaches them from the far side and goes **straight through** them, arriving back at the start cell.
- 5: The start cell has turned blue too ("ready again"). It fires, and the path becomes a glowing **loop**. Show it as a **ring of cells**: the bright head of the wave runs round, with a **red locked tail behind** and **blue ready cells ahead**. It never runs into a locked cell, so it never stops. A lap counter: 1, 2, 3. "A wave chasing its own tail: re-entry".
- 6: Pacemaker pulses arrive at the ring and fizzle out against its red tail ("fizzles out"). Then cut to the **3D heart**: the loop becomes several glowing spinning swirls on the bottom chambers, which multiply: "electrical tornadoes".
- 7: Why it's rare: three ticks build up as they're said: "right over the heart" (a 3D chest target), "the wrong force" (a gauge from "too soft" through "danger" to "too hard", with the needle in the danger band), "inside that tiny window" (the ECG red band). Then "mostly young people playing sport".

## 9. Ventricular fibrillation (3D)

- 0: The real 3D heart quivering instead of squeezing, with several glowing spiral fronts on the ventricle wall. A side inset: "normal squeeze" (blood pushed out) against "quiver" (nothing comes out). A chaotic ECG. Write "Ventricular fibrillation" once.
- 1: The blood flow to a brain icon stops on "no blood pumped", and an oxygen bar drains. A simple figure collapses: "within seconds".
- 2: A clock: "fatal within minutes without help".

## 10. The reset button (3D AED and shock, 2D logic)

- 0: 3D: a green AED box on a wall, opened, with pads placed on the chest. "AED: anyone can use one, it talks you through it".
- 1: Question card: "If a knock caused this, why does a bigger knock fix it?"
- 2: The loop ring from scene 8 next to a small patch: the hit fired one small spot, with blue ready cells all around, and the wave runs out into them ("room to run").
- 3: The ring and patch full of spinning loops. The shock flash fires EVERY cell at once: everything turns red with closed padlocks ("every cell locked at once"). The loop heads find red in every direction and fade out ("nowhere to go").
- 4: All cells turn blue together, then one clean pacemaker wave sweeps across. Cut to the 3D heart giving one coordinated squeeze, and a normal ECG beat.
- 5: 3D hands doing CPR on the chest, with blood arrows: "keep doing CPR until it recovers".
- 6: Two rows. "Chaos": the AED says "shock advised", shock, one clean wave. "Flatline": the AED says "no shock advised", nothing to reset ("there's no spark to take over").
- 7: The real heart beating steadily. "The heart itself is healthy". A stopwatch: "each minute without a shock: survival drops about 7 to 10%". "Every minute counts". Fade out.

# ShapeShift research protocol

Version 2, 2026-11-14. Every rule below is implemented in `src/shapeshift/study/` and
every threshold lives in `config/default.yaml`. Where this document and the code
disagree, the code is what ran, and the disagreement is a bug.

## 1. Question

When an MLB pitcher changes the physical shape of a pitch over the winter, does that
pitch get better results the next season than it would have otherwise? And which kinds
of change pay off?

The decision this informs is a player-development one: which offseason change is
worth a pitcher's limited training time. It is not a pitch-grading exercise. Shape
grades appear only as a mechanism check (section 6).

## 2. Data

- Every regular-season pitch from Baseball Savant, 2020 to 2026, pulled with
  `pybaseball` in weekly, checksummed partitions (`shapeshift fetch`).
- Spring training, postseason, pitches with missing tracking, and physically
  implausible readings are flagged and excluded (`shapeshift audit` prints the counts).
- The study uses season pairs 2021-22 through 2025-26. The 2020 season is used only as
  the "season before" for the 2021 pre-trend check.

## 3. Unit and pitch groups

The unit is one pitcher's pitch group in two consecutive seasons, with at least 150
pitches in each.

Pitch groups are coarser than Savant's labels on purpose. Savant introduced the sweeper
(ST) and slurve (SV) labels in 2023, so a 2022 "slider" and a 2023 "sweeper" can be the
same pitch. Sliders, sweepers, and slurves are one group, and a unit is dropped if a
second Savant pitch type makes up more than 15% of its group in either season (a
slider-sweeper mix would fake a shape change).

Movement is mirrored so positive horizontal break always means arm-side, for both
left- and right-handers.

## 4. What counts as a redesign

Classification reads physical shape only. No outcome column is passed to it, and a test
(`tests/test_treatment.py::test_classification_ignores_outcomes`) enforces that.

For each of eight features (velocity, induced vertical break, arm-side break, spin,
arm angle, release height, release side, extension):

1. Take the change in the pitch's season mean.
2. Subtract the median change for that pitch group in that season pair. This removes
   league-wide drift: aging, a new ball, tracking recalibration.
3. Compare it to a material threshold in the feature's own units.

A unit is a **redesign** when at least one feature:

- moved at least its threshold (2.0 mph velocity; 3.0 in of vertical or horizontal
  break; 150 rpm spin; 6 degrees of arm angle; 0.25 ft release height; 0.6 ft release
  side; 0.25 ft extension);
- moved at least 4 standard errors, given that pitch's own pitch-to-pitch spread; and
- held in both halves of the new season, keeping at least half the change and the
  same direction.

A unit is a **control** when every feature moved less than 60% of its threshold.
Everything in between is **ambiguous** and excluded, so the comparison is between
clear changes and clear non-changes.

Each redesign is labelled by its main feature (the one furthest past its threshold)
and direction, for example "more velocity".

### Amendment from version 1

Version 1 set thresholds by judgement (1.0 mph, 2 in, 0.25 ft release side, and so on)
and a control band of 50%. Applied to the data, it classified 59% of pitch-seasons as
redesigns and 4% as controls. That is year-to-year noise, not redesign, and it left too
few controls to match against. Version 2 resets each threshold near the 95th percentile
of ordinary drift-adjusted change. It was calibrated on the distribution of shape
changes alone. One honest caveat: the version 1 effect estimate had already been
computed when the amendment was made. To keep that visible, the version 1 rule is
re-run and reported in every sensitivity table.

## 5. Outcomes

All outcomes are post-season minus pre-season, signed so positive is better for the
pitcher.

**Primary: luck-adjusted runs saved per 100 pitches of the redesigned pitch.** This is
Savant's run-expectancy change for each pitch, with batted-ball luck removed. For a ball
in play, the actual wOBA value is replaced by the expected wOBA from exit velocity and
launch angle (converted at 1.24 runs per wOBA point). So a bloop single and a lineout
with the same contact quality count the same. Balls, strikes, walks, and strikeouts
keep their actual value.

**Secondary:** whiff rate per swing; called-strike-plus-whiff rate; chase rate per
out-of-zone pitch; zone rate; xwOBA on contact; hard-hit rate per ball in play; actual
(not luck-adjusted) runs saved; usage share; and runs saved per 100 pitches across the
whole arsenal, to catch effects on the pitcher's other pitches.

## 6. Mechanism check: shape grades

A gradient-boosted model predicts luck-adjusted run value from shape alone: velocity,
movement, spin, release, arm angle, and gaps to the pitcher's primary fastball. Plate
location, count, batter, and pitcher identity are excluded, and a test enforces the
exclusion list. Each season is graded by a model trained on the other seasons, so no
pitch is graded by a model that saw it. The grade change shows whether a redesign
improved the pitch "on paper" as well as in results.

## 7. Estimation

The estimand is the average effect of a redesign on the pitchers who made one.

1. **Propensity score.** Within each pitch group, a logistic regression predicts
   redesign versus control from pre-season shape (all eight features), runs saved per
   100, whiff rate, usage, age, and starter role.
2. **Matching.** Each redesign is matched, with replacement, to its 5 nearest controls
   by propensity logit within the same pitch group and season pair. The caliper is
   0.2 standard deviations of the logit (Austin 2011). A pitcher is never matched to
   himself.
3. **Regression adjustment.** A least-squares fit of each outcome change on the same
   covariates, fit on controls only, removes the imbalance matching leaves
   (Abadie-Imbens bias correction).
4. **Inference.** A pitcher-clustered bootstrap with 2,000 draws resamples pitchers
   with replacement, on both the redesign and the control side, and gives a 95%
   percentile interval. On simulated leagues with a known effect, the estimator is
   unbiased and its interval covered the truth in 95% of 60 runs (`tests/test_estimate.py`).

## 8. Eras

- **Development:** season pairs 2021-22, 2022-23, 2023-24.
- **Held out:** 2024-25 and 2025-26.

Each era is estimated as its own matched design. Results for both are reported
whatever they show.

2026 caveat: the automated ball-strike challenge system changed called strikes
league-wide. The drift adjustment and the control comparison absorb league-wide
changes, but zone-based outcomes in 2025-26 should be read with that in mind.

## 9. Checks

- **Balance:** standardized mean difference of every covariate before and after
  matching. Target |SMD| at most 0.1.
- **Pre-trend:** the same matched comparison on the season before the redesign
  (t-1 to t). It should be near zero.
- **Placebo:** 200 draws in which fake redesigns are sampled from controls, cell by
  cell, and run through the full estimator. The real estimate should sit outside that
  null distribution.
- **Sensitivity:** 1 or 10 controls per redesign; a 0.05 SD caliper; no regression
  adjustment; thresholds scaled by 0.75 and 1.5; the version 1 thresholds; also
  matching on whole-arsenal results; only one-feature redesigns; excluding rebounds;
  only units with a prior season; and dropping each season pair in turn.
- **Rebounds:** a redesign whose main feature moved at least half a threshold the
  other way the season before is a recovery, not a redesign (for example, regaining
  lost velocity after an injury). It is reported with and without these.

## 10. Change types and multiple testing

Change types are slices of the one all-seasons matched design, so each type's
all-seasons estimate is a blend of its two era estimates. Types with at least 25
redesigns are reported. p-values are adjusted across types with Benjamini-Hochberg.

A change type is called a finding only if both hold:

- its adjusted q-value is below 0.05; and
- its estimate is positive in both the development and the held-out era.

The rule is applied mechanically in `study/report.py`.

## 11. What this design cannot do

- **It is observational.** Matching handles what is measured: shape, results, usage,
  age, role. It cannot see intent, health, coaching, grip, or a new training program
  that changed several things at once. The whole-arsenal outcome and the pre-trend are
  partial checks, not proof.
- **"Redesign" means a measured change, not a chosen one.** Velocity loss and spin loss
  appear as change types even though nobody plans them.
- **Survivorship.** A pitcher must throw 150 or more pitches of the pitch in both
  seasons. Experiments abandoned in spring, and pitchers who lost their jobs, are not
  in the sample.
- **Labels.** The main-feature label is a summary. A redesign often moves several
  features together, so "more velocity" means velocity was the largest relative
  change, not the only one.

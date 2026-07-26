# Progressive disclosure — research report (2026-07-26)

Commissioned for mockup 047 (Simulator progressive disclosure). Compiled from
primary sources; each claim cites its origin. The condensed, decision-mapped
version lives inside
[mockups/047/simulator-progressive-disclosure.html](mockups/047/simulator-progressive-disclosure.html).

## 1. Core principles

**Definition (Jakob Nielsen / NN/g, coined 1995).** Progressive disclosure is a
strategy for managing feature-rich, complex interfaces: "Initially, show users
only a few of the most important options" then "offer a larger set of
specialized options upon request" (secondary screen/panel). It exists
specifically to resolve the tension between **feature-richness** and
**simplicity**.
Source: Nielsen Norman Group, "Progressive Disclosure" —
https://www.nngroup.com/articles/progressive-disclosure/

**Primary/secondary split — the two things you must get right (NN/g):**

1. _Feature distribution_: "You must get the right split between initial and
   secondary features. You have to disclose everything that users frequently
   need up front." Getting this wrong (hiding something most users need) is the
   single most common failure mode.
2. _Navigation clarity_: "It must be obvious how users progress from the
   primary to the secondary disclosure levels" — via clear, discoverable
   triggers and descriptive labeling, not vague icons.

**How many disclosure levels — the 2-level rule.** NN/g: "designs that go
beyond 2 disclosure levels typically have low usability because users often get
lost when moving between the levels." If more advanced features exist than two
levels can hold, chunk them into logical groups at the same level rather than
nesting a third level.

**Staged vs. on-demand disclosure.** _Progressive disclosure proper_: secondary
features surface only on user request (non-linear; user can ignore secondary
content entirely). _Staged disclosure_ (wizards): a forced, linear sequence,
appropriate only when steps are genuinely sequential and most users must
complete all of them.

**Benefits.** Improves learnability, efficiency of use, and error rate
simultaneously — novices aren't shown things they'd misuse, experts aren't
forced to scan past clutter.

**Related pattern.** Tidwell et al., _Designing Interfaces_ (O'Reilly),
catalogues progressive disclosure as staged revelation to prevent overwhelming
users while preserving discoverability of the hidden functionality (not just
deleting it).

## 2. Form-specific guidance

- **Minimize the field count first — before hiding fields.** NN/g: "Eliminating
  unnecessary fields requires more time, but the reduced user effort and
  increased completion rates make it worthwhile." Remove fields that are
  derivable, collectible later, or non-essential. Forms following
  field-minimization and sequencing guidelines achieved **78% one-try
  successful submission vs. 42%** for non-compliant forms.
  Source: NN/g, "Website Forms Usability: Top 10 Recommendations" —
  https://www.nngroup.com/articles/web-form-design/
- **Optional fields — cap and label, but prefer elimination.** "Limit the form
  to only 1 or 2 optional fields, and clearly label them as optional." The
  first-choice fix is removal from the primary view, not labeling.
- **Smart defaults / presets.** Carbon frames form-level disclosure as
  conditional revelation: "reveals any additional content that may arise based
  on the user's previous selection." A preset chip is legitimate progressive
  disclosure only if selecting it either fully substitutes for the form or
  visibly pre-populates it — chips and a full form fully exposed side by side
  defeat the purpose.
  Source: Carbon Design System, "Disclosures" —
  https://carbondesignsystem.com/patterns/disclosures-pattern/
- **Disclosure mechanisms by weight** (GitLab Pajamas): truncation with
  preview → inline accordion → dropdown/overflow → modal/new page → full
  step-by-step flow. "Determine which actions are most important using a
  combination of available user research and usage data"; avoid 3+ levels —
  "it could be a sign the feature is too complex."
  Source: GitLab Pajamas, "Progressive Disclosure" —
  https://design.gitlab.com/patterns/progressive-disclosure/
- **Chunking ≠ hiding** (Smashing Magazine): progressive disclosure and
  chunking manage two independent abandonment drivers — _perception of
  complexity_ (how much is on screen) and _interaction cost_ (how many
  actions/decisions are required).
  Source: https://www.smashingmagazine.com/category/forms/

## 3. Results / data-display guidance

- **"Overview first, zoom and filter, then details-on-demand."** Shneiderman's
  Visual Information-Seeking Mantra: overview of the whole collection first;
  zoom on items of interest; filter the uninteresting; details only on demand.
  Source: Ben Shneiderman, "The Eyes Have It" (IEEE VL 1996) —
  https://www.cs.umd.edu/~ben/papers/Shneiderman1996eyes.pdf
- **Accordions — uses and costs** (NN/g): use when users need only a few pieces
  of the page's content; avoid when the audience needs the majority of it. Core
  cost, stated directly: "Valuable content that is hidden under an accordion
  may be missed altogether."
  Source: NN/g, "Accordions on Desktop: When and How to Use" —
  https://www.nngroup.com/articles/accordions-on-desktop/
- **Signposting collapsed content.** A good accordion header answers "what will
  I find if I click this?" — counts and one-line previews, plus a clear
  clickability signifier (caret/plus tested best).
- **Accordion vs. tabs vs. rows** (Carbon): tabs for mutually exclusive views
  of comparable importance; accordion rows for a list of same-shaped secondary
  items; a single disclosure toggle for one clearly secondary block. "A
  disclosure should not take up a considerable amount of the size of the
  screen. Disclosures are meant to be smaller moments."

## 4. Developer-tool patterns

- **GitHub PR "Files changed"**: per-file "Viewed" checkbox collapses reviewed
  diffs; a persistent header shows viewed-count progress regardless of collapse
  state; bulk collapse/expand (Alt+click) as an escape hatch.
  Sources: GitHub Docs, "Reviewing proposed changes in a pull request"; GitHub
  Changelog, "Collapse all diffs in a pull request at once".
- **Vercel / Netlify deploy views**: accordion per build phase, collapsed by
  default; an always-visible deployment-status summary; in-log search as a
  shortcut past the disclosure hierarchy.
  Sources: Vercel Docs "Builds"; Netlify Docs "Build troubleshooting tips".
- **Chrome DevTools Network panel**: request row = overview; the detail pane is
  itself chunked into tabs (Headers/Preview/Response/Timing) so no single view
  is overloaded.
  Source: https://developer.chrome.com/docs/devtools/network
- **Common shape**: (1) a persistent summary/status the disclosure never hides;
  (2) collapsed-by-default detail with a count, glyph, or preview in the
  header; (3) a bulk or search escape hatch for power users.

## 5. Anti-patterns / when NOT to hide

- **Never hide the primary answer.** The pattern's prerequisite is keeping
  everything "frequently needed" up front — otherwise the extra click plus the
  implied unimportance actively harm. (NN/g, Progressive Disclosure)
- **Over-collapsing kills discoverability — quantified.** Hidden navigation was
  used in **27%** of desktop cases vs. **48%** (visible) and **50%** (combo):
  low salience, low information scent, added interaction cost.
  Source: NN/g, "Hamburger Menus and Hidden Navigation Hurt UX Metrics" —
  https://www.nngroup.com/articles/hamburger-menus/
- **Accordion blindness.** Collapsing content doesn't remove the need to see
  it; it makes it likely users won't. (NN/g, Accordions)
- **Disclosure that disorients.** Primer: "Refrain from creating interactions
  that drastically disorient the user's initial point of focus" — no scrolling
  the user away, no collapsing siblings as a side effect, no chevrons that are
  really navigation.
  Source: GitHub Primer, "Progressive Disclosure" —
  https://primer.github.io/design/ui-patterns/progressive-disclosure/
- **Sparingness.** Primer ("use sparingly") and Carbon ("smaller moments")
  converge: disclosure is a targeted fix for specific overflow, not a default
  architecture for every busy section.

## 6. Checklist

1. Identify the one primary answer and never gate it (the verdict sentence).
2. Cap disclosure depth at 2 levels; chunk sideways instead of nesting.
3. Cut fields before hiding them (delete/default/derive first).
4. Quick-fill chips must substitute for or visibly populate the form.
5. Sequence results overview → zoom/filter → details-on-demand.
6. Every collapsed header carries a count or preview, never a bare label.
7. Keep a persistent status summary visible regardless of collapse state.
8. A disclosure toggle must never move or reset unrelated UI.
9. Tabs only for mutually exclusive content; rows for secondary siblings.
10. Budget disclosure sparingly — fix the worst signal-to-noise sections only.

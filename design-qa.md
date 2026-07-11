# Design QA

- source visual truth path: `design/agent-native-options/option-3-selected.png`
- implementation screenshot path: `design/agent-native-final-pass2-1440x1024.png`
- viewport: 1440 × 1024 desktop, 390 × 844 mobile
- state: synthetic case loaded, Eve clarification visible, packet editable, confirmation blocked until ambiguity is answered
- full-view comparison evidence: `design/agent-native-comparison-pass2.png`
- focused region comparison evidence: `design/agent-native-comparison-focused-left.png`, `design/agent-native-comparison-focused-right.png`
- mobile evidence: `design/agent-native-mobile-390x844.png`

**Findings**

- No actionable P0, P1, or P2 differences remain. The implementation preserves the selected visual direction: restrained clinical palette, serif document hierarchy, thin separators, split Eve and canvas workspace, source status, source-bound packet, and one-question-at-a-time intake.
- Fonts and typography: display and body hierarchy match the reference intent, with readable optical weight, line height, and wrapping at both tested viewports.
- Spacing and layout rhythm: the final 42/58 workspace split matches the reference proportions. Header height, panel boundaries, question callout, packet rows, and composer remain aligned without clipping.
- Colors and visual tokens: warm paper surfaces, ink hierarchy, green verification, blue active state, and amber ambiguity all remain consistent with the source design.
- Image quality and asset fidelity: the target contains no photographic or illustrative assets. All visible UI icons use the Phosphor icon family; no placeholder, CSS-drawn, or handcrafted SVG assets were introduced.
- Copy and content: the generated mock content was replaced with real synthetic-case fields and source-grounded Eve copy while preserving the intended information hierarchy.
- Responsive behavior: at 390 × 844, `scrollWidth` equals `clientWidth` at 390 px. Controls wrap without horizontal overflow and the workflow continues vertically.
- Accessibility and interactions: inputs are labeled, focus styles are present, disabled states are visible, source links remain semantic, and the core flow is keyboard-addressable.

**Comparison History**

1. Pass 1 evidence: `design/agent-native-comparison-pass1.png`
   - Earlier [P1] finding: the implementation used a 36/64 split, materially narrowing Eve compared with the reference's approximately 42/58 composition.
   - Earlier [P2] finding: Eve's clarification was plain body copy, weakening the primary question hierarchy and leaving the left panel visually sparse.
   - Fixes made: changed the desktop grid to 42/58, added a source-grounded question callout using the shared icon system, and aligned the phase-specific Eve heading with the selected direction.
2. Pass 2 evidence: `design/agent-native-comparison-pass2.png`, plus both focused comparisons.
   - Post-fix result: panel proportions, question hierarchy, packet density, color tokens, typography, and composer anchoring now match the selected design intent. No actionable P0/P1/P2 findings remain.

**Primary Interactions Tested**

- Loaded the floating synthetic demo from the empty state.
- Received one source-grounded Eve clarification.
- Entered the clarification and confirmed the packet.
- Observed real progressive stages from medication resolution through adversarial verification.
- Received the canonical verified report with rejected claims, findings, source passages, and clinician questions.
- Switched to the Evidence only adaptive lens.
- Imported a real synthetic PDF through the intake API.
- Transcribed a real generated audio file through the voice API.
- Checked browser console warnings and errors: none.

**Open Questions**

- None blocking handoff.

**Implementation Checklist**

- [x] Match the chosen split-workspace composition.
- [x] Preserve editable source-derived packet fields.
- [x] Keep Eve limited to one clarification at a time.
- [x] Stream verified artifacts instead of revealing a static report.
- [x] Verify desktop and mobile behavior.

**Follow-up Polish**

- [P3] The compact action row is denser than the stacked action cards in the generated mock, but it preserves more space for the actual source packet and composer.

final result: passed

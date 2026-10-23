# Mobile UI Agent Instructions — UI Engineering & Visual Verification Rules

Scope: changes under `frontend/mobile`. The repository-level `AGENTS.md` also applies; these mobile-specific rules take precedence when they are more specific.

These instructions apply to changes under `frontend/mobile`.

## Responsive Bottom Tab Bar

## Functional icon contract

### Shared surfaces

- Shared `Button` and `IconBtn` keep their standard surfaces. Apply glass only to explicitly requested frequent-use controls in the main sales/chat flow (currently Read order / Scan code and Bobi toolbar/composer); do not propagate it to auth, settings, dialogs or secondary screens. Keep highlights static and non-interactive, preserving contrast and disabled/destructive states.

- Page/root/scroll backgrounds use `colors.bg`; cards, sheets and navigation surfaces use `colors.card`; recessed inputs, placeholders and neutral controls use `colors.surfaceMuted`.
- Do not add screen-specific neutral HEX backgrounds. Brand headers, semantic status surfaces, camera previews and image artwork retain their intentional colors.

- Keep existing brand illustrations on prominent actions. The all-Feather replacement was rejected; do not repeat it across the app.
- For future icon upgrades prefer simple two-tone filled artwork, with purple primary shapes and yellow/green accents. Review at actual control size before replacing existing assets.
- Keep the same symbol for the same action across screens. Logo and Bobi mascot are brand artwork exceptions; product photos are content.
- Brand color may emphasize an action; do not introduce a different icon family to make one button stand out.

When changing the Bottom Tab Bar in `app/(tabs)/_layout.tsx`:

- Keep the layout visually consistent across Expo native devices with different aspect ratios and the web preview.
- Use the actual Bottom Tab Bar layout width from `onLayout` or `useWindowDimensions`; do not position the center action using hardcoded screen pixels or unrelated percentage offsets.
- Derive the SVG curve, center action position, tab regions, and spacing from the same measured width and shared layout constants.
- Keep the center action aligned to `barWidth / 2` and keep the SVG curve centered on that same value.
- Treat safe-area space as part of the Bottom Tab Bar surface so no gap or background seam appears below it.
- Preserve the existing theme tokens and navigation routes; do not introduce new colors or alter tab behavior while making the layout responsive.
- Validate both the typecheck and the rendered UI at narrow, regular, and wide phone widths. A passing typecheck alone is not sufficient for visual completion.

### Native/web parity rules

- Treat the React Native layout coordinate system as the source of truth. Do not mix percentage positioning with measured SVG geometry when the parent has padding, borders, or safe-area space.
- For repeated bottom-tab regions, measure the bar with `onLayout`, derive `tabWidth = barWidth / tabCount`, and use numeric `left`/`width` values from that same measurement. The SVG, center action, labels, and touch targets must share this coordinate system on web and native.
- Keep the visual bar height separate from `insets.bottom`: the bar must remain anchored to the viewport bottom on every platform. Do not add the safe-area inset to the custom tab-bar height or use it to move the bar upward; if a platform exposes a bottom inset, cover it with the same bar surface instead of creating a visible gap.
- When a visual item opens a screen outside `Tabs` (for example `Chi phí` → `/expenses`), define its active state from the pathname as well as `state.routes`; do not assume every visible item is a `Tabs.Screen`.
- Before declaring parity, compare screenshots at the same logical viewport width and record platform, viewport, safe-area inset, and device pixel ratio. A web screenshot at a different frame width is not evidence of native parity.
- Keep all vertical geometry coupled: if `BAR_HEIGHT` changes, derive the SVG height, path bottom, and curve offset from shared constants. Never leave a fixed SVG/path bottom (such as the old `110`) when increasing the bar height, or the newly added lower area will reveal the background instead of the bar surface.
- Tune the bottom body and top curve independently: use a shared curve-depth constant for the SVG offset/control points and `BAR_HEIGHT` for the filled body. A thinner top rise must not be simulated by exposing the background or moving the whole bar.
- Do not reuse the SVG placement offset as the curve baseline. Keep separate constants such as `SHAPE_OFFSET` and `CURVE_HEIGHT`: changing `CURVE_HEIGHT` must visibly move the side shoulders while the SVG remains anchored. Otherwise the `top` offset cancels the curve change and repeated visual tuning appears to have no effect.
- When the requested change says “hạ các mép hai bên để cong hơn”, increase the side baseline (`CURVE_HEIGHT`) while preserving `SHAPE_OFFSET` and the center peak; do not lower only the center peak or move the whole tab bar.
- Keep the safe-area fill below the visual bar only (`top: BAR_HEIGHT`). A full-shell background layer sits behind the SVG curve and makes the area above the shoulders look opaque, hiding the intended transparent background.

### Shared motion contract

- Use `SCREEN_ANIMATION` from `src/motion.ts` for root stack screens and JavaScript tabs. Do not set route transitions independently in individual layouts; web and native otherwise fall back to different navigator defaults.
- The current contract is immediate navigation (`SCREEN_ANIMATION = 'none'`). Do not reintroduce `fade`, `slide_from_bottom`, `slide_from_right`, or per-screen overrides without a screenshot comparison on both web and native.
- Keep content feedback separate from navigation: streaming text, loading dots, press feedback, and the system keyboard may animate, but route changes must not animate.
- Use one keyboard strategy per screen. `KeyboardAvoidingView` may handle native safe-area/IME movement; web should not receive a fake keyboard-avoidance animation. Do not add a second `LayoutAnimation`, spring, or manual translate to the same composer.
- When auditing motion, test: opening a screen, switching tabs, focusing the composer, opening/closing the keyboard, starting a stream, and pressing send. Record web/native behavior separately; do not infer parity from typecheck alone.
AGENTS.md — UI Engineering & Visual Verification Rules
Scope: changes under `frontend/mobile`. Read this file before every UI/UX change in this directory. The repository-level `AGENTS.md` also applies.

## Natural-Language Task Defaults

Treat the user's natural-language request as the task specification. Do not require file names, implementation plans, technical terminology, or a formal checklist when the affected area can be identified from the repository.

For each UI request:

1. Infer the smallest affected scope from the request and existing code.
2. Inspect relevant files, theme tokens, navigation, and the current implementation before editing.
3. Preserve existing behavior, routes, labels, data, colors, and unrelated screens unless the user explicitly asks to change them.
4. State a brief inferred success criterion, then implement the change directly.
5. Run appropriate code checks and perform screenshot-based visual verification when the task is visual.
6. Iterate on visible mismatches instead of stopping after the first successful build or typecheck.
7. In the final response, summarize files changed, checks, runtime/screenshot verification, and remaining issues.

Ask a clarifying question only when intent cannot be safely inferred, when materially different implementations are possible, or when the requested action would expand scope or cause a risky/destructive change. Otherwise make the smallest reasonable assumption, state it briefly, and continue.

When the user says a design is still wrong, treat that as evidence that visual verification has failed. Reinspect the implementation and continue the fix-and-screenshot loop; do not defend the previous implementation based only on checklist compliance or passing code checks.

Project context: mobile application Sổ Nghe Lời. Preserve existing product behavior and visual identity.

1. Non-negotiable principle: visual correctness is not code correctness
A successful typecheck, lint, build, or git diff --check does not prove the UI looks correct. Never report a visual task as verified based on code checks alone.

For every UI task, use this loop:

Inspect → Define expected appearance → Implement → Run → Capture screenshot → Inspect/compare → Fix → Re-capture → Report.

Do not stop at the first successful compilation. If the environment cannot run the app or capture screenshots, state "Visual verification NOT performed", explain the concrete blocker, and provide exact manual validation steps. Never claim a screenshot was captured or reviewed unless it actually was.
2. Before editing
1. Read this file and relevant project documentation, theme/tokens, navigation configuration, and affected components.
2. Inspect the existing screen and surrounding layout; identify the actual source of the UI rather than patching random styles.
3. Preserve all routes, handlers, business logic, accessibility labels, icon semantics, tab ordering, and data unless the task explicitly changes them.
4. Write a short internal implementation plan and explicit, visually observable acceptance criteria.
5. If the user supplies a reference screenshot, treat it as the design target only for the requested changes. Do not reproduce its sample data, colors, labels, or other unrelated details.
6. If a visual reference is not available to the agent, do not invent one. Use the user's written constraints and say which details remain unverified.
3. Design-system protection
- Never change existing brand colors or invent HEX/RGB values unless explicitly requested. Reuse theme tokens and color constants.
- Preserve existing typography family, icon family, active/inactive color semantics, and overall design language unless explicitly changed.
- Preserve text, labels, numbers, images, and screen content unless explicitly changed.
- Prefer consistent spacing, optical alignment, balanced touch targets, and responsive layout over arbitrary offsets.
- Avoid unnecessary gradients, glows, shadows, glass effects, floating pills, bounces, or decorative layers.
- Avoid hardcoded physical screenshot pixels. Use logical units (dp/pt), actual window dimensions, safe-area insets, and measured layout.
- Keep touch targets accessible; aim for at least ~44pt on iOS and ~48dp on Android where practical.
- Support small/large devices, Android/iOS, text scaling, and gesture/navigation safe areas.
- Do not install new UI libraries without checking existing dependencies and justifying the need.
4. Mandatory screenshot-based validation
4.1 Choose an available runtime
Inspect package.json, Expo configuration, scripts, and installed tooling before running commands. Use the project's existing development workflow. Possible environments:
- Android emulator or attached device: start the app and capture with adb exec-out screencap -p > /tmp/ui-after.png (only when adb and a device are available).
- iOS Simulator on macOS: use xcrun simctl io booted screenshot /tmp/ui-after.png (only when xcrun and a booted simulator are available).
- Expo/React Native: use the configured Expo or React Native scripts to launch the app; do not assume a simulator is available.
- Web build, if genuinely supported: use an available browser automation/screenshot tool such as Playwright; a web screenshot does not replace native verification when platform behavior differs.
Capture the actual running UI, not an AI-generated mockup or an SVG preview. If the user supplies a baseline screenshot and it is available locally, keep it intact for comparison. Record platform, viewport, pixel density if known, screen name, and test state.
4.2 Visual inspection checklist
Open and inspect the captured screenshot. Check:
- Overall silhouette and proportions, especially curved/notched shapes.
- Element position, spacing, alignment, baseline, and optical centering.
- Correct container width, height, corner radius, and clipping.
- Icon and label sizes; consistent typography and visual weight.
- Safe-area gaps, overlap, scroll obstruction, and device edges.
- Shadows/borders: no unintended halos, seams, or doubled outlines.
- Colors and active/inactive states match the existing theme.
- Tap areas and navigation still work; inspect at least active and inactive states for tab changes.
If reference and output images are available, compare side by side at matched viewport dimensions. Pixel-diff, overlays, or image metrics may assist, but do not rely solely on them: dynamic text, anti-aliasing, and device differences can create harmless pixel differences. Do not claim a visual match solely from numeric similarity.
4.3 Iterate until acceptable
If the screenshot shows a mismatch, identify its specific visible cause (e.g., curve too tall, center button too low, labels misaligned). Change the underlying layout or geometry, then capture and inspect again. Avoid piling on absolute offsets to hide structural mistakes.

If a screenshot cannot be inspected with the available tools, stop claiming visual success. Report the blocker and request a screenshot from the user if needed.
5. Special rules: Bottom Tab Bar
These rules apply whenever editing the bottom navigation of Sổ Nghe Lời, including frontend/mobile/app/(tabs)/_layout.tsx.

Target behavior
- Traditional full-width, bottom-attached navigation bar; no Dynamic Island/floating pill.
- Background touches both screen sides and the bottom safe area without an unexplained gap.
- Rounded top corners and a subtle, smooth, symmetric upward rise at the center. The rise is part of the bar background itself, not a separate disc pasted behind the button.
- Raised circular center action button is visually centered inside the raised region, with appropriate breathing room around it.
- Curve should be a shallow, elegant bump, not a tall mountain or exaggerated arch.
- Center button must not sit so low that the curve looks like a large empty dome above it.
- Standard icons share one visual row; all labels, including the center label, should have closely aligned baselines.
- Balanced bar height; no excessive blank area above or below icons and labels.
- Retain the existing icon shapes, tab names/order, routes, and all existing brand colors.
- Active state changes only icon and label colors. No moving indicator, pill background, scaling, spring, bounce, or tab displacement. A subtle color transition is acceptable.
Geometry rules
- Derive curve control points from the measured screen width and actual bar height, not arbitrary fixed screen coordinates.
- Keep the curve continuous (C1-continuous where possible), centered, and symmetrical.
- Ensure the SVG background, center button, and touch layer use the same coordinate system; account for safe-area offsets separately.
- Decorative SVG must not intercept touches (pointerEvents handling as appropriate).
- Treat any numerical dimensions in task prompts as initial estimates, not proof of visual accuracy. Tune from screenshots.
Known failure patterns to catch
1. Flat top edge with a button simply overlaid on top.
2. Oversized center hump/arch that looks like a hill or mountain.
3. Center button positioned too low inside the hump.
4. Center label noticeably lower than neighboring labels.
5. Bar too tall, with disproportionate empty space.
6. Wrong border tracing through the button or a visible seam between layers.
7. Correct code checks but unverified or visibly wrong output.
Do not mark this component visually complete until these issues have been inspected in an actual screenshot.
6. Tools and agent workflow
Use available tools rather than merely describing what a human could do:
- Code agent (Codex): inspect repo, implement changes, run checks, and coordinate validation.
- Native runtime (Expo/React Native + Android Emulator / iOS Simulator): render the real screen.
- Screenshot capture (ADB / simctl / supported screenshot tooling): save actual output images.
- Image inspection or vision-capable agent: examine captured screenshots and compare against references; if unavailable, disclose this limitation.
- Playwright: optional for web targets or supported browser previews; not a substitute for native device validation.
Do not claim to have spawned specialized sub-agents or used screenshot/vision tools unless the current environment actually supports and executed them. If delegation/sub-agents are available, delegate visual review to an independent reviewer after implementation. The reviewer must inspect evidence, not merely read the implementation summary.
7. Quality gates
After implementation, run the checks supported by the repository (for example, typecheck, lint, tests, git diff --check). Then perform runtime and visual checks separately. If possible, verify at least one compact phone size and one additional viewport, and both Android/iOS when the task is cross-platform.

Do not make unrelated changes. Remove obsolete UI code only when confirmed unused. Review the diff for accidental changes to colors, strings, navigation, and screen content.
8. Required final report for EVERY UI task
Report these fields clearly:
- Files changed: exact paths.
- What changed: concrete UI differences, not generic "improved styling".
- Code checks: commands and pass/fail results.
- Runtime: platform/device and whether the app actually ran.
- Screenshot evidence: exact saved path(s), if any, and whether they were opened and visually inspected.
- Visual comparison: which reference was used and specific pass/fail observations.
- Remaining issues: known mismatches or blockers.
- Status: choose one of VISUALLY VERIFIED, CODE VERIFIED ONLY — VISUAL UNVERIFIED, or FAILED / NEEDS REVISION.
Never use VISUALLY VERIFIED unless the running app was captured and its screenshot actually inspected.
10. Cross-platform voice/read-order parity
- `app/voice.tsx` is a shared screen. Never hide or replace the whole screen because a speech engine is unavailable on one platform; gate only microphone actions and show an explicit capability/status message.
- Android/iOS use the native `speechEngine`; web uses the browser Web Speech API when available. `speechEngine.supported === false` on web is expected and does not mean the route is missing.
- Keep the route and navigation entry identical on web and native. Platform-specific differences must be limited to recording implementation, safe-area/keyboard behavior, and capability messaging.
- When debugging “app có, web none”, verify in order: `/voice` route registration, `ZenRing`/menu navigation, browser speech capability, then recording permission.
- Any change to this flow must be checked on both a native Expo runtime and web at the same viewport state; record which browser/device supports speech recognition.
- Navigation transition options on `Stack.Screen` are not a cross-platform animation contract: native-stack transitions may be ignored on web. For parity, set the stack transition to `none` and implement one shared screen-entry animation inside the screen (with platform-safe driver settings), avoiding double transitions.
- Shared screen animation values must live in `src/motion.ts` (for example `SCREEN_ENTER`); do not put a duration, distance, or easing literal in only the native or web branch. The native driver may differ for performance, but the contract values must remain identical.
- Prefer a short, single entrance animation and do not perform data loading, layout animation, or nested route animation that competes with it. Validate perceived speed on Expo first, then match web to that same contract.
- Bobi identity rules: reuse `src/components/MascotBadge` and `assets/bobi-bubble.png` for the Bobi screen and navigation entry. The Bobi tab is a route shortcut outside the normal active/inactive icon semantics, so it stays filled and brand-colored even when `/ai` is not active.
- Functional menu buttons use `ACTION_MENU_DURATION` (350ms) from `src/motion.ts`: ZenRing assistant menu opens with a staggered left/right/bottom slide plus fade, and QuickNav opens from the left with fade. Press feedback, drag release, recording, loading, and micro-interactions are separate and must not be forced to 350ms.

9. Priority and stopping rule
Explicit user requirements take precedence over aesthetic preferences. When a task asks for a visual match, prioritize the actual rendered result over a technically elegant implementation that looks wrong. If evidence is insufficient to validate the appearance, be transparent and ask for the missing screenshot or runtime access; do not fabricate validation.

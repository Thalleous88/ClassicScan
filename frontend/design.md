# ClassicScan — Design System (Graphite)

A premium, dark-only utility design system for ClassicScan. Built around a single
accent, hairline depth, and a strict type rhythm. The goal is a confident,
distinctive product feel — closer to Linear / Arc / iA Writer than to a generic
scanner template.

## Principles

1. **One accent, one signal.** A single mint accent carries the brand. No
   gradients, no second brand color, no decorative tinting.
2. **Depth by surface, not shadow.** Hierarchy comes from stepping
   `bg → surface → surfaceRaised` and 1px hairlines. Drop shadows are reserved
   for the bottom sheet.
3. **Functional iconography.** Icons exist to communicate, not to decorate.
   No icon-in-rounded-square hero blocks. No emoji.
4. **Type carries the page.** Display weight + tight tracking for titles,
   eyebrow + value pattern for meta. The page is legible without ornament.
5. **Strict rhythm.** Spacing and radius come from a small scale. If a value
   isn't on the scale, it isn't used.

## Color tokens

All values are sRGB hex.

### Surfaces
| Token            | Value     | Use                                          |
|------------------|-----------|----------------------------------------------|
| `bg`             | `#0B0B0E` | App background, deepest surface              |
| `surface`        | `#141418` | Cards, inputs, list rows, sheet              |
| `surfaceRaised`  | `#1C1C22` | Pressed / hovered, dialogs, popovers         |
| `hairline`       | `#26262C` | 1px borders, dividers                        |

### Ink
| Token       | Value     | Use                                    |
|-------------|-----------|----------------------------------------|
| `ink`       | `#F4F4F5` | Primary text, icons in body            |
| `inkMuted`  | `#A1A1AA` | Secondary text, captions               |
| `inkFaint`  | `#52525B` | Tertiary, disabled, eyebrow labels     |

### Accent
| Token         | Value     | Use                                 |
|---------------|-----------|-------------------------------------|
| `accent`      | `#6EE7B7` | Primary action, single brand signal |
| `accentInk`   | `#0B0B0E` | Text/icon on accent fill            |
| `accentSoft`  | `#0F2E26` | Accent-tinted badges, rails         |

### Status
| Token         | Value     | Use                            |
|---------------|-----------|--------------------------------|
| `warning`     | `#FBBF24` | Warning fills (handwriting)    |
| `warningInk`  | `#3B2A06` | Text on warning fill           |
| `danger`      | `#F87171` | Error text/icons               |
| `dangerInk`   | `#3B0A0A` | Text on danger fill            |

### Camera-feed exceptions
The camera screen overlays content on a live video feed. White at 100% and
black at 60% are permitted there — they are not part of the system palette.

## Spacing scale

`4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 56 / 80`

Two convenience extensions exist for layout edges already in use:
`18` (used by tight card padding) and `72` (used by header offsets). No other
ad-hoc values.

## Radius scale

| Token   | Value | Use                                |
|---------|-------|------------------------------------|
| `xs`    | 6     | Chips, tags, small inputs          |
| `sm`    | 10    | Inputs, secondary buttons          |
| `md`    | 14    | Cards, primary buttons, list rows  |
| `lg`    | 20    | Image frames, sheet top corners    |
| `pill`  | 999   | Pills, FAB, mode chips             |

## Elevation

There is no drop-shadow scale. Depth is communicated by:

1. **Surface stepping**: `bg → surface → surfaceRaised`.
2. **Hairlines**: 1px `hairline` borders or top/bottom rules.
3. **Sheet lift** (sole exception): bottom sheet uses
   `shadowColor #000, opacity 0.4, radius 24, offset (0, -4)`. No other
   component uses a drop shadow.

## Typography

Family: **Plus Jakarta Sans** (existing, already loaded).

| Role         | Weight     | Size / line-height | Tracking | Notes                          |
|--------------|------------|--------------------|----------|--------------------------------|
| Display      | 700 Bold   | 32 / 36            | -0.5     | Screen-level titles            |
| Title        | 700 Bold   | 22 / 28            | -0.3     | Section titles                 |
| Body-strong  | 600 Semi   | 15 / 22            | 0        | Buttons, emphasized body       |
| Body         | 400 Reg    | 15 / 22            | 0        | Default body                   |
| Caption      | 500 Medium | 12 / 16            | 0        | Meta, secondary info           |
| Eyebrow      | 700 Bold   | 11 / 14            | +1.4     | UPPERCASE, `inkFaint`          |
| Mono         | 400 Reg    | 14 / 22            | 0        | Reserved (not currently used)  |

The **eyebrow + value** pattern replaces decorative section headings:

```
RECENT
New scan • 2 minutes ago
```

## Components

### Button

Single component, three variants. Height 48, radius `md`, full-bleed body
weight, optional leading/trailing icon.

| Variant     | Bg          | Border        | Text        | Pressed              |
|-------------|-------------|---------------|-------------|----------------------|
| `primary`   | `accent`    | none          | `accentInk` | `accent` @ 80%       |
| `secondary` | `surface`   | 1px `hairline`| `ink`       | `surfaceRaised`      |
| `ghost`     | transparent | none          | `ink`       | `surface` @ 50%      |

`disabled` → opacity 0.4. `loading` → swap label for a 16px spinner in
`accentInk` (primary) or `ink` (others).

### Input

Bg `surface`, 1px `hairline`, radius `sm`, height 48, padding-x 16.
Placeholder `inkFaint`, value `ink`. On focus, border becomes `accent`.

Pair with an eyebrow label above (`USERNAME`, `PASSWORD`).

### Card / List row

Bg `surface`, 1px `hairline`, radius `md`. No shadow. Padding 16. List rows
use a 12px gap between thumbnail / body / chevron.

Thumbnails: 56×56, radius `sm`, bg `surfaceRaised`. Icon `inkMuted` at 22.

### Tab bar

Bg `bg`, top 1px `hairline`. Active tint `accent`, inactive `inkFaint`.
Label weight Body-strong, size 11.

### Hero action (home)

Replaces the concentric SCAN circle. Full-width `surface` card, radius `md`,
1px `hairline`. Left rail 4px wide × full height in `accent`. Padding 20.
Title (Title weight) + caption (Body, `inkMuted`). Trailing chevron `ink`.

### Bottom sheet

Bg `surface`, top corners radius `lg`. Top hairline. Sole component allowed
to use the sheet-lift shadow (see Elevation).

### Capture button (camera)

Outer ring 2px `ink` (white on dark feed). Inner disc 56×56 `accent`. No
gradient, no glow. Pressed → inner disc shrinks to 52.

### Mode chip

Pill, height 32, padding-x 14. Inactive: bg `surface`, 1px `hairline`, text
`inkMuted`. Active: bg `accent`, no border, text `accentInk`.

### Badge

Eyebrow weight, padding 2/8, radius `xs`. Variants: `accent` (bg
`accentSoft`, text `accent`), `warning` (bg with `warning` @ 18%, text
`warning`), `neutral` (bg `surface`, text `inkMuted`).

## Patterns

### Screen header

Display title left-aligned. Optional trailing icon button (40×40,
`surface`, hairline, radius `pill`). Top padding follows safe area + 16.
No drop shadow under the header.

### Empty state

Centered. 56×56 `surface` icon tile + 1px hairline + radius `md`. Title in
Body-strong `ink`. Caption in Body `inkMuted`. No illustration.

### Error / warning banner

Full-width row, radius `sm`, padding 12. Warning: bg with `warning` @ 12%,
1px `warning` @ 32%, text `warning`. Danger: same with `danger`.

## Do / Don't

**Do**
- Use one accent. Use it sparingly — primary action, brand mark, focus.
- Step surfaces (`bg → surface → surfaceRaised`) before reaching for shadow.
- Pair every meta value with an eyebrow.
- Keep radii on the scale.

**Don't**
- Add a second brand color or a gradient.
- Use icon-in-rounded-square hero blocks.
- Apply drop shadows except to the bottom sheet.
- Mix hex literals into JSX. All color comes from tokens.
- Use concentric circles, "glow" rings, or decorative rims.

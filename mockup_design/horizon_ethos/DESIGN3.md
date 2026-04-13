```markdown
# Design System: The Horizon Narrative

## 1. Overview & Creative North Star
**Creative North Star: "The Editorial Explorer"**

This design system rejects the "utility-only" look of traditional travel apps in favor of a high-end editorial experience. We are not just building a tool; we are crafting a digital concierge. The goal is to move beyond the rigid, boxy layouts of the past and embrace **The Editorial Explorer**—a philosophy where data (budgets, flight times, itineraries) is treated with the same elegance as a luxury travel magazine.

By leveraging intentional asymmetry, overlapping high-quality photography with sophisticated typography, and utilizing a "tonal-first" depth model, we create an interface that feels both adventurous and meticulously organized. We break the template by using breathing room as a functional element, allowing the user's journey to feel expansive rather than cluttered.

---

## 2. Colors: Tonal Depth & The "No-Line" Rule
The palette is inspired by the transition from day to night—oceanic depth meeting the warmth of a sunset.

### The "No-Line" Rule
**Explicit Instruction:** Designers are prohibited from using 1px solid borders to section content. Boundaries must be defined solely through background color shifts or subtle tonal transitions. A section is "contained" by its change in surface value, not by a stroke.

### Surface Hierarchy & Nesting
Treat the UI as physical layers of frosted glass and fine paper.
*   **Base Layer:** `surface` (#f8f9fa) – The canvas.
*   **Secondary Sections:** `surface-container-low` (#f3f4f5) – Use this for large, secondary content areas.
*   **Elevated Content:** `surface-container-lowest` (#ffffff) – Reserved for the most important interactive cards to provide a "pop" of clean white against the background.

### The "Glass & Gradient" Rule
To elevate the "Modern" brand personality:
*   **Glassmorphism:** For floating navigation or quick-action overlays, use `surface` at 80% opacity with a `24px` backdrop blur. This ensures the vibrant photography bleeds through, keeping the experience immersive.
*   **Signature Textures:** Use a subtle linear gradient (Top-Left to Bottom-Right) from `primary` (#005d90) to `primary_container` (#0077b6) for Hero CTAs and active states to provide "soul" and dimension.

---

## 3. Typography: The Sophisticated Voice
We use two distinct sans-serifs to balance "Adventure" with "Reliability."

*   **Display & Headlines (Plus Jakarta Sans):** This is our "Adventurous" voice. It features wide apertures and a modern geometric feel. Use `display-lg` for destination names to create a sense of awe.
*   **Body & Titles (Manrope):** This is our "Smart" voice. It is highly legible and professional. Use `title-md` for complex data points like budget categories or flight numbers to ensure absolute clarity.

**Hierarchy as Identity:** 
High contrast in scale is mandatory. Pairing a `display-sm` headline with `body-md` secondary text creates the "Editorial" look. Never use two adjacent sizes (e.g., `title-lg` and `title-md`) for primary and secondary information; jump at least two levels to maintain a clear visual hierarchy.

---

## 4. Elevation & Depth: Tonal Layering
We do not use shadows to create "pop"; we use light and tone.

*   **The Layering Principle:** Instead of a shadow, place a `surface-container-highest` (#e1e3e4) element on top of a `surface` background to create natural separation.
*   **Ambient Shadows:** For floating action buttons or modal cards, use a shadow with a `32px` blur and `4%` opacity, tinted with `primary` (#005d90). This mimics natural light reflecting off a blue sky rather than a "dirty" grey shadow.
*   **The "Ghost Border":** If a border is required for accessibility in forms, use `outline_variant` (#bfc7d1) at **15% opacity**. It should be felt, not seen.

---

## 5. Components

### Cards & Itineraries
*   **The Rule:** Forbid divider lines. Separate timeline events or budget items using `1.5rem` (xl) vertical spacing and alternating `surface-container-low` backgrounds.
*   **Imagery:** Cards should utilize `lg` (1rem) rounded corners. Photos must have a subtle `primary_fixed` (#cde5ff) color wash in the placeholder state.

### Buttons
*   **Primary:** Gradient of `primary` to `primary_container`. `full` roundedness (capsule). White text (`on_primary`).
*   **Secondary:** `secondary_fixed` (#ffdbc9) background with `on_secondary_fixed` (#331200) text. This provides the "Sunset" warmth for secondary actions.

### Data Inputs (Budgets & Dates)
*   **Style:** Minimalist. No bottom border. Use `surface-container-high` as a subtle background fill with `md` (0.75rem) corner radius.
*   **Focus State:** Transition the background to `primary_fixed` with a `10%` ghost border of the `primary` color.

### Sophisticated Travel Primitives
*   **The "Progressive Timeline":** Use a vertical line made of `primary_fixed_dim` (#94ccff) that is only 2px wide, but use `primary` nodes to indicate current status.
*   **The "Budget Lens":** A semi-transparent glassmorphic chip used to overlay price data on top of high-quality destination photography.

---

## 6. Do's and Don'ts

### Do:
*   **DO** use overlapping elements. Let a destination photo bleed off the edge or have a title card overlap the bottom of an image by `24px`.
*   **DO** prioritize whitespace. If a screen feels "busy," increase the padding rather than adding a line.
*   **DO** use `secondary` (#9b4500) sparingly as a "heartbeat" color for alerts or high-priority notifications.

### Don't:
*   **DON'T** use pure black (#000000) for text. Use `on_surface` (#191c1d) to maintain a soft, premium feel.
*   **DON'T** use "Standard" 4px rounded corners. Stick to the Scale (`lg` or `xl`) to maintain the "Soft & Modern" brand personality.
*   **DON'T** use icons in more than two colors. Stick to a monochromatic icon style using `primary` or `outline`.
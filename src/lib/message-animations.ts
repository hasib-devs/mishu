import type { Variants } from "motion";

type AnimationKey = "slide-up" | "slide-down" | "fade" | "scale";

/**
 * Shared Framer Motion variants for chat message scroll items.
 *
 * Each entry exposes a `variants` object whose `initial`, `animate`, and
 * `exit` keys are referenced by `MotionMessageScrollerItem` (see ChatBox.tsx).
 */
export const MESSAGE_ANIMATIONS: Record<AnimationKey, { variants: Variants }> =
  {
    "slide-up": {
      variants: {
        initial: { opacity: 0, y: 16 },
        animate: {
          opacity: 1,
          y: 0,
          transition: { duration: 0.35, ease: "easeOut" },
        },
        exit: { opacity: 0, y: -8 },
      },
    },
    "slide-down": {
      variants: {
        initial: { opacity: 0, y: -16 },
        animate: {
          opacity: 1,
          y: 0,
          transition: { duration: 0.35, ease: "easeOut" },
        },
        exit: { opacity: 0, y: 8 },
      },
    },
    fade: {
      variants: {
        initial: { opacity: 0 },
        animate: {
          opacity: 1,
          transition: { duration: 0.35 },
        },
        exit: { opacity: 0 },
      },
    },
    scale: {
      variants: {
        initial: { opacity: 0, scale: 0.96 },
        animate: {
          opacity: 1,
          scale: 1,
          transition: { duration: 0.3, ease: "easeOut" },
        },
        exit: { opacity: 0, scale: 0.96 },
      },
    },
  };

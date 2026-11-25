import { motion } from "motion/react";
import type { Variants } from "framer-motion";
const v: Variants = { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } };
const c = motion.create(document.createElement("div"));
console.log(c);

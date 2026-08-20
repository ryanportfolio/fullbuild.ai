'use client';

/* One registration surface for GSAP. Every plugin the site ships is named
   here, at module scope, so "which plugins do we carry" has exactly one
   grep-able answer and no component ever registers twice. SSR-safe: gsap
   queues non-headless plugin registration until it wakes in a browser. */
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { TextPlugin } from 'gsap/TextPlugin';
import { ScrambleTextPlugin } from 'gsap/ScrambleTextPlugin';
import { SplitText } from 'gsap/SplitText';
import { MorphSVGPlugin } from 'gsap/MorphSVGPlugin';
import { Draggable } from 'gsap/Draggable';
import { InertiaPlugin } from 'gsap/InertiaPlugin';

gsap.registerPlugin(
  ScrollTrigger,
  TextPlugin,
  ScrambleTextPlugin,
  SplitText,
  MorphSVGPlugin,
  Draggable,
  InertiaPlugin,
);

export { gsap, ScrollTrigger, SplitText, MorphSVGPlugin, Draggable };

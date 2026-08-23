"use client";

import { useEffect, type RefObject } from "react";
import { useReplay } from "./store";
import { requestSceneFrame, sceneGate } from "./scene/gate";
import {
  freeform,
  hover,
  metresPerPixel,
  orbit,
  pan,
  pickBoatAt,
  pressOutcome,
  zoom,
} from "./scene/interaction";

/* How far a press may travel and still be a click. The same eight pixels the
 * water has always used to tell a click from a drag, now also the line between
 * picking a boat and steering the camera. */
const SLOP = 8;

interface Press {
  id: number;
  button: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  gesture: boolean;
  panning: boolean;
}

interface Touch {
  x: number;
  y: number;
}

/**
 * The water's one pointer owner.
 *
 * Everything a pointer can do to the replay is decided here: pick a boat,
 * steer the freeform camera, or reach playback. They are exclusive by
 * construction. A press that travelled is a camera move and can no longer
 * select or toggle; a press that landed on a boat selects and never toggles;
 * only a still press on open water reaches playback, which is the behaviour
 * the water has always had.
 *
 * Nothing here writes React state. Hover and camera pose are module state read
 * by the frame loop, and the two store writes it does make, follow and setRig,
 * are things a hand asked for once.
 */
export function useWaterPointer(
  target: RefObject<HTMLDivElement | null>,
  live: boolean,
): void {
  useEffect(() => {
    const node = target.current;
    if (node === null || !live) return;

    let press: Press | null = null;
    /* Live touches, for the two-finger gestures. A Map rather than an array
     * because a finger lifting mid-pinch has to leave by id. */
    const touches = new Map<number, Touch>();
    /* The live touches, copied into the same two seats every move rather than
     * into a fresh array: a two finger gesture delivers these at pointer rate
     * and every array it built would be one the collector has to take back
     * while the visitor is still moving. */
    const points: Touch[] = [
      { x: 0, y: 0 },
      { x: 0, y: 0 },
    ];
    const readTouches = (): number => {
      let n = 0;
      for (const touch of touches.values()) {
        if (n >= points.length) break;
        points[n].x = touch.x;
        points[n].y = touch.y;
        n += 1;
      }
      return n;
    };
    let spread = 0;
    let frame = 0;
    let waiting: { x: number; y: number } | null = null;

    const box = () => node.getBoundingClientRect();

    /* Capture keeps a drag alive when the pointer leaves the canvas, and it is
     * an improvement rather than a requirement: a pointer the platform has
     * already let go of, which is what a cancelled touch and a synthetic event
     * both look like, throws here and would take the rest of the handler with
     * it. */
    const capture = (id: number) => {
      try {
        node.setPointerCapture(id);
      } catch {
        /* The drag still works, it just ends at the edge of the canvas. */
      }
    };

    const deviceOf = (x: number, y: number): [number, number] => {
      const rect = box();
      if (rect.width < 1 || rect.height < 1) return [2, 2];
      return [
        ((x - rect.left) / rect.width) * 2 - 1,
        -(((y - rect.top) / rect.height) * 2 - 1),
      ];
    };

    const pickAt = (x: number, y: number): string | null => {
      const [nx, ny] = deviceOf(x, y);
      if (nx < -1 || nx > 1 || ny < -1 || ny > 1) return null;
      return pickBoatAt(nx, ny);
    };

    /* One pick a frame at most. A 240Hz mouse would otherwise raycast four
     * times for every picture anybody sees. */
    const flushHover = () => {
      frame = 0;
      const at = waiting;
      waiting = null;
      if (at === null) return;
      const found = pickAt(at.x, at.y);
      if (found === hover.id) return;
      hover.id = found;
      requestSceneFrame();
    };

    const enterFreeform = () => {
      if (useReplay.getState().rig === "freeform") return;
      useReplay.getState().setRig("freeform");
    };

    const onDown = (event: PointerEvent) => {
      const replay = useReplay.getState();
      if (replay.chart2d) return;
      if (event.pointerType === "touch") {
        touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (touches.size === 2) spread = 0;
        /* A single finger is the page's scroll everywhere except inside the
         * camera the visitor has asked for, so nothing is captured here and
         * nothing is prevented. */
        if (replay.rig === "freeform") {
          freeform.busy = true;
          capture(event.pointerId);
        }
      }
      if (event.button !== 0 && event.button !== 1) return;
      /* Stops the press turning into a text selection or a native drag on the
       * way to becoming an orbit. */
      if (event.pointerType === "mouse") event.preventDefault();
      press = {
        id: event.pointerId,
        button: event.button,
        startX: event.clientX,
        startY: event.clientY,
        lastX: event.clientX,
        lastY: event.clientY,
        gesture: false,
        panning: event.button === 1 || event.shiftKey,
      };
    };

    const onMove = (event: PointerEvent) => {
      const replay = useReplay.getState();
      if (event.pointerType === "touch") {
        if (!touches.has(event.pointerId)) return;
        touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (replay.rig !== "freeform" || replay.chart2d) return;
        const count = readTouches();
        if (count === 1) {
          const first = points[0];
          if (press !== null) {
            orbit(freeform, first.x - press.lastX, first.y - press.lastY);
            press.lastX = first.x;
            press.lastY = first.y;
            press.gesture = true;
          }
          requestSceneFrame();
          return;
        }
        if (count >= 2) {
          const a = points[0];
          const b = points[1];
          const reach = Math.hypot(a.x - b.x, a.y - b.y);
          const midX = (a.x + b.x) * 0.5;
          const midY = (a.y + b.y) * 0.5;
          if (spread > 0 && press !== null) {
            /* Pinching out is the fleet coming closer, so the range shrinks by
             * the same ratio the fingers grew by. */
            zoom(freeform, (spread - reach) * 1.4);
            pan(
              freeform,
              midX - press.lastX,
              midY - press.lastY,
              metresPerPixel(freeform, box().height),
            );
            press.gesture = true;
          }
          spread = reach;
          if (press !== null) {
            press.lastX = midX;
            press.lastY = midY;
          }
          requestSceneFrame();
          return;
        }
        return;
      }

      if (press === null) {
        if (event.pointerType !== "mouse" || replay.chart2d) return;
        waiting = { x: event.clientX, y: event.clientY };
        if (frame === 0) frame = window.requestAnimationFrame(flushHover);
        return;
      }
      if (event.pointerId !== press.id) return;
      if (replay.chart2d) return;

      if (!press.gesture) {
        const travel = Math.hypot(event.clientX - press.startX, event.clientY - press.startY);
        if (travel <= SLOP) return;
        press.gesture = true;
        freeform.busy = true;
        capture(press.id);
        /* Taking the camera by hand is what enters the mode, and the frame
         * that follows seeds it from the shot on screen. The first move after
         * the threshold is spent arriving there, so the drag continues from
         * here rather than jumping by the eight pixels already travelled. */
        enterFreeform();
        press.lastX = event.clientX;
        press.lastY = event.clientY;
        return;
      }

      const dx = event.clientX - press.lastX;
      const dy = event.clientY - press.lastY;
      press.lastX = event.clientX;
      press.lastY = event.clientY;
      if (press.panning) {
        pan(freeform, dx, dy, metresPerPixel(freeform, box().height));
      } else {
        orbit(freeform, dx, dy);
      }
      requestSceneFrame();
    };

    const release = (event: PointerEvent) => {
      if (node.hasPointerCapture(event.pointerId)) node.releasePointerCapture(event.pointerId);
    };

    const onUp = (event: PointerEvent) => {
      const replay = useReplay.getState();
      if (event.pointerType === "touch") {
        touches.delete(event.pointerId);
        if (touches.size < 2) spread = 0;
        if (touches.size === 0) freeform.busy = false;
        /* A finger lifting out of a pinch leaves the other one still down, and
         * the gesture was being measured from the midpoint between the two. The
         * remaining finger takes over from where it actually is, or the first
         * frame of the orbit that follows would spend the whole half-distance
         * between them in one step. */
        if (touches.size === 1 && press !== null && readTouches() === 1) {
          press.lastX = points[0].x;
          press.lastY = points[0].y;
          return;
        }
      }
      const started = press;
      if (started === null || started.id !== event.pointerId) {
        release(event);
        return;
      }
      press = null;
      release(event);
      freeform.busy = false;
      const travelled =
        started.gesture ||
        Math.hypot(event.clientX - started.startX, event.clientY - started.startY) > SLOP;
      const hit = travelled ? null : pickAt(event.clientX, event.clientY);
      const outcome = pressOutcome({
        gesture: travelled,
        hitId: hit,
        live: true,
        chart2d: replay.chart2d,
        button: started.button,
      });
      if (outcome === "select" && hit !== null) replay.follow(hit);
      else if (outcome === "toggle") replay.toggle();
    };

    const onCancel = (event: PointerEvent) => {
      if (event.pointerType === "touch") {
        touches.delete(event.pointerId);
        if (touches.size < 2) spread = 0;
      }
      if (press !== null && press.id === event.pointerId) press = null;
      release(event);
      freeform.busy = false;
    };

    const onLeave = () => {
      if (hover.id === null) return;
      hover.id = null;
      requestSceneFrame();
    };

    /* Framing the boat under the pointer, which is the one camera action worth
     * a shortcut on the water itself. A double click on open water is two
     * ordinary misses and does nothing the first one did not. */
    const onDouble = (event: MouseEvent) => {
      const replay = useReplay.getState();
      if (replay.chart2d) return;
      const hit = pickAt(event.clientX, event.clientY);
      if (hit === null) return;
      replay.follow(hit);
      freeform.pending = "selected";
      if (replay.rig !== "freeform") replay.setRig("freeform");
      requestSceneFrame();
    };

    node.addEventListener("pointerdown", onDown);
    node.addEventListener("pointermove", onMove);
    node.addEventListener("pointerup", onUp);
    node.addEventListener("pointercancel", onCancel);
    node.addEventListener("pointerleave", onLeave);
    node.addEventListener("dblclick", onDouble);

    return () => {
      node.removeEventListener("pointerdown", onDown);
      node.removeEventListener("pointermove", onMove);
      node.removeEventListener("pointerup", onUp);
      node.removeEventListener("pointercancel", onCancel);
      node.removeEventListener("pointerleave", onLeave);
      node.removeEventListener("dblclick", onDouble);
      if (frame !== 0) window.cancelAnimationFrame(frame);
      hover.id = null;
      freeform.busy = false;
    };
  }, [target, live]);
}

/**
 * The wheel, which only belongs to the camera once the visitor has asked for
 * the camera. Both Layline pages put the replay inside a scrolling document,
 * so a wheel handler that were always live would take the page's scroll away
 * from every visitor who never touched the camera at all. Registered only
 * while the freeform rig is up, and removed with it.
 */
export function useWheelZoom(target: RefObject<HTMLDivElement | null>, active: boolean): void {
  useEffect(() => {
    const node = target.current;
    if (node === null || !active) return;
    const onWheel = (event: WheelEvent) => {
      if (useReplay.getState().chart2d) return;
      event.preventDefault();
      /* Lines and pages are reported by some mice and every trackpad reports
       * pixels; the two are brought to the same scale before the zoom sees
       * them. A pinch on a trackpad arrives here as a wheel with ctrl held,
       * which is the gesture people already zoom with. */
      const step =
        event.deltaMode === 1 ? event.deltaY * 16 : event.deltaMode === 2 ? event.deltaY * 400 : event.deltaY;
      zoom(freeform, step);
      requestSceneFrame();
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, [target, active]);
}

/* Elements that own the space bar themselves. A button is activated by it, a
 * field types with it, and a slider pages with it; none of them are asking the
 * replay for anything. */
const TYPING = new Set(["INPUT", "TEXTAREA", "SELECT", "BUTTON", "A"]);

/**
 * Space is play and pause, wherever the visitor is looking at the replay.
 *
 * The canvas cannot hold focus and should not: it has no keyboard interface of
 * its own, and every camera action has a real button in the transport. So the
 * key is read at the window and gated on the one honest question, whether the
 * replay is on screen. Scrolled away to read the debrief, space is the page's
 * own scroll again.
 */
export function useSpaceToggle(): void {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.code !== "Space" || event.repeat) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (!sceneGate.onScreen) return;
      const target = event.target as HTMLElement | null;
      if (target !== null) {
        if (TYPING.has(target.tagName)) return;
        if (target.isContentEditable) return;
        if (target.closest("[role=slider], [contenteditable=true]") !== null) return;
      }
      event.preventDefault();
      useReplay.getState().toggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

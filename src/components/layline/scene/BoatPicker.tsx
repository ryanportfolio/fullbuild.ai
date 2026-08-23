"use client";

import { useEffect, useMemo } from "react";
import { useThree } from "@react-three/fiber";
import { Raycaster, Vector2 } from "three";
import type { Intersection, Object3D } from "three";
import type { RaceData } from "@/lib/layline/types";
import { setBoatPicker } from "./interaction";

/**
 * Which boat is under a point on the water.
 *
 * The raycast is run by hand against six pick boxes rather than handed to the
 * renderer's own event system, which would raycast every hull, every sail and
 * every wire in the scene on every pointer move. The pointer handlers
 * themselves stay on the DOM layer that already owns the press; this component
 * only lends them a camera and a raycaster, the same way the gate lends the
 * frozen canvas a door.
 *
 * Coordinates in are normalised device coordinates, so the caller measures the
 * canvas box and this never has to.
 */
export function BoatPicker({ race }: { race: RaceData }) {
  const camera = useThree((state) => state.camera);
  const scene = useThree((state) => state.scene);
  const ray = useMemo(() => new Raycaster(), []);
  const point = useMemo(() => new Vector2(), []);
  /* Reused, because a pick runs at pointer rate and every array three would
   * allocate here is one the collector has to take back mid-drag. */
  const hits = useMemo<Intersection[]>(() => [], []);
  const boxes = useMemo<(Object3D | null)[]>(() => race.boats.map(() => null), [race]);

  useEffect(() => {
    setBoatPicker((nx, ny) => {
      point.set(nx, ny);
      ray.setFromCamera(point, camera);
      let nearest: string | null = null;
      let range = Number.POSITIVE_INFINITY;
      for (let i = 0; i < race.boats.length; i++) {
        let box = boxes[i];
        /* A canvas that has remounted, or a race that has been swapped, leaves
         * every one of these pointing at an object no longer in the scene. */
        if (box === null || box.parent === null) {
          box = scene.getObjectByName(`pick-${race.boats[i].id}`) ?? null;
          boxes[i] = box;
        }
        if (box === null) continue;
        /* The fleet writes its matrices in the frame pass and the renderer
         * flushes them at draw time, so a pick taken between the two, or on a
         * paused page that has not drawn since the clock moved, would read the
         * previous frame's world. Six matrices is nothing; a boat picked one
         * frame behind is not. */
        box.updateWorldMatrix(true, false);
        hits.length = 0;
        ray.intersectObject(box, false, hits);
        const first = hits[0];
        if (first === undefined || first.distance >= range) continue;
        range = first.distance;
        nearest = race.boats[i].id;
      }
      return nearest;
    });
    return () => setBoatPicker(null);
  }, [race, camera, scene, ray, point, hits, boxes]);

  return null;
}

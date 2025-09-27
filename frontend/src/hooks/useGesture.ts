import { useEffect, useState, useRef } from "react";

export function useBlendshapeGestures(blendShapes: { name: string; score: number }[], gestures: any[]) {
  const [activeGestures, setActiveGestures] = useState<string[]>([]);
  const frameCountsRef = useRef<Record<string, number>>({});

  useEffect(() => {
    const newActive: string[] = [];

    gestures.forEach((gesture) => {
      const bs = blendShapes.find((b) => b.name === gesture.metric);
      const score = bs?.score ?? 0;

      if (score >= gesture.threshold) {
        frameCountsRef.current[gesture.name] = (frameCountsRef.current[gesture.name] || 0) + 1;

        if (frameCountsRef.current[gesture.name] >= gesture.framesRequired) {
          newActive.push(gesture.name);
          gesture.onActivate?.();
        }
      } else {
        frameCountsRef.current[gesture.name] = 0;
      }
    });

    setActiveGestures(newActive);
  }, [blendShapes, gestures]);

  return activeGestures;
}

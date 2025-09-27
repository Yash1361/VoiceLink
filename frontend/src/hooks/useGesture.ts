import { useEffect, useRef, useState } from "react";

type MetricCondition = {
  name: string;
  threshold: number;
  comparison?: ">" | "<" | string;
};

type Gesture = {
  name: string;
  metrics: MetricCondition[];
  framesRequired: number;
  onActivate?: () => void;
};

export function useBlendshapeGestures(
  blendShapes: { name: string; score: number }[],
  gestures: Gesture[]
) {
  const frameCountsRef = useRef<{ [key: string]: number }>({});
  const [activeGestures, setActiveGestures] = useState<string[]>([]);

  useEffect(() => {
    const newlyActive: string[] = [];

    for (const g of gestures) {
      const allPassed = g.metrics.every((m) => {
        const value = blendShapes.find((b) => b.name === m.name)?.score ?? 0;
        return m.comparison === "<"
          ? value < m.threshold
          : value > m.threshold;
      });

      frameCountsRef.current[g.name] = frameCountsRef.current[g.name] || 0;

      if (allPassed) {
        frameCountsRef.current[g.name] += 1;
      } else {
        frameCountsRef.current[g.name] = 0;
      }

      if (frameCountsRef.current[g.name] >= g.framesRequired) {
        newlyActive.push(g.name);
        g.onActivate?.();
        frameCountsRef.current[g.name] = 0; // reset after trigger
      }
    }

    if (newlyActive.length > 0) {
      setActiveGestures(newlyActive);
    } else {
      setActiveGestures([]);
    }
  }, [blendShapes, gestures]);

  return activeGestures;
}

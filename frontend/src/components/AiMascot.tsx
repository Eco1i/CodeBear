import { useEffect, useRef, useState } from "react";
import type { AiAccessory } from "../types";


export const AI_ACCESSORY_OPTIONS: ReadonlyArray<{ id: AiAccessory; label: string }> = [
  { id: "none", label: "原装" },
  { id: "blue_scarf", label: "蓝围巾" },
  { id: "red_cap", label: "红帽" },
  { id: "knit_hat", label: "针织帽" },
  { id: "round_glasses", label: "圆眼镜" },
  { id: "headphones", label: "耳机" },
  { id: "bow_tie", label: "领结" },
  { id: "data_crown", label: "数据皇冠" },
];

function BearAccessoryArtwork({ accessory }: { accessory: AiAccessory }) {
  switch (accessory) {
    case "blue_scarf":
      return (
        <g className="ai-bear-accessory-art is-blue-scarf">
          <path className="ai-accessory-blue ai-accessory-stroke" d="M20 69c16 7 39 8 56-1l-3 12c-15 7-36 7-50-1Z" />
          <path className="ai-accessory-blue ai-accessory-stroke" d="M58 78c6 2 12 4 18 3l-7 14-13-14Z" />
          <path className="ai-accessory-highlight" d="M28 73c11 3 26 4 38 1" />
        </g>
      );
    case "red_cap":
      return (
        <g className="ai-bear-accessory-art is-red-cap">
          <path className="ai-accessory-coral ai-accessory-stroke" d="M27 29c2-10 10-16 21-16 12 0 20 6 22 16Z" />
          <path className="ai-accessory-coral ai-accessory-stroke" d="M18 34c16-5 43-6 61 0-15 4-45 5-61 0Z" />
          <path className="ai-accessory-blue" d="M30 25h37l2 7-42 2Z" />
          <path className="ai-accessory-gold ai-accessory-stroke" d="m44 13 7-3 5 6-7 5-6-3Z" />
        </g>
      );
    case "knit_hat":
      return (
        <g className="ai-bear-accessory-art is-knit-hat">
          <circle className="ai-accessory-gold ai-accessory-stroke" cx="48" cy="10" r="6" />
          <path className="ai-accessory-blue ai-accessory-stroke" d="M27 29c2-12 9-18 21-18s20 6 22 18Z" />
          <path className="ai-accessory-blue-light ai-accessory-stroke" d="M24 28h49v9H24Z" />
          <path className="ai-accessory-highlight" d="M35 18v9m13-13v13m13-9v9" />
        </g>
      );
    case "round_glasses":
      return (
        <g className="ai-bear-accessory-art is-round-glasses">
          <circle className="ai-accessory-glass ai-accessory-stroke" cx="36" cy="54" r="9" />
          <circle className="ai-accessory-glass ai-accessory-stroke" cx="60" cy="52" r="9" />
          <path className="ai-accessory-line" d="M45 53c2-2 4-2 6 0M27 52l-8-3m50 1 8-4" />
        </g>
      );
    case "headphones":
      return (
        <g className="ai-bear-accessory-art is-headphones">
          <path className="ai-accessory-line is-heavy" d="M23 54c0-20 10-31 25-31s25 11 25 31" />
          <rect className="ai-accessory-coral ai-accessory-stroke" x="17" y="51" width="12" height="21" rx="6" />
          <rect className="ai-accessory-coral ai-accessory-stroke" x="67" y="49" width="12" height="21" rx="6" />
          <path className="ai-accessory-gold" d="M21 55h4v13h-4zm50-2h4v13h-4z" />
        </g>
      );
    case "bow_tie":
      return (
        <g className="ai-bear-accessory-art is-bow-tie">
          <path className="ai-accessory-gold ai-accessory-stroke" d="M47 80c-9-9-18-10-20-4-2 7 7 12 20 7Z" />
          <path className="ai-accessory-gold ai-accessory-stroke" d="M49 80c10-9 19-10 21-4 2 7-8 12-21 7Z" />
          <circle className="ai-accessory-coral ai-accessory-stroke" cx="48" cy="81" r="5" />
        </g>
      );
    case "data_crown":
      return (
        <g className="ai-bear-accessory-art is-data-crown">
          <path className="ai-accessory-gold ai-accessory-stroke" d="m24 30 4-17 13 10 8-16 9 16 12-11 3 18Z" />
          <path className="ai-accessory-blue ai-accessory-stroke" d="M25 29h47l-3 9H29Z" />
          <circle className="ai-accessory-coral ai-accessory-stroke" cx="49" cy="20" r="3" />
        </g>
      );
    default:
      return null;
  }
}

interface PolarBearMarkProps {
  compact?: boolean;
  accessory?: AiAccessory;
  animated?: boolean;
}

type AccessoryMotionPhase = "idle" | "exiting" | "staged" | "entering";

const ACCESSORY_EXIT_MS = 76;
const ACCESSORY_ENTER_MS = 180;

export function PolarBearMark({
  compact = false,
  accessory = "none",
  animated = true,
}: PolarBearMarkProps) {
  const targetAccessoryRef = useRef(accessory);
  const displayedAccessoryRef = useRef(accessory);
  const motionPhaseRef = useRef<AccessoryMotionPhase>("idle");
  const motionTimerRef = useRef<number | null>(null);
  const motionFrameRef = useRef<number | null>(null);
  const [displayedAccessory, setDisplayedAccessory] = useState(accessory);
  const [motionPhase, setMotionPhaseState] = useState<AccessoryMotionPhase>("idle");

  function setMotionPhase(nextPhase: AccessoryMotionPhase) {
    motionPhaseRef.current = nextPhase;
    setMotionPhaseState(nextPhase);
  }

  function clearScheduledMotion() {
    if (motionTimerRef.current !== null) {
      window.clearTimeout(motionTimerRef.current);
      motionTimerRef.current = null;
    }
    if (motionFrameRef.current !== null) {
      window.cancelAnimationFrame(motionFrameRef.current);
      motionFrameRef.current = null;
    }
  }

  function finishAccessoryEnter() {
    motionTimerRef.current = window.setTimeout(() => {
      motionTimerRef.current = null;
      if (targetAccessoryRef.current !== displayedAccessoryRef.current) {
        beginAccessoryExit();
        return;
      }
      setMotionPhase("idle");
    }, ACCESSORY_ENTER_MS);
  }

  function beginAccessoryEnter(fromHidden: boolean) {
    clearScheduledMotion();
    if (displayedAccessoryRef.current === "none") {
      setMotionPhase("idle");
      return;
    }
    if (!fromHidden) {
      setMotionPhase("entering");
      finishAccessoryEnter();
      return;
    }
    setMotionPhase("staged");
    motionFrameRef.current = window.requestAnimationFrame(() => {
      motionFrameRef.current = window.requestAnimationFrame(() => {
        motionFrameRef.current = null;
        setMotionPhase("entering");
        finishAccessoryEnter();
      });
    });
  }

  function showLatestAccessory() {
    clearScheduledMotion();
    const nextAccessory = targetAccessoryRef.current;
    displayedAccessoryRef.current = nextAccessory;
    setDisplayedAccessory(nextAccessory);
    beginAccessoryEnter(true);
  }

  function beginAccessoryExit() {
    clearScheduledMotion();
    if (displayedAccessoryRef.current === "none") {
      showLatestAccessory();
      return;
    }
    setMotionPhase("exiting");
    motionTimerRef.current = window.setTimeout(() => {
      motionTimerRef.current = null;
      showLatestAccessory();
    }, ACCESSORY_EXIT_MS);
  }

  useEffect(() => {
    targetAccessoryRef.current = accessory;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!animated || reduceMotion) {
      clearScheduledMotion();
      displayedAccessoryRef.current = accessory;
      setDisplayedAccessory(accessory);
      setMotionPhase("idle");
      return;
    }

    const displayed = displayedAccessoryRef.current;
    switch (motionPhaseRef.current) {
      case "exiting":
        if (accessory === displayed) beginAccessoryEnter(false);
        break;
      case "staged":
        if (accessory === displayed) break;
        displayedAccessoryRef.current = accessory;
        setDisplayedAccessory(accessory);
        if (accessory === "none") {
          clearScheduledMotion();
          setMotionPhase("idle");
        }
        break;
      case "entering":
      case "idle":
        if (accessory !== displayed) beginAccessoryExit();
        break;
    }
  }, [accessory, animated]);

  useEffect(() => () => clearScheduledMotion(), []);

  const changing = motionPhase !== "idle";

  return (
    <svg
      className={`ai-bear-mark${compact ? " is-compact" : ""}${changing ? " is-accessory-changing" : ""} is-accessory-${motionPhase}`}
      viewBox="0 0 96 96"
      data-accessory={displayedAccessory}
      data-motion-phase={motionPhase}
      aria-hidden="true"
    >
      <g className="ai-bear-base">
        <path
          className="ai-bear-outline"
          d="M25 29c-4-9-14-8-16 1-2 7 2 12 7 14-4 17-1 30 10 38 11 8 33 8 44 0 11-8 14-21 10-38 5-2 9-8 7-14-3-9-13-10-18-1-12-5-32-5-44 0Z"
        />
        <circle className="ai-bear-face" cx="37" cy="54" r="3" />
        <circle className="ai-bear-face" cx="59" cy="52" r="3" />
        <path className="ai-bear-face" d="M42 62c0-4 12-5 13 0 0 4-4 7-7 7s-6-3-6-7Z" />
        <path className="ai-bear-mouth" d="M48 68v3m0 0c-2 3-5 4-7 3m7-3c2 3 5 4 7 3" />
        <path className="ai-bear-data-line" d="M31 83c10 4 24 4 34 0" />
      </g>
      {displayedAccessory !== "none" ? (
        <g
          className={`ai-bear-accessory is-${displayedAccessory.replace(/_/g, "-")} is-${motionPhase}`}
        >
          <BearAccessoryArtwork accessory={displayedAccessory} />
        </g>
      ) : null}
    </svg>
  );
}

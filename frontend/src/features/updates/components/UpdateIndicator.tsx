import type { UpdateState } from "../types";
import { versionLabel } from "../model";

interface UpdateIndicatorProps {
  state: UpdateState | null;
  onClick: () => void;
}

export function UpdateIndicator({ state, onClick }: UpdateIndicatorProps) {
  if (!state) return null;
  const available = state.status === "update_available" && state.latest;
  return (
    <button
      type="button"
      className={`update-chip${available ? " is-available" : ""}`}
      onClick={onClick}
      title={available ? "发现新版本，点击查看" : "检查更新"}
    >
      {available ? (
        <>
          <span className="update-chip-dot" aria-hidden="true" />
          新版本 {versionLabel(state.latest!.version)}
        </>
      ) : (
        versionLabel(state.current_version)
      )}
    </button>
  );
}

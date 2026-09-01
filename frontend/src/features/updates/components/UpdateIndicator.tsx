import { useI18n } from "../../preferences/PreferencesProvider";
import type { UpdateState } from "../types";
import { versionLabel } from "../model";

interface UpdateIndicatorProps {
    state: UpdateState | null;
    onClick: () => void;
}

export function UpdateIndicator({ state, onClick }: UpdateIndicatorProps) {
    const { t } = useI18n();
    if (!state) return null;
    const available = state.status === "update_available" && state.latest;
    return (
        <button
            type="button"
            className={`update-chip${available ? " is-available" : ""}`}
            onClick={onClick}
            title={available ? t("update.available") : t("header.update")}
        >
            {available ? (
                <>
                    <span className="update-chip-dot" aria-hidden="true" />
                    {t("update.newVersion", {
                        version: versionLabel(state.latest!.version),
                    })}
                </>
            ) : (
                versionLabel(state.current_version)
            )}
        </button>
    );
}

import { json, request } from "../../shared/api/client";
import type { UpdateState } from "./types";

export const updatesApi = {
  check: () => request<UpdateState>("/api/updates/check"),
  refresh: () => request<UpdateState>("/api/updates/check", json("POST", {})),
  ignore: (version: string) =>
    request<UpdateState>("/api/updates/ignore", json("POST", { version })),
};

export interface LatestRelease {
  version: string;
  published_at: string;
  release_url: string;
  zip_url: string;
  sha256: string;
  notes: string;
}

export type UpdateStatus = "update_available" | "up_to_date" | "unknown";

export interface UpdateState {
  current_version: string;
  status: UpdateStatus;
  latest: LatestRelease | null;
  checked_at: number | null;
}

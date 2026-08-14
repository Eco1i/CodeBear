export interface DictionarySummary {
  id: string;
  name: string;
  description: string;
  source_type: "manual" | "excel";
  source_name: string;
  source_sheet: string;
  code_column: string;
  name_column: string;
  item_count: number;
  binding_count: number;
  table_count: number;
  skipped_duplicate_count?: number;
  skipped_conflict_count?: number;
  conflicting_codes?: string[];
  created_at: string;
  updated_at: string;
}

export interface DictionaryItem {
  id?: string;
  dictionary_id?: string;
  code: string;
  name: string;
  description: string;
  ordinal?: number;
}

export interface DictionaryItemsResult {
  items: DictionaryItem[];
  total: number;
  limit: number;
  offset: number;
}

export interface DictionaryFieldBinding {
  field_id: string;
  dictionary_id: string;
  dictionary_name: string;
  item_count: number;
}

export interface DictionaryBoundField {
  field_id: string;
  field_code: string;
  field_name: string;
  table_id: string;
  table_code: string;
  table_name: string;
  pdm_id: string;
  pdm_path: string;
  project_id: string;
  project_name: string;
  created_at?: string;
  bound_dictionary_id?: string | null;
  bound_dictionary_name?: string | null;
}

export interface DictionaryFieldCandidatesResult {
  items: DictionaryBoundField[];
  total: number;
  limit: number;
}

export interface ExcelSheetPreview {
  name: string;
  columns: string[];
  preview: string[][];
  row_count: number;
}

export interface ExcelInspection {
  file_name: string;
  sheets: ExcelSheetPreview[];
}

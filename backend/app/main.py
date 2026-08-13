from __future__ import annotations

import asyncio
import tempfile
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated, Any, Literal

from fastapi import FastAPI, File, Form, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, Field, SecretStr
from starlette.background import BackgroundTask

from .ai import AiService
from .ai_history import AiConversationService
from .backup import MAX_ARCHIVE_BYTES
from .config import APP_NAME, APP_VERSION, AppPaths, SettingsStore, bundled_resource
from .database import Database
from .security import LocalRequestGuardMiddleware
from .service import ServiceError, WorkspaceService


MAX_PDM_FILES = 500
MAX_PDM_FILE_BYTES = 512 * 1024 * 1024
MAX_PDM_TOTAL_BYTES = 2 * 1024 * 1024 * 1024


paths = AppPaths.create()
settings_store = SettingsStore(paths)
database = Database(paths.database)
service = WorkspaceService(database, settings_store)
ai_service = AiService(database, settings_store)
ai_conversation_service = AiConversationService(database)


@asynccontextmanager
async def lifespan(_: FastAPI):
    database.initialize()
    settings_store.read()
    yield


app = FastAPI(title=f"{APP_NAME} API", version=APP_VERSION, lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:5173",
        "http://localhost:5173",
        "http://127.0.0.1:4173",
        "http://localhost:4173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(LocalRequestGuardMiddleware)


@app.exception_handler(ServiceError)
async def service_error_handler(_: Request, exc: ServiceError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": {"message": exc.message, "code": exc.code, "data": exc.data}},
    )


class WorkspaceUpdate(BaseModel):
    workspace_root: str = Field(min_length=1)


class NamePayload(BaseModel):
    name: str = Field(min_length=1, max_length=160)


class FolderCreate(NamePayload):
    project_id: str
    parent_path: str = ""


class RenamePayload(NamePayload):
    project_id: str
    relative_path: str = ""


class MovePayload(BaseModel):
    project_id: str
    relative_path: str
    target_parent_path: str = ""


class TrashPayload(BaseModel):
    project_id: str
    relative_path: str = ""


class FieldUpdate(BaseModel):
    id: str
    name: str = ""
    code: str
    data_type: str
    length: str = ""
    nullable: bool = True
    default_value: str = ""
    comment: str = ""


class FieldsSavePayload(BaseModel):
    expected_hash: str
    fields: list[FieldUpdate]


class DdlConfigPayload(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    database: Literal["mysql", "oracle", "dameng", "tdsql", "ignite"]
    version: str = Field(min_length=1, max_length=20)
    schema_name: str = Field(default="", max_length=128, alias="schema")
    include_comments: bool = True
    drop_table: bool = False
    if_not_exists: bool = True
    engine: str = Field(default="InnoDB", max_length=40)
    charset: str = Field(default="utf8mb4", max_length=40)
    collation: str = Field(default="utf8mb4_0900_ai_ci", max_length=80)
    tablespace: str = Field(default="", max_length=128)
    tdsql_mode: Literal["shard", "single", "broadcast"] = "shard"
    ignite_template: Literal["PARTITIONED", "REPLICATED"] = "PARTITIONED"
    ignite_backups: int = Field(default=0, ge=0, le=10)
    ignite_atomicity: Literal["ATOMIC", "TRANSACTIONAL"] = "ATOMIC"
    ignite_write_sync: Literal["FULL_SYNC", "PRIMARY_SYNC", "FULL_ASYNC"] = "FULL_SYNC"
    ignite_cache_group: str = Field(default="", max_length=128)
    ignite_affinity_key: bool = True


class DdlGeneratePayload(BaseModel):
    table_ids: list[str] = Field(min_length=1, max_length=5000)
    config: DdlConfigPayload


class BackupExportNode(BaseModel):
    project_id: str = Field(min_length=1, max_length=100)
    type: Literal["project", "folder", "pdm"]
    relative_path: str = Field(default="", max_length=1000)


class BackupExportPayload(BaseModel):
    nodes: list[BackupExportNode] = Field(min_length=1, max_length=50_000)


class BackupImportNode(BaseModel):
    project_key: str = Field(min_length=1, max_length=200)
    type: Literal["project", "folder", "pdm"]
    relative_path: str = Field(default="", max_length=1000)


class BackupImportPayload(BaseModel):
    token: str = Field(min_length=1, max_length=100)
    nodes: list[BackupImportNode] = Field(min_length=1, max_length=50_000)
    conflict_policy: Literal["skip", "rename", "overwrite"] = "rename"


class LegacyDataPayload(BaseModel):
    data_path: str = Field(min_length=1, max_length=2000)


class AiSettingsUpdate(BaseModel):
    api_key: SecretStr | None = Field(default=None, min_length=10, max_length=512)
    assistant_name: str | None = Field(default=None, min_length=1, max_length=20)
    assistant_accessory: Literal[
        "none",
        "blue_scarf",
        "red_cap",
        "knit_hat",
        "round_glasses",
        "headphones",
        "bow_tie",
        "data_crown",
    ] | None = None


class AiConnectionTest(BaseModel):
    api_key: SecretStr | None = Field(default=None, min_length=10, max_length=512)


class AiHistoryEvidence(BaseModel):
    table_id: str = Field(min_length=1, max_length=100)
    table_code: str = Field(default="", max_length=160)
    table_name: str = Field(default="", max_length=160)
    relevance: Literal["direct", "related", "candidate"] = "related"


class AiHistoryRetrieval(BaseModel):
    intent: Literal["find_tables", "find_field", "describe_table", "out_of_scope", "sensitive_request"]
    resolved_question: str = Field(default="", max_length=1000)
    scope_terms: list[str] = Field(default_factory=list, max_length=8)
    business_terms: list[str] = Field(default_factory=list, max_length=32)
    code_terms: list[str] = Field(default_factory=list, max_length=32)
    target_role: str = Field(default="core", max_length=20)
    exclude_roles: list[str] = Field(default_factory=list, max_length=8)
    only_target_role: bool = False


class AiHistoryMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=4000)
    evidence: list[AiHistoryEvidence] = Field(default_factory=list, max_length=10)
    retrieval: AiHistoryRetrieval | None = None


class AiScopePayload(BaseModel):
    type: Literal["table", "pdm", "project", "all"]
    project_id: str | None = Field(default=None, max_length=100)
    scope_path: str = Field(default="", max_length=1000)
    table_id: str | None = Field(default=None, max_length=100)


class AiChatPayload(BaseModel):
    question: str = Field(min_length=1, max_length=1000)
    scope: AiScopePayload
    history: list[AiHistoryMessage] = Field(default_factory=list, max_length=8)


class AiConversationMessageCreate(BaseModel):
    id: str = Field(min_length=1, max_length=100)
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=20_000)
    payload: dict[str, Any] = Field(default_factory=dict)


class AiConversationCreate(BaseModel):
    first_message: AiConversationMessageCreate


class AiConversationRename(BaseModel):
    title: str = Field(min_length=1, max_length=80)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "name": APP_NAME, "version": APP_VERSION}


@app.get("/api/settings")
def get_settings() -> dict[str, str]:
    return service.get_settings()


@app.put("/api/settings/workspace")
def update_workspace(payload: WorkspaceUpdate) -> dict[str, str]:
    return service.set_workspace(payload.workspace_root)


@app.get("/api/ai/settings")
def get_ai_settings() -> dict:
    return ai_service.status()


@app.put("/api/ai/settings")
def update_ai_settings(payload: AiSettingsUpdate) -> dict:
    api_key = payload.api_key.get_secret_value() if payload.api_key else None
    return ai_service.configure(
        api_key,
        assistant_name=payload.assistant_name,
        assistant_accessory=payload.assistant_accessory,
    )


@app.delete("/api/ai/settings")
def clear_ai_settings() -> dict:
    return ai_service.configure(None, clear=True)


@app.post("/api/ai/test")
async def test_ai_connection(payload: AiConnectionTest) -> dict:
    api_key = payload.api_key.get_secret_value() if payload.api_key else None
    return await asyncio.to_thread(ai_service.test_connection, api_key)


@app.post("/api/ai/chat")
async def ai_chat(payload: AiChatPayload) -> dict:
    return await asyncio.to_thread(
        ai_service.chat,
        payload.question.strip(),
        payload.scope.model_dump(),
        [message.model_dump() for message in payload.history],
    )


@app.get("/api/ai/conversations")
def list_ai_conversations(limit: int = Query(default=200, ge=1, le=500)) -> list[dict]:
    return ai_conversation_service.list_conversations(limit=limit)


@app.post("/api/ai/conversations", status_code=201)
def create_ai_conversation(payload: AiConversationCreate) -> dict:
    return ai_conversation_service.create_conversation(payload.first_message.model_dump())


@app.get("/api/ai/conversations/{conversation_id}")
def get_ai_conversation(conversation_id: str) -> dict:
    return ai_conversation_service.get_conversation(conversation_id)


@app.patch("/api/ai/conversations/{conversation_id}")
def rename_ai_conversation(conversation_id: str, payload: AiConversationRename) -> dict:
    return ai_conversation_service.rename_conversation(conversation_id, payload.title)


@app.delete("/api/ai/conversations/{conversation_id}")
def delete_ai_conversation(conversation_id: str) -> dict[str, bool]:
    ai_conversation_service.delete_conversation(conversation_id)
    return {"deleted": True}


@app.post("/api/ai/conversations/{conversation_id}/messages", status_code=201)
def append_ai_conversation_message(conversation_id: str, payload: AiConversationMessageCreate) -> dict:
    return ai_conversation_service.add_message(conversation_id, payload.model_dump())


@app.get("/api/projects")
def list_projects() -> list[dict]:
    return service.list_projects()


@app.post("/api/projects", status_code=201)
def create_project(payload: NamePayload) -> dict:
    return service.create_project(payload.name)


@app.put("/api/projects/{project_id}")
def rename_project(project_id: str, payload: NamePayload) -> dict:
    return service.rename_project(project_id, payload.name)


@app.get("/api/projects/{project_id}/tree")
def project_tree(project_id: str) -> dict:
    return service.project_tree(project_id)


@app.post("/api/projects/{project_id}/refresh")
def refresh_project(project_id: str, force: bool = False) -> dict:
    return service.refresh_project(project_id, force=force)


@app.post("/api/folders", status_code=201)
def create_folder(payload: FolderCreate) -> dict:
    return service.create_folder(payload.project_id, payload.parent_path, payload.name)


@app.post("/api/import")
def import_pdm_files(
    project_id: Annotated[str, Form()],
    parent_path: Annotated[str, Form()] = "",
    overwrite: Annotated[bool, Form()] = False,
    files: Annotated[list[UploadFile], File()] = [],
) -> dict:
    if not files:
        raise ServiceError(422, "请选择至少一个 PDM 文件", code="missing_files")
    if len(files) > MAX_PDM_FILES:
        raise ServiceError(413, f"一次最多导入 {MAX_PDM_FILES} 个 PDM 文件", code="too_many_files")
    staging_root = paths.app_data / "staging"
    staging_root.mkdir(parents=True, exist_ok=True)
    staged: list[tuple[str, Path]] = []
    temporary_paths: list[Path] = []
    total_bytes = 0
    try:
        for upload in files:
            suffix = Path(upload.filename or "upload.pdm").suffix or ".pdm"
            with tempfile.NamedTemporaryFile(
                prefix="maxiong-",
                suffix=suffix,
                dir=staging_root,
                delete=False,
            ) as stream:
                temporary_path = Path(stream.name)
                temporary_paths.append(temporary_path)
                file_bytes = 0
                for chunk in iter(lambda: upload.file.read(1024 * 1024), b""):
                    file_bytes += len(chunk)
                    total_bytes += len(chunk)
                    if file_bytes > MAX_PDM_FILE_BYTES:
                        raise ServiceError(
                            413,
                            "单个 PDM 文件不能超过 512 MB",
                            code="pdm_file_too_large",
                        )
                    if total_bytes > MAX_PDM_TOTAL_BYTES:
                        raise ServiceError(
                            413,
                            "单次导入文件总量不能超过 2 GB",
                            code="pdm_import_too_large",
                        )
                    stream.write(chunk)
                staged.append((upload.filename or temporary_path.name, temporary_path))
        return service.import_staged_files(
            project_id,
            parent_path,
            staged,
            overwrite=overwrite,
        )
    finally:
        for staged_path in temporary_paths:
            try:
                staged_path.unlink(missing_ok=True)
            except OSError:
                pass
        for upload in files:
            upload.file.close()


@app.post("/api/backups/export")
def export_backup(payload: BackupExportPayload) -> FileResponse:
    archive_path, file_name = service.export_backup([node.model_dump() for node in payload.nodes])
    return FileResponse(
        archive_path,
        media_type="application/octet-stream",
        filename=file_name,
        headers={"X-CodeBear-Filename": file_name},
        background=BackgroundTask(archive_path.unlink, missing_ok=True),
    )


@app.post("/api/backups/inspect")
def inspect_backup(file: Annotated[UploadFile, File()]) -> dict:
    staging_root = paths.app_data / "staging"
    staging_root.mkdir(parents=True, exist_ok=True)
    suffix = Path(file.filename or "backup.cbbak").suffix or ".cbbak"
    temporary_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            prefix="codebear-backup-",
            suffix=suffix,
            dir=staging_root,
            delete=False,
        ) as stream:
            temporary_path = Path(stream.name)
            copied = 0
            for chunk in iter(lambda: file.file.read(1024 * 1024), b""):
                copied += len(chunk)
                if copied > MAX_ARCHIVE_BYTES:
                    raise ServiceError(413, "备份包不能超过 2 GB", code="backup_too_large")
                stream.write(chunk)
        return service.stage_backup_file(temporary_path, file.filename or "backup.cbbak")
    finally:
        if temporary_path is not None:
            temporary_path.unlink(missing_ok=True)
        file.file.close()


@app.post("/api/backups/legacy/inspect")
def inspect_legacy_data(payload: LegacyDataPayload) -> dict:
    return service.stage_legacy_data(payload.data_path)


@app.post("/api/backups/import")
def import_backup(payload: BackupImportPayload) -> dict:
    return service.import_backup(
        payload.token,
        [node.model_dump() for node in payload.nodes],
        payload.conflict_policy,
    )


@app.delete("/api/backups/{token}")
def discard_staged_backup(token: str) -> dict[str, bool]:
    service.discard_staged_backup(token)
    return {"discarded": True}


@app.put("/api/nodes/rename")
def rename_node(payload: RenamePayload) -> dict:
    return service.rename_node(payload.project_id, payload.relative_path, payload.name)


@app.post("/api/nodes/move")
def move_node(payload: MovePayload) -> dict:
    return service.move_node(payload.project_id, payload.relative_path, payload.target_parent_path)


@app.post("/api/nodes/trash")
def trash_node(payload: TrashPayload) -> dict:
    return service.trash_node(payload.project_id, payload.relative_path)


@app.get("/api/trash")
def list_trash() -> list[dict]:
    return service.list_trash()


@app.post("/api/trash/{trash_id}/restore")
def restore_trash(trash_id: str) -> dict:
    return service.restore_trash(trash_id)


@app.get("/api/tables")
def search_tables(
    project_id: str | None = None,
    scope_type: Literal["project", "folder", "pdm"] = "project",
    scope_path: str = "",
    mode: Literal["table", "field"] = "table",
    q: str = "",
    all_nodes: bool = False,
    limit: int = Query(2000, ge=1, le=5000),
    offset: int = Query(0, ge=0),
) -> dict:
    return service.search_tables(
        project_id=project_id,
        scope_type=scope_type,
        scope_path=scope_path,
        mode=mode,
        query=q,
        all_nodes=all_nodes,
        limit=limit,
        offset=offset,
    )


@app.get("/api/ddl/options")
def ddl_options() -> dict:
    return service.ddl_options()


@app.get("/api/ddl/catalog")
def ddl_catalog(
    project_id: str = Query(min_length=1, max_length=100),
    include_tables: bool = True,
    pdm_id: list[str] = Query(default=[]),
    q: str = Query(default="", max_length=200),
) -> dict:
    return service.ddl_catalog(
        project_id,
        include_tables=include_tables,
        pdm_ids=pdm_id,
        query=q,
    )


@app.post("/api/ddl/generate")
def generate_ddl(payload: DdlGeneratePayload) -> dict:
    return service.generate_ddl(payload.table_ids, payload.config.model_dump(by_alias=True))


@app.get("/api/tables/{table_id}")
def table_detail(table_id: str) -> dict:
    return service.table_detail(table_id)


@app.put("/api/tables/{table_id}/fields")
def save_table_fields(table_id: str, payload: FieldsSavePayload) -> dict:
    return service.save_table_fields(
        table_id,
        payload.expected_hash,
        [field.model_dump() for field in payload.fields],
    )


frontend_dist = bundled_resource("frontend", "dist")
if frontend_dist.exists():
    assets = frontend_dist / "assets"
    if assets.exists():
        app.mount("/assets", StaticFiles(directory=assets), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa(full_path: str) -> FileResponse:
        candidate = (frontend_dist / full_path).resolve()
        if candidate.is_file() and candidate.is_relative_to(frontend_dist.resolve()):
            return FileResponse(candidate)
        return FileResponse(frontend_dist / "index.html")

from dataclasses import dataclass
from typing import Literal
from uuid import uuid4

try:
    from temporalio import workflow as temporal_workflow
except ModuleNotFoundError:
    temporal_workflow = None


def _temporal_workflow_definition(name: str):
    def decorate(cls):
        if temporal_workflow is None:
            return cls
        return temporal_workflow.defn(name=name)(cls)

    return decorate


def _temporal_workflow_run(fn):
    if temporal_workflow is None:
        return fn
    return temporal_workflow.run(fn)


QualityGateConditionName = Literal[
    "canonContinuity",
    "policySafety",
    "originalityIp",
    "metadata",
    "rightsRecord",
    "provenanceLedger",
    "humanApproval",
]
QualityGateConditionStatus = Literal["pass", "warning", "blocking-failure"]


@dataclass(frozen=True)
class WorkflowArtifact:
    id: str
    series_id: str
    chapter_number: int
    body: str


@dataclass(frozen=True)
class WorkflowEvaluation:
    conditions: dict[QualityGateConditionName, QualityGateConditionStatus]


@dataclass(frozen=True)
class ProvenanceEntry:
    workspace_id: str
    prompt: str
    model: str
    rights_record_id: str
    workflow_run_id: str


@dataclass(frozen=True)
class ApprovalTask:
    id: str
    status: str


@dataclass(frozen=True)
class ChapterDraftWorkflowResult:
    artifact: WorkflowArtifact
    evaluation: WorkflowEvaluation
    provenance: ProvenanceEntry
    approval_task: ApprovalTask
    public_publish_requested: bool


@dataclass(frozen=True)
class WorkspaceBoundary:
    id: str
    owner: str
    data_access_scope: tuple[str, ...]
    ai_run_quota_remaining: int
    cost_center: str
    budget_cents_remaining: int

    def grants_series_access(self, series_id: str) -> bool:
        return "series:*" in self.data_access_scope or f"series:{series_id}" in self.data_access_scope


@dataclass(frozen=True)
class WorkflowRunContext:
    id: str
    workflow_type: str
    temporal_workflow_id: str
    temporal_task_queue: str
    workspace_id: str
    workspace_owner: str
    data_access_scope: tuple[str, ...]
    quota_reserved: int
    cost_center: str
    estimated_cost_cents: int
    mode: Literal["AI-Autonomous Mode"]
    environment: Literal["sandbox"]


@dataclass(frozen=True)
class TemporalSandboxWorkflowResult:
    workflow_run: WorkflowRunContext
    artifact: WorkflowArtifact
    evaluation: WorkflowEvaluation
    provenance: ProvenanceEntry
    approval_task: ApprovalTask
    public_publish_requested: bool
    public_publish_blocked_by: tuple[QualityGateConditionName, ...]


@dataclass(frozen=True)
class TemporalSandboxWorkflowRequest:
    workspace_id: str
    series_id: str
    chapter_number: int
    prompt: str
    model: str
    rights_record_id: str
    public_publish_requested: bool = False


@dataclass(frozen=True)
class TrustedTemporalExecution:
    workspace: WorkspaceBoundary
    workflow_run_id: str
    temporal_workflow_id: str


@_temporal_workflow_definition("ai-factory.sandbox-ai-autonomous-mode")
class SandboxAIAutonomousModeWorkflow:
    workflow_type = "ai-factory.sandbox-ai-autonomous-mode"
    task_queue = "ai-factory-sandbox"

    def __init__(self, execution: TrustedTemporalExecution | None = None):
        self.execution = execution

    @_temporal_workflow_run
    async def run(self, request: TemporalSandboxWorkflowRequest) -> TemporalSandboxWorkflowResult:
        if self.execution is None:
            raise ValueError("Trusted Temporal execution is required")
        return _run_temporal_sandbox_request(request, self.execution)


def run_chapter_draft_workflow(
    *,
    workspace_id: str,
    series_id: str,
    chapter_number: int,
    prompt: str,
    model: str,
    rights_record_id: str,
    workflow_run_id: str | None = None,
) -> ChapterDraftWorkflowResult:
    if not rights_record_id.strip():
        raise ValueError("Rights Record is required before AI workflow execution")

    artifact = WorkflowArtifact(
        id=f"artifact:{series_id}:{chapter_number}",
        series_id=series_id,
        chapter_number=chapter_number,
        body="Draft artifact awaiting editorial review.",
    )
    evaluation = WorkflowEvaluation(
        conditions={
            "canonContinuity": "pass",
            "policySafety": "pass",
            "originalityIp": "pass",
            "metadata": "pass",
            "rightsRecord": "pass",
            "provenanceLedger": "pass",
            "humanApproval": "blocking-failure",
        }
    )
    provenance = ProvenanceEntry(
        workspace_id=workspace_id,
        prompt=prompt,
        model=model,
        rights_record_id=rights_record_id,
        workflow_run_id=workflow_run_id or _new_workflow_run_id(),
    )
    approval_task = ApprovalTask(
        id=f"approval:{artifact.id}",
        status="waiting-for-human-approval",
    )

    return ChapterDraftWorkflowResult(
        artifact=artifact,
        evaluation=evaluation,
        provenance=provenance,
        approval_task=approval_task,
        public_publish_requested=False,
    )


def run_temporal_sandbox_autonomous_workflow(
    *,
    workspace: WorkspaceBoundary,
    series_id: str,
    chapter_number: int,
    prompt: str,
    model: str,
    rights_record_id: str,
    public_publish_requested: bool = False,
) -> TemporalSandboxWorkflowResult:
    execution = _trusted_temporal_execution(workspace)
    return _run_temporal_sandbox_request(
        TemporalSandboxWorkflowRequest(
            workspace_id=workspace.id,
            series_id=series_id,
            chapter_number=chapter_number,
            prompt=prompt,
            model=model,
            rights_record_id=rights_record_id,
            public_publish_requested=public_publish_requested,
        ),
        execution,
    )


def _run_temporal_sandbox_request(
    request: TemporalSandboxWorkflowRequest,
    execution: TrustedTemporalExecution,
) -> TemporalSandboxWorkflowResult:
    if request.workspace_id != execution.workspace.id:
        raise ValueError("Trusted Temporal execution does not match requested Workspace")
    if not execution.workspace.grants_series_access(request.series_id):
        raise ValueError("Workspace does not grant data access to this Series")

    estimated_cost_cents = _estimate_sandbox_cost_cents(request.prompt)
    if execution.workspace.ai_run_quota_remaining < 1:
        raise ValueError("Workspace AI run quota is exhausted")
    if execution.workspace.budget_cents_remaining < estimated_cost_cents:
        raise ValueError("Workspace cost budget is exhausted")

    base_result = run_chapter_draft_workflow(
        workspace_id=execution.workspace.id,
        series_id=request.series_id,
        chapter_number=request.chapter_number,
        prompt=request.prompt,
        model=request.model,
        rights_record_id=request.rights_record_id,
        workflow_run_id=execution.workflow_run_id,
    )
    workflow_run = WorkflowRunContext(
        id=execution.workflow_run_id,
        workflow_type=SandboxAIAutonomousModeWorkflow.workflow_type,
        temporal_workflow_id=execution.temporal_workflow_id,
        temporal_task_queue=SandboxAIAutonomousModeWorkflow.task_queue,
        workspace_id=execution.workspace.id,
        workspace_owner=execution.workspace.owner,
        data_access_scope=execution.workspace.data_access_scope,
        quota_reserved=1,
        cost_center=execution.workspace.cost_center,
        estimated_cost_cents=estimated_cost_cents,
        mode="AI-Autonomous Mode",
        environment="sandbox",
    )
    artifact = WorkflowArtifact(
        id=base_result.artifact.id,
        series_id=base_result.artifact.series_id,
        chapter_number=base_result.artifact.chapter_number,
        body="Sandbox AI-Autonomous Mode draft artifact awaiting editorial review.",
    )
    provenance = ProvenanceEntry(
        workspace_id=base_result.provenance.workspace_id,
        prompt=base_result.provenance.prompt,
        model=base_result.provenance.model,
        rights_record_id=base_result.provenance.rights_record_id,
        workflow_run_id=workflow_run.id,
    )

    return TemporalSandboxWorkflowResult(
        workflow_run=workflow_run,
        artifact=artifact,
        evaluation=base_result.evaluation,
        provenance=provenance,
        approval_task=base_result.approval_task,
        public_publish_requested=request.public_publish_requested,
        public_publish_blocked_by=("humanApproval",),
    )


def _estimate_sandbox_cost_cents(prompt: str) -> int:
    return max(1, len(prompt.strip()) // 20)


def _new_workflow_run_id() -> str:
    return f"ai-workflow-run:{uuid4()}"


def _trusted_temporal_execution(workspace: WorkspaceBoundary) -> TrustedTemporalExecution:
    if temporal_workflow is not None:
        try:
            info = temporal_workflow.info()
            return TrustedTemporalExecution(
                workspace=workspace,
                workflow_run_id=f"ai-workflow-run:{info.workflow_id}",
                temporal_workflow_id=info.workflow_id,
            )
        except Exception:
            pass

    workflow_run_id = _new_workflow_run_id()
    return TrustedTemporalExecution(
        workspace=workspace,
        workflow_run_id=workflow_run_id,
        temporal_workflow_id=f"temporal:sandbox:{workflow_run_id}",
    )

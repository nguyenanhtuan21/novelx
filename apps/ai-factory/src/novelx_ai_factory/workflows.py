from dataclasses import dataclass
from typing import Literal


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


def run_chapter_draft_workflow(
    *,
    workspace_id: str,
    series_id: str,
    chapter_number: int,
    prompt: str,
    model: str,
    rights_record_id: str,
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

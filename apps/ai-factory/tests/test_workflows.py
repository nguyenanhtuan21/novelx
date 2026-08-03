import asyncio
import unittest

from novelx_ai_factory.workflows import (
    SandboxAIAutonomousModeWorkflow,
    TemporalSandboxWorkflowRequest,
    TrustedTemporalExecution,
    WorkspaceBoundary,
    run_chapter_draft_workflow,
    run_temporal_sandbox_autonomous_workflow,
)


class ChapterDraftWorkflowTest(unittest.TestCase):
    def workspace(self, *, data_access_scope=("series:thanh-kiem-trong-mua",)):
        return WorkspaceBoundary(
            id="novelx-internal",
            owner="content-ops",
            data_access_scope=data_access_scope,
            ai_run_quota_remaining=3,
            cost_center="ai-factory-rd",
            budget_cents_remaining=5000,
        )

    def temporal_request(self):
        return TemporalSandboxWorkflowRequest(
            workspace_id="novelx-internal",
            series_id="thanh-kiem-trong-mua",
            chapter_number=1,
            prompt="Draft a chapter from the locked Story Bible.",
            model="sandbox-model",
            rights_record_id="rights-1",
        )

    def test_runs_temporal_sandbox_autonomous_workflow_inside_workspace_boundary(self):
        workspace = self.workspace()

        result = run_temporal_sandbox_autonomous_workflow(
            workspace=workspace,
            series_id="thanh-kiem-trong-mua",
            chapter_number=1,
            prompt="Draft a chapter from the locked Story Bible.",
            model="sandbox-model",
            rights_record_id="rights-1",
        )

        self.assertEqual(result.workflow_run.workspace_id, "novelx-internal")
        self.assertEqual(result.workflow_run.workspace_owner, "content-ops")
        self.assertEqual(result.workflow_run.workflow_type, "ai-factory.sandbox-ai-autonomous-mode")
        self.assertTrue(result.workflow_run.id.startswith("ai-workflow-run:"))
        self.assertTrue(result.workflow_run.temporal_workflow_id.startswith("temporal:sandbox:"))
        self.assertEqual(result.workflow_run.temporal_task_queue, "ai-factory-sandbox")
        self.assertEqual(result.workflow_run.environment, "sandbox")
        self.assertEqual(result.workflow_run.mode, "AI-Autonomous Mode")
        self.assertEqual(result.workflow_run.data_access_scope, ("series:thanh-kiem-trong-mua",))
        self.assertEqual(result.workflow_run.quota_reserved, 1)
        self.assertEqual(result.workflow_run.cost_center, "ai-factory-rd")
        self.assertGreater(result.workflow_run.estimated_cost_cents, 0)
        self.assertEqual(result.artifact.series_id, "thanh-kiem-trong-mua")
        self.assertEqual(result.evaluation.conditions["humanApproval"], "blocking-failure")
        self.assertEqual(result.provenance.workflow_run_id, result.workflow_run.id)
        self.assertEqual(result.approval_task.status, "waiting-for-human-approval")
        self.assertEqual(result.public_publish_requested, False)
        self.assertEqual(result.public_publish_blocked_by, ("humanApproval",))

    def test_temporal_workflow_contract_runs_without_live_model_provider(self):
        result = asyncio.run(
            SandboxAIAutonomousModeWorkflow(
                TrustedTemporalExecution(
                    workspace=self.workspace(),
                    workflow_run_id="ai-workflow-run:test-run",
                    temporal_workflow_id="temporal:sandbox:ai-workflow-run:test-run",
                )
            ).run(
                self.temporal_request()
            )
        )

        self.assertEqual(SandboxAIAutonomousModeWorkflow.workflow_type, "ai-factory.sandbox-ai-autonomous-mode")
        self.assertEqual(result.workflow_run.id, "ai-workflow-run:test-run")
        self.assertIn("sandbox", result.artifact.body.lower())
        self.assertEqual(result.evaluation.conditions["humanApproval"], "blocking-failure")

    def test_rejects_temporal_sandbox_workflow_outside_workspace_data_access(self):
        workspace = self.workspace(data_access_scope=("series:other-series",))

        with self.assertRaisesRegex(ValueError, "Workspace does not grant data access"):
            run_temporal_sandbox_autonomous_workflow(
                workspace=workspace,
                series_id="thanh-kiem-trong-mua",
                chapter_number=1,
                prompt="Draft a chapter from the locked Story Bible.",
                model="sandbox-model",
                rights_record_id="rights-1",
            )

    def test_creates_artifacts_evaluations_provenance_and_approval_task_without_public_publish(self):
        result = run_chapter_draft_workflow(
            workspace_id="novelx-internal",
            series_id="thanh-kiem-trong-mua",
            chapter_number=1,
            prompt="Draft a chapter from the locked Story Bible.",
            model="gpt-5.5",
            rights_record_id="rights-1",
        )

        self.assertEqual(result.public_publish_requested, False)
        self.assertEqual(result.approval_task.status, "waiting-for-human-approval")
        self.assertEqual(result.artifact.series_id, "thanh-kiem-trong-mua")
        self.assertEqual(result.evaluation.conditions["humanApproval"], "blocking-failure")
        self.assertEqual(result.provenance.workspace_id, "novelx-internal")
        self.assertEqual(result.provenance.rights_record_id, "rights-1")
        self.assertTrue(result.provenance.workflow_run_id.startswith("ai-workflow-run:"))

    def test_blocks_requested_public_publish_until_human_approval_exists(self):
        result = run_temporal_sandbox_autonomous_workflow(
            workspace=self.workspace(),
            series_id="thanh-kiem-trong-mua",
            chapter_number=1,
            prompt="Draft a chapter from the locked Story Bible.",
            model="sandbox-model",
            rights_record_id="rights-1",
            public_publish_requested=True,
        )

        self.assertEqual(result.public_publish_requested, True)
        self.assertEqual(result.public_publish_blocked_by, ("humanApproval",))
        self.assertEqual(result.approval_task.status, "waiting-for-human-approval")
        self.assertEqual(result.evaluation.conditions["humanApproval"], "blocking-failure")

    def test_rejects_workflow_inputs_without_rights_record(self):
        with self.assertRaisesRegex(ValueError, "Rights Record is required"):
            run_chapter_draft_workflow(
                workspace_id="novelx-internal",
                series_id="thanh-kiem-trong-mua",
                chapter_number=1,
                prompt="Draft a chapter from the locked Story Bible.",
                model="gpt-5.5",
                rights_record_id="",
            )


if __name__ == "__main__":
    unittest.main()

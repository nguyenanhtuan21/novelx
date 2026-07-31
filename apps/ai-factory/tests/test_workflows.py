import unittest

from novelx_ai_factory.workflows import run_chapter_draft_workflow


class ChapterDraftWorkflowTest(unittest.TestCase):
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

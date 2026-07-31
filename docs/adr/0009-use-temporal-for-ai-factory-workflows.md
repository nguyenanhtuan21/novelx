# Use Temporal for AI Factory workflows

AI Factory will use Temporal as the workflow engine for long-running AI workflows, including generation, evaluation, human waits, retries, scheduling, and recovery. This introduces operational and modeling commitments, but gives NovelX durable execution history, reliable retry semantics, explicit activity boundaries, and a stronger foundation for idempotent, auditable AI content production than ad hoc queues, cron jobs, or scripts.

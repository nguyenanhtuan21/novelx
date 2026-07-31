# Core Platform modular monolith with separate AI Factory

NovelX will build the Core Platform as a modular monolith for reader experience, catalog, CMS, publishing, entitlement, billing, community, and operations, while running AI Factory as a separate API/workers/workflow deployment. This avoids premature full microservices while preserving a strong boundary for long-running AI workflows, model/provider concerns, evaluation, provenance, and operational scaling.

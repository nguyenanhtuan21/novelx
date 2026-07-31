# NovelX AI Factory

AI Factory is the internal control plane for AI-assisted NovelX workflows. The MVP keeps it separate from Core Platform code and uses this package as the Python worker/workflow foundation for model and evaluation tooling.

Temporal is the intended durable workflow runtime. This first seam keeps the workflow contract pure and testable before a Temporal worker adapter is wired in.

# Separate reader and staff accounts

NovelX separates reader accounts from staff accounts instead of treating staff privileges as ordinary roles on reader accounts. This keeps reader sessions, community behavior, purchases, privileged operations, MFA, step-up authentication, and immutable audit trails on safer boundaries, avoiding a costly and risky split after authorization logic has spread through the codebase.

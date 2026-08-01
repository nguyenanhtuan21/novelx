# NovelX

NovelX is a digital story platform and AI-enabled content studio. It exists to operate a curated catalog of serialized stories with strong reader experience, editorial quality, AI transparency, and controlled publishing workflows.

## Language

**NovelX**:
The digital story platform and content studio being built in this repo. In the first 12 months, NovelX is the primary product; it proves reader value, editorial operations, and AI-assisted content production.
_Avoid_: AI Factory, generic content platform

**AI Factory**:
The internal control plane for AI-assisted content workflows used by NovelX. In the first 12 months, it is an operational capability for NovelX, not a standalone public B2B product.
_Avoid_: script runner, public AI SaaS

**Workspace**:
The AI Factory boundary for organization, data access, quota, cost tracking, and workflow ownership. In the MVP, workspaces are internal and NovelX may be the default workspace, but the domain preserves this boundary for future expansion.
_Avoid_: tenant, organization account

**Core Platform**:
The NovelX application surface that owns reader experience, catalog, CMS, publishing, entitlement, billing, community, and operational administration. For the MVP, it is built as a modular monolith and integrates with AI Factory through API and event boundaries.
_Avoid_: reader app, CMS app, backend monolith

**Series**:
A serialized text story in the NovelX catalog, made up of ordered chapters and operated against a release cadence, quality bar, and reader-retention goals. Series are the core content unit for the MVP.
_Avoid_: book, title, novel

**Chapter**:
An ordered text installment within a series. Chapters are the core reading, progress-tracking, review, scheduling, and publishing unit for the MVP.
_Avoid_: episode, post, page

**AI Persona**:
A public creative persona used to present an AI-assisted content line transparently. An AI Persona is not a real person, does not log in, and must not use fake human biography, credentials, lived experience, or testimonials.
_Avoid_: AI author, virtual human author, fake author

**AI-Autonomous Mode**:
A workflow mode where AI can generate, evaluate, revise, and package content without manual intervention before the final public-publishing gate. In the MVP, this mode may operate in sandbox or staging, but public publishing still requires human approval.
_Avoid_: full auto-publish, unchecked AI publishing

**Human Approval**:
An explicit approval decision by an accountable human reviewer before a chapter becomes publicly available. Human approval is the required public-publishing gate for MVP chapters.
_Avoid_: AI review, automated QA pass

**Canon**:
The accepted truth of a series, including its world rules, characters, timeline, relationships, and irreversible story facts. In the MVP, AI may propose canon changes, but locked canon is owned by accountable human authors or editors. Canon is made of canon entries, each a single statement under an id that later continuity checks can name.
_Avoid_: generated memory, model context

**Story Bible**:
The governed record of a series canon used by authors, editors, and AI workflows. A story bible is locked once it is in production use, which names the human accountable for it and the time they took that on. Locked is accountable rather than frozen: an editor may still change locked canon, but only by naming a reason, so what a lock rules out is the silent change rather than the change.
_Avoid_: prompt context, loose notes, wiki

**AI Workflow Run**:
One execution of an AI Factory workflow, and the identity it carries when it reaches Core Platform. An AI workflow run is a system path rather than a person: it never becomes a staff account, so it cannot pass a staff permission gate, and it cannot write canon. Core Platform does not accept a request's own claim to be one, because an actor a caller asserts about itself is not evidence.
_Avoid_: service account, staff automation, bot user

**Draft Chapter**:
A chapter being written in the staff CMS: prose attached to a governed series, and never publicly readable. A draft carries no rights record, provenance ledger entry, quality gate result, or human approval when it is authored; each is attached later by the workflow that carries it towards publishing, so their absence is the honest state of a fresh draft rather than a gate that was skipped.
_Avoid_: unpublished chapter, private chapter, chapter revision

**Published Snapshot**:
The immutable public version of a chapter produced by a publishing action. Post-publication fixes create a new revision while preserving the previous snapshot internally with reason, actor, audit trail, and related ticket.
_Avoid_: live chapter body, mutable page content

**Quality Gate**:
The set of required checks that a chapter must pass before public publishing. A quality gate is multi-condition, including canon and continuity, policy safety, originality and IP, metadata, rights and provenance, and human approval; a blocking failure prevents publication even if other scores are high.
_Avoid_: AI score, aggregate quality score

**Creative Disclosure**:
The public label explaining how a series or chapter was created: Human, Hybrid, or AI-Assisted. Human means people wrote the creative work and AI only provided light mechanical support; Hybrid means AI materially contributed to outline or draft while people co-created and remain accountable; AI-Assisted means AI workflows produced most of the draft under human editorial oversight.
_Avoid_: AI-generated, machine-written, fake author disclosure

**Reader Account**:
An account used by a reader to read, follow series, store progress, participate in community features, and manage reader-facing purchases or preferences.
_Avoid_: user account, customer account

**Reader Session Token**:
The signed proof of which reader session a reader-facing request belongs to: a reader account or an anonymous reader session. Core Platform issues and verifies it; clients treat it as opaque and never construct one. A request without a valid token names no reader account.
_Avoid_: API key, reader id header, JWT

**Series Follow**:
A reader account's standing interest in a series, used to build that reader's library and, later, release notifications. A series follow is reader-owned state and says nothing about entitlement to paid or early-access content.
_Avoid_: subscription, bookmark, favourite

**Reader Library**:
The reader-account view built from series follows and reading progress: which series a reader follows and where they left off in each. A reader library is per-account state and is not available to an anonymous reader session, which is invited to upgrade instead. It is distinct from the curated catalog, which is the platform-wide content set.
_Avoid_: bookshelf, my list, catalog

**Anonymous Reader Session**:
A pre-account reader session that can read public content and preserve lightweight reading progress before being upgraded into a reader account without losing that history. It must not be treated as a place for sensitive or privileged data.
_Avoid_: guest account, anonymous user

**Staff Account**:
An account used by an operator such as an editor, moderator, admin, or content operations member to perform privileged work. Staff accounts are separate from reader accounts and require stronger authentication, authorization, and audit controls.
_Avoid_: admin role on reader account, user account

**Staff Session Token**:
The signed proof that a privileged request acts as a Staff Account, carrying the permissions that account may act on and running out after a short session window. It travels on the staff boundary's own header under its own scheme and is signed with a secret separate from the reader one, so it is a different credential from a Reader Session Token rather than a stronger version of one.
_Avoid_: admin token, elevated reader session, API key

**Staff Audit Record**:
The append-only record of a privileged staff operation: actor, action, target, outcome, and time. Refused attempts are recorded too, so a reader or anonymous session probing the staff boundary leaves evidence. It is the operational accountability trail for staff work, distinct from the Provenance Ledger, which is the lineage of content and AI workflow artifacts.
_Avoid_: activity log, event log, provenance entry

**Weekly Engaged Reading Hours**:
The north-star metric for NovelX: total valid reading time from legitimate readers in a week, interpreted alongside guardrails such as D30 retention, report rate, AI cost per approved chapter, and ad complaints.
_Avoid_: pageviews, clicks, raw time-on-site

**Entitlement**:
A reader's right to access a benefit or content unit, such as ad-free reading, early access, or a paid chapter. NovelX models entitlement from the start, even if real payment-provider integration is deferred until after the core reader, CMS, and publishing flows stabilize.
_Avoid_: payment, subscription, purchase record

**Managed Taxonomy**:
The governed classification model for content discovery, safety, personalization, and monetization. NovelX treats genre, subgenre, trope, mood, theme, audience, age rating, and content warning as managed dimensions; free-form tags are only supplementary and moderated.
_Avoid_: free tags, folksonomy, hashtag taxonomy

**Curated Catalog**:
The MVP content strategy for NovelX: a controlled catalog of roughly 20 to 40 quality-reviewed series across four to six focused genres. A curated catalog is intentionally not a mass-published library or open creator marketplace.
_Avoid_: content dump, marketplace catalog, SEO content farm

**Workflow Material**:
Something a workflow works from rather than something NovelX wrote: an asset, a dataset, a reference, or source material. It is named apart from Series and Chapters because the question it raises is where it came from, and it enters a workflow only by being attached to what that workflow carries — for the MVP, a Draft Chapter.
_Avoid_: input, source file, upload

**Rights Record**:
The evidence-backed record of who owns or licenses an asset or dataset, where it may be used, for how long, whether it may be modified, and whether it may be used in AI workflows. Public availability on the Internet is not a rights record. Its scope says which workflows the material is cleared for and its AI-use right says whether the grant permits AI use at all; the two are kept apart because a licence routinely allows publishing while forbidding model use. A record is written once — a grant that has genuinely changed is a new record, so what was relied on at the time survives.
_Avoid_: source URL, attribution note, license guess

**Provenance Ledger**:
The internal append-only, queryable record of how content and AI workflow artifacts were created, evaluated, edited, approved, revised, and published. For chapter text and workflow artifacts, this ledger is the source of truth; external content-credential metadata may only supplement it for media assets.
_Avoid_: C2PA as source of truth, audit log only

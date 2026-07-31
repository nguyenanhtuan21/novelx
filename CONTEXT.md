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
The accepted truth of a series, including its world rules, characters, timeline, relationships, and irreversible story facts. In the MVP, AI may propose canon changes, but locked canon is owned by accountable human authors or editors.
_Avoid_: generated memory, model context

**Story Bible**:
The governed record of a series canon used by authors, editors, and AI workflows. Once locked for production use, changes to a story bible require human review and audit.
_Avoid_: prompt context, loose notes, wiki

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

**Rights Record**:
The evidence-backed record of who owns or licenses an asset or dataset, where it may be used, for how long, whether it may be modified, and whether it may be used in AI workflows. Public availability on the Internet is not a rights record.
_Avoid_: source URL, attribution note, license guess

**Provenance Ledger**:
The internal append-only, queryable record of how content and AI workflow artifacts were created, evaluated, edited, approved, revised, and published. For chapter text and workflow artifacts, this ledger is the source of truth; external content-credential metadata may only supplement it for media assets.
_Avoid_: C2PA as source of truth, audit log only

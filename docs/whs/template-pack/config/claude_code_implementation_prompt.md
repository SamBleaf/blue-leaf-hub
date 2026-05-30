# Claude Code Implementation Prompt

You are working in Blue Leaf Hub.

Implement the WHS template system from this pack.

## Non-negotiable principles

1. Do not build independent document forms.
2. Use structured data and merge fields.
3. Do not use AI to generate legal WHS text.
4. Use approved markdown templates as source content.
5. Use questionnaire answers and risk rules to choose outputs.
6. Store generated document snapshots with template version and profile version.
7. Mark documents stale when WHS profile data changes.
8. Keep worker-facing outputs short and mobile friendly.

## Required architecture

- whs_site_profiles is the single WHS source of truth per project.
- whsQuestionnaire.mjs defines modules, questions, conditional logic and code references.
- whsRiskRules.mjs consumes the outputs matrix and derives:
  - high_risk_activities
  - applicable_swms
  - applicable_permits
  - required_inspections
  - required_registers
  - required_toolbox_talks
  - site_board_warnings
  - training_requirements
- whsMergeFields.mjs maps every merge field to source data.
- Document templates are markdown files with {{merge_fields}}.
- Generated outputs land in job_documents with:
  - generator_key = whs_engine
  - template_key
  - template_version
  - profile_version
  - generated_at
  - generated_by
  - audience_layer
  - stale flag

## Build order

1. Import templates.
2. Build merge field resolver.
3. Build markdown renderer.
4. Build output generator.
5. Build stale detection.
6. Build SWMS generation from selected templates.
7. Build site board generator.
8. Build dashboard compliance health score.

## UI requirements

- One WHS setup screen per project.
- Modules expand/collapse.
- Show only relevant conditional questions.
- Prefill from project/job/tender data.
- Use pick lists over free text.
- Display generated output list with status:
  - Draft
  - Generated
  - Stale
  - Approved
  - Requires review
- Separate outputs by audience:
  - Management
  - Site
  - Worker

## Testing requirement

Create test project scenarios:

1. Single-storey renovation with no major high risk work.
2. Double-storey custom home with scaffold, roof work and structural carpentry.
3. Renovation with demolition, asbestos prompt and silica cutting.
4. Steep site with excavation, retaining wall and mobile plant.
5. Project with crane lift and roof trusses.

For each scenario verify:

- correct questionnaire modules reveal
- correct SWMS generate
- correct permits generate
- correct inspections generate
- correct registers activate
- documents render with no missing required merge fields
- worker-facing outputs remain short

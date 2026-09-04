import EmailFamilySettings from "./EmailFamilySettings.jsx";

// The pipeline "gap" emails (crm_pipeline_email): PTSA covering, contract-signed, ops-handoff,
// nurture, lost, tender-started. Thin wrapper over the shared EmailFamilySettings editor.
const LABELS = {
  ptsa_covering: "PTSA covering",
  contract_signed: "Contract signed",
  ops_handoff: "Ops handoff",
  nurture: "Nurture",
  lost: "Lost close-off",
  tender_started: "Tender started",
};
const SAMPLE = {
  "{{client_salutation}}": "Jenna and Adam",
  "{{ptsa_fee}}": "$16,500 incl. GST",
  "{{user_signature}}": "Kind regards,\nSam Morris\nDirector\n0434 046 399",
};

export default function PipelineEmailSettings() {
  return (
    <EmailFamilySettings
      endpoint="/api/sales/pipeline-email-template"
      anchorId="pipeline-email"
      title="Pipeline emails (PTSA, Won, nurture & lost)"
      blurb="The stage emails in the Stage-email dropdown: the PTSA covering email, the contract-signed welcome + Operations handoff (Won), the nurture check-in, the lost close-off and the tender-started update."
      labels={LABELS}
      sample={SAMPLE}
    />
  );
}

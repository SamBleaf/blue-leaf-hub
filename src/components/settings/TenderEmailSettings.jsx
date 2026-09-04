import EmailFamilySettings from "./EmailFamilySettings.jsx";

// The Tender-stage named client emails (crm_tender_email): 24h proposal follow-up, client-review
// follow-up, contract sent, unsigned-contract follow-up. Thin wrapper over the shared editor.
const LABELS = {
  proposal_followup: "Proposal follow-up (24h)",
  review_followup: "Client review follow-up",
  contract_sent: "Contract sent",
  contract_followup: "Unsigned-contract follow-up",
};
const SAMPLE = {
  "{{client_salutation}}": "Jenna and Adam",
  "{{user_signature}}": "Kind regards,\nSam Morris\nDirector\n0434 046 399",
};

export default function TenderEmailSettings() {
  return (
    <EmailFamilySettings
      endpoint="/api/sales/tender-email-template"
      anchorId="tender-email"
      title="Tender emails"
      blurb="The Tender-stage named client emails: the 24-hour follow-up after presenting the proposal, the client-review follow-up, the contract-sent email, and the unsigned-contract follow-up."
      labels={LABELS}
      sample={SAMPLE}
    />
  );
}

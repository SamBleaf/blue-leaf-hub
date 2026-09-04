import EmailFamilySettings from "./EmailFamilySettings.jsx";

// The Concept-stage client emails (crm_concept_email): brief questions, interim update, approval
// follow-up, accepted-concepts acknowledgement. Thin wrapper over the shared editor.
const LABELS = {
  brief_questions: "Brief questions",
  interim: "Interim update",
  followup: "Approval follow-up",
  accepted_concepts: "Accepted-concepts ack",
};
const SAMPLE = {
  "{{client_salutation}}": "Jenna and Adam",
  "{{designer_name}}": "Bart",
  "{{designer_company}}": "Orange Tree Design",
  "{{user_signature}}": "Kind regards,\nSam Morris\nDirector\n0434 046 399",
};

export default function ConceptEmailSettings() {
  return (
    <EmailFamilySettings
      endpoint="/api/sales/concept-email-template"
      anchorId="concept-email"
      title="Concept emails"
      blurb="The Concept-stage client emails: the brief questions (before the brief meeting), the interim update while concepts are underway, the post-presentation approval follow-up, and the accepted-concepts acknowledgement that bridges into PTSA / Plans."
      labels={LABELS}
      sample={SAMPLE}
    />
  );
}

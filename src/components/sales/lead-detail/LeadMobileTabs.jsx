/**
 * LeadMobileTabs — Pass 3A tab strip for the lead-detail mobile/tablet layout.
 * Thin wrapper over the Pass 1 MobileTabs primitive (controlled by the page).
 */
import MobileTabs from "../../ui/MobileTabs.jsx";

export default function LeadMobileTabs({ tabs, value, onChange, className = "" }) {
  return <MobileTabs tabs={tabs} value={value} onChange={onChange} className={className} />;
}

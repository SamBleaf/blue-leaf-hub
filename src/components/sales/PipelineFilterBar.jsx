/**
 * PipelineFilterBar — chip filter row for the pipeline (Pass 2 redesign).
 * Builds the chip options + live counts from the lead set, using FilterChips (Pass 1).
 * Controlled — selection state lives in the page.
 */
import FilterChips from "../ui/FilterChips.jsx";
import { PIPELINE_FILTERS } from "../../lib/salesPipeline.js";

export default function PipelineFilterBar({ leads = [], value, onChange, className = "" }) {
  const options = PIPELINE_FILTERS.map((f) => ({
    value: f.value,
    label: f.label,
    count: f.value === "all" ? leads.length : leads.filter(f.test).length,
  }));
  return (
    <div className={className}>
      <FilterChips options={options} value={value} onChange={onChange} />
    </div>
  );
}

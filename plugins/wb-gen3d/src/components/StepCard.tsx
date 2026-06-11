import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

// Staged setup step card (WORKBENCH_LEFT_SIDEBAR §7): number → title → live
// summary → collapsible body. Only the current step is open; collapsed steps
// keep showing their summary so the user can scan their choices.
export function StepCard({
  index,
  title,
  summary,
  open,
  onToggle,
  children,
}: {
  index: number;
  title: string;
  summary: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className={`step-card ${open ? 'is-open' : ''}`}>
      <button type="button" className="step-head" aria-expanded={open} onClick={onToggle}>
        <span className="step-num">{index}</span>
        <span className="step-titles">
          <span className="step-title">{title}</span>
          {!open && summary && <span className="step-summary">{summary}</span>}
        </span>
        <ChevronDown className="step-caret" size={16} aria-hidden="true" />
      </button>
      {open && <div className="step-body motion-fade-in">{children}</div>}
    </section>
  );
}

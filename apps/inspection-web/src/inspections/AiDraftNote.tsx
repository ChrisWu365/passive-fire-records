import type { AiStatus } from '../api/types';

/**
 * Shows the stored AI draft, always labelled as unverified, or the fact that the last request failed.
 * The wording is deliberate: a draft is a suggestion for a person to review, never a compliance decision.
 */
export function AiDraftNote({ status, summary }: { status: AiStatus; summary: string | null }) {
  if (status === 'FAILED') {
    return <div className="ai-note failed"><p>The last AI draft request failed. You can try again.</p></div>;
  }
  if (!summary) return null;
  return (
    <div className="ai-note">
      <strong>AI-assisted draft — unverified</strong>
      <p>{summary}</p>
      <small>
        Human inspection and professional judgement are required. This suggestion is not a compliance decision.
      </small>
    </div>
  );
}

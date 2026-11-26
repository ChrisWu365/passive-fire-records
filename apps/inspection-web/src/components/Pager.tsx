interface PagerProps {
  /** The page being shown, counted from 1. */
  page: number;
  pageCount: number;
  onChange: (page: number) => void;
}

/** Previous and Next with the page number. Renders nothing when everything fits on one page. */
export function Pager({ page, pageCount, onChange }: PagerProps) {
  if (pageCount <= 1) return null;
  return (
    <nav className="pager" aria-label="Pages">
      <button type="button" className="button ghost" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        Previous
      </button>
      <span>Page {page} of {pageCount}</span>
      <button type="button" className="button ghost" disabled={page >= pageCount} onClick={() => onChange(page + 1)}>
        Next
      </button>
    </nav>
  );
}

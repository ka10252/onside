"use client";

/** Opens the browser's print dialogue, where "Save as PDF" is the usual choice. */
export function PrintButton() {
  return (
    <button type="button" className="btn primary" onClick={() => window.print()}>
      Save as PDF
    </button>
  );
}

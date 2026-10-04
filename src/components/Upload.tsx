/** What the student uploaded for a question: a photo shown in place, a PDF offered to open. */
export function Upload({ responseId, v, alt }: { responseId: string; v?: number; alt: string }) {
  const src = `/api/photo?r=${responseId}${v ? `&v=${v}` : ""}`;
  return (
    <span className="uploadbox">
      {/* eslint-disable-next-line @next/next/no-img-element -- private upload of unknown size */}
      <img className="upload" src={src} alt={alt} />
      <a className="btn ghost sm" href={src} target="_blank" rel="noreferrer">
        Open the file
      </a>
    </span>
  );
}

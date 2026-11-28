import { useMemo, useState, type ReactNode } from 'react';
import { checkSvg, svgDataUrl } from '../../../lib/visuals/svg';

/**
 * A ```svg block shown as a picture. The drawing is only ever the source of an
 * <img>; it is never added to the page's own DOM.
 */
export function DiagramBlock({ code, codeView }: { code: string; codeView: ReactNode }) {
  const check = useMemo(() => checkSvg(code), [code]);
  const src = useMemo(() => (check.ok ? svgDataUrl(check.svg) : ''), [check]);
  const [failedSrc, setFailedSrc] = useState('');
  const [showCode, setShowCode] = useState(false);

  if (!check.ok || failedSrc === src) {
    const reason = check.ok ? 'it could not be displayed' : check.reason;
    return (
      <div data-no-speech>
        <p className="visual-error">This diagram could not be drawn ({reason}), so its code is shown.</p>
        {codeView}
      </div>
    );
  }

  return (
    <div className="visual-block" data-no-speech dir="ltr">
      <figure className="answer-figure">
        <img
          src={src}
          alt={check.title ?? 'Diagram'}
          className={check.sized ? 'diagram-image' : 'diagram-image diagram-image--fill'}
          onError={() => setFailedSrc(src)}
        />
      </figure>
      <div data-no-print>
        <button
          type="button"
          className="visual-toggle"
          aria-expanded={showCode}
          onClick={() => setShowCode((shown) => !shown)}
        >
          {showCode ? 'Hide code' : 'Show code'}
        </button>
        {showCode && codeView}
      </div>
    </div>
  );
}

const escapeAttr = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

export interface PreviewPageInput {
  scriptUrl: string;
  /** Origin of the panel, so the ready ping is not broadcast. */
  parentOrigin: string;
}

/**
 * The preview host page, served from a real URL rather than an iframe `srcdoc`.
 *
 * `srcdoc` gives the frame the opaque origin `about:srcdoc`, which leaves a
 * widget with no host origin to postMessage back to - so RPC, and therefore any
 * iframe widget, could never work in preview. A real URL fixes that and lets the
 * runtime use its normal storage paths.
 */
export function renderPreviewPage({ scriptUrl, parentOrigin }: PreviewPageInput): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>Widget preview</title>
<style>
  html, body { margin: 0; padding: 0; height: 100%; }
  body {
    background-image:
      linear-gradient(45deg, #f3f4f6 25%, transparent 25%),
      linear-gradient(-45deg, #f3f4f6 25%, transparent 25%),
      linear-gradient(45deg, transparent 75%, #f3f4f6 75%),
      linear-gradient(-45deg, transparent 75%, #f3f4f6 75%);
    background-size: 24px 24px;
    background-position: 0 0, 0 12px, 12px -12px, -12px 0;
  }
  .hint {
    position: absolute;
    inset-inline: 0;
    top: 40%;
    margin: 0;
    text-align: center;
    font: 500 12px/1.5 ui-sans-serif, system-ui, -apple-system, sans-serif;
    color: #9ca3af;
  }
</style>
</head>
<body>
<p class="hint">Preview page &mdash; your widget renders over this.</p>
<script src="${escapeAttr(scriptUrl)}"></script>
<script>
  // Tell the panel the runtime has booted, so the first config push is not sent
  // before the host is listening for it.
  window.addEventListener('load', function () {
    parent.postMessage({ wp: 1, event: 'preview:ready' }, ${JSON.stringify(parentOrigin)});
  });
</script>
</body>
</html>`;
}

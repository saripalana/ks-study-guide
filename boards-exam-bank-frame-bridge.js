(function () {
  'use strict';

  const examFrame = document.getElementById('examFrame');
  if (!examFrame || examFrame.getAttribute('data-bank-frame-bridge') === 'true') return;

  let objectUrl = '';
  const nativeHasAttribute = examFrame.hasAttribute.bind(examFrame);
  const nativeRemoveAttribute = examFrame.removeAttribute.bind(examFrame);
  const assetBase = new URL('./', window.location.href).href;

  function revokeObjectUrl() {
    if (!objectUrl) return;
    URL.revokeObjectURL(objectUrl);
    objectUrl = '';
  }

  function withAssetBase(documentText) {
    const html = String(documentText || '');
    const baseTag = '<base href="' + assetBase.replace(/"/g, '&quot;') + '">';
    if (/<base\s/i.test(html)) return html;
    if (/<head[^>]*>/i.test(html)) return html.replace(/<head([^>]*)>/i, '<head$1>' + baseTag);
    return baseTag + html;
  }

  Object.defineProperty(examFrame, 'srcdoc', {
    configurable: true,
    enumerable: true,
    get: function () { return ''; },
    set: function (documentText) {
      revokeObjectUrl();
      const blob = new Blob([withAssetBase(documentText)], { type: 'text/html;charset=utf-8' });
      objectUrl = URL.createObjectURL(blob);
      examFrame.setAttribute('data-bank-runtime-document', 'true');
      examFrame.src = objectUrl;
    }
  });

  examFrame.hasAttribute = function (name) {
    if (name === 'srcdoc' && examFrame.getAttribute('data-bank-runtime-document') === 'true') return true;
    return nativeHasAttribute(name);
  };

  examFrame.removeAttribute = function (name) {
    if (name === 'srcdoc') {
      nativeRemoveAttribute('data-bank-runtime-document');
      revokeObjectUrl();
      return;
    }
    nativeRemoveAttribute(name);
  };

  examFrame.setAttribute('data-bank-frame-bridge', 'true');
  window.addEventListener('pagehide', revokeObjectUrl);
})();
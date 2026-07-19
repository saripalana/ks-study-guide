(function () {
  'use strict';

  const definitions = new Map();
  let observer = null;

  function regionElement(region) {
    return document.querySelector('[data-dashboard-region="' + String(region) + '"]');
  }

  function componentSelector(id) {
    return '[data-dashboard-component="' + String(id).replace(/"/g, '\\"') + '"]';
  }

  function mountRegion(region) {
    const container = regionElement(region);
    if (!container) return false;

    const ordered = Array.from(definitions.values())
      .filter(function (definition) { return definition.region === region; })
      .sort(function (a, b) {
        if (a.order !== b.order) return a.order - b.order;
        return a.id.localeCompare(b.id);
      });

    ordered.forEach(function (definition) {
      let node = container.querySelector(componentSelector(definition.id));
      if (!node) {
        node = definition.mount(container) || null;
        if (!node) return;
        node.setAttribute('data-dashboard-component', definition.id);
      }
      container.appendChild(node);
    });
    return true;
  }

  function mountAll() {
    const regions = new Set(Array.from(definitions.values()).map(function (definition) { return definition.region; }));
    regions.forEach(mountRegion);
  }

  function register(definition) {
    if (!definition || typeof definition.id !== 'string' || !definition.id.trim()) {
      throw new Error('Dashboard components require a stable id.');
    }
    if (typeof definition.region !== 'string' || !definition.region.trim()) {
      throw new Error('Dashboard components require a target region.');
    }
    if (typeof definition.mount !== 'function') {
      throw new Error('Dashboard components require a mount function.');
    }

    const normalized = Object.freeze({
      id: definition.id.trim(),
      region: definition.region.trim(),
      order: Number.isFinite(Number(definition.order)) ? Number(definition.order) : 100,
      mount: definition.mount
    });
    definitions.set(normalized.id, normalized);
    mountRegion(normalized.region);
    return normalized.id;
  }

  function start() {
    mountAll();
    if (observer || !document.body) return;
    observer = new MutationObserver(function () { mountAll(); });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();

  window.BoardsDashboardRegistry = Object.freeze({
    register: register,
    mountAll: mountAll,
    getRegion: regionElement
  });
})();

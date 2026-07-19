(function () {
  'use strict';

  const definitions = new Map();
  let observer = null;
  let mountScheduled = false;

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

    const nodes = ordered.map(function (definition) {
      let node = container.querySelector(componentSelector(definition.id));
      if (!node) {
        node = definition.mount(container) || null;
        if (!node) return null;
        node.setAttribute('data-dashboard-component', definition.id);
      }
      return node;
    }).filter(Boolean);

    nodes.forEach(function (node, index) {
      const current = container.children[index] || null;
      if (current !== node) container.insertBefore(node, current);
    });
    return true;
  }

  function mountAll() {
    const regions = new Set(Array.from(definitions.values()).map(function (definition) { return definition.region; }));
    regions.forEach(mountRegion);
  }

  function scheduleMountAll() {
    if (mountScheduled) return;
    mountScheduled = true;
    requestAnimationFrame(function () {
      mountScheduled = false;
      mountAll();
    });
  }

  function containsRegion(node) {
    if (!node || node.nodeType !== 1) return false;
    return node.hasAttribute('data-dashboard-region') || !!node.querySelector('[data-dashboard-region]');
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
    observer = new MutationObserver(function (mutations) {
      const regionAdded = mutations.some(function (mutation) {
        return Array.from(mutation.addedNodes || []).some(containsRegion);
      });
      if (regionAdded) scheduleMountAll();
    });
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

// Escala el tablero completo sin alterar las posiciones de sus componentes.
(function () {
  function fitDashboard() {
    const styles = getComputedStyle(document.documentElement);
    const width = parseFloat(styles.getPropertyValue('--dashboard-width')) || 1024;
    const height = parseFloat(styles.getPropertyValue('--dashboard-height')) || 600;
    const scale = Math.min(window.innerWidth / width, window.innerHeight / height);
    document.documentElement.style.setProperty('--dashboard-scale', String(scale));
    positionArrows(scale);
  }
  function positionArrows(scale) {
    const svg = document.querySelector('.flow-arrows');
    if (!svg) return;
    const bounds = svg.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const rect = selector => document.querySelector(selector).getBoundingClientRect();
    const center = box => ({x:box.left + box.width / 2, y:box.top + box.height / 2});
    const load = rect('[data-gauge="load"]');
    const target = center(load);
    function edge(box, toward, battery) {
      const c = center(box), dx = toward.x - c.x, dy = toward.y - c.y;
      const rx = box.width / 2, ry = box.height / 2;
      const distance = battery
        ? 1 / Math.max(Math.abs(dx) / rx, Math.abs(dy) / ry)
        : .94 / Math.sqrt((dx / rx) ** 2 + (dy / ry) ** 2);
      const length = Math.hypot(dx, dy);
      return {x:c.x + dx * distance + dx / length * 12 * scale,
              y:c.y + dy * distance + dy / length * 12 * scale};
    }
    const point = p => `${(p.x - bounds.left) / bounds.width * 100} ${(p.y - bounds.top) / bounds.height * 100}`;
    for (const [id, selector, battery] of [
      ['flow-pv', '[data-gauge="solar"]', false],
      ['flow-grid', '[data-gauge="grid"]', false],
      ['flow-battery', '.battery-shell', true]
    ]) {
      const source = rect(selector);
      document.getElementById(id).setAttribute('d',
        `M ${point(edge(source, target, battery))} L ${point(edge(load, center(source), false))}`);
    }
  }
  fitDashboard();
  window.addEventListener('resize', fitDashboard);
})();

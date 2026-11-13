// Escala el tablero completo sin alterar las posiciones de sus componentes.
(function () {
  function fitDashboard() {
    const styles = getComputedStyle(document.documentElement);
    const width = parseFloat(styles.getPropertyValue('--dashboard-width')) || 1024;
    const height = parseFloat(styles.getPropertyValue('--dashboard-height')) || 600;
    const scale = Math.min(window.innerWidth / width, window.innerHeight / height);
    document.documentElement.style.setProperty('--dashboard-scale', String(scale));
  }
  fitDashboard();
  window.addEventListener('resize', fitDashboard);
})();

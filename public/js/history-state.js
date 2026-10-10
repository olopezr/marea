// Estado abierto/cerrado del panel "Boya frente a previsión", independiente del DOM.
// Solo recuerda un spot: al abrir otro la ficha vuelve a empezar cerrada, como en iOS y Android.
export function createHistoryState() {
  let spotId = null;
  return {
    isOpen: (id) => spotId === id,
    set(id, open) {
      if (open) spotId = id;
      else if (spotId === id) spotId = null;
    },
    reset() {
      spotId = null;
    },
  };
}

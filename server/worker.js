// Proceso worker dedicado para la revisión periódica y envío de avisos push.
// Permite escalar el servidor web horizontalmente sin duplicar envíos de avisos.
import * as push from "./push.js";

console.log("[worker] Marea Alert Worker iniciado");
const scheduler = push.startScheduler();

// Ejecuta una primera revisión al arrancar tras 5 segundos si se desea
const runImmediate = process.env.WORKER_RUN_ON_START === "true" || process.env.WORKER_RUN_ON_START === "1";
if (runImmediate) {
  setTimeout(() => {
    console.log("[worker] Ejecutando revisión inicial de alertas...");
    push
      .checkAlerts()
      .then((r) =>
        console.log(`[worker] Revisión inicial completada: ${r.sent} avisos enviados (${r.checked} spots revisados)`),
      )
      .catch((err) => console.error("[worker] Error en revisión inicial:", err.message));
  }, 5000).unref();
}

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    console.log(`[worker] Recibida señal ${sig}, deteniendo scheduler...`);
    clearInterval(scheduler);
    process.exit(0);
  });
}

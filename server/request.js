// Origen de las peticiones. Render va detrás de Cloudflare, que pone la IP real en CF-Connecting-IP
// y sobrescribe la que mande el cliente. X-Forwarded-For no sirve tal cual: su primer valor lo
// escribe el cliente; el último lo añade el proxy más cercano.
export function clientIp(req) {
  const cf = req.headers["cf-connecting-ip"];
  if (cf) return String(cf).trim();
  const xff = req.headers["x-forwarded-for"];
  if (xff) return String(xff).split(",").at(-1).trim();
  return req.socket.remoteAddress ?? "";
}

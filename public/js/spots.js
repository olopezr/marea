// Spots de surf. Lo usan el servidor y el cliente.
// `facing`: rumbo (grados) hacia el que mira la playa, mar adentro.
// `tide`: marea en la que mejor funciona (low | mid | high | all).
// Coordenadas y orientaciones aproximadas: pendientes de validación con surfers locales.
const PEN = "Europe/Madrid", CAN = "Atlantic/Canary";

export const SPOTS = [
  // Galicia
  { id: "patos",     name: "Patos",          region: "Pontevedra",   lat: 42.155, lon: -8.823,  facing: 270, tide: "mid",  tz: PEN },
  { id: "lanzada",   name: "A Lanzada",      region: "Pontevedra",   lat: 42.452, lon: -8.875,  facing: 260, tide: "all",  tz: PEN },
  { id: "razo",      name: "Razo",           region: "A Coruña",     lat: 43.293, lon: -8.700,  facing: 315, tide: "all",  tz: PEN },
  { id: "doninos",   name: "Doniños",        region: "A Coruña",     lat: 43.495, lon: -8.317,  facing: 280, tide: "all",  tz: PEN },
  { id: "pantin",    name: "Pantín",         region: "A Coruña",     lat: 43.637, lon: -8.112,  facing: 315, tide: "mid",  tz: PEN },
  { id: "frouxeira", name: "A Frouxeira",    region: "A Coruña",     lat: 43.610, lon: -8.155,  facing: 315, tide: "mid",  tz: PEN },
  // Asturias
  { id: "tapia",     name: "Tapia",          region: "Asturias",     lat: 43.571, lon: -6.947,  facing: 0,   tide: "mid",  tz: PEN },
  { id: "xago",      name: "Xagó",           region: "Asturias",     lat: 43.607, lon: -5.912,  facing: 320, tide: "mid",  tz: PEN },
  { id: "salinas",   name: "Salinas",        region: "Asturias",     lat: 43.578, lon: -5.958,  facing: 340, tide: "mid",  tz: PEN },
  { id: "rodiles",   name: "Rodiles",        region: "Asturias",     lat: 43.530, lon: -5.374,  facing: 0,   tide: "mid",  tz: PEN },
  // Cantabria
  { id: "locos",     name: "Los Locos",      region: "Cantabria",    lat: 43.434, lon: -4.042,  facing: 0,   tide: "mid",  tz: PEN },
  { id: "liencres",  name: "Liencres",       region: "Cantabria",    lat: 43.459, lon: -3.960,  facing: 330, tide: "all",  tz: PEN },
  { id: "somo",      name: "Somo",           region: "Cantabria",    lat: 43.459, lon: -3.735,  facing: 345, tide: "low",  tz: PEN },
  { id: "berria",    name: "Berria",         region: "Cantabria",    lat: 43.468, lon: -3.473,  facing: 350, tide: "all",  tz: PEN },
  // País Vasco
  { id: "sopelana",  name: "Sopelana",       region: "Bizkaia",      lat: 43.388, lon: -2.996,  facing: 315, tide: "mid",  tz: PEN },
  { id: "bakio",     name: "Bakio",          region: "Bizkaia",      lat: 43.430, lon: -2.810,  facing: 340, tide: "mid",  tz: PEN },
  { id: "mundaka",   name: "Mundaka",        region: "Bizkaia",      lat: 43.408, lon: -2.698,  facing: 330, tide: "low",  tz: PEN },
  { id: "zarautz",   name: "Zarautz",        region: "Gipuzkoa",     lat: 43.286, lon: -2.170,  facing: 0,   tide: "all",  tz: PEN },
  { id: "zurriola",  name: "La Zurriola",    region: "Gipuzkoa",     lat: 43.326, lon: -1.973,  facing: 0,   tide: "mid",  tz: PEN },
  // Andalucía
  { id: "conil",     name: "Fuente del Gallo", region: "Cádiz",      lat: 36.282, lon: -6.105,  facing: 250, tide: "mid",  tz: PEN },
  { id: "palmar",    name: "El Palmar",      region: "Cádiz",        lat: 36.240, lon: -6.072,  facing: 225, tide: "mid",  tz: PEN },
  { id: "canos",     name: "Los Caños de Meca", region: "Cádiz",     lat: 36.187, lon: -6.019,  facing: 220, tide: "mid",  tz: PEN },
  // Canarias
  { id: "famara",    name: "Famara",         region: "Lanzarote",    lat: 29.118, lon: -13.560, facing: 315, tide: "mid",  tz: CAN },
  { id: "quemao",    name: "El Quemao",      region: "Lanzarote",    lat: 29.115, lon: -13.651, facing: 350, tide: "high", tz: CAN },
  { id: "confital",  name: "El Confital",    region: "Gran Canaria", lat: 28.158, lon: -15.440, facing: 330, tide: "high", tz: CAN },
  { id: "cicer",     name: "La Cícer",       region: "Gran Canaria", lat: 28.128, lon: -15.448, facing: 290, tide: "mid",  tz: CAN },
  { id: "americas",  name: "Las Américas",   region: "Tenerife",     lat: 28.060, lon: -16.735, facing: 225, tide: "mid",  tz: CAN },
];

export const spotById = Object.fromEntries(SPOTS.map(s => [s.id, s]));

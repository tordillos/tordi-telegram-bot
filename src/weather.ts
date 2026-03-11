// Tordillos, Salamanca coordinates
const LATITUDE = 40.96;
const LONGITUDE = -5.45;

const WMO_CODES: Record<number, string> = {
  0: "Despejado ☀️",
  1: "Mayormente despejado 🌤️",
  2: "Parcialmente nublado ⛅",
  3: "Nublado ☁️",
  45: "Niebla 🌫️",
  48: "Niebla con escarcha 🌫️",
  51: "Llovizna ligera 🌦️",
  53: "Llovizna moderada 🌦️",
  55: "Llovizna intensa 🌧️",
  61: "Lluvia ligera 🌧️",
  63: "Lluvia moderada 🌧️",
  65: "Lluvia intensa 🌧️",
  66: "Lluvia helada ligera 🌨️",
  67: "Lluvia helada intensa 🌨️",
  71: "Nevada ligera 🌨️",
  73: "Nevada moderada 🌨️",
  75: "Nevada intensa ❄️",
  77: "Granizo ❄️",
  80: "Chubascos ligeros 🌦️",
  81: "Chubascos moderados 🌧️",
  82: "Chubascos fuertes ⛈️",
  85: "Chubascos de nieve ligeros 🌨️",
  86: "Chubascos de nieve fuertes 🌨️",
  95: "Tormenta ⛈️",
  96: "Tormenta con granizo ⛈️",
  99: "Tormenta con granizo fuerte ⛈️",
};

interface WeatherResponse {
  current: {
    temperature_2m: number;
    relative_humidity_2m: number;
    apparent_temperature: number;
    weather_code: number;
    wind_speed_10m: number;
  };
  daily: {
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_probability_max: number[];
    weather_code: number[];
  };
}

export async function getWeather(): Promise<string> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(LATITUDE));
  url.searchParams.set("longitude", String(LONGITUDE));
  url.searchParams.set(
    "current",
    "temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m"
  );
  url.searchParams.set(
    "daily",
    "temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code"
  );
  url.searchParams.set("timezone", "Europe/Madrid");
  url.searchParams.set("forecast_days", "1");

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`Open-Meteo API error: ${res.status}`);
  }

  const data = (await res.json()) as WeatherResponse;

  const current = data.current;
  const daily = data.daily;

  const weatherDesc =
    WMO_CODES[current.weather_code] ?? `Código ${current.weather_code}`;
  const dailyDesc =
    WMO_CODES[daily.weather_code[0]] ?? `Código ${daily.weather_code[0]}`;
  const rainProb = daily.precipitation_probability_max[0];

  const willRain = rainProb >= 40;
  const rainLine = willRain
    ? `⚠️ <b>Probabilidad de lluvia: ${rainProb}%</b> — ¡Llévate el paraguas!`
    : `Probabilidad de lluvia: ${rainProb}%`;

  const lines = [
    `<b>🌡️ El tiempo en Tordillos</b>`,
    ``,
    `<b>Ahora:</b> ${weatherDesc}`,
    `🌡️ ${current.temperature_2m}°C (sensación ${current.apparent_temperature}°C)`,
    `💧 Humedad: ${current.relative_humidity_2m}%`,
    `💨 Viento: ${current.wind_speed_10m} km/h`,
    ``,
    `<b>Hoy:</b> ${dailyDesc}`,
    `🔺 Máx: ${daily.temperature_2m_max[0]}°C | 🔻 Mín: ${daily.temperature_2m_min[0]}°C`,
    rainLine,
  ];

  return lines.join("\n");
}

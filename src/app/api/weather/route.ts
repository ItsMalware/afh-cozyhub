import { NextResponse } from "next/server";

type OpenMeteoCurrent = {
  temperature_2m?: number;
  weather_code?: number;
};

const WEATHER_CODE_MAP: Record<number, string> = {
  0: "Clear",
  1: "Mostly clear",
  2: "Partly cloudy",
  3: "Cloudy",
  45: "Fog",
  48: "Fog",
  51: "Drizzle",
  53: "Drizzle",
  55: "Drizzle",
  61: "Rain",
  63: "Rain",
  65: "Heavy rain",
  71: "Snow",
  73: "Snow",
  75: "Heavy snow",
  80: "Rain showers",
  81: "Rain showers",
  82: "Heavy showers",
  95: "Thunderstorm",
};

function asNumber(input: string | undefined, fallback: number): number {
  const value = Number(input);
  return Number.isFinite(value) ? value : fallback;
}

function weatherCondition(code: number | undefined): string {
  if (typeof code !== "number") {
    return "Unknown";
  }
  return WEATHER_CODE_MAP[code] ?? "Unknown";
}

export async function GET() {
  try {
    const latitude = asNumber(process.env.WEATHER_LATITUDE, 33.749);
    const longitude = asNumber(process.env.WEATHER_LONGITUDE, -84.388);
    const city = process.env.WEATHER_CITY ?? "Atlanta";
    const timezone = process.env.SMS_TIMEZONE ?? "America/New_York";
    const weatherUrl = new URL("https://api.open-meteo.com/v1/forecast");
    weatherUrl.searchParams.set("latitude", latitude.toString());
    weatherUrl.searchParams.set("longitude", longitude.toString());
    weatherUrl.searchParams.set("current", "temperature_2m,weather_code");
    weatherUrl.searchParams.set("timezone", timezone);

    const response = await fetch(weatherUrl.toString(), { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Weather provider request failed (${response.status})`);
    }

    const payload = (await response.json()) as {
      current?: OpenMeteoCurrent;
      timezone?: string;
    };
    const current = payload.current ?? {};
    const temperatureC = current.temperature_2m;

    if (typeof temperatureC !== "number") {
      throw new Error("Weather provider returned no temperature");
    }

    return NextResponse.json(
      {
        weather: {
          city,
          timezone: payload.timezone ?? timezone,
          temperatureC,
          condition: weatherCondition(current.weather_code),
          fetchedAt: new Date().toISOString(),
        },
      },
      { status: 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown weather error";
    return NextResponse.json(
      {
        message: "Unable to load weather",
        error: message,
      },
      { status: 500 },
    );
  }
}

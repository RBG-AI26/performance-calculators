const TABLE_DATA = window.TABLE_DATA;
const LRC_CRUISE_TABLE = window.LRC_CRUISE_TABLE;
const LRC_ALTITUDE_LIMITS_TABLE = window.LRC_ALTITUDE_LIMITS_TABLE;
const DRIFTDOWN_TABLE = window.DRIFTDOWN_TABLE;
const EO_DIVERSION_TABLE = window.EO_DIVERSION_TABLE;
const FLAPS_UP_TABLE = window.FLAPS_UP_TABLE;
const DIVERSION_LRC_TABLE = window.DIVERSION_LRC_TABLE;
const GO_AROUND_TABLE = window.GO_AROUND_TABLE;

const { shortTripAnm, longRangeAnm, longRangeFuel: longRangeFuelTable, shortTripFuelAlt } = TABLE_DATA;
const APP_VERSION = "v7.10.3";
const INPUT_STATE_STORAGE_KEY = "performance-calculators-input-state-v1";
const PANEL_COLLAPSE_STORAGE_KEY = "performance-calculators-panel-collapse-v1";
const SCENARIO_STORAGE_KEY = "performance-calculators-scenarios-v1";
const LINKED_WEIGHT_OVERRIDE_STORAGE_KEY = "performance-calculators-linked-weight-overrides-v1";
const THEME_STORAGE_KEY = "performance-calculators-theme-v1";
const SYNC_SESSION_STORAGE_KEY = "performance-calculators-sync-session-v2";
const SYNC_AUTH_STORAGE_KEY = "performance-calculators-sync-auth-v1";
const NON_PERSISTED_FIELD_IDS = new Set(["scenario-name", "scenario-select", "theme-mode"]);
const LINKED_START_WEIGHT_FIELD_IDS = ["dpa-weight", "lrc-alt-weight", "eo-weight", "eo-div-weight", "cog-weight"];
const DEFAULT_THEME_MODE = "auto";
const SYNC_STATUS_REFRESH_SKEW_MS = 60 * 1000;
const SYNC_SCENARIO_FILE_TYPE = "performance-calculators-scenario";
const SYNC_SCENARIO_FILE_VERSION = 1;
const SYNC_SCENARIO_BUNDLE_TYPE = "performance-calculators-scenarios-sync";
const SYNC_SCENARIO_BUNDLE_VERSION = 1;
const SYNC_ACTIVITY_STORAGE_KEY = "performance-calculators-sync-activity-v1";

const R_AIR = 287.05287;
const GAMMA = 1.4;
const G0 = 9.80665;
const T0 = 288.15;
const P0 = 101325;
const FT_TO_M = 0.3048;
const M_TO_FT = 1 / FT_TO_M;
const MPS_TO_KT = 1.94384449244;
const KT_TO_MPS = 0.51444444444;
const EARTH_RADIUS_M = 6356766;
const A0 = Math.sqrt(GAMMA * R_AIR * T0);
const ISA_LAYER_BASES_M = [0, 11000, 20000, 32000, 47000];
const ISA_LAYER_LAPSE_RATES = [-0.0065, 0, 0.001, 0.0028, 0];
const ISA_BASES = buildIsaBases();
const DEG_PER_RAD = 180 / Math.PI;
const RAD_PER_DEG = Math.PI / 180;
const DEFAULT_HOLD_BANK_DEG = 25;
const FIXED_ALLOWANCE_KG = 200;
const MIN_CONTINGENCY_KG = 350;
const MAX_CONTINGENCY_KG = 1200;
const FRF_HOLD_ALTITUDE_FT = 1500;
const ADDITIONAL_HOLD_ALTITUDE_FT = 20000;
const ENROUTE_HOLD_SPEED_FUEL_FACTOR = 0.95;
const LOSE_TIME_CLIMB_RATE_FPM = 1000;
const LOSE_TIME_DESCENT_RATE_FPM = 1000;
const LOSE_TIME_REFERENCE_DESCENT_ALT_AXIS_FT = [0, 25000, 27000, 29000, 31000, 33000, 35000, 37000, 39000, 41000, 43000];
const LOSE_TIME_REFERENCE_DESCENT_DISTANCE_NM = [0, 94, 101, 109, 116, 123, 129, 135, 142, 150, 156];
const LOSE_TIME_REFERENCE_DESCENT_TIME_MIN = [0, 20, 21, 22, 23, 23, 24, 25, 26, 27, 28];
const LOSE_TIME_MIN_OPTION_D_MACH = 0.4;
const LOSE_TIME_OPTION_D_REFERENCE_DESCENT_IAS_KT = 310;
const LOSE_TIME_MIN_OPTION_D_DESCENT_IAS_KT = 140;
const GO_AROUND_ANTI_ICE_ADJUSTMENT = {
  engineOn: { oatLe8: -0.1, oatGt8Le20: -0.2 },
  engineWingOn: { oatLe8: -0.1, oatGt8Le20: -0.2 },
};
const COG_LIMIT_WEIGHT_AXIS_1000KG = [108, 120, 140, 160, 180, 200, 220, 240];
const COG_LIMIT_VALUES_PCT_MAC = [23.1, 24.7, 27.4, 29.8, 32.1, 34.4, 36.8, 37.5];
let linkedWeightOverrides = readLinkedWeightOverrides();

function parseNum(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
}

function parseNumOrDefault(value, defaultValue = 0) {
  const text = String(value ?? "").trim();
  if (text === "") return defaultValue;
  return parseNum(text);
}

function parseAltOrFlInput(rawInput, label = "Alt/FL") {
  const rawText = String(rawInput ?? "").trim();
  if (rawText === "") {
    throw new Error(`${label} must be entered`);
  }

  const value = Number(rawText);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be > 0`);
  }

  // Rule: exactly 3-digit integer input is FL, otherwise feet.
  const absValue = Math.abs(value);
  const integerDigits = Math.trunc(absValue).toString().length;
  const isThreeDigitFl = Number.isInteger(value) && integerDigits === 3;
  const altitudeFt = isThreeDigitFl ? value * 100 : value;
  const flightLevel = altitudeFt / 100;

  return {
    rawText,
    value,
    isThreeDigitFl,
    altitudeFt,
    flightLevel,
  };
}

function parseLoseTimeOptionDSpeedInput(rawInput) {
  const rawText = String(rawInput ?? "").trim();
  if (rawText === "") {
    throw new Error("Option D speed must be entered");
  }

  const value = Number(rawText);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error("Option D speed must be > 0");
  }

  const isMachInput = rawText.startsWith(".") || rawText.startsWith("0.");
  if (isMachInput) {
    if (value >= 1) {
      throw new Error("Option D Mach must be < 1.0");
    }
    return {
      mode: "mach",
      mach: value,
      descentIasKt: null,
      displayText: `Mach ${value.toFixed(3)}`,
    };
  }

  return {
    mode: "ias",
    mach: null,
    descentIasKt: value,
    displayText: `${format(value, 0)} kt`,
  };
}

function getIsaTempCAtPressureAltitude(pressureAltitudeFt) {
  const isaAtmosphere = atmosphereFromPressureAltitude({
    pressureAltitudeFt,
    tempMode: "isa-dev",
    isaDeviationC: 0,
    oatC: 0,
  });
  return isaAtmosphere.isaTempK - 273.15;
}

function resolveTemperaturePair({ isaDeviationRaw, temperatureRaw, lastSource = "isa-dev", pressureAltitudeFt, label = "Temperature" }) {
  const isaText = String(isaDeviationRaw ?? "").trim();
  const tempText = String(temperatureRaw ?? "").trim();

  let sourceUsed;
  if (isaText !== "" && tempText === "") {
    sourceUsed = "isa-dev";
  } else if (tempText !== "" && isaText === "") {
    sourceUsed = "temp";
  } else if (isaText !== "" && tempText !== "") {
    sourceUsed = lastSource === "temp" ? "temp" : "isa-dev";
  } else {
    throw new Error(`${label}: enter ISA deviation or Temperature`);
  }

  const isaTempC = getIsaTempCAtPressureAltitude(pressureAltitudeFt);
  let isaDeviationC;
  let temperatureC;
  if (sourceUsed === "isa-dev") {
    isaDeviationC = parseNum(isaText);
    if (!Number.isFinite(isaDeviationC)) {
      throw new Error(`${label}: ISA deviation is invalid`);
    }
    temperatureC = isaTempC + isaDeviationC;
  } else {
    temperatureC = parseNum(tempText);
    if (!Number.isFinite(temperatureC)) {
      throw new Error(`${label}: temperature is invalid`);
    }
    isaDeviationC = temperatureC - isaTempC;
  }

  return {
    sourceUsed,
    isaDeviationC,
    temperatureC,
    isaTempC,
  };
}

function applyTemperatureFieldStyle({ sourceUsed, isaDeviationEl, temperatureEl }) {
  if (isaDeviationEl) {
    isaDeviationEl.classList.toggle("auto-derived", sourceUsed === "temp");
  }
  if (temperatureEl) {
    temperatureEl.classList.toggle("auto-derived", sourceUsed === "isa-dev");
  }
}

function userFlToTableFl(flightLevel) {
  return flightLevel >= 100 ? flightLevel / 10 : flightLevel;
}

function getLrcTableFlRange() {
  if (!LRC_CRUISE_TABLE || !Array.isArray(LRC_CRUISE_TABLE.altitudesFL) || LRC_CRUISE_TABLE.altitudesFL.length < 2) {
    return { minFl: NaN, maxFl: NaN };
  }
  return {
    minFl: LRC_CRUISE_TABLE.altitudesFL[0] * 10,
    maxFl: LRC_CRUISE_TABLE.altitudesFL[LRC_CRUISE_TABLE.altitudesFL.length - 1] * 10,
  };
}

function getDiversionBandTable(bandKey) {
  if (!DIVERSION_LRC_TABLE) return null;
  if (DIVERSION_LRC_TABLE.low?.groundToAir && DIVERSION_LRC_TABLE.high?.groundToAir) {
    if (bandKey === "low") return DIVERSION_LRC_TABLE.low;
    if (bandKey === "high") return DIVERSION_LRC_TABLE.high;
    return null;
  }
  return DIVERSION_LRC_TABLE;
}

function getDiversionBandRanges(bandKey) {
  const tableSet = getDiversionBandTable(bandKey);
  if (!tableSet) {
    return {
      minGnm: NaN,
      maxGnm: NaN,
      minWindKt: NaN,
      maxWindKt: NaN,
      minAltitudeFt: NaN,
      maxAltitudeFt: NaN,
      minWeightT: NaN,
      maxWeightT: NaN,
    };
  }

  const gnmAxis = tableSet.groundToAir?.gnmAxis || [];
  const windAxis = tableSet.groundToAir?.windAxis || [];
  const altitudeAxis = tableSet.fuelTime?.altitudeAxisFt || [];
  const weightAxis = tableSet.fuelAdjustment?.weightAxisT || [];

  return {
    minGnm: gnmAxis[0],
    maxGnm: gnmAxis[gnmAxis.length - 1],
    minWindKt: windAxis[0],
    maxWindKt: windAxis[windAxis.length - 1],
    minAltitudeFt: altitudeAxis[0],
    maxAltitudeFt: altitudeAxis[altitudeAxis.length - 1],
    minWeightT: weightAxis[0],
    maxWeightT: weightAxis[weightAxis.length - 1],
  };
}

function getLrcAltitudeLimitsRanges() {
  if (!LRC_ALTITUDE_LIMITS_TABLE) {
    return {
      minWeightT: NaN,
      maxWeightT: NaN,
      minIsaDevC: NaN,
      maxIsaDevC: NaN,
      minOptimumAltFt: NaN,
      maxOptimumAltFt: NaN,
    };
  }
  const weightAxis = LRC_ALTITUDE_LIMITS_TABLE.weightAxisT || [];
  const isaAxis = LRC_ALTITUDE_LIMITS_TABLE.isaDeviationAxisC || [];
  const optimumGrid = LRC_ALTITUDE_LIMITS_TABLE.optimumAltFtValues || [];
  const flatOptimum = optimumGrid.flat().filter(Number.isFinite);
  return {
    minWeightT: weightAxis[0],
    maxWeightT: weightAxis[weightAxis.length - 1],
    minIsaDevC: isaAxis[0],
    maxIsaDevC: isaAxis[isaAxis.length - 1],
    minOptimumAltFt: flatOptimum.length ? Math.min(...flatOptimum) : NaN,
    maxOptimumAltFt: flatOptimum.length ? Math.max(...flatOptimum) : NaN,
  };
}

function validateLrcFlightLevelRange(flightLevel, label = "Flight level") {
  const { minFl, maxFl } = getLrcTableFlRange();
  if (!Number.isFinite(minFl) || !Number.isFinite(maxFl)) return;
  if (flightLevel < minFl || flightLevel > maxFl) {
    throw new Error(`${label} out of range (FL${format(minFl, 0)}-FL${format(maxFl, 0)})`);
  }
}

function getGlobalPerfAdjust() {
  const el = document.querySelector("#global-perf-adjust");
  const perfAdjustPercent = parseNum(el?.value);
  if (!Number.isFinite(perfAdjustPercent)) {
    throw new Error("Global flight plan performance adjustment is invalid");
  }
  return perfAdjustPercent / 100;
}

function sanitizeThemeMode(mode) {
  return ["day", "night", "auto"].includes(mode) ? mode : DEFAULT_THEME_MODE;
}

function readThemeMode() {
  try {
    return sanitizeThemeMode(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return DEFAULT_THEME_MODE;
  }
}

function writeThemeMode(mode) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, sanitizeThemeMode(mode));
  } catch {
    // Ignore storage failures and keep the app usable.
  }
}

function resolveAppliedTheme(mode) {
  const normalized = sanitizeThemeMode(mode);
  if (normalized === "auto") {
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "night" : "day";
  }
  return normalized;
}

function applyTheme(mode = readThemeMode()) {
  const normalized = sanitizeThemeMode(mode);
  const appliedTheme = resolveAppliedTheme(normalized);
  const rootEl = document.documentElement;
  if (rootEl?.dataset) {
    rootEl.dataset.themeMode = normalized;
    rootEl.dataset.theme = appliedTheme;
  }

  const themeEl = document.querySelector("#theme-mode");
  if (themeEl && themeEl.value !== normalized) {
    themeEl.value = normalized;
  }

  const themeColorMeta = document.querySelector('meta[name="theme-color"]');
  if (themeColorMeta && rootEl && typeof getComputedStyle === "function") {
    const cssValue = getComputedStyle(rootEl).getPropertyValue("--theme-color").trim();
    if (cssValue) {
      themeColorMeta.setAttribute("content", cssValue);
    }
  }
}

function format(value, digits = 2) {
  if (!Number.isFinite(value)) return "-";
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}

function formatInputNumber(value, digits = 0) {
  if (!Number.isFinite(value)) return "";
  const fixed = Number(value).toFixed(Math.max(0, digits));
  return fixed.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

function formatMinutes(minutes) {
  if (!Number.isFinite(minutes)) return "-";
  const sign = minutes < 0 ? "-" : "";
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  let m = Math.floor(abs % 60);
  let s = Math.round((abs - Math.floor(abs)) * 60);
  let hh = h;
  if (s === 60) {
    s = 0;
    m += 1;
  }
  if (m === 60) {
    m = 0;
    hh += 1;
  }
  return `${sign}${String(hh).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function formatHoursDecimalMinutes(totalMinutes, minuteDigits = 1) {
  if (!Number.isFinite(totalMinutes)) return "-";
  const sign = totalMinutes < 0 ? "-" : "";
  const absMinutes = Math.abs(totalMinutes);
  const hours = Math.floor(absMinutes / 60);
  const minutes = absMinutes - hours * 60;
  const fixedMinutes = minutes.toFixed(Math.max(0, minuteDigits));
  const minuteText = minutes < 10 ? `0${fixedMinutes}` : fixedMinutes;
  return `${sign}${hours}:${minuteText}`;
}

function parseHoursDecimalMinutes(rawInput, label = "Time") {
  const text = String(rawInput ?? "").trim();
  if (text === "") {
    throw new Error(`${label} must be entered`);
  }
  const match = text.match(/^(-?)(\d+):(\d{1,2}(?:\.\d+)?)$/);
  if (!match) {
    throw new Error(`${label} must use H:MM or H:MM.m format`);
  }
  const [, signText, hoursText, minutesText] = match;
  const hours = Number(hoursText);
  const minutes = Number(minutesText);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    throw new Error(`${label} is invalid`);
  }
  if (minutes < 0 || minutes >= 60) {
    throw new Error(`${label} minutes must be between 0 and < 60`);
  }
  const totalMinutes = hours * 60 + minutes;
  return signText === "-" ? -totalMinutes : totalMinutes;
}

function normalize360(deg) {
  return ((deg % 360) + 360) % 360;
}

function toRadians(deg) {
  return deg * RAD_PER_DEG;
}

function toDegrees(rad) {
  return rad * DEG_PER_RAD;
}

function findBracket(axis, x) {
  if (x < axis[0] || x > axis[axis.length - 1]) {
    throw new Error(`Value ${x} is out of range ${axis[0]} to ${axis[axis.length - 1]}`);
  }

  if (x === axis[axis.length - 1]) {
    return { i0: axis.length - 2, i1: axis.length - 1, t: 1 };
  }

  for (let i = 0; i < axis.length - 1; i += 1) {
    const a = axis[i];
    const b = axis[i + 1];
    if (x >= a && x <= b) {
      const t = b === a ? 0 : (x - a) / (b - a);
      return { i0: i, i1: i + 1, t };
    }
  }

  throw new Error(`No interpolation bracket found for ${x}`);
}

function linear(axis, values, x) {
  const { i0, i1, t } = findBracket(axis, x);
  return values[i0] + (values[i1] - values[i0]) * t;
}

function bilinear(xAxis, yAxis, grid, x, y) {
  const bx = findBracket(xAxis, x);
  const by = findBracket(yAxis, y);

  const q11 = grid[bx.i0][by.i0];
  const q12 = grid[bx.i0][by.i1];
  const q21 = grid[bx.i1][by.i0];
  const q22 = grid[bx.i1][by.i1];

  return (
    q11 * (1 - bx.t) * (1 - by.t) +
    q21 * bx.t * (1 - by.t) +
    q12 * (1 - bx.t) * by.t +
    q22 * bx.t * by.t
  );
}

function interpolateAcrossWeight(weightAxis, valuesByWeight, weight) {
  const { i0, i1, t } = findBracket(weightAxis, weight);
  const lowerSeries = valuesByWeight[i0];
  const upperSeries = valuesByWeight[i1];
  return lowerSeries.map((v, idx) => v + (upperSeries[idx] - v) * t);
}

function shortTripAnmFromGnm(gnm, wind) {
  if (gnm < 50 || gnm > 600 || Math.abs(wind) > 100) {
    throw new Error("Short Trip ANM input out of range (GNM 50-600, wind +/-100)");
  }

  const gAxis = shortTripAnm.gnmAxis;

  if (wind === 0) return gnm;

  // Spreadsheet convention: positive wind is tailwind, negative wind is headwind.
  if (wind < 0) {
    const absWind = Math.abs(wind);
    if (absWind < 20) {
      const anmAt20 = linear(gAxis, shortTripAnm.headwindValues.map((row) => row[0]), gnm);
      return gnm + (anmAt20 - gnm) * (absWind / 20);
    }

    return bilinear(gAxis, shortTripAnm.headwindAxis, shortTripAnm.headwindValues, gnm, absWind);
  }

  if (wind < 20) {
    const anmAt20Tail = linear(gAxis, shortTripAnm.tailwindValues.map((row) => row[0]), gnm);
    return gnm + (anmAt20Tail - gnm) * (wind / 20);
  }

  return bilinear(gAxis, shortTripAnm.tailwindAxis, shortTripAnm.tailwindValues, gnm, wind);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function clampToAxis(axis, x) {
  return clamp(x, axis[0], axis[axis.length - 1]);
}

function linearClamped(axis, values, x) {
  return linear(axis, values, clampToAxis(axis, x));
}

function bilinearClamped(xAxis, yAxis, grid, x, y) {
  return bilinear(xAxis, yAxis, grid, clampToAxis(xAxis, x), clampToAxis(yAxis, y));
}

function evaluateLrcAltitudeLimits(weightT, isaDeviationCInput) {
  if (!LRC_ALTITUDE_LIMITS_TABLE) {
    throw new Error("LRC altitude limits table is missing");
  }
  if (!Number.isFinite(weightT) || weightT <= 0) {
    throw new Error("Weight must be > 0 t");
  }
  if (!Number.isFinite(isaDeviationCInput)) {
    throw new Error("Temperature / ISA deviation is invalid");
  }

  const isaAxis = LRC_ALTITUDE_LIMITS_TABLE.isaDeviationAxisC;
  const weightAxis = LRC_ALTITUDE_LIMITS_TABLE.weightAxisT;
  const minIsa = isaAxis[0];
  const maxIsa = isaAxis[isaAxis.length - 1];
  const isaDeviationCUsed = isaDeviationCInput < minIsa ? minIsa : isaDeviationCInput;
  if (isaDeviationCUsed > maxIsa) {
    throw new Error(`Temperature / ISA deviation out of range (ISA+${format(minIsa, 0)} to ISA+${format(maxIsa, 0)})`);
  }
  if (weightT < weightAxis[0] || weightT > weightAxis[weightAxis.length - 1]) {
    throw new Error(`Weight out of range (${format(weightAxis[0], 1)}-${format(weightAxis[weightAxis.length - 1], 1)} t)`);
  }

  const optimumAltFt = bilinear(
    isaAxis,
    weightAxis,
    LRC_ALTITUDE_LIMITS_TABLE.optimumAltFtValues,
    isaDeviationCUsed,
    weightT,
  );
  const maxAltFt = bilinear(
    isaAxis,
    weightAxis,
    LRC_ALTITUDE_LIMITS_TABLE.maxAltFtValues,
    isaDeviationCUsed,
    weightT,
  );
  const thrustMetric = bilinear(
    isaAxis,
    weightAxis,
    LRC_ALTITUDE_LIMITS_TABLE.thrustLimitedValues,
    isaDeviationCUsed,
    weightT,
  );

  return {
    weightT,
    isaDeviationCInput,
    isaDeviationCUsed,
    clampedToIsa10: isaDeviationCInput < minIsa,
    optimumAltFt,
    maxAltFt,
    thrustLimited: thrustMetric >= 0.5,
    thrustMetric,
  };
}

function buildOptimumAltitudeByWeightAtIsa(isaDeviationCUsed) {
  const isaAxis = LRC_ALTITUDE_LIMITS_TABLE.isaDeviationAxisC;
  const weightAxis = LRC_ALTITUDE_LIMITS_TABLE.weightAxisT;
  const grid = LRC_ALTITUDE_LIMITS_TABLE.optimumAltFtValues;

  return weightAxis.map((_, weightIndex) =>
    linear(
      isaAxis,
      grid.map((row) => row[weightIndex]),
      isaDeviationCUsed,
    ),
  );
}

function weightForNominatedOptimumAltitude(targetOptimumAltFt, isaDeviationCUsed) {
  if (!Number.isFinite(targetOptimumAltFt) || targetOptimumAltFt <= 0) {
    throw new Error("New Optimum Altitude must be > 0");
  }
  const weightAxis = LRC_ALTITUDE_LIMITS_TABLE.weightAxisT;
  const optimumByWeight = buildOptimumAltitudeByWeightAtIsa(isaDeviationCUsed);
  const minOpt = Math.min(...optimumByWeight);
  const maxOpt = Math.max(...optimumByWeight);
  if (targetOptimumAltFt < minOpt || targetOptimumAltFt > maxOpt) {
    throw new Error(
      `New Optimum Altitude out of range (${format(minOpt, 0)}-${format(maxOpt, 0)} ft / FL${format(minOpt / 100, 0)}-FL${format(maxOpt / 100, 0)})`,
    );
  }

  // Search from heaviest to lightest so flat-top altitudes resolve to the earliest reachable weight.
  for (let i = weightAxis.length - 1; i >= 1; i -= 1) {
    const wHeavy = weightAxis[i];
    const wLight = weightAxis[i - 1];
    const aHeavy = optimumByWeight[i];
    const aLight = optimumByWeight[i - 1];
    const lowAlt = Math.min(aHeavy, aLight);
    const highAlt = Math.max(aHeavy, aLight);
    if (targetOptimumAltFt >= lowAlt && targetOptimumAltFt <= highAlt) {
      if (aLight === aHeavy) {
        return wHeavy;
      }
      const t = (targetOptimumAltFt - aHeavy) / (aLight - aHeavy);
      return wHeavy + (wLight - wHeavy) * t;
    }
  }

  return weightAxis[0];
}

function simulateStepClimbFuelToTargetWeight({
  startWeightT,
  targetWeightT,
  startFlightLevel,
  targetOptimumAltFt,
  isaDeviationCUsed,
  perfAdjust,
}) {
  if (!Number.isFinite(startWeightT) || !Number.isFinite(targetWeightT)) {
    throw new Error("Weight input is invalid for step-climb simulation");
  }
  if (!Number.isFinite(startFlightLevel) || startFlightLevel <= 0) {
    throw new Error("Current Alt/FL is invalid for step-climb simulation");
  }
  if (!Number.isFinite(targetOptimumAltFt) || targetOptimumAltFt <= 0) {
    throw new Error("New Optimum Altitude is invalid for step-climb simulation");
  }
  const cruiseWeightAxis = (LRC_CRUISE_TABLE?.records || [])
    .map((record) => record.weightT)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  const minCruiseWeightT = cruiseWeightAxis[0];
  const maxCruiseWeightT = cruiseWeightAxis[cruiseWeightAxis.length - 1];
  if (!Number.isFinite(minCruiseWeightT) || !Number.isFinite(maxCruiseWeightT)) {
    throw new Error("LRC cruise weight axis is unavailable");
  }
  if (startWeightT < minCruiseWeightT || startWeightT > maxCruiseWeightT) {
    throw new Error(`Current weight out of range for LRC fuel-flow lookup (${format(minCruiseWeightT, 1)}-${format(maxCruiseWeightT, 1)} t)`);
  }

  const startAltitudeFt = startFlightLevel * 100;
  const burnRequiredKg = Math.max(0, (startWeightT - targetWeightT) * 1000);
  const transitions = [];
  const firstStepAltitudeFt = Math.floor(startAltitudeFt / 1000) * 1000 + 1000;
  const maxStepAltitudeFt = Math.floor(targetOptimumAltFt / 1000) * 1000;
  for (let stepAltitudeFt = firstStepAltitudeFt; stepAltitudeFt <= maxStepAltitudeFt; stepAltitudeFt += 1000) {
    transitions.push({
      altitudeFt: stepAltitudeFt,
      thresholdWeightT: weightForNominatedOptimumAltitude(stepAltitudeFt, isaDeviationCUsed),
    });
  }

  let currentWeightT = startWeightT;
  let currentAltitudeFt = startAltitudeFt;
  let transitionIndex = 0;
  const stepClimbs = [];
  const applyEligibleClimbs = () => {
    while (
      transitionIndex < transitions.length &&
      currentWeightT <= transitions[transitionIndex].thresholdWeightT + 1e-9
    ) {
      currentAltitudeFt = transitions[transitionIndex].altitudeFt;
      stepClimbs.push({
        altitudeFt: currentAltitudeFt,
        atWeightT: currentWeightT,
      });
      transitionIndex += 1;
    }
  };

  applyEligibleClimbs();
  const initialFuelFlowKgHr = getLrcCruiseState(clamp(currentWeightT, minCruiseWeightT, maxCruiseWeightT), currentAltitudeFt / 100, 0, perfAdjust).fuelHr;
  if (burnRequiredKg <= 1e-6) {
    return {
      burnRequiredKg,
      timeMinutes: 0,
      averageFuelFlowKgHr: initialFuelFlowKgHr,
      initialFuelFlowKgHr,
      stepClimbs,
    };
  }

  const BURN_STEP_KG = 250;
  let burnedKg = 0;
  let elapsedHours = 0;

  while (burnedKg < burnRequiredKg - 1e-6) {
    applyEligibleClimbs();
    const lookupWeightT = clamp(currentWeightT, minCruiseWeightT, maxCruiseWeightT);
    const fuelFlowKgHr = getLrcCruiseState(lookupWeightT, currentAltitudeFt / 100, 0, perfAdjust).fuelHr;
    if (!Number.isFinite(fuelFlowKgHr) || fuelFlowKgHr <= 0) {
      throw new Error("Computed LRC fuel flow is invalid during step-climb simulation");
    }

    const remainingKg = burnRequiredKg - burnedKg;
    let nextSegmentLimitKg = remainingKg;
    if (transitionIndex < transitions.length && currentWeightT > transitions[transitionIndex].thresholdWeightT + 1e-9) {
      nextSegmentLimitKg = Math.min(nextSegmentLimitKg, (currentWeightT - transitions[transitionIndex].thresholdWeightT) * 1000);
    }
    if (nextSegmentLimitKg <= 1e-6) {
      applyEligibleClimbs();
      continue;
    }

    const stepBurnKg = Math.min(BURN_STEP_KG, nextSegmentLimitKg);
    const stepHours = stepBurnKg / fuelFlowKgHr;
    burnedKg += stepBurnKg;
    currentWeightT -= stepBurnKg / 1000;
    elapsedHours += stepHours;
  }

  return {
    burnRequiredKg,
    timeMinutes: elapsedHours * 60,
    averageFuelFlowKgHr: burnRequiredKg / elapsedHours,
    initialFuelFlowKgHr,
    stepClimbs,
  };
}

function getDriftdownRanges() {
  if (!DRIFTDOWN_TABLE) {
    return {
      minWeightT: NaN,
      maxWeightT: NaN,
      minIsaDevC: NaN,
      maxIsaDevC: NaN,
      minGnm: NaN,
      maxGnm: NaN,
      minWindKt: NaN,
      maxWindKt: NaN,
      minAnm: NaN,
      maxAnm: NaN,
    };
  }
  const startWeights = DRIFTDOWN_TABLE.levelOff?.startWeightAxisT || [];
  const isaAxis = DRIFTDOWN_TABLE.levelOff?.isaDeviationAxisC || [];
  const gnmAxis = DRIFTDOWN_TABLE.groundToAir?.gnmAxis || [];
  const windAxis = DRIFTDOWN_TABLE.groundToAir?.windAxis || [];
  const anmAxis = DRIFTDOWN_TABLE.fuelTime?.anmAxis || [];
  return {
    minWeightT: startWeights[0],
    maxWeightT: startWeights[startWeights.length - 1],
    minIsaDevC: isaAxis[0],
    maxIsaDevC: isaAxis[isaAxis.length - 1],
    minGnm: gnmAxis[0],
    maxGnm: gnmAxis[gnmAxis.length - 1],
    minWindKt: windAxis[0],
    maxWindKt: windAxis[windAxis.length - 1],
    minAnm: anmAxis[0],
    maxAnm: anmAxis[anmAxis.length - 1],
  };
}

function normalizeIsaDeviationForDriftdown(inputIsaDeviationC) {
  if (!Number.isFinite(inputIsaDeviationC)) {
    throw new Error("Temperature / ISA deviation is invalid");
  }
  const axis = DRIFTDOWN_TABLE.levelOff.isaDeviationAxisC;
  const minIsa = axis[0];
  const maxIsa = axis[axis.length - 1];
  const isaDeviationCUsed = inputIsaDeviationC < minIsa ? minIsa : inputIsaDeviationC;
  if (isaDeviationCUsed > maxIsa) {
    throw new Error(`Engine inop temperature / ISA deviation out of range (ISA+${format(minIsa, 0)} to ISA+${format(maxIsa, 0)})`);
  }
  return {
    isaDeviationCUsed,
    clampedToIsa10: inputIsaDeviationC < minIsa,
  };
}

function evaluateDriftdownLevelOff(startWeightT, isaDeviationCInput) {
  if (!DRIFTDOWN_TABLE) {
    throw new Error("Driftdown table is missing");
  }
  const { isaDeviationCUsed, clampedToIsa10 } = normalizeIsaDeviationForDriftdown(isaDeviationCInput);
  const weightAxis = DRIFTDOWN_TABLE.levelOff.startWeightAxisT;
  if (startWeightT < weightAxis[0] || startWeightT > weightAxis[weightAxis.length - 1]) {
    throw new Error(
      `Engine inop start weight out of range (${format(weightAxis[0], 1)}-${format(weightAxis[weightAxis.length - 1], 1)} t)`,
    );
  }

  const levelOffWeightT = linear(weightAxis, DRIFTDOWN_TABLE.levelOff.levelOffWeightValues, startWeightT);
  const optimumDriftdownKias = linear(weightAxis, DRIFTDOWN_TABLE.levelOff.optimumDriftdownKiasValues, startWeightT);
  const levelOffAltFt = bilinear(
    DRIFTDOWN_TABLE.levelOff.isaDeviationAxisC,
    weightAxis,
    DRIFTDOWN_TABLE.levelOff.levelOffAltFtValues,
    isaDeviationCUsed,
    startWeightT,
  );

  return {
    isaDeviationCUsed,
    clampedToIsa10,
    levelOffWeightT,
    optimumDriftdownKias,
    levelOffAltFt,
  };
}

function driftdownAnmFromGnm(gnm, windKt) {
  if (!DRIFTDOWN_TABLE) {
    throw new Error("Driftdown table is missing");
  }
  const gnmAxis = DRIFTDOWN_TABLE.groundToAir.gnmAxis;
  const windAxis = DRIFTDOWN_TABLE.groundToAir.windAxis;
  if (!Number.isFinite(gnm) || gnm < gnmAxis[0] || gnm > gnmAxis[gnmAxis.length - 1]) {
    throw new Error(`Driftdown GNM out of range (${format(gnmAxis[0], 0)}-${format(gnmAxis[gnmAxis.length - 1], 0)})`);
  }
  if (!Number.isFinite(windKt) || windKt < windAxis[0] || windKt > windAxis[windAxis.length - 1]) {
    throw new Error(`Driftdown wind out of range (${format(windAxis[0], 0)} to +${format(windAxis[windAxis.length - 1], 0)} kt)`);
  }

  if (windKt === 0) return gnm;

  if (windKt < 0) {
    const absWind = Math.abs(windKt);
    if (absWind < 20) {
      const anmAt20Headwind = linear(
        gnmAxis,
        DRIFTDOWN_TABLE.groundToAir.values.map((row) => row[4]),
        gnm,
      );
      return gnm + (anmAt20Headwind - gnm) * (absWind / 20);
    }
  } else if (windKt < 20) {
    const anmAt20Tailwind = linear(
      gnmAxis,
      DRIFTDOWN_TABLE.groundToAir.values.map((row) => row[5]),
      gnm,
    );
    return gnm + (anmAt20Tailwind - gnm) * (windKt / 20);
  }

  return bilinear(
    gnmAxis,
    windAxis,
    DRIFTDOWN_TABLE.groundToAir.values,
    gnm,
    windKt,
  );
}

function driftdownFuelAndTime(anm, startWeightT, perfAdjust) {
  if (!DRIFTDOWN_TABLE) {
    throw new Error("Driftdown table is missing");
  }
  const anmAxis = DRIFTDOWN_TABLE.fuelTime.anmAxis;
  const weightAxis = DRIFTDOWN_TABLE.fuelTime.weightAxisT;
  if (!Number.isFinite(anm) || anm < anmAxis[0] || anm > anmAxis[anmAxis.length - 1]) {
    throw new Error(`Driftdown ANM out of range (${format(anmAxis[0], 0)}-${format(anmAxis[anmAxis.length - 1], 0)})`);
  }
  if (!Number.isFinite(startWeightT) || startWeightT < weightAxis[0] || startWeightT > weightAxis[weightAxis.length - 1]) {
    throw new Error(`Driftdown start weight out of range (${format(weightAxis[0], 1)}-${format(weightAxis[weightAxis.length - 1], 1)} t)`);
  }

  const fuel1000Kg = bilinear(
    anmAxis,
    weightAxis,
    DRIFTDOWN_TABLE.fuelTime.fuel1000KgValues,
    anm,
    startWeightT,
  );
  const timeMinutes = linear(anmAxis, DRIFTDOWN_TABLE.fuelTime.timeMinutesValues, anm);
  return {
    fuelKg: fuel1000Kg * 1000 * (1 + perfAdjust),
    timeMinutes,
  };
}

function singleEngineLrcCapabilityAltitude(startWeightT, isaDeviationCInput) {
  if (!DRIFTDOWN_TABLE) {
    throw new Error("Driftdown table is missing");
  }
  const { isaDeviationCUsed, clampedToIsa10 } = normalizeIsaDeviationForDriftdown(isaDeviationCInput);
  const weightAxis = DRIFTDOWN_TABLE.singleEngineLrcCapability.weightAxisT;
  if (!Number.isFinite(startWeightT) || startWeightT < weightAxis[0] || startWeightT > weightAxis[weightAxis.length - 1]) {
    throw new Error(
      `SE LRC capability weight out of range (${format(weightAxis[0], 1)}-${format(weightAxis[weightAxis.length - 1], 1)} t)`,
    );
  }

  const altitudeFt = bilinear(
    DRIFTDOWN_TABLE.singleEngineLrcCapability.isaDeviationAxisC,
    weightAxis,
    DRIFTDOWN_TABLE.singleEngineLrcCapability.altitudeFtValues,
    isaDeviationCUsed,
    startWeightT,
  );
  return {
    isaDeviationCUsed,
    clampedToIsa10,
    altitudeFt,
  };
}

function getEoDiversionRanges() {
  if (!EO_DIVERSION_TABLE) {
    return {
      minGnm: NaN,
      maxGnm: NaN,
      minWindKt: NaN,
      maxWindKt: NaN,
      minAnm: NaN,
      maxAnm: NaN,
      minAltitudeFt: NaN,
      maxAltitudeFt: NaN,
      minWeightT: NaN,
      maxWeightT: NaN,
    };
  }
  return {
    minGnm: EO_DIVERSION_TABLE.groundToAir.gnmAxis[0],
    maxGnm: EO_DIVERSION_TABLE.groundToAir.gnmAxis[EO_DIVERSION_TABLE.groundToAir.gnmAxis.length - 1],
    minWindKt: EO_DIVERSION_TABLE.groundToAir.windAxis[0],
    maxWindKt: EO_DIVERSION_TABLE.groundToAir.windAxis[EO_DIVERSION_TABLE.groundToAir.windAxis.length - 1],
    minAnm: EO_DIVERSION_TABLE.fuelTime.anmAxis[0],
    maxAnm: EO_DIVERSION_TABLE.fuelTime.anmAxis[EO_DIVERSION_TABLE.fuelTime.anmAxis.length - 1],
    minAltitudeFt: EO_DIVERSION_TABLE.fuelTime.altitudeAxisFt[0],
    maxAltitudeFt: EO_DIVERSION_TABLE.fuelTime.altitudeAxisFt[EO_DIVERSION_TABLE.fuelTime.altitudeAxisFt.length - 1],
    minWeightT: EO_DIVERSION_TABLE.fuelAdjustment.weightAxisT[0],
    maxWeightT: EO_DIVERSION_TABLE.fuelAdjustment.weightAxisT[EO_DIVERSION_TABLE.fuelAdjustment.weightAxisT.length - 1],
  };
}

function eoDiversionFuelTime(gnmInput, windInputKt, altitudeInputFt, weightInputT, perfAdjust) {
  if (!EO_DIVERSION_TABLE) {
    throw new Error("EO diversion table is missing");
  }
  if (
    !Number.isFinite(gnmInput) ||
    !Number.isFinite(windInputKt) ||
    !Number.isFinite(altitudeInputFt) ||
    !Number.isFinite(weightInputT)
  ) {
    throw new Error("EO diversion input is invalid");
  }
  if (!Number.isFinite(perfAdjust)) {
    throw new Error("Global flight plan performance adjustment is invalid");
  }

  const gnmAxis = EO_DIVERSION_TABLE.groundToAir.gnmAxis;
  const windAxis = EO_DIVERSION_TABLE.groundToAir.windAxis;
  const altAxis = EO_DIVERSION_TABLE.fuelTime.altitudeAxisFt;
  const weightAxis = EO_DIVERSION_TABLE.fuelAdjustment.weightAxisT;
  const gnmUsed = clampToAxis(gnmAxis, gnmInput);
  const windUsedKt = clampToAxis(windAxis, windInputKt);
  const altitudeUsedFt = clampToAxis(altAxis, altitudeInputFt);
  const weightUsedT = clampToAxis(weightAxis, weightInputT);

  const warnings = [];
  if (gnmUsed !== gnmInput) warnings.push(`EO diversion distance clamped to ${format(gnmUsed, 0)} NM`);
  if (windUsedKt !== windInputKt) warnings.push(`EO diversion wind clamped to ${format(windUsedKt, 0)} kt`);
  if (altitudeUsedFt !== altitudeInputFt) warnings.push(`EO diversion altitude clamped to ${format(altitudeUsedFt, 0)} ft`);
  if (weightUsedT !== weightInputT) warnings.push(`EO diversion weight clamped to ${format(weightUsedT, 1)} t`);

  const anm = Math.abs(windUsedKt) < 1e-9
    ? gnmUsed
    : bilinearClamped(
        EO_DIVERSION_TABLE.groundToAir.gnmAxis,
        EO_DIVERSION_TABLE.groundToAir.windAxis,
        EO_DIVERSION_TABLE.groundToAir.values,
        gnmUsed,
        windUsedKt,
      );

  const referenceFuel1000Kg = bilinearClamped(
    EO_DIVERSION_TABLE.fuelTime.anmAxis,
    EO_DIVERSION_TABLE.fuelTime.altitudeAxisFt,
    EO_DIVERSION_TABLE.fuelTime.fuel1000KgValues,
    anm,
    altitudeUsedFt,
  );
  const timeMinutes = bilinearClamped(
    EO_DIVERSION_TABLE.fuelTime.anmAxis,
    EO_DIVERSION_TABLE.fuelTime.altitudeAxisFt,
    EO_DIVERSION_TABLE.fuelTime.timeMinutesValues,
    anm,
    altitudeUsedFt,
  );
  const adjustment1000Kg = bilinearClamped(
    EO_DIVERSION_TABLE.fuelAdjustment.referenceFuelAxis1000Kg,
    EO_DIVERSION_TABLE.fuelAdjustment.weightAxisT,
    EO_DIVERSION_TABLE.fuelAdjustment.adjustment1000KgValues,
    referenceFuel1000Kg,
    weightUsedT,
  );
  const flightFuel1000Kg = (referenceFuel1000Kg + adjustment1000Kg) * (1 + perfAdjust);

  return {
    anm,
    referenceFuel1000Kg,
    adjustment1000Kg,
    flightFuel1000Kg,
    flightFuelKg: flightFuel1000Kg * 1000,
    timeMinutes,
    usedInputs: {
      gnm: gnmUsed,
      windKt: windUsedKt,
      altitudeFt: altitudeUsedFt,
      weightT: weightUsedT,
    },
    warnings,
  };
}

function getGoAroundConfig(flapSelection) {
  if (!GO_AROUND_TABLE) {
    throw new Error("Go-around table is missing");
  }
  const key = String(flapSelection) === "5" ? "flap5" : "flap20";
  const config = GO_AROUND_TABLE[key];
  if (!config) {
    throw new Error("Invalid flap selection");
  }
  return config;
}

function getGoAroundRanges(config) {
  return {
    minOatC: config.reference.oatAxisC[0],
    maxOatC: config.reference.oatAxisC[config.reference.oatAxisC.length - 1],
    minAltitudeFt: config.reference.altitudeAxisFt[0],
    maxAltitudeFt: config.reference.altitudeAxisFt[config.reference.altitudeAxisFt.length - 1],
    minWeightT: config.weightAdjustment.weightAxisT[0],
    maxWeightT: config.weightAdjustment.weightAxisT[config.weightAdjustment.weightAxisT.length - 1],
  };
}

function lookupGoAroundReferenceGradient(config, oatC, elevationFt) {
  const oatAxis = config.reference.oatAxisC;
  const altitudeAxis = config.reference.altitudeAxisFt;
  const grid = config.reference.gradientPctByOatAlt;

  const byAltitude = altitudeAxis.map((_, altitudeIdx) => {
    const valuesByOat = grid.map((row) => row[altitudeIdx]);
    return interpolateFromAvailablePointsClamped(oatAxis, valuesByOat, oatC, "go-around reference gradient");
  });

  return interpolateFromAvailablePointsClamped(altitudeAxis, byAltitude, elevationFt, "go-around reference gradient");
}

function lookupGoAroundWeightAdjustment(config, landingWeightT, referenceGradientPct) {
  const profile = buildGoAroundWeightAdjustmentProfile(config, referenceGradientPct);
  return linearClamped(profile.weightAxis, profile.adjustmentByWeightPct, landingWeightT);
}

function buildGoAroundWeightAdjustmentProfile(config, referenceGradientPct) {
  const gradientAxis = config.weightAdjustment.gradientAxisPct;
  const weightAxis = config.weightAdjustment.weightAxisT;
  const adjustmentByWeightPct = config.weightAdjustment.adjustmentPctByWeightGradient.map((row) =>
    linearClamped(gradientAxis, row, referenceGradientPct),
  );
  return { weightAxis, adjustmentByWeightPct };
}

function solveGoAroundWeightForTargetGradient({
  config,
  referenceGradientPct,
  baseGradientWithoutWeightPct,
  targetGradientPct,
}) {
  const profile = buildGoAroundWeightAdjustmentProfile(config, referenceGradientPct);
  const requiredWeightAdjustmentPct = targetGradientPct - baseGradientWithoutWeightPct;
  const landingWeightT = interpolateFromAvailablePointsClamped(
    profile.adjustmentByWeightPct,
    profile.weightAxis,
    requiredWeightAdjustmentPct,
    "go-around weight solution",
  );
  const appliedWeightAdjustmentPct = linearClamped(profile.weightAxis, profile.adjustmentByWeightPct, landingWeightT);
  return {
    landingWeightT,
    requiredWeightAdjustmentPct,
    appliedWeightAdjustmentPct,
  };
}

function getGoAroundSpeedRow(config, speedLabel) {
  const row = config.speedAdjustment.rows.find((item) => item.speed === speedLabel);
  if (!row) {
    throw new Error(`Invalid speed selection: ${speedLabel}`);
  }
  return row;
}

function lookupGoAroundSpeedAdjustment(config, speedLabel, referenceGradientPct) {
  const speedRow = getGoAroundSpeedRow(config, speedLabel);
  return linearClamped(config.speedAdjustment.gradientAxisPct, speedRow.adjustments, referenceGradientPct);
}

function lookupGoAroundAntiIceAdjustment(_config, antiIceMode, oatC) {
  if (antiIceMode === "off") return 0;
  const antiIceData = GO_AROUND_ANTI_ICE_ADJUSTMENT[antiIceMode];
  if (!antiIceData) {
    throw new Error("Invalid anti-ice selection");
  }
  if (oatC <= 8) return antiIceData.oatLe8;
  if (oatC <= 20) return antiIceData.oatGt8Le20;
  return 0;
}

function getGoAroundAntiIceBand(oatC) {
  if (oatC <= 8) return "Landing Temp <= 8°C";
  if (oatC <= 20) return "8°C < Landing Temp <= 20°C";
  return "Landing Temp > 20°C";
}

function shouldApplyGoAroundIcingPenalty(applyIcingPenalty, oatC) {
  return applyIcingPenalty && oatC < 10;
}

function calculateGoAroundGradient({
  flapSelection,
  oatCInput,
  elevationFtInput,
  landingWeightTInput,
  targetGradientPctInput,
  speedLabel,
  antiIceMode,
  applyIcingPenalty,
}) {
  const config = getGoAroundConfig(flapSelection);
  const ranges = getGoAroundRanges(config);

  if (!Number.isFinite(oatCInput)) throw new Error("Landing temperature is invalid");
  if (!Number.isFinite(elevationFtInput)) throw new Error("Airport elevation is invalid");
  const hasLandingWeightInput = Number.isFinite(landingWeightTInput);
  const hasTargetGradientInput = Number.isFinite(targetGradientPctInput);
  if (!hasLandingWeightInput && !hasTargetGradientInput) {
    throw new Error("Enter Landing Weight or Target Gradient");
  }
  if (hasLandingWeightInput && landingWeightTInput <= 0) {
    throw new Error("Landing weight must be > 0 t");
  }

  const oatC = clampToAxis(config.reference.oatAxisC, oatCInput);
  const elevationFt = clampToAxis(config.reference.altitudeAxisFt, elevationFtInput);
  const referenceGradientPct = lookupGoAroundReferenceGradient(config, oatC, elevationFt);
  const speedAdjustmentPct = lookupGoAroundSpeedAdjustment(config, speedLabel, referenceGradientPct);
  const antiIceAdjustmentPct = lookupGoAroundAntiIceAdjustment(config, antiIceMode, oatC);
  const antiIceBand = getGoAroundAntiIceBand(oatC);
  const icingPenaltyPct = shouldApplyGoAroundIcingPenalty(applyIcingPenalty, oatC) ? -config.icingPenaltyPct : 0;
  const baseGradientWithoutWeightPct = referenceGradientPct + speedAdjustmentPct + antiIceAdjustmentPct + icingPenaltyPct;
  const warnings = [];
  if (oatC !== oatCInput) {
    warnings.push(`Landing temperature clamped to ${format(oatC, 1)}°C`);
  }
  if (elevationFt !== elevationFtInput) {
    warnings.push(`Airport elevation clamped to ${format(elevationFt, 0)} ft`);
  }

  let landingWeightT;
  let weightAdjustmentPct;
  let mode;

  if (hasTargetGradientInput) {
    const profile = buildGoAroundWeightAdjustmentProfile(config, referenceGradientPct);
    const solution = solveGoAroundWeightForTargetGradient({
      config,
      referenceGradientPct,
      baseGradientWithoutWeightPct,
      targetGradientPct: targetGradientPctInput,
    });
    landingWeightT = solution.landingWeightT;
    weightAdjustmentPct = solution.appliedWeightAdjustmentPct;
    mode = "target";
    const finalAtMinWeight =
      baseGradientWithoutWeightPct +
      linearClamped(
        profile.weightAxis,
        profile.adjustmentByWeightPct,
        config.weightAdjustment.weightAxisT[0],
      );
    const finalAtMaxWeight =
      baseGradientWithoutWeightPct +
      linearClamped(
        profile.weightAxis,
        profile.adjustmentByWeightPct,
        config.weightAdjustment.weightAxisT[config.weightAdjustment.weightAxisT.length - 1],
      );
    const minFinal = Math.min(finalAtMinWeight, finalAtMaxWeight);
    const maxFinal = Math.max(finalAtMinWeight, finalAtMaxWeight);
    if (targetGradientPctInput < minFinal || targetGradientPctInput > maxFinal) {
      warnings.push(
        `Target gradient out of achievable range (${format(minFinal, 1)}% to ${format(maxFinal, 1)}%); required weight clamped`,
      );
    }
  } else {
    landingWeightT = clampToAxis(config.weightAdjustment.weightAxisT, landingWeightTInput);
    weightAdjustmentPct = lookupGoAroundWeightAdjustment(config, landingWeightT, referenceGradientPct);
    mode = "weight";
    if (landingWeightT !== landingWeightTInput) {
      warnings.push(`Landing weight clamped to ${format(landingWeightT, 1)} t`);
    }
  }

  const finalGradientPct =
    baseGradientWithoutWeightPct + weightAdjustmentPct;

  return {
    mode,
    flapLabel: config.flap,
    ranges,
    inputsUsed: {
      oatC,
      elevationFt,
      landingWeightT,
      speedLabel,
    },
    targetGradientPct: hasTargetGradientInput ? targetGradientPctInput : NaN,
    referenceGradientPct,
    weightAdjustmentPct,
    speedAdjustmentPct,
    antiIceAdjustmentPct,
    antiIceBand,
    icingPenaltyPct,
    finalGradientPct,
    warnings,
  };
}

function buildFuelRequirement({ flightFuelKg, landingWeightT, additionalHoldingMin, arrivalAllowanceMin = 0, perfAdjust }) {
  if (!Number.isFinite(flightFuelKg) || flightFuelKg < 0) {
    throw new Error("Flight fuel is invalid");
  }
  if (!Number.isFinite(landingWeightT) || landingWeightT <= 0) {
    throw new Error("Landing weight is invalid");
  }
  if (!Number.isFinite(additionalHoldingMin)) {
    throw new Error("Additional holding minutes are invalid");
  }
  if (additionalHoldingMin < 0) {
    throw new Error("Additional holding minutes must be >= 0");
  }
  if (!Number.isFinite(arrivalAllowanceMin)) {
    throw new Error("Arrival allowance minutes are invalid");
  }
  if (arrivalAllowanceMin < 0) {
    throw new Error("Arrival allowance minutes must be >= 0");
  }

  let frfFfEng;
  let additionalHoldFfEng;
  try {
    frfFfEng = lookupHoldMetric(landingWeightT, FRF_HOLD_ALTITUDE_FT, "ffEng") * (1 + perfAdjust);
  } catch (error) {
    throw new Error(`Unable to derive FRF from holding table: ${error.message}`);
  }
  try {
    additionalHoldFfEng = lookupHoldMetric(landingWeightT, ADDITIONAL_HOLD_ALTITUDE_FT, "ffEng") * (1 + perfAdjust);
  } catch (error) {
    throw new Error(`Unable to derive Additional Holding Fuel from holding table: ${error.message}`);
  }
  const frfFuelHrKg = frfFfEng * 2;
  const additionalHoldFuelHrKg = additionalHoldFfEng * 2;
  const frfKg = frfFuelHrKg * 0.5;
  const extraHoldingKg = additionalHoldFuelHrKg * (additionalHoldingMin / 60);
  const arrivalAllowanceKg = frfFuelHrKg * (arrivalAllowanceMin / 60);
  const contingencyKg = clamp(flightFuelKg * 0.05, MIN_CONTINGENCY_KG, MAX_CONTINGENCY_KG);
  const totalFuelKg = flightFuelKg + frfKg + contingencyKg + extraHoldingKg + arrivalAllowanceKg + FIXED_ALLOWANCE_KG;

  return {
    frfKg,
    contingencyKg,
    extraHoldingKg,
    arrivalAllowanceKg,
    fixedAllowanceKg: FIXED_ALLOWANCE_KG,
    totalFuelKg,
  };
}

function shortTripCore(anm, weight, perfAdjust) {
  if (anm < 50 || anm > 600 || weight < 120 || weight > 200) {
    throw new Error("Short Trip fuel/alt input out of range (ANM 50-600, weight 120-200)");
  }

  const fuelByAnm = interpolateAcrossWeight(shortTripFuelAlt.weightAxis, shortTripFuelAlt.fuelValues, weight);
  const altByAnm = interpolateAcrossWeight(shortTripFuelAlt.weightAxis, shortTripFuelAlt.altitudeValues, weight);

  const fuel1000kg = linear(shortTripFuelAlt.anmAxis, fuelByAnm, anm);
  const altitudeFt = linear(shortTripFuelAlt.anmAxis, altByAnm, anm);
  const timeMinutes = linear(shortTripFuelAlt.anmAxis, shortTripFuelAlt.timeValuesText.map(timeTextToMinutes), anm);
  const flightFuelKg = fuel1000kg * 1000 * (1 + perfAdjust);

  return { flightFuelKg, altitudeFt, timeMinutes };
}

function longRangeAnmFromGnm(gnm, wind) {
  return bilinear(longRangeAnm.gnmAxis, longRangeAnm.windAxis, longRangeAnm.values, gnm, wind);
}

function longRangeCore(anm, weight, perfAdjust) {
  if (anm < 800 || anm > 8400 || weight < 120 || weight > 200) {
    throw new Error("Long Range input out of range (ANM 800-8400, weight 120-200)");
  }

  const fuel1000kg = bilinear(
    longRangeFuelTable.anmAxis,
    longRangeFuelTable.weightAxis,
    longRangeFuelTable.fuelValues,
    anm,
    weight,
  );
  const timeDays = linear(longRangeFuelTable.anmAxis, longRangeFuelTable.timeValuesDays, anm);
  const timeMinutes = timeDays * 24 * 60;

  const flightFuel1000KgAdjusted = fuel1000kg * (1 + perfAdjust);
  return {
    flightFuel1000Kg: flightFuel1000KgAdjusted,
    flightFuelKg: flightFuel1000KgAdjusted * 1000,
    timeMinutes,
  };
}

function longRangeFuel(anm, weight, perfAdjust, additionalHoldingMin, arrivalAllowanceMin = 0) {
  const core = longRangeCore(anm, weight, perfAdjust);
  const fuelBuildUp = buildFuelRequirement({
    flightFuelKg: core.flightFuelKg,
    landingWeightT: weight,
    additionalHoldingMin,
    arrivalAllowanceMin,
    perfAdjust,
  });

  return {
    flightFuel1000Kg: core.flightFuel1000Kg,
    frfKg: fuelBuildUp.frfKg,
    contingencyKg: fuelBuildUp.contingencyKg,
    extraHoldingKg: fuelBuildUp.extraHoldingKg,
    arrivalAllowanceKg: fuelBuildUp.arrivalAllowanceKg,
    fixedAllowanceKg: fuelBuildUp.fixedAllowanceKg,
    totalFuelKg: fuelBuildUp.totalFuelKg,
    timeMinutes: core.timeMinutes,
  };
}

function calculateTripTimeBase(gnm, wind) {
  const shortAnm = (() => {
    try {
      return shortTripAnmFromGnm(gnm, wind);
    } catch {
      return NaN;
    }
  })();
  const longAnm = (() => {
    try {
      return longRangeAnmFromGnm(gnm, wind);
    } catch {
      return NaN;
    }
  })();
  if (!Number.isFinite(shortAnm) && !Number.isFinite(longAnm)) {
    throw new Error("Trip fuel ANM lookup out of range");
  }

  const referenceAnm = Number.isFinite(longAnm) ? longAnm : shortAnm;
  let mode;
  let anmDisplay;
  let timeMinutes;
  let blendAlpha = NaN;

  if (referenceAnm < 600) {
    if (!Number.isFinite(shortAnm)) {
      throw new Error("Trip fuel requires short-trip coverage below 600 ANM");
    }
    mode = "short";
    anmDisplay = shortAnm;
    timeMinutes = linear(shortTripFuelAlt.anmAxis, shortTripFuelAlt.timeValuesText.map(timeTextToMinutes), shortAnm);
  } else if (referenceAnm > 800) {
    if (!Number.isFinite(longAnm)) {
      throw new Error("Trip fuel requires long-range coverage above 800 ANM");
    }
    const longResult = longRangeCore(longAnm, 120, 0);
    mode = "long";
    anmDisplay = longAnm;
    timeMinutes = longResult.timeMinutes;
  } else {
    blendAlpha = clamp((referenceAnm - 600) / 200, 0, 1);
    const shortEdge = shortTripCore(600, 120, 0);
    const longEdge = longRangeCore(800, 120, 0);
    mode = "blend";
    anmDisplay =
      Number.isFinite(shortAnm) && Number.isFinite(longAnm)
        ? shortAnm + (longAnm - shortAnm) * blendAlpha
        : referenceAnm;
    timeMinutes = shortEdge.timeMinutes + (longEdge.timeMinutes - shortEdge.timeMinutes) * blendAlpha;
  }

  return {
    mode,
    anmDisplay,
    shortAnm,
    longAnm,
    blendAlpha,
    timeMinutes,
  };
}

function estimateLongSectorCruiseGuidance(landingWeightT, flightFuelKg, tripTimeMinutes) {
  if (!LRC_ALTITUDE_LIMITS_TABLE) return null;
  const ISA_DEVIATION_C = 10;
  const weightAxis = LRC_ALTITUDE_LIMITS_TABLE.weightAxisT || [];
  if (weightAxis.length < 2) return null;

  const minWeightT = weightAxis[0];
  const maxWeightT = weightAxis[weightAxis.length - 1];
  const startWeightEstimatedT = landingWeightT + flightFuelKg / 1000;
  const startWeightUsedT = clamp(startWeightEstimatedT, minWeightT, maxWeightT);
  const landingWeightUsedT = clamp(landingWeightT, minWeightT, maxWeightT);
  const startLimits = evaluateLrcAltitudeLimits(startWeightUsedT, ISA_DEVIATION_C);
  const landingLimits = evaluateLrcAltitudeLimits(landingWeightUsedT, ISA_DEVIATION_C);
  const startBandLowFt = Math.max(0, startLimits.optimumAltFt - 2000);
  const startBandHighFt = startLimits.optimumAltFt + 2000;

  const burnRateKgPerMin = tripTimeMinutes > 0 ? flightFuelKg / tripTimeMinutes : NaN;
  const stepClimbs = [];
  const nextStepFromFt = Math.floor(startLimits.optimumAltFt / 1000) * 1000 + 1000;
  const finalStepFt = Math.floor(landingLimits.optimumAltFt / 1000) * 1000;
  for (let altitudeFt = nextStepFromFt; altitudeFt <= finalStepFt; altitudeFt += 1000) {
    const triggerWeightT = weightForNominatedOptimumAltitude(altitudeFt, ISA_DEVIATION_C);
    if (triggerWeightT > startWeightUsedT + 1e-9 || triggerWeightT < landingWeightUsedT - 1e-9) continue;
    const burnToTriggerKg = Math.max(0, (startWeightEstimatedT - triggerWeightT) * 1000);
    const etaMin = Number.isFinite(burnRateKgPerMin) && burnRateKgPerMin > 0 ? burnToTriggerKg / burnRateKgPerMin : NaN;
    stepClimbs.push({
      altitudeFt,
      triggerWeightT,
      etaMin,
    });
  }

  return {
    isaDeviationC: ISA_DEVIATION_C,
    startWeightEstimatedT,
    startWeightUsedT,
    landingWeightUsedT,
    startOptimumAltFt: startLimits.optimumAltFt,
    landingOptimumAltFt: landingLimits.optimumAltFt,
    startBandLowFt,
    startBandHighFt,
    stepClimbs,
    clampedWeights:
      Math.abs(startWeightEstimatedT - startWeightUsedT) > 1e-9 || Math.abs(landingWeightT - landingWeightUsedT) > 1e-9,
  };
}

function calculateTripFuelBase(gnm, wind, weight, perfAdjust) {
  const timeBase = calculateTripTimeBase(gnm, wind);
  const { mode, anmDisplay, shortAnm, longAnm, blendAlpha, timeMinutes } = timeBase;
  let flightFuelKg;
  let suggestedAltFt = NaN;

  if (mode === "short") {
    const shortResult = shortTripCore(shortAnm, weight, perfAdjust);
    flightFuelKg = shortResult.flightFuelKg;
    suggestedAltFt = shortResult.altitudeFt;
  } else if (mode === "long") {
    const longResult = longRangeCore(longAnm, weight, perfAdjust);
    flightFuelKg = longResult.flightFuelKg;
  } else {
    const shortEdge = shortTripCore(600, weight, perfAdjust);
    const longEdge = longRangeCore(800, weight, perfAdjust);
    flightFuelKg = shortEdge.flightFuelKg + (longEdge.flightFuelKg - shortEdge.flightFuelKg) * blendAlpha;
    suggestedAltFt = shortEdge.altitudeFt;
  }

  const longGuidance = anmDisplay >= 800 ? estimateLongSectorCruiseGuidance(weight, flightFuelKg, timeMinutes) : null;

  return {
    mode,
    anmDisplay,
    shortAnm,
    longAnm,
    blendAlpha,
    flightFuelKg,
    timeMinutes,
    suggestedAltFt,
    longGuidance,
  };
}

function solveTripFuelWindFromTime(gnm, targetTimeMin) {
  if (!Number.isFinite(gnm) || gnm <= 0) {
    throw new Error("Ground Distance (GNM) must be > 0");
  }
  if (!Number.isFinite(targetTimeMin) || targetTimeMin <= 0) {
    throw new Error("Time must be > 0");
  }

  const minWindKt = -100;
  const maxWindKt = 100;
  const toleranceMin = 1e-4;
  const low = { windKt: minWindKt, timeBase: calculateTripTimeBase(gnm, minWindKt) };
  const high = { windKt: maxWindKt, timeBase: calculateTripTimeBase(gnm, maxWindKt) };
  const minTimeMin = Math.min(low.timeBase.timeMinutes, high.timeBase.timeMinutes);
  const maxTimeMin = Math.max(low.timeBase.timeMinutes, high.timeBase.timeMinutes);
  const timeIncreasesWithWind = high.timeBase.timeMinutes > low.timeBase.timeMinutes;

  if (targetTimeMin < minTimeMin - toleranceMin || targetTimeMin > maxTimeMin + toleranceMin) {
    throw new Error(
      `Time out of range for wind resolution at this distance (${formatHoursDecimalMinutes(minTimeMin)}-${formatHoursDecimalMinutes(maxTimeMin)})`,
    );
  }

  let lowWindKt = minWindKt;
  let highWindKt = maxWindKt;
  let lowTimeBase = low.timeBase;
  let highTimeBase = high.timeBase;
  let best = Math.abs(lowTimeBase.timeMinutes - targetTimeMin) <= Math.abs(highTimeBase.timeMinutes - targetTimeMin) ? low : high;

  for (let i = 0; i < 36; i += 1) {
    const midWindKt = (lowWindKt + highWindKt) / 2;
    const midTimeBase = calculateTripTimeBase(gnm, midWindKt);
    if (Math.abs(midTimeBase.timeMinutes - targetTimeMin) < Math.abs(best.timeBase.timeMinutes - targetTimeMin)) {
      best = { windKt: midWindKt, timeBase: midTimeBase };
    }
    if (Math.abs(midTimeBase.timeMinutes - targetTimeMin) <= toleranceMin) {
      return {
        resolvedWindKt: midWindKt,
        timeBase: midTimeBase,
      };
    }
    if (timeIncreasesWithWind) {
      if (midTimeBase.timeMinutes < targetTimeMin) {
        lowWindKt = midWindKt;
        lowTimeBase = midTimeBase;
      } else {
        highWindKt = midWindKt;
        highTimeBase = midTimeBase;
      }
    } else if (midTimeBase.timeMinutes < targetTimeMin) {
      highWindKt = midWindKt;
      highTimeBase = midTimeBase;
    } else {
      lowWindKt = midWindKt;
      lowTimeBase = midTimeBase;
    }
  }

  if (Math.abs(lowTimeBase.timeMinutes - targetTimeMin) < Math.abs(best.timeBase.timeMinutes - targetTimeMin)) {
    best = { windKt: lowWindKt, timeBase: lowTimeBase };
  }
  if (Math.abs(highTimeBase.timeMinutes - targetTimeMin) < Math.abs(best.timeBase.timeMinutes - targetTimeMin)) {
    best = { windKt: highWindKt, timeBase: highTimeBase };
  }

  return {
    resolvedWindKt: best.windKt,
    timeBase: best.timeBase,
  };
}

function calculateTripFuel(gnm, wind, weight, perfAdjust, additionalHoldingMin, arrivalAllowanceMin = 0) {
  const core = calculateTripFuelBase(gnm, wind, weight, perfAdjust);
  const fuelBuildUp = buildFuelRequirement({
    flightFuelKg: core.flightFuelKg,
    landingWeightT: weight,
    additionalHoldingMin,
    arrivalAllowanceMin,
    perfAdjust,
  });

  return {
    ...core,
    frfKg: fuelBuildUp.frfKg,
    contingencyKg: fuelBuildUp.contingencyKg,
    extraHoldingKg: fuelBuildUp.extraHoldingKg,
    arrivalAllowanceKg: fuelBuildUp.arrivalAllowanceKg,
    fixedAllowanceKg: fuelBuildUp.fixedAllowanceKg,
    totalFuelKg: fuelBuildUp.totalFuelKg,
  };
}

function calculateTripFuelEnhanced({
  gnm,
  wind,
  weight,
  perfAdjust,
  taxiKg = 0,
  plannedAddKg = 0,
  appKg = FIXED_ALLOWANCE_KG,
  arrivalFuelKg = 0,
  wxHoldKg = 0,
  divnNdaKg = 0,
  divHoldKg = 0,
  contingencyKg = NaN,
  frfKg = NaN,
  reqAdditionalKg = 0,
}) {
  const core = calculateTripFuelBase(gnm, wind, weight, perfAdjust);
  const frfAutoKg = getHoldFuelFlowKgHr(weight, FRF_HOLD_ALTITUDE_FT, perfAdjust) * 0.5;
  const contingencyAutoKg = clamp(core.flightFuelKg * 0.05, MIN_CONTINGENCY_KG, MAX_CONTINGENCY_KG);
  const resolvedFrfKg = Number.isFinite(frfKg) ? frfKg : frfAutoKg;
  const resolvedContingencyKg = Number.isFinite(contingencyKg) ? contingencyKg : contingencyAutoKg;
  const totalFuelKg =
    core.flightFuelKg +
    appKg +
    arrivalFuelKg +
    wxHoldKg +
    divnNdaKg +
    divHoldKg +
    resolvedContingencyKg +
    resolvedFrfKg +
    reqAdditionalKg +
    taxiKg +
    plannedAddKg;

  return {
    ...core,
    taxiKg,
    plannedAddKg,
    appKg,
    arrivalFuelKg,
    wxHoldKg,
    divnNdaKg,
    divHoldKg,
    contingencyKg: resolvedContingencyKg,
    contingencyAutoKg,
    frfKg: resolvedFrfKg,
    frfAutoKg,
    reqAdditionalKg,
    totalFuelKg,
  };
}

function solveTripFuelLandingWeightFromCurrentWeight(gnm, wind, currentWeightT, perfAdjust) {
  if (!Number.isFinite(currentWeightT) || currentWeightT <= 0) {
    throw new Error("Current weight must be > 0 t");
  }

  const minLandingWeightT = 120;
  const maxLandingWeightT = 200;
  const rootToleranceT = 0.001;
  const iterationLimit = 60;

  const residualForLandingWeight = (landingWeightT) => {
    const core = calculateTripFuelBase(gnm, wind, landingWeightT, perfAdjust);
    return {
      core,
      residualT: landingWeightT + core.flightFuelKg / 1000 - currentWeightT,
    };
  };

  const lower = residualForLandingWeight(minLandingWeightT);
  const upper = residualForLandingWeight(maxLandingWeightT);
  const minCurrentWeightT = minLandingWeightT + lower.core.flightFuelKg / 1000;
  const maxCurrentWeightT = maxLandingWeightT + upper.core.flightFuelKg / 1000;

  if (Math.abs(lower.residualT) <= rootToleranceT) {
    return {
      currentWeightT,
      solvedLandingWeightT: minLandingWeightT,
      impliedFlightFuelBurnKg: lower.core.flightFuelKg,
      core: lower.core,
    };
  }
  if (Math.abs(upper.residualT) <= rootToleranceT) {
    return {
      currentWeightT,
      solvedLandingWeightT: maxLandingWeightT,
      impliedFlightFuelBurnKg: upper.core.flightFuelKg,
      core: upper.core,
    };
  }

  if (lower.residualT * upper.residualT > 0) {
    throw new Error(
      `No valid current-weight solution for this route. Current weight must be between ${format(minCurrentWeightT, 1)} and ${format(maxCurrentWeightT, 1)} t`,
    );
  }

  let lowWeightT = minLandingWeightT;
  let highWeightT = maxLandingWeightT;
  let mid = lower;

  for (let i = 0; i < iterationLimit; i += 1) {
    const midWeightT = (lowWeightT + highWeightT) / 2;
    mid = residualForLandingWeight(midWeightT);
    if (Math.abs(mid.residualT) <= rootToleranceT || Math.abs(highWeightT - lowWeightT) <= rootToleranceT) {
      return {
        currentWeightT,
        solvedLandingWeightT: midWeightT,
        impliedFlightFuelBurnKg: mid.core.flightFuelKg,
        core: mid.core,
      };
    }
    if (lower.residualT * mid.residualT <= 0) {
      highWeightT = midWeightT;
      upper.residualT = mid.residualT;
      upper.core = mid.core;
    } else {
      lowWeightT = midWeightT;
      lower.residualT = mid.residualT;
      lower.core = mid.core;
    }
  }

  return {
    currentWeightT,
    solvedLandingWeightT: (lowWeightT + highWeightT) / 2,
    impliedFlightFuelBurnKg: mid.core.flightFuelKg,
    core: mid.core,
  };
}

function diversionLrcFuelByBand(bandKey, gnm, wind, altitudeFt, weightT, perfAdjust, additionalHoldingMin, arrivalAllowanceMin = 0) {
  const tableSet = getDiversionBandTable(bandKey);
  if (!tableSet) {
    throw new Error("Diversion LRC table is missing");
  }
  if (!Number.isFinite(gnm) || !Number.isFinite(wind) || !Number.isFinite(altitudeFt) || !Number.isFinite(weightT)) {
    throw new Error("Diversion input is invalid");
  }
  if (!Number.isFinite(perfAdjust)) {
    throw new Error("Global flight plan performance adjustment is invalid");
  }

  const gnmAxis = tableSet.groundToAir.gnmAxis;
  const windAxis = tableSet.groundToAir.windAxis;
  const altitudeAxisFt = tableSet.fuelTime.altitudeAxisFt;
  const weightAxis = tableSet.fuelAdjustment.weightAxisT;

  const gnmUsed = clampToAxis(gnmAxis, gnm);
  const windUsed = clampToAxis(windAxis, wind);
  const altitudeUsed = clampToAxis(altitudeAxisFt, altitudeFt);
  const weightUsed = clampToAxis(weightAxis, weightT);

  const warnings = [];
  if (gnmUsed !== gnm) warnings.push(`Ground distance clamped to ${format(gnmUsed, 0)} NM`);
  if (windUsed !== wind) warnings.push(`Wind clamped to ${format(windUsed, 0)} kt`);
  if (altitudeUsed !== altitudeFt) warnings.push(`Altitude clamped to ${format(altitudeUsed, 0)} ft`);
  if (weightUsed !== weightT) warnings.push(`Start weight clamped to ${format(weightUsed, 1)} t`);

  const anm = Math.abs(windUsed) < 1e-9
    ? gnmUsed
    : bilinearClamped(gnmAxis, windAxis, tableSet.groundToAir.values, gnmUsed, windUsed);

  const referenceFuel1000Kg = bilinearClamped(
    tableSet.fuelTime.anmAxis,
    tableSet.fuelTime.altitudeAxisFt,
    tableSet.fuelTime.fuel1000KgValues,
    anm,
    altitudeUsed,
  );
  const timeMinutes = bilinearClamped(
    tableSet.fuelTime.anmAxis,
    tableSet.fuelTime.altitudeAxisFt,
    tableSet.fuelTime.timeMinutesValues,
    anm,
    altitudeUsed,
  );
  const adjustment1000Kg = bilinearClamped(
    tableSet.fuelAdjustment.referenceFuelAxis1000Kg,
    tableSet.fuelAdjustment.weightAxisT,
    tableSet.fuelAdjustment.adjustment1000KgValues,
    referenceFuel1000Kg,
    weightUsed,
  );

  const adjustedFuelBeforePerf1000Kg = referenceFuel1000Kg + adjustment1000Kg;
  const adjustedFuel1000Kg = adjustedFuelBeforePerf1000Kg * (1 + perfAdjust);
  const adjustedFuelKg = adjustedFuel1000Kg * 1000;
  const reserveCalcWeightT = weightUsed - adjustedFuelKg / 1000 - FIXED_ALLOWANCE_KG / 1000;
  if (!Number.isFinite(reserveCalcWeightT) || reserveCalcWeightT <= 0) {
    throw new Error("Computed reserve-calculation weight is invalid (check start weight/fuel)");
  }
  const fuelBuildUp = buildFuelRequirement({
    flightFuelKg: adjustedFuelKg,
    landingWeightT: reserveCalcWeightT,
    additionalHoldingMin,
    arrivalAllowanceMin,
    perfAdjust,
  });

  return {
    anm,
    referenceFuel1000Kg,
    adjustment1000Kg,
    adjustedFuelBeforePerf1000Kg,
    adjustedFuel1000Kg,
    adjustedFuelKg,
    reserveCalcWeightT,
    frfKg: fuelBuildUp.frfKg,
    contingencyKg: fuelBuildUp.contingencyKg,
    extraHoldingKg: fuelBuildUp.extraHoldingKg,
    arrivalAllowanceKg: fuelBuildUp.arrivalAllowanceKg,
    fixedAllowanceKg: fuelBuildUp.fixedAllowanceKg,
    totalFuelKg: fuelBuildUp.totalFuelKg,
    timeMinutes,
    warnings,
    usedInputs: {
      gnm: gnmUsed,
      wind: windUsed,
      altitudeFt: altitudeUsed,
      weightT: weightUsed,
    },
  };
}

function getHoldingStateFromFlapsUpTable(weightT, altitudeFt) {
  if (!FLAPS_UP_TABLE || !Array.isArray(FLAPS_UP_TABLE.records)) {
    throw new Error("Flaps-up holding table is missing");
  }

  const altitudeAxis = FLAPS_UP_TABLE.altitudesFt;
  const tryInterp = (values, label) => {
    try {
      return interpolateFromAvailablePoints(altitudeAxis, values, altitudeFt, label);
    } catch {
      return NaN;
    }
  };

  const metricsByWeight = FLAPS_UP_TABLE.records.map((record) => ({
    weight: record.weightT,
    kias: tryInterp(record.kiasByAlt, `Hold IAS at ${record.weightT}t`),
    ffEng: tryInterp(record.ffEngByAlt, `Hold FF/ENG at ${record.weightT}t`),
  }));

  const kias = interpolateAcrossWeightPoints(
    metricsByWeight.map((m) => ({ weight: m.weight, value: m.kias })),
    weightT,
    "Hold IAS",
  );
  const ffEng = interpolateAcrossWeightPoints(
    metricsByWeight.map((m) => ({ weight: m.weight, value: m.ffEng })),
    weightT,
    "Hold FF/ENG",
  );

  const atmosphere = atmosphereFromPressureAltitude({
    pressureAltitudeFt: altitudeFt,
    tempMode: "isa-dev",
    isaDeviationC: 0,
    oatC: 0,
  });
  const speed = iasToMachTas({
    iasKt: kias,
    pressurePa: atmosphere.pressurePa,
    speedOfSoundMps: atmosphere.speedOfSoundMps,
  });

  return {
    kias,
    tas: speed.tasKt,
    mach: speed.mach,
    ffEng,
  };
}

function lookupHoldMetric(weight, altitude, key) {
  const state = getHoldingStateFromFlapsUpTable(weight, altitude);
  if (!(key in state)) {
    throw new Error(`Unknown holding metric: ${key}`);
  }
  return state[key];
}

function holdingAt(weight, altitude, wind, perfAdjust) {
  const state = getHoldingStateFromFlapsUpTable(weight, altitude);
  const ffEng = state.ffEng * (1 + perfAdjust);
  const fuelHr = ffEng * 2;
  const gs = state.tas + wind;

  if (gs <= 0) {
    throw new Error("Ground speed <= 0 kt in holding calculation");
  }

  return {
    kias: state.kias,
    tas: state.tas,
    mach: state.mach,
    ffEng,
    fuelHr,
    gs,
    kgPerGnm: fuelHr / gs,
    lessFivePct: fuelHr * 0.95,
  };
}

function windVectorFromDirection(windFromDeg, windSpeedKt) {
  const windToDeg = normalize360(windFromDeg + 180);
  const windToRad = toRadians(windToDeg);
  return {
    eastKt: windSpeedKt * Math.sin(windToRad),
    northKt: windSpeedKt * Math.cos(windToRad),
  };
}

function solveHeadingForTrack(trackDeg, tasKt, windFromDeg, windSpeedKt) {
  const trackRad = toRadians(normalize360(trackDeg));
  const trackUnit = {
    east: Math.sin(trackRad),
    north: Math.cos(trackRad),
  };
  const rightUnit = {
    east: Math.cos(trackRad),
    north: -Math.sin(trackRad),
  };
  const windVec = windVectorFromDirection(windFromDeg, windSpeedKt);
  const windAlong = windVec.eastKt * trackUnit.east + windVec.northKt * trackUnit.north;
  const windCross = windVec.eastKt * rightUnit.east + windVec.northKt * rightUnit.north;

  const crossRatio = -windCross / tasKt;
  if (Math.abs(crossRatio) > 1) {
    throw new Error("Crosswind component exceeds TAS; cannot maintain selected inbound/outbound tracks");
  }

  const wcaRad = Math.asin(crossRatio);
  const headingDeg = normalize360(trackDeg + toDegrees(wcaRad));
  const gsKt = tasKt * Math.cos(wcaRad) + windAlong;
  if (gsKt <= 0) {
    throw new Error("Computed ground speed <= 0 kt");
  }

  return {
    headingDeg,
    gsKt,
    wcaDeg: toDegrees(wcaRad),
    windAlongKt: windAlong,
    windCrossKt: windCross,
  };
}

function averageTurnGroundSpeed({
  startTrackDeg,
  holdSide,
  tasKt,
  windFromDeg,
  windSpeedKt,
  label,
  samples = 72,
}) {
  if (holdSide !== "R" && holdSide !== "L") {
    throw new Error("Hold side must be L or R");
  }
  const direction = holdSide === "R" ? 1 : -1;
  let gsSum = 0;

  for (let i = 0; i < samples; i += 1) {
    const t = (i + 0.5) / samples;
    const trackDeg = normalize360(startTrackDeg + direction * 180 * t);
    let state;
    try {
      state = solveHeadingForTrack(trackDeg, tasKt, windFromDeg, windSpeedKt);
    } catch (error) {
      throw new Error(`Unable to compute ${label} ground speed through turn: ${error.message}`);
    }
    gsSum += state.gsKt;
  }

  return gsSum / samples;
}

function calculateHoldTiming({
  mode,
  totalHoldMin,
  inboundLegMin,
  holdSide,
  inboundCourseDeg,
  windFromDeg,
  windSpeedKt,
  pressureAltitudeFt,
  iasKt,
  isaDeviationC,
  bankLimitDeg = DEFAULT_HOLD_BANK_DEG,
}) {
  if (!Number.isFinite(pressureAltitudeFt) || pressureAltitudeFt <= 0) {
    throw new Error("Timing altitude must be a positive value in feet");
  }
  if (!Number.isFinite(iasKt) || iasKt <= 0) {
    throw new Error("Timing IAS must be > 0 kt");
  }
  if (!Number.isFinite(windSpeedKt) || windSpeedKt < 0) {
    throw new Error("Wind speed must be >= 0 kt");
  }
  if (!Number.isFinite(inboundCourseDeg)) {
    throw new Error("Inbound course is invalid");
  }
  if (!Number.isFinite(windFromDeg)) {
    throw new Error("Wind direction is invalid");
  }
  if (!Number.isFinite(isaDeviationC)) {
    throw new Error("Timing ISA deviation is invalid");
  }
  if (!Number.isFinite(bankLimitDeg) || bankLimitDeg <= 0 || bankLimitDeg >= 90) {
    throw new Error("Bank limit must be > 0 and < 90 deg");
  }

  const atmosphere = atmosphereFromPressureAltitude({
    pressureAltitudeFt,
    tempMode: "isa-dev",
    isaDeviationC,
    oatC: 0,
  });
  const speed = iasToMachTas({
    iasKt,
    pressurePa: atmosphere.pressurePa,
    speedOfSoundMps: atmosphere.speedOfSoundMps,
  });

  const inboundTrack = normalize360(inboundCourseDeg);
  const outboundTrack = normalize360(inboundTrack + 180);
  const inbound = solveHeadingForTrack(inboundTrack, speed.tasKt, windFromDeg, windSpeedKt);
  const outbound = solveHeadingForTrack(outboundTrack, speed.tasKt, windFromDeg, windSpeedKt);

  // Holding pattern sequence:
  // 1) Outbound turn at fix (inbound track -> outbound track)
  // 2) Outbound leg
  // 3) Inbound turn at outbound end (outbound track -> inbound track)
  // 4) Inbound leg back to fix
  const outboundTurnDeg = 180;
  const inboundTurnDeg = 180;
  const outboundTurnAvgGsKt = averageTurnGroundSpeed({
    startTrackDeg: inboundTrack,
    holdSide,
    tasKt: speed.tasKt,
    windFromDeg,
    windSpeedKt,
    label: "outbound turn",
  });
  const inboundTurnAvgGsKt = averageTurnGroundSpeed({
    startTrackDeg: outboundTrack,
    holdSide,
    tasKt: speed.tasKt,
    windFromDeg,
    windSpeedKt,
    label: "inbound turn",
  });
  const radiusFromGsAndBankNm = (gsKt, bankDeg) => {
    const radiusM = ((gsKt * KT_TO_MPS) ** 2) / (G0 * Math.tan(toRadians(bankDeg)));
    return radiusM / 1852;
  };
  const bankForGsAndRadiusDeg = (gsKt, radiusNm) => {
    const radiusM = radiusNm * 1852;
    return toDegrees(Math.atan(((gsKt * KT_TO_MPS) ** 2) / (G0 * radiusM)));
  };

  const gsDifference = outboundTurnAvgGsKt - inboundTurnAvgGsKt;
  const gsTieThresholdKt = 0.01;
  let fixedBankTurnLabel;
  let turnRadiusNm;
  let outboundTurnBankDeg;
  let inboundTurnBankDeg;

  if (Math.abs(gsDifference) <= gsTieThresholdKt) {
    fixedBankTurnLabel = "Both turns (equal average turn GS)";
    outboundTurnBankDeg = bankLimitDeg;
    inboundTurnBankDeg = bankLimitDeg;
    turnRadiusNm = radiusFromGsAndBankNm(outboundTurnAvgGsKt, bankLimitDeg);
  } else if (gsDifference > 0) {
    fixedBankTurnLabel = "Outbound turn at fix";
    outboundTurnBankDeg = bankLimitDeg;
    turnRadiusNm = radiusFromGsAndBankNm(outboundTurnAvgGsKt, bankLimitDeg);
    inboundTurnBankDeg = bankForGsAndRadiusDeg(inboundTurnAvgGsKt, turnRadiusNm);
  } else {
    fixedBankTurnLabel = "Inbound turn at outbound end";
    inboundTurnBankDeg = bankLimitDeg;
    turnRadiusNm = radiusFromGsAndBankNm(inboundTurnAvgGsKt, bankLimitDeg);
    outboundTurnBankDeg = bankForGsAndRadiusDeg(outboundTurnAvgGsKt, turnRadiusNm);
  }

  if (!Number.isFinite(turnRadiusNm) || turnRadiusNm <= 0) {
    throw new Error("Turn radius is invalid");
  }
  if (!Number.isFinite(outboundTurnBankDeg) || !Number.isFinite(inboundTurnBankDeg)) {
    throw new Error("Computed hold turn bank is invalid");
  }

  const outboundTurnRateDegPerSec = toDegrees((outboundTurnAvgGsKt / 3600) / turnRadiusNm);
  const inboundTurnRateDegPerSec = toDegrees((inboundTurnAvgGsKt / 3600) / turnRadiusNm);
  const outboundTurnMin = (outboundTurnDeg / outboundTurnRateDegPerSec) / 60;
  const inboundTurnMin = (inboundTurnDeg / inboundTurnRateDegPerSec) / 60;
  const totalTurnMin = outboundTurnMin + inboundTurnMin;
  const gsRatioInToOut = inbound.gsKt / outbound.gsKt;

  let computedInboundMin;
  let computedTotalMin;
  let outboundLegMin;
  if (mode === "given-inbound") {
    if (!Number.isFinite(inboundLegMin) || inboundLegMin <= 0) {
      throw new Error("Inbound leg time must be > 0 min");
    }
    computedInboundMin = inboundLegMin;
    outboundLegMin = computedInboundMin * gsRatioInToOut;
    computedTotalMin = computedInboundMin + outboundLegMin + totalTurnMin;
  } else if (mode === "given-total") {
    if (!Number.isFinite(totalHoldMin) || totalHoldMin <= 0) {
      throw new Error("Total hold time must be > 0 min");
    }
    if (totalHoldMin <= totalTurnMin) {
      throw new Error("Total hold time is too short for turns at selected speed/bank");
    }
    computedTotalMin = totalHoldMin;
    computedInboundMin = (computedTotalMin - totalTurnMin) / (1 + gsRatioInToOut);
    outboundLegMin = computedInboundMin * gsRatioInToOut;
  } else {
    throw new Error("Unknown hold timing mode");
  }

  return {
    iasKt: speed.iasKt,
    tasKt: speed.tasKt,
    mach: speed.mach,
    inboundTrackDeg: inboundTrack,
    outboundTrackDeg: outboundTrack,
    inboundHeadingDeg: inbound.headingDeg,
    outboundHeadingDeg: outbound.headingDeg,
    inboundGroundSpeedKt: inbound.gsKt,
    outboundGroundSpeedKt: outbound.gsKt,
    inboundWcaDeg: inbound.wcaDeg,
    outboundWcaDeg: outbound.wcaDeg,
    turn1RateDegPerSec: outboundTurnRateDegPerSec,
    turn2RateDegPerSec: inboundTurnRateDegPerSec,
    referenceTurnRateDegPerSec:
      fixedBankTurnLabel === "Inbound turn at outbound end" ? inboundTurnRateDegPerSec : outboundTurnRateDegPerSec,
    referenceTurnGsKt: fixedBankTurnLabel === "Inbound turn at outbound end" ? inboundTurnAvgGsKt : outboundTurnAvgGsKt,
    turnRadiusNm,
    turn1AvgGsKt: outboundTurnAvgGsKt,
    turn2AvgGsKt: inboundTurnAvgGsKt,
    turn1BankDeg: outboundTurnBankDeg,
    turn2BankDeg: inboundTurnBankDeg,
    turnModel: `${format(bankLimitDeg, 1)}° fixed on wind-behind turn; opposite turn solved for same radius`,
    fixedBankTurnLabel,
    turn1Deg: outboundTurnDeg,
    turn2Deg: inboundTurnDeg,
    turn1Min: outboundTurnMin,
    turn2Min: inboundTurnMin,
    outboundTurnRateDegPerSec,
    inboundTurnRateDegPerSec,
    outboundTurnAvgGsKt,
    inboundTurnAvgGsKt,
    outboundTurnBankDeg,
    inboundTurnBankDeg,
    outboundTurnDeg,
    inboundTurnDeg,
    outboundTurnMin,
    inboundTurnMin,
    totalTurnMin,
    gsRatioInToOut,
    inboundLegMin: computedInboundMin,
    outboundLegMin,
    totalHoldMin: computedTotalMin,
    inboundLegNm: (inbound.gsKt * computedInboundMin) / 60,
    outboundLegNm: (outbound.gsKt * outboundLegMin) / 60,
  };
}

function getLevelChangeRateFpm(levelChangeMode) {
  if (levelChangeMode === "climb") return LOSE_TIME_CLIMB_RATE_FPM;
  if (levelChangeMode === "descent") return LOSE_TIME_DESCENT_RATE_FPM;
  return 0;
}

function getLevelChangeDurationMin(startFl, levelChange) {
  if (levelChange.mode === "none") return 0;
  const deltaFt = Math.abs((levelChange.newFl - startFl) * 100);
  if (deltaFt === 0) return 0;
  const rateFpm = getLevelChangeRateFpm(levelChange.mode);
  if (rateFpm <= 0) {
    throw new Error("Level change rate is invalid");
  }
  return deltaFt / rateFpm;
}

function getFlightLevelAtElapsed(startFl, levelChange, elapsedMin) {
  if (levelChange.mode === "none") return startFl;

  const levelChangeStartMin = levelChange.afterMin;
  const levelChangeDurationMin = getLevelChangeDurationMin(startFl, levelChange);
  const levelChangeEndMin = levelChangeStartMin + levelChangeDurationMin;

  if (elapsedMin <= levelChangeStartMin) return startFl;
  if (elapsedMin >= levelChangeEndMin || levelChangeDurationMin <= 0) return levelChange.newFl;

  const t = (elapsedMin - levelChangeStartMin) / levelChangeDurationMin;
  return startFl + (levelChange.newFl - startFl) * t;
}

function validateLevelChange(levelChange, startFl) {
  if (levelChange.mode === "none") return;
  if (!Number.isFinite(levelChange.afterMin) || levelChange.afterMin < 0) {
    throw new Error("Level change time must be >= 0 minutes");
  }
  if (!Number.isFinite(levelChange.newFl) || levelChange.newFl <= 0) {
    throw new Error("New FL must be a positive number");
  }
  if (levelChange.mode === "climb" && levelChange.newFl <= startFl) {
    throw new Error("Climb requires new FL above current FL");
  }
  if (levelChange.mode === "descent" && levelChange.newFl >= startFl) {
    throw new Error("Descent requires new FL below current FL");
  }
}

function interpolateFromAvailablePoints(xAxis, yAxis, x, label) {
  const points = xAxis
    .map((xVal, idx) => ({ x: xVal, y: yAxis[idx] }))
    .filter((point) => Number.isFinite(point.y))
    .sort((a, b) => a.x - b.x);

  if (points.length < 2) {
    throw new Error(`Insufficient ${label} data for interpolation`);
  }

  const minX = points[0].x;
  const maxX = points[points.length - 1].x;
  if (x < minX || x > maxX) {
    throw new Error(`${label} out of range (${format(minX, 0)}-${format(maxX, 0)})`);
  }

  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i];
    const p1 = points[i + 1];
    if (x >= p0.x && x <= p1.x) {
      if (p1.x === p0.x) return p0.y;
      const t = (x - p0.x) / (p1.x - p0.x);
      return p0.y + (p1.y - p0.y) * t;
    }
  }

  return points[points.length - 1].y;
}

function interpolateFromAvailablePointsClamped(xAxis, yAxis, x, label) {
  const points = xAxis
    .map((xVal, idx) => ({ x: xVal, y: yAxis[idx] }))
    .filter((point) => Number.isFinite(point.y))
    .sort((a, b) => a.x - b.x);

  if (points.length === 0) {
    throw new Error(`No ${label} data available`);
  }
  if (points.length === 1) {
    return points[0].y;
  }

  if (x <= points[0].x) return points[0].y;
  if (x >= points[points.length - 1].x) return points[points.length - 1].y;

  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i];
    const p1 = points[i + 1];
    if (x >= p0.x && x <= p1.x) {
      if (p1.x === p0.x) return p0.y;
      const t = (x - p0.x) / (p1.x - p0.x);
      return p0.y + (p1.y - p0.y) * t;
    }
  }

  return points[points.length - 1].y;
}

function interpolateAcrossWeightPoints(weightPoints, weight, label) {
  const points = weightPoints
    .filter((point) => Number.isFinite(point.value))
    .sort((a, b) => a.weight - b.weight);

  if (points.length < 2) {
    throw new Error(`Insufficient ${label} data across weights`);
  }

  const minWeight = points[0].weight;
  const maxWeight = points[points.length - 1].weight;
  if (weight < minWeight || weight > maxWeight) {
    throw new Error(`${label} weight out of range (${format(minWeight, 1)}-${format(maxWeight, 1)} t)`);
  }

  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i];
    const p1 = points[i + 1];
    if (weight >= p0.weight && weight <= p1.weight) {
      if (p1.weight === p0.weight) return p0.value;
      const t = (weight - p0.weight) / (p1.weight - p0.weight);
      return p0.value + (p1.value - p0.value) * t;
    }
  }

  return points[points.length - 1].value;
}

function getLrcCruiseState(weightT, flightLevel, windKt, perfAdjust = 0) {
  if (!LRC_CRUISE_TABLE || !Array.isArray(LRC_CRUISE_TABLE.records)) {
    throw new Error("LRC cruise table is missing");
  }

  const cruiseTableFl = userFlToTableFl(flightLevel);
  const altitudeAxis = LRC_CRUISE_TABLE.altitudesFL;
  const minFl = altitudeAxis[0];
  const maxFl = altitudeAxis[altitudeAxis.length - 1];
  if (cruiseTableFl < minFl || cruiseTableFl > maxFl) {
    throw new Error(`LRC FL out of range (${format(minFl * 10, 0)}-${format(maxFl * 10, 0)})`);
  }
  const tryInterp = (values, label) => {
    try {
      return interpolateFromAvailablePoints(altitudeAxis, values, cruiseTableFl, label);
    } catch {
      return NaN;
    }
  };
  const metricsByWeight = LRC_CRUISE_TABLE.records.map((record) => ({
    weight: record.weightT,
    mach: tryInterp(record.machByAlt, `Mach at ${record.weightT}t`),
    ias: tryInterp(record.kiasByAlt, `IAS at ${record.weightT}t`),
    ffEng: tryInterp(record.ffEngByAlt, `FF/ENG at ${record.weightT}t`),
  }));

  let mach;
  try {
    mach = interpolateAcrossWeightPoints(
      metricsByWeight.map((m) => ({ weight: m.weight, value: m.mach })),
      weightT,
      "LRC Mach",
    );
  } catch (error) {
    if (String(error?.message || "").startsWith("Insufficient LRC Mach data across weights")) {
      throw new Error(`LRC Mach unavailable at FL${format(flightLevel, 0)} for interpolation across weights`);
    }
    throw error;
  }
  const ias = interpolateAcrossWeightPoints(
    metricsByWeight.map((m) => ({ weight: m.weight, value: m.ias })),
    weightT,
    "LRC IAS",
  );
  const ffEng = interpolateAcrossWeightPoints(
    metricsByWeight.map((m) => ({ weight: m.weight, value: m.ffEng })),
    weightT,
    "LRC FF/ENG",
  );

  const atmosphere = atmosphereFromPressureAltitude({
    pressureAltitudeFt: flightLevel * 100,
    tempMode: "isa-dev",
    isaDeviationC: 0,
    oatC: 0,
  });
  const tas = mach * atmosphere.speedOfSoundMps * MPS_TO_KT;
  const gs = tas + windKt;
  if (gs <= 0) {
    throw new Error("Cruise ground speed <= 0 kt");
  }

  return {
    ias,
    mach,
    tas,
    ffEng: ffEng * (1 + perfAdjust),
    fuelHr: ffEng * (1 + perfAdjust) * 2,
    gs,
  };
}

function getHoldState(weightT, flightLevel, windKt, perfAdjust = 0) {
  const hold = holdingAt(weightT, flightLevel * 100, windKt, 0);
  return {
    ias: hold.kias,
    mach: NaN,
    tas: hold.tas,
    ffEng: hold.ffEng * (1 + perfAdjust),
    fuelHr: hold.fuelHr * (1 + perfAdjust),
    gs: hold.gs,
  };
}

function simulateToFixAndOptionalHold({
  distanceNm,
  startWeightT,
  startFl,
  cruiseWindKt,
  holdWindKt,
  levelChange,
  switchToHoldSpeedAtMin,
  holdAtFixMin,
  perfAdjust,
  dtMin = 1,
}) {
  let elapsedMin = 0;
  let remainingNm = distanceNm;
  let weightT = startWeightT;
  let fuelBurnKg = 0;
  let timeToFixMin = null;
  let switchInfo = null;
  let holdRemainingMin = holdAtFixMin;
  let switched = false;
  const levelChangeDurationMin = getLevelChangeDurationMin(startFl, levelChange);
  const levelChangeStartMin = levelChange.mode === "none" ? Infinity : levelChange.afterMin;
  const levelChangeEndMin =
    levelChange.mode === "none" ? Infinity : levelChange.afterMin + levelChangeDurationMin;

  for (let guard = 0; guard < 20000; guard += 1) {
    if (remainingNm <= 1e-7 && holdRemainingMin <= 1e-7) break;

    const currentFl = getFlightLevelAtElapsed(startFl, levelChange, elapsedMin);
    const inTransit = remainingNm > 1e-7;
    const inHoldAtFix = !inTransit;

    let phase = "hold-at-fix";
    if (inTransit) {
      if (elapsedMin >= switchToHoldSpeedAtMin) {
        phase = "hold-speed-enroute";
        if (!switched) {
          switched = true;
          switchInfo = {
            atElapsedMin: elapsedMin,
            remainingNmAtSwitch: remainingNm,
          };
        }
      } else {
        phase = "lrc-cruise";
      }
    }

    let perf;
    if (phase === "lrc-cruise") {
      perf = getLrcCruiseState(weightT, currentFl, cruiseWindKt, perfAdjust);
    } else if (phase === "hold-speed-enroute") {
      perf = getHoldState(weightT, currentFl, holdWindKt, perfAdjust);
    } else {
      perf = getHoldState(weightT, currentFl, holdWindKt, perfAdjust);
    }

    let stepMin = dtMin;
    const nextLevelChangeStartDelta = elapsedMin < levelChangeStartMin ? levelChangeStartMin - elapsedMin : Infinity;
    const nextLevelChangeEndDelta = elapsedMin < levelChangeEndMin ? levelChangeEndMin - elapsedMin : Infinity;
    const nextSwitchDelta =
      inTransit && elapsedMin < switchToHoldSpeedAtMin ? switchToHoldSpeedAtMin - elapsedMin : Infinity;
    stepMin = Math.min(stepMin, nextLevelChangeStartDelta, nextLevelChangeEndDelta, nextSwitchDelta);

    if (phase === "lrc-cruise" || phase === "hold-speed-enroute") {
      const timeToFixCandidate = (remainingNm / perf.gs) * 60;
      stepMin = Math.min(stepMin, timeToFixCandidate);
    } else if (inHoldAtFix) {
      stepMin = Math.min(stepMin, holdRemainingMin);
    }

    if (!Number.isFinite(stepMin) || stepMin <= 0) {
      throw new Error("Simulation step collapsed to zero");
    }

    const effectiveFuelHr =
      phase === "hold-speed-enroute" ? perf.fuelHr * ENROUTE_HOLD_SPEED_FUEL_FACTOR : perf.fuelHr;
    const burnKg = effectiveFuelHr * (stepMin / 60);
    fuelBurnKg += burnKg;
    weightT -= burnKg / 1000;

    if (phase === "lrc-cruise" || phase === "hold-speed-enroute") {
      remainingNm = Math.max(0, remainingNm - perf.gs * (stepMin / 60));
      if (remainingNm <= 1e-7 && timeToFixMin === null) {
        timeToFixMin = elapsedMin + stepMin;
      }
    } else {
      holdRemainingMin = Math.max(0, holdRemainingMin - stepMin);
    }

    elapsedMin += stepMin;
    if (weightT <= 0) {
      throw new Error("Weight reduced below zero during simulation");
    }
  }

  if (timeToFixMin === null) {
    timeToFixMin = elapsedMin;
  }

  return {
    timeToFixMin,
    totalTimeMin: elapsedMin,
    fuelBurnKg,
    finalWeightT: weightT,
    switchInfo,
  };
}

function calculateRequiredSpeedToMeetFixTime({ distanceNm, targetFixTimeMin, startFl, windKt }) {
  if (!Number.isFinite(distanceNm) || distanceNm <= 0) {
    throw new Error("Distance to fix must be > 0 NM");
  }
  if (!Number.isFinite(targetFixTimeMin) || targetFixTimeMin <= 0) {
    throw new Error("Target fix time must be > 0 min");
  }
  if (!Number.isFinite(startFl) || startFl <= 0) {
    throw new Error("Start FL must be > 0");
  }
  if (!Number.isFinite(windKt)) {
    throw new Error("Wind is invalid");
  }

  const requiredGsKt = distanceNm / (targetFixTimeMin / 60);
  const requiredTasKt = requiredGsKt - windKt;
  if (requiredTasKt <= 0) {
    throw new Error("Required speed is not achievable with current wind");
  }

  const atmosphere = atmosphereFromPressureAltitude({
    pressureAltitudeFt: startFl * 100,
    tempMode: "isa-dev",
    isaDeviationC: 0,
    oatC: 0,
  });
  const converted = tasToIasMach({
    tasKt: requiredTasKt,
    pressurePa: atmosphere.pressurePa,
    speedOfSoundMps: atmosphere.speedOfSoundMps,
  });

  return {
    requiredGsKt,
    requiredTasKt,
    requiredIasKt: converted.iasKt,
    requiredMach: converted.mach,
  };
}

function getReferenceDescentMetricAtAltitudeFt(altitudeFt, metricValues, label) {
  return interpolateFromAvailablePointsClamped(
    LOSE_TIME_REFERENCE_DESCENT_ALT_AXIS_FT,
    metricValues,
    clamp(altitudeFt, 0, LOSE_TIME_REFERENCE_DESCENT_ALT_AXIS_FT[LOSE_TIME_REFERENCE_DESCENT_ALT_AXIS_FT.length - 1]),
    label,
  );
}

function getReferenceDescentProfileSegment(startAltitudeFt, endAltitudeFt) {
  const startFt = Math.max(0, startAltitudeFt);
  const endFt = Math.max(0, endAltitudeFt);
  if (endFt > startFt) {
    throw new Error("Fix crossing altitude must be at or below the descent start altitude");
  }
  const startDistanceNm = getReferenceDescentMetricAtAltitudeFt(
    startFt,
    LOSE_TIME_REFERENCE_DESCENT_DISTANCE_NM,
    "reference descent distance",
  );
  const endDistanceNm = getReferenceDescentMetricAtAltitudeFt(
    endFt,
    LOSE_TIME_REFERENCE_DESCENT_DISTANCE_NM,
    "reference descent distance",
  );
  const startTimeMin = getReferenceDescentMetricAtAltitudeFt(
    startFt,
    LOSE_TIME_REFERENCE_DESCENT_TIME_MIN,
    "reference descent time",
  );
  const endTimeMin = getReferenceDescentMetricAtAltitudeFt(
    endFt,
    LOSE_TIME_REFERENCE_DESCENT_TIME_MIN,
    "reference descent time",
  );

  return {
    distanceNm: Math.max(0, startDistanceNm - endDistanceNm),
    timeMin: Math.max(0, startTimeMin - endTimeMin),
  };
}

function getEstimatedFixCrossingAltitudeFt(startAltitudeFt, descentDistanceNm) {
  const startFt = Math.max(0, startAltitudeFt);
  const usedDescentDistanceNm = Math.max(0, descentDistanceNm);
  const startReferenceDistanceNm = getReferenceDescentMetricAtAltitudeFt(
    startFt,
    LOSE_TIME_REFERENCE_DESCENT_DISTANCE_NM,
    "reference descent distance",
  );
  const targetReferenceDistanceNm = Math.max(0, startReferenceDistanceNm - usedDescentDistanceNm);
  return interpolateFromAvailablePointsClamped(
    LOSE_TIME_REFERENCE_DESCENT_DISTANCE_NM,
    LOSE_TIME_REFERENCE_DESCENT_ALT_AXIS_FT,
    targetReferenceDistanceNm,
    "estimated fix crossing altitude",
  );
}

function getLinearWindAtAltitudeKt(cruiseWindKt, startAltitudeFt, altitudeFt) {
  if (!Number.isFinite(cruiseWindKt)) throw new Error("Wind is invalid");
  if (!Number.isFinite(startAltitudeFt) || startAltitudeFt <= 0) return 0;
  const scale = clamp(altitudeFt / startAltitudeFt, 0, 1);
  return cruiseWindKt * scale;
}

function getTasAtAltitudeForMach(altitudeFt, mach, isaDeviationC = 0) {
  const atmosphere = atmosphereFromPressureAltitude({
    pressureAltitudeFt: altitudeFt,
    tempMode: "isa-dev",
    isaDeviationC,
    oatC: 0,
  });
  return {
    atmosphere,
    tasKt: mach * atmosphere.speedOfSoundMps * MPS_TO_KT,
  };
}

function getTasAtAltitudeForIas(altitudeFt, iasKt, isaDeviationC = 0) {
  const atmosphere = atmosphereFromPressureAltitude({
    pressureAltitudeFt: altitudeFt,
    tempMode: "isa-dev",
    isaDeviationC,
    oatC: 0,
  });
  const converted = iasToMachTas({
    iasKt,
    pressurePa: atmosphere.pressurePa,
    speedOfSoundMps: atmosphere.speedOfSoundMps,
  });
  return {
    atmosphere,
    tasKt: converted.tasKt,
    mach: converted.mach,
  };
}

function findMachIasCrossoverAltitudeFt(startAltitudeFt, mach, targetIasKt, isaDeviationC = 0) {
  const getEquivalentIasAtAltitude = (altitudeFt) => {
    const atmosphere = atmosphereFromPressureAltitude({
      pressureAltitudeFt: altitudeFt,
      tempMode: "isa-dev",
      isaDeviationC,
      oatC: 0,
    });
    return machToIasTas({
      mach,
      pressurePa: atmosphere.pressurePa,
      speedOfSoundMps: atmosphere.speedOfSoundMps,
    }).iasKt;
  };

  const startEquivalentIasKt = getEquivalentIasAtAltitude(startAltitudeFt);
  if (startEquivalentIasKt >= targetIasKt) {
    return startAltitudeFt;
  }

  const seaLevelEquivalentIasKt = getEquivalentIasAtAltitude(0);
  if (seaLevelEquivalentIasKt <= targetIasKt) {
    return 0;
  }

  let lowAltitudeFt = 0;
  let highAltitudeFt = startAltitudeFt;
  for (let i = 0; i < 32; i += 1) {
    const midAltitudeFt = (lowAltitudeFt + highAltitudeFt) / 2;
    const midEquivalentIasKt = getEquivalentIasAtAltitude(midAltitudeFt);
    if (midEquivalentIasKt >= targetIasKt) {
      lowAltitudeFt = midAltitudeFt;
    } else {
      highAltitudeFt = midAltitudeFt;
    }
  }
  return (lowAltitudeFt + highAltitudeFt) / 2;
}

function simulateCruiseDescentTimeToFix({
  distanceNm,
  startFl,
  cruiseWindKt,
  distanceToTodNm,
  descentIasKt,
  cruiseMach,
  isaDeviationC = 0,
}) {
  if (!Number.isFinite(distanceNm) || distanceNm <= 0) {
    throw new Error("Distance to fix must be > 0 NM");
  }
  if (!Number.isFinite(startFl) || startFl <= 0) {
    throw new Error("Current FL must be > 0");
  }
  if (!Number.isFinite(cruiseWindKt)) {
    throw new Error("Wind is invalid");
  }
  if (!Number.isFinite(distanceToTodNm) || distanceToTodNm < 0) {
    throw new Error("Distance to TOD must be >= 0 NM");
  }
  if (!Number.isFinite(descentIasKt) || descentIasKt <= 0) {
    throw new Error("Descent IAS must be > 0 kt");
  }
  if (!Number.isFinite(cruiseMach) || cruiseMach <= 0) {
    throw new Error("Cruise Mach is invalid");
  }

  const startAltitudeFt = startFl * 100;
  const cruiseDistanceUsedNm = Math.min(distanceNm, distanceToTodNm);
  const descentDistanceUsedNm = Math.max(0, distanceNm - cruiseDistanceUsedNm);
  const fixCrossingAltitudeFt =
    descentDistanceUsedNm <= 1e-7
      ? startAltitudeFt
      : getEstimatedFixCrossingAltitudeFt(startAltitudeFt, descentDistanceUsedNm);
  const lowAltitudeIasKt = Math.min(descentIasKt, 250);

  if (descentDistanceUsedNm <= 1e-7) {
    const cruiseTasKt = getTasAtAltitudeForMach(startAltitudeFt, cruiseMach, isaDeviationC).tasKt;
    const cruiseGsKt = cruiseTasKt + cruiseWindKt;
    if (cruiseGsKt <= 0) {
      throw new Error("Cruise ground speed <= 0 kt");
    }
    return {
      cruiseDistanceNm: cruiseDistanceUsedNm,
      descentDistanceNm: 0,
      cruiseTimeMin: (cruiseDistanceUsedNm / cruiseGsKt) * 60,
      descentTimeMin: 0,
      totalTimeMin: (cruiseDistanceUsedNm / cruiseGsKt) * 60,
      fixCrossingAltitudeFt,
      crossoverAltitudeFt: startAltitudeFt,
      descentIasAbove10kKt: descentIasKt,
      descentIasBelow10kKt: lowAltitudeIasKt,
      referenceDescentDistanceNm: 0,
      referenceDescentTimeMin: 0,
      machSegmentDistanceNm: 0,
      machSegmentTimeMin: 0,
      iasHighSegmentDistanceNm: 0,
      iasHighSegmentTimeMin: 0,
      iasLowSegmentDistanceNm: 0,
      iasLowSegmentTimeMin: 0,
      cruiseMach,
    };
  }

  const referenceDescent = getReferenceDescentProfileSegment(startAltitudeFt, fixCrossingAltitudeFt);
  const cruiseTasKt = getTasAtAltitudeForMach(startAltitudeFt, cruiseMach, isaDeviationC).tasKt;
  const cruiseGsKt = cruiseTasKt + cruiseWindKt;
  if (cruiseGsKt <= 0) {
    throw new Error("Cruise ground speed <= 0 kt");
  }
  const cruiseTimeMin = (cruiseDistanceUsedNm / cruiseGsKt) * 60;
  const crossoverAltitudeFt = findMachIasCrossoverAltitudeFt(startAltitudeFt, cruiseMach, descentIasKt, isaDeviationC);

  const totalAltitudeDeltaFt = startAltitudeFt - fixCrossingAltitudeFt;
  let descentTimeMin = 0;
  let machSegmentDistanceNm = 0;
  let machSegmentTimeMin = 0;
  let iasHighSegmentDistanceNm = 0;
  let iasHighSegmentTimeMin = 0;
  let iasLowSegmentDistanceNm = 0;
  let iasLowSegmentTimeMin = 0;

  const integrationStepNm = Math.min(2, Math.max(descentDistanceUsedNm / 120, 0.5));
  for (let travelledNm = 0; travelledNm < descentDistanceUsedNm - 1e-9; ) {
    const stepNm = Math.min(integrationStepNm, descentDistanceUsedNm - travelledNm);
    const midProgress = (travelledNm + stepNm / 2) / descentDistanceUsedNm;
    const altitudeFt = startAltitudeFt - totalAltitudeDeltaFt * midProgress;
    const localWindKt = getLinearWindAtAltitudeKt(cruiseWindKt, startAltitudeFt, altitudeFt);

    let tasKt;
    if (altitudeFt > 10000 && altitudeFt > crossoverAltitudeFt) {
      tasKt = getTasAtAltitudeForMach(altitudeFt, cruiseMach, isaDeviationC).tasKt;
      machSegmentDistanceNm += stepNm;
    } else if (altitudeFt > 10000) {
      tasKt = getTasAtAltitudeForIas(altitudeFt, descentIasKt, isaDeviationC).tasKt;
      iasHighSegmentDistanceNm += stepNm;
    } else {
      tasKt = getTasAtAltitudeForIas(altitudeFt, lowAltitudeIasKt, isaDeviationC).tasKt;
      iasLowSegmentDistanceNm += stepNm;
    }

    const gsKt = tasKt + localWindKt;
    if (gsKt <= 0) {
      throw new Error("Descent ground speed <= 0 kt");
    }
    const stepTimeMin = (stepNm / gsKt) * 60;
    descentTimeMin += stepTimeMin;
    if (altitudeFt > 10000 && altitudeFt > crossoverAltitudeFt) {
      machSegmentTimeMin += stepTimeMin;
    } else if (altitudeFt > 10000) {
      iasHighSegmentTimeMin += stepTimeMin;
    } else {
      iasLowSegmentTimeMin += stepTimeMin;
    }
    travelledNm += stepNm;
  }

  return {
    cruiseDistanceNm: cruiseDistanceUsedNm,
    descentDistanceNm: descentDistanceUsedNm,
    cruiseTimeMin,
    descentTimeMin,
    totalTimeMin: cruiseTimeMin + descentTimeMin,
    fixCrossingAltitudeFt,
    crossoverAltitudeFt,
    descentIasAbove10kKt: descentIasKt,
    descentIasBelow10kKt: lowAltitudeIasKt,
    referenceDescentDistanceNm: referenceDescent.distanceNm,
    referenceDescentTimeMin: referenceDescent.timeMin,
    machSegmentDistanceNm,
    machSegmentTimeMin,
    iasHighSegmentDistanceNm,
    iasHighSegmentTimeMin,
    iasLowSegmentDistanceNm,
    iasLowSegmentTimeMin,
    cruiseMach,
  };
}

function buildLoseTimeCruiseDescentOption({
  distanceNm,
  startWeightT,
  startFl,
  requiredDelayMin,
  cruiseWindKt,
  distanceToTodNm,
  descentIasKt = null,
  fixedCruiseMach = null,
  speedInputMode = "ias",
  perfAdjust,
  targetTimeMin,
  isaDeviationC = 0,
  temperatureC = null,
}) {
  if (!Number.isFinite(startWeightT) || startWeightT <= 0) {
    throw new Error("Current weight must be > 0");
  }
  if (!Number.isFinite(perfAdjust)) {
    throw new Error("Performance adjustment is invalid");
  }

  const baselineCruise = getLrcCruiseState(startWeightT, startFl, cruiseWindKt, perfAdjust);
  if (speedInputMode === "mach") {
    if (!Number.isFinite(fixedCruiseMach) || fixedCruiseMach <= 0 || fixedCruiseMach >= 1) {
      throw new Error("Option D Mach must be > 0 and < 1.0");
    }

    const baseline = simulateCruiseDescentTimeToFix({
      distanceNm,
      startFl,
      cruiseWindKt,
      distanceToTodNm,
      descentIasKt: LOSE_TIME_OPTION_D_REFERENCE_DESCENT_IAS_KT,
      cruiseMach: fixedCruiseMach,
      isaDeviationC,
    });
    const resolvedTargetTimeMin =
      Number.isFinite(targetTimeMin) && targetTimeMin > 0 ? targetTimeMin : baseline.totalTimeMin + requiredDelayMin;

    if (requiredDelayMin <= 1e-9) {
      return {
        inputMode: "mach",
        inputCruiseMach: fixedCruiseMach,
        inputDescentIasKt: null,
        baseline,
        solution: baseline,
        targetTimeMin: resolvedTargetTimeMin,
        residualHoldMin: 0,
        requiredMach: fixedCruiseMach,
        requiredDescentIasKt: baseline.descentIasAbove10kKt,
        limitedByMaxMach: false,
        limitedByMinIas: false,
        isaDeviationC,
        temperatureC,
      };
    }

    const minimumIasSolution = simulateCruiseDescentTimeToFix({
      distanceNm,
      startFl,
      cruiseWindKt,
      distanceToTodNm,
      descentIasKt: LOSE_TIME_MIN_OPTION_D_DESCENT_IAS_KT,
      cruiseMach: fixedCruiseMach,
      isaDeviationC,
    });

    if (minimumIasSolution.totalTimeMin < resolvedTargetTimeMin) {
      return {
        inputMode: "mach",
        inputCruiseMach: fixedCruiseMach,
        inputDescentIasKt: null,
        baseline,
        solution: minimumIasSolution,
        targetTimeMin: resolvedTargetTimeMin,
        residualHoldMin: resolvedTargetTimeMin - minimumIasSolution.totalTimeMin,
        requiredMach: fixedCruiseMach,
        requiredDescentIasKt: minimumIasSolution.descentIasAbove10kKt,
        limitedByMaxMach: false,
        limitedByMinIas: true,
        isaDeviationC,
        temperatureC,
      };
    }

    let lowIas = LOSE_TIME_MIN_OPTION_D_DESCENT_IAS_KT;
    let highIas = LOSE_TIME_OPTION_D_REFERENCE_DESCENT_IAS_KT;
    let lowSolution = minimumIasSolution;
    let highSolution = baseline;

    for (let i = 0; i < 32; i += 1) {
      const midIas = (lowIas + highIas) / 2;
      const midSolution = simulateCruiseDescentTimeToFix({
        distanceNm,
        startFl,
        cruiseWindKt,
        distanceToTodNm,
        descentIasKt: midIas,
        cruiseMach: fixedCruiseMach,
        isaDeviationC,
      });
      if (midSolution.totalTimeMin > resolvedTargetTimeMin) {
        lowIas = midIas;
        lowSolution = midSolution;
      } else {
        highIas = midIas;
        highSolution = midSolution;
      }
    }

    const solution =
      Math.abs(lowSolution.totalTimeMin - resolvedTargetTimeMin) <=
      Math.abs(highSolution.totalTimeMin - resolvedTargetTimeMin)
        ? lowSolution
        : highSolution;

    return {
      inputMode: "mach",
      inputCruiseMach: fixedCruiseMach,
      inputDescentIasKt: null,
      baseline,
      solution,
      targetTimeMin: resolvedTargetTimeMin,
      residualHoldMin: 0,
      requiredMach: fixedCruiseMach,
      requiredDescentIasKt: solution.descentIasAbove10kKt,
      limitedByMaxMach: false,
      limitedByMinIas: false,
      isaDeviationC,
      temperatureC,
    };
  }

  if (!Number.isFinite(descentIasKt) || descentIasKt <= 0) {
    throw new Error("Option D descent IAS must be > 0");
  }

  const baseline = simulateCruiseDescentTimeToFix({
    distanceNm,
    startFl,
    cruiseWindKt,
    distanceToTodNm,
    descentIasKt,
    cruiseMach: baselineCruise.mach,
    isaDeviationC,
  });
  const resolvedTargetTimeMin =
    Number.isFinite(targetTimeMin) && targetTimeMin > 0 ? targetTimeMin : baseline.totalTimeMin + requiredDelayMin;

  if (requiredDelayMin <= 1e-9) {
    return {
      inputMode: "ias",
      inputCruiseMach: null,
      inputDescentIasKt: descentIasKt,
      baseline,
      solution: baseline,
      targetTimeMin: resolvedTargetTimeMin,
      residualHoldMin: 0,
      requiredMach: baselineCruise.mach,
      requiredDescentIasKt: baseline.descentIasAbove10kKt,
      limitedByMaxMach: false,
      limitedByMinIas: false,
      isaDeviationC,
      temperatureC,
    };
  }

  if (baseline.totalTimeMin > resolvedTargetTimeMin) {
    return {
      inputMode: "ias",
      inputCruiseMach: null,
      inputDescentIasKt: descentIasKt,
      baseline,
      solution: baseline,
      targetTimeMin: resolvedTargetTimeMin,
      residualHoldMin: 0,
      requiredMach: baselineCruise.mach,
      requiredDescentIasKt: baseline.descentIasAbove10kKt,
      limitedByMaxMach: true,
      limitedByMinIas: false,
      isaDeviationC,
      temperatureC,
    };
  }

  const minimumMach = Math.min(LOSE_TIME_MIN_OPTION_D_MACH, baselineCruise.mach);
  const minimumMachSolution = simulateCruiseDescentTimeToFix({
    distanceNm,
    startFl,
    cruiseWindKt,
    distanceToTodNm,
    descentIasKt,
    cruiseMach: minimumMach,
    isaDeviationC,
  });

  if (minimumMachSolution.totalTimeMin < resolvedTargetTimeMin) {
    return {
      inputMode: "ias",
      inputCruiseMach: null,
      inputDescentIasKt: descentIasKt,
      baseline,
      solution: minimumMachSolution,
      targetTimeMin: resolvedTargetTimeMin,
      residualHoldMin: resolvedTargetTimeMin - minimumMachSolution.totalTimeMin,
      requiredMach: minimumMach,
      requiredDescentIasKt: minimumMachSolution.descentIasAbove10kKt,
      limitedByMaxMach: false,
      limitedByMinIas: false,
      isaDeviationC,
      temperatureC,
    };
  }

  let lowMach = minimumMach;
  let highMach = baselineCruise.mach;
  let lowSolution = minimumMachSolution;
  let highSolution = baseline;

  for (let i = 0; i < 32; i += 1) {
    const midMach = (lowMach + highMach) / 2;
    const midSolution = simulateCruiseDescentTimeToFix({
      distanceNm,
      startFl,
      cruiseWindKt,
      distanceToTodNm,
      descentIasKt,
      cruiseMach: midMach,
      isaDeviationC,
    });
    if (midSolution.totalTimeMin > resolvedTargetTimeMin) {
      lowMach = midMach;
      lowSolution = midSolution;
    } else {
      highMach = midMach;
      highSolution = midSolution;
    }
  }

  const solution =
    Math.abs(lowSolution.totalTimeMin - resolvedTargetTimeMin) <=
    Math.abs(highSolution.totalTimeMin - resolvedTargetTimeMin)
      ? lowSolution
      : highSolution;

  return {
    inputMode: "ias",
    inputCruiseMach: null,
    inputDescentIasKt: descentIasKt,
    baseline,
    solution,
    targetTimeMin: resolvedTargetTimeMin,
    residualHoldMin: 0,
    requiredMach: solution.cruiseMach,
    requiredDescentIasKt: solution.descentIasAbove10kKt,
    limitedByMaxMach: false,
    limitedByMinIas: false,
    isaDeviationC,
    temperatureC,
  };
}

function buildLoseTimeComparison({
  distanceNm,
  startWeightT,
  startFl,
  requiredDelayMin,
  cruiseWindKt,
  holdWindKt,
  levelChange,
  perfAdjust,
}) {
  if (!Number.isFinite(distanceNm)) throw new Error("Distance to fix is invalid");
  if (!Number.isFinite(requiredDelayMin)) throw new Error("Required delay is invalid");
  if (!Number.isFinite(startWeightT)) throw new Error("Current weight is invalid");
  if (!Number.isFinite(startFl)) throw new Error("Current FL is invalid");
  if (!Number.isFinite(cruiseWindKt) || !Number.isFinite(holdWindKt)) throw new Error("Wind is invalid");
  if (!Number.isFinite(perfAdjust)) throw new Error("Performance adjustment is invalid");
  if (distanceNm <= 0) throw new Error("Distance to fix must be > 0 NM");
  if (requiredDelayMin < 0) throw new Error("Required delay must be >= 0 min");
  if (startWeightT <= 0) throw new Error("Current weight must be > 0");
  if (startFl <= 0) throw new Error("Current FL must be > 0");

  validateLevelChange(levelChange, startFl);

  const baseline = simulateToFixAndOptionalHold({
    distanceNm,
    startWeightT,
    startFl,
    cruiseWindKt,
    holdWindKt,
    levelChange,
    switchToHoldSpeedAtMin: Number.POSITIVE_INFINITY,
    holdAtFixMin: 0,
    perfAdjust,
  });

  const optionA = simulateToFixAndOptionalHold({
    distanceNm,
    startWeightT,
    startFl,
    cruiseWindKt,
    holdWindKt,
    levelChange,
    switchToHoldSpeedAtMin: Number.POSITIVE_INFINITY,
    holdAtFixMin: requiredDelayMin,
    perfAdjust,
  });

  const targetFixTime = baseline.timeToFixMin + requiredDelayMin;

  const allHoldTransit = simulateToFixAndOptionalHold({
    distanceNm,
    startWeightT,
    startFl,
    cruiseWindKt,
    holdWindKt,
    levelChange,
    switchToHoldSpeedAtMin: 0,
    holdAtFixMin: 0,
    perfAdjust,
  });

  let optionBTransit;
  let residualHoldMin = 0;

  if (targetFixTime > allHoldTransit.timeToFixMin) {
    optionBTransit = allHoldTransit;
    residualHoldMin = targetFixTime - allHoldTransit.timeToFixMin;
  } else {
    let low = 0;
    let high = Math.max(targetFixTime + 60, baseline.timeToFixMin + 60);
    let lowSim = allHoldTransit;
    let highSim = simulateToFixAndOptionalHold({
      distanceNm,
      startWeightT,
      startFl,
      cruiseWindKt,
      holdWindKt,
      levelChange,
      switchToHoldSpeedAtMin: high,
      holdAtFixMin: 0,
      perfAdjust,
    });

    if (lowSim.timeToFixMin < targetFixTime || highSim.timeToFixMin > targetFixTime) {
      throw new Error("Unable to bracket switch point for enroute delay solution");
    }

    for (let i = 0; i < 24; i += 1) {
      const mid = (low + high) / 2;
      const midSim = simulateToFixAndOptionalHold({
        distanceNm,
        startWeightT,
        startFl,
        cruiseWindKt,
        holdWindKt,
        levelChange,
        switchToHoldSpeedAtMin: mid,
        holdAtFixMin: 0,
        perfAdjust,
      });

      if (midSim.timeToFixMin > targetFixTime) {
        low = mid;
        lowSim = midSim;
      } else {
        high = mid;
        highSim = midSim;
      }
    }

    optionBTransit =
      Math.abs(lowSim.timeToFixMin - targetFixTime) <= Math.abs(highSim.timeToFixMin - targetFixTime) ? lowSim : highSim;
  }

  const optionB = simulateToFixAndOptionalHold({
    distanceNm,
    startWeightT,
    startFl,
    cruiseWindKt,
    holdWindKt,
    levelChange,
    switchToHoldSpeedAtMin: optionBTransit.switchInfo ? optionBTransit.switchInfo.atElapsedMin : Number.POSITIVE_INFINITY,
    holdAtFixMin: residualHoldMin,
    perfAdjust,
  });

  let optionC = null;
  let optionCError = "";
  try {
    optionC = calculateRequiredSpeedToMeetFixTime({
      distanceNm,
      targetFixTimeMin: targetFixTime,
      startFl,
      windKt: cruiseWindKt,
    });
  } catch (error) {
    optionCError = String(error?.message || "Unable to compute required speed");
  }

  return {
    baseline,
    optionA,
    optionB,
    optionC,
    optionCError,
    targetFixTime,
    requiredDelayMin,
    residualHoldMin,
  };
}

function buildIsaBases() {
  const bases = [
    {
      hBaseM: ISA_LAYER_BASES_M[0],
      tBaseK: T0,
      pBasePa: P0,
      lapseRate: ISA_LAYER_LAPSE_RATES[0],
    },
  ];

  for (let i = 1; i < ISA_LAYER_BASES_M.length; i += 1) {
    const prev = bases[i - 1];
    const hBaseM = ISA_LAYER_BASES_M[i];
    const deltaH = hBaseM - prev.hBaseM;
    const lapse = prev.lapseRate;

    let tBaseK;
    let pBasePa;
    if (Math.abs(lapse) < 1e-12) {
      tBaseK = prev.tBaseK;
      pBasePa = prev.pBasePa * Math.exp((-G0 * deltaH) / (R_AIR * prev.tBaseK));
    } else {
      tBaseK = prev.tBaseK + lapse * deltaH;
      pBasePa = prev.pBasePa * (tBaseK / prev.tBaseK) ** (-G0 / (R_AIR * lapse));
    }

    bases.push({
      hBaseM,
      tBaseK,
      pBasePa,
      lapseRate: ISA_LAYER_LAPSE_RATES[i],
    });
  }

  return bases;
}

function geometricToGeopotentialMeters(geometricMeters) {
  return (EARTH_RADIUS_M * geometricMeters) / (EARTH_RADIUS_M + geometricMeters);
}

function isaStateAtGeopotential(geopotentialM) {
  if (geopotentialM > ISA_LAYER_BASES_M[ISA_LAYER_BASES_M.length - 1]) {
    throw new Error("Altitude out of ISA model range (max 47,000 m geopotential)");
  }

  let layerIndex = 0;
  for (let i = 0; i < ISA_BASES.length - 1; i += 1) {
    if (geopotentialM >= ISA_BASES[i].hBaseM && geopotentialM < ISA_BASES[i + 1].hBaseM) {
      layerIndex = i;
      break;
    }
    if (geopotentialM >= ISA_BASES[i + 1].hBaseM) {
      layerIndex = i + 1;
    }
  }

  const base = ISA_BASES[layerIndex];
  const deltaH = geopotentialM - base.hBaseM;
  let isaTempK;
  let pressurePa;

  if (Math.abs(base.lapseRate) < 1e-12) {
    isaTempK = base.tBaseK;
    pressurePa = base.pBasePa * Math.exp((-G0 * deltaH) / (R_AIR * base.tBaseK));
  } else {
    isaTempK = base.tBaseK + base.lapseRate * deltaH;
    pressurePa = base.pBasePa * (isaTempK / base.tBaseK) ** (-G0 / (R_AIR * base.lapseRate));
  }

  return { isaTempK, pressurePa };
}

function atmosphereFromPressureAltitude({ pressureAltitudeFt, tempMode, oatC, isaDeviationC }) {
  if (!Number.isFinite(pressureAltitudeFt)) {
    throw new Error("Invalid pressure altitude");
  }

  const geometricM = pressureAltitudeFt * FT_TO_M;
  const geopotentialM = geometricToGeopotentialMeters(geometricM);
  const { isaTempK, pressurePa } = isaStateAtGeopotential(geopotentialM);

  let actualTempK;
  if (tempMode === "isa-dev") {
    actualTempK = isaTempK + isaDeviationC;
  } else {
    actualTempK = oatC + 273.15;
  }

  if (!Number.isFinite(actualTempK) || actualTempK <= 0) {
    throw new Error("Temperature input is invalid for atmospheric computation");
  }

  return {
    pressurePa,
    isaTempK,
    actualTempK,
    speedOfSoundMps: Math.sqrt(GAMMA * R_AIR * actualTempK),
    geopotentialM,
  };
}

function iasToMachTas({ iasKt, pressurePa, speedOfSoundMps }) {
  if (!Number.isFinite(iasKt) || iasKt < 0) throw new Error("IAS must be >= 0");

  const vCas = iasKt * KT_TO_MPS;
  const qc = P0 * ((1 + ((GAMMA - 1) / 2) * (vCas / A0) ** 2) ** (GAMMA / (GAMMA - 1)) - 1);
  const mach = Math.sqrt((2 / (GAMMA - 1)) * ((qc / pressurePa + 1) ** ((GAMMA - 1) / GAMMA) - 1));
  const tasKt = mach * speedOfSoundMps * MPS_TO_KT;

  return { iasKt, mach, tasKt };
}

function machToIasTas({ mach, pressurePa, speedOfSoundMps }) {
  if (!Number.isFinite(mach) || mach < 0) throw new Error("Mach must be >= 0");

  const tasKt = mach * speedOfSoundMps * MPS_TO_KT;
  const qc = pressurePa * ((1 + ((GAMMA - 1) / 2) * mach ** 2) ** (GAMMA / (GAMMA - 1)) - 1);
  const casMps = A0 * Math.sqrt((2 / (GAMMA - 1)) * ((qc / P0 + 1) ** ((GAMMA - 1) / GAMMA) - 1));

  return { iasKt: casMps * MPS_TO_KT, mach, tasKt };
}

function tasToIasMach({ tasKt, pressurePa, speedOfSoundMps }) {
  if (!Number.isFinite(tasKt) || tasKt < 0) throw new Error("TAS must be >= 0");

  const mach = (tasKt * KT_TO_MPS) / speedOfSoundMps;
  const qc = pressurePa * ((1 + ((GAMMA - 1) / 2) * mach ** 2) ** (GAMMA / (GAMMA - 1)) - 1);
  const casMps = A0 * Math.sqrt((2 / (GAMMA - 1)) * ((qc / P0 + 1) ** ((GAMMA - 1) / GAMMA) - 1));

  return { iasKt: casMps * MPS_TO_KT, mach, tasKt };
}

function timeTextToMinutes(t) {
  const [h, m] = String(t).split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return NaN;
  return h * 60 + m;
}

function renderRows(target, rows) {
  const emphasizedRows = new Set([
    "Inbound Leg Time",
    "DPA Total",
    "Total Fuel Required",
    "Required Weight",
    "Option D Cruise / Initial Descent Mach",
    "Option D Descent IAS (>10000 / <=10000)",
  ]);
  const stackedRows = new Set([
    "Estimated Step Climb Triggers",
    "Step Climb Plan",
    "Option B Speed Reduction Start",
    "Option D Descent Segment Split",
  ]);
  const makeStackedValueHtml = (value) =>
    String(value ?? "")
      .replace(/ -> /g, ' <span class="result-inline-sep">&rarr;</span><wbr> ')
      .replace(/, /g, ",<wbr> ");

  target.innerHTML = rows
    .map(([k, v]) => {
      if (k === "__spacer__") {
        return '<div class="result-spacer"></div>';
      }
      if (k === "__section__") {
        return `<div class="result-section-title">${v}</div>`;
      }
      if (k === "__warning__") {
        return `<div class="result-warning">${v}</div>`;
      }
      const rowClasses = ["result-row"];
      if (emphasizedRows.has(k)) rowClasses.push("result-row-emphasis");
      if (stackedRows.has(k)) rowClasses.push("result-row-stack");
      const rowClass = rowClasses.join(" ");
      const valueHtml = stackedRows.has(k) ? makeStackedValueHtml(v) : v;
      return `<div class="${rowClass}"><span class="result-key">${k}</span><span class="result-value">${valueHtml}</span></div>`;
    })
    .join("");
}

function renderError(target, message) {
  target.innerHTML = `<div class="error">${message}</div>`;
}

function renderValidation(target, message) {
  target.innerHTML = `<div class="validation">${message}</div>`;
}

function missingFieldsBanner(target, missingNames) {
  const names = missingNames.filter(Boolean);
  if (names.length === 0) return false;
  const plural = names.length > 1 ? "s" : "";
  renderValidation(target, `Missing required input${plural}: ${names.join(", ")}`);
  return true;
}

function recalculateAllForms() {
  [
    "#trip-fuel-form",
    "#dpa-form",
    "#lrc-altitude-form",
    "#engine-out-drift-form",
    "#engine-out-diversion-form",
    "#diversion-low-form",
    "#diversion-high-form",
    "#go-around-form",
    "#holding-form",
    "#lose-time-form",
    "#conversion-form",
    "#cog-limit-form",
  ].forEach((selector) => {
    const form = document.querySelector(selector);
    if (form) form.dispatchEvent(new Event("submit"));
  });
}

function fieldIsBlank(value) {
  return String(value ?? "").trim() === "";
}

function shouldDeferLiveSubmitForInput(el) {
  if (!el) return false;
  const type = String(el.type || "").toLowerCase();
  return type === "number" && document.activeElement === el && fieldIsBlank(el.value);
}

function getPersistableFields() {
  return Array.from(document.querySelectorAll("input[id], select[id], textarea[id]")).filter(
    (el) => el.id && !NON_PERSISTED_FIELD_IDS.has(el.id),
  );
}

function captureInputState() {
  const snapshot = {};
  getPersistableFields().forEach((el) => {
    if (!el.id) return;
    const type = (el.type || "").toLowerCase();
    if (type === "checkbox" || type === "radio") {
      snapshot[el.id] = { checked: !!el.checked };
    } else {
      snapshot[el.id] = { value: el.value };
    }
  });
  return snapshot;
}

function applyCapturedInputState(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return;
  getPersistableFields().forEach((el) => {
    if (!el.id || !(el.id in snapshot)) return;
    const savedEntry = snapshot[el.id];
    const type = (el.type || "").toLowerCase();
    if ((type === "checkbox" || type === "radio") && typeof savedEntry?.checked === "boolean") {
      el.checked = savedEntry.checked;
      return;
    }
    if (typeof savedEntry?.value === "string") {
      el.value = savedEntry.value;
    }
  });
}

function persistInputState() {
  try {
    localStorage.setItem(INPUT_STATE_STORAGE_KEY, JSON.stringify(captureInputState()));
  } catch {
    // Ignore storage failures (quota/privacy mode) and continue app execution.
  }
}

function restorePersistedInputState() {
  try {
    const raw = localStorage.getItem(INPUT_STATE_STORAGE_KEY);
    if (!raw) return;
    applyCapturedInputState(JSON.parse(raw));
  } catch {
    // Ignore malformed persisted state and continue with markup defaults.
  }
}

function readNamedScenarios() {
  try {
    const raw = localStorage.getItem(SCENARIO_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function readSyncActivity() {
  try {
    const raw = localStorage.getItem(SYNC_ACTIVITY_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function writeSyncActivity(activity) {
  try {
    localStorage.setItem(SYNC_ACTIVITY_STORAGE_KEY, JSON.stringify(activity));
  } catch {
    // Ignore storage failures and keep the app usable.
  }
}

function formatSyncTimestamp(isoText) {
  const date = new Date(isoText);
  if (Number.isNaN(date.getTime())) return "";
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
  } catch {
    return date.toLocaleString();
  }
}

function buildSyncActivityMessage(activity) {
  if (!activity?.at || !activity?.action) return "No Dropbox sync recorded on this device yet.";
  const timestamp = formatSyncTimestamp(activity.at);
  const actionLabel = activity.action === "pull" ? "Dropbox load" : "Dropbox save";
  const countText = Number.isFinite(activity.count) ? ` (${activity.count} scenarios)` : "";
  return `Last ${actionLabel}: ${timestamp}${countText}`;
}

function writeSyncActivityRecord(action, count) {
  writeSyncActivity({
    action,
    count: Number.isFinite(count) ? count : null,
    at: new Date().toISOString(),
  });
}

function writeNamedScenarios(scenarios) {
  try {
    localStorage.setItem(SCENARIO_STORAGE_KEY, JSON.stringify(scenarios));
  } catch {
    // Ignore storage failures and keep the app usable.
  }
}

function getSyncConfig() {
  const raw = window.SYNC_CONFIG || {};
  const configuredPath = String(raw.dropboxSyncFilePath || "").trim();
  return {
    dropboxAppKey: String(raw.dropboxAppKey || "").trim(),
    dropboxSyncFilePath: configuredPath ? `/${configuredPath.replace(/^\/+/g, "")}` : "/performance-calculators-scenarios.json",
  };
}

function isSyncConfigured() {
  return !!getSyncConfig().dropboxAppKey;
}

function normalizeSyncSession(raw) {
  if (!raw || typeof raw !== "object") return null;
  const accessToken = String(raw.accessToken || raw.access_token || "").trim();
  if (!accessToken) return null;
  const refreshToken = String(raw.refreshToken || raw.refresh_token || "").trim();
  const account = raw.account && typeof raw.account === "object" ? raw.account : {};
  const expiresAt = Number(
    raw.expiresAt || raw.expires_at || (Number.isFinite(raw.expires_in) ? Date.now() + Number(raw.expires_in) * 1000 : 0),
  );
  return {
    accessToken,
    refreshToken,
    expiresAt: Number.isFinite(expiresAt) ? expiresAt : 0,
    account: {
      id: String(account.id || account.account_id || "").trim(),
      email: String(account.email || "").trim(),
      name: String(account.name || account.display_name || "").trim(),
    },
  };
}

function readSyncSession() {
  try {
    const raw = localStorage.getItem(SYNC_SESSION_STORAGE_KEY);
    if (!raw) return null;
    return normalizeSyncSession(JSON.parse(raw));
  } catch {
    return null;
  }
}

function writeSyncSession(session) {
  const normalized = normalizeSyncSession(session);
  try {
    if (!normalized) {
      localStorage.removeItem(SYNC_SESSION_STORAGE_KEY);
      return null;
    }
    localStorage.setItem(SYNC_SESSION_STORAGE_KEY, JSON.stringify(normalized));
    return normalized;
  } catch {
    return normalized;
  }
}

function clearSyncSession() {
  try {
    localStorage.removeItem(SYNC_SESSION_STORAGE_KEY);
  } catch {
    // Ignore storage failures and keep the app usable.
  }
}

function readSyncAuthState() {
  try {
    const raw = localStorage.getItem(SYNC_AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return {
      state: String(parsed.state || "").trim(),
      verifier: String(parsed.verifier || "").trim(),
      redirectUrl: String(parsed.redirectUrl || "").trim(),
    };
  } catch {
    return null;
  }
}

function writeSyncAuthState(state) {
  try {
    if (!state || typeof state !== "object") {
      localStorage.removeItem(SYNC_AUTH_STORAGE_KEY);
      return;
    }
    localStorage.setItem(
      SYNC_AUTH_STORAGE_KEY,
      JSON.stringify({
        state: String(state.state || "").trim(),
        verifier: String(state.verifier || "").trim(),
        redirectUrl: String(state.redirectUrl || "").trim(),
      }),
    );
  } catch {
    // Ignore storage failures and keep the app usable.
  }
}

function clearSyncAuthState() {
  try {
    localStorage.removeItem(SYNC_AUTH_STORAGE_KEY);
  } catch {
    // Ignore storage failures and keep the app usable.
  }
}

function readSyncAuthParamsFromUrl() {
  if (typeof window === "undefined" || !window.location) return { code: "", state: "", error: "" };
  const params = new URLSearchParams(window.location.search || "");
  return {
    code: String(params.get("code") || "").trim(),
    state: String(params.get("state") || "").trim(),
    error: String(params.get("error_description") || params.get("error") || "").trim(),
  };
}

function clearSyncAuthParamsFromUrl() {
  if (typeof window === "undefined" || !window.location || !window.history?.replaceState) return;
  try {
    const url = new URL(window.location.href);
    ["code", "state", "error", "error_description"].forEach((key) => url.searchParams.delete(key));
    url.hash = "";
    window.history.replaceState({}, document.title, url.toString());
  } catch {
    // Ignore history manipulation failures.
  }
}

function getScenarioSavedAtValue(scenario) {
  return String(scenario?.savedAt || "");
}

function mergeNamedScenarioMaps(localScenarios, remoteScenarios) {
  const merged = {};
  const names = new Set([...Object.keys(localScenarios || {}), ...Object.keys(remoteScenarios || {})]);
  names.forEach((name) => {
    const localScenario = localScenarios?.[name];
    const remoteScenario = remoteScenarios?.[name];
    if (!localScenario) {
      merged[name] = remoteScenario;
      return;
    }
    if (!remoteScenario) {
      merged[name] = localScenario;
      return;
    }
    merged[name] =
      getScenarioSavedAtValue(remoteScenario) > getScenarioSavedAtValue(localScenario) ? remoteScenario : localScenario;
  });
  return merged;
}

function getSyncRedirectUrl() {
  if (typeof window === "undefined" || !window.location) return "";
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  return url.toString();
}

async function readSyncError(response) {
  const requestId = response.headers?.get?.("x-dropbox-request-id") || "";
  try {
    const payload = await response.json();
    const message =
      String(payload?.error_summary || payload?.error_description || payload?.error || payload?.message || payload?.msg || "").trim() ||
      `Request failed (${response.status})`;
    return requestId ? `${message} [req ${requestId}]` : message;
  } catch {
    try {
      const text = await response.text();
      const message = text || `Request failed (${response.status})`;
      return requestId ? `${message} [req ${requestId}]` : message;
    } catch {
      return requestId ? `Request failed (${response.status}) [req ${requestId}]` : `Request failed (${response.status})`;
    }
  }
}

function describeSyncError(error, fallback = "Request failed") {
  const sdkSummary = String(
    error?.error?.error_summary ||
      error?.error_summary ||
      error?.error?.error ||
      error?.error ||
      error?.message ||
      "",
  ).trim();
  const requestId = String(
    error?.headers?.get?.("x-dropbox-request-id") ||
      error?.status?.headers?.get?.("x-dropbox-request-id") ||
      error?.response?.headers?.get?.("x-dropbox-request-id") ||
      error?.requestId ||
      "",
  ).trim();
  const statusCode = Number(error?.status || error?.response?.status || error?.statusCode);
  let message = sdkSummary;
  if (!message && Number.isFinite(statusCode)) {
    message = `${fallback} (${statusCode})`;
  }
  if (!message) message = fallback;
  return requestId ? `${message} [req ${requestId}]` : message;
}

function base64UrlEncodeBytes(bytes) {
  if (typeof btoa !== "function") {
    throw new Error("This browser does not support Dropbox sync");
  }
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function createRandomSyncToken(byteLength = 32) {
  const cryptoObj = window.crypto || window.msCrypto;
  if (!cryptoObj?.getRandomValues) {
    throw new Error("This browser does not support Dropbox sync");
  }
  const bytes = new Uint8Array(byteLength);
  cryptoObj.getRandomValues(bytes);
  return base64UrlEncodeBytes(bytes);
}

async function createCodeChallenge(verifier) {
  const cryptoObj = window.crypto || window.msCrypto;
  if (!cryptoObj?.subtle?.digest) {
    throw new Error("This browser does not support Dropbox sync");
  }
  const digest = await cryptoObj.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64UrlEncodeBytes(new Uint8Array(digest));
}

async function requestDropboxToken(params) {
  const response = await fetch("https://api.dropboxapi.com/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(params).toString(),
  });
  if (!response.ok) {
    throw new Error(await readSyncError(response));
  }
  return response.json();
}

async function fetchDropboxAccount(accessToken) {
  const dbx = createDropboxClient({ accessToken });
  const response = await dbx.usersGetCurrentAccount();
  const payload = response?.result || response;
  return {
    id: String(payload?.account_id || "").trim(),
    email: String(payload?.email || "").trim(),
    name: String(payload?.name?.display_name || "").trim(),
  };
}

function createDropboxClient(session) {
  const DropboxSdk = window.Dropbox?.Dropbox;
  if (typeof DropboxSdk !== "function") {
    throw new Error("Dropbox SDK unavailable. Refresh and try again.");
  }
  return new DropboxSdk({
    accessToken: session?.accessToken || "",
    fetch: window.fetch.bind(window),
  });
}

async function startDropboxAuthFlow() {
  const config = getSyncConfig();
  if (!config.dropboxAppKey) {
    throw new Error("Dropbox sync is not configured");
  }
  const verifier = createRandomSyncToken(32);
  const state = createRandomSyncToken(16);
  const redirectUrl = getSyncRedirectUrl();
  const challenge = await createCodeChallenge(verifier);
  writeSyncAuthState({ state, verifier, redirectUrl });

  const params = new URLSearchParams({
    client_id: config.dropboxAppKey,
    response_type: "code",
    token_access_type: "offline",
    redirect_uri: redirectUrl,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
    scope: "account_info.read files.content.read files.content.write",
  });
  window.location.assign(`https://www.dropbox.com/oauth2/authorize?${params.toString()}`);
}

async function exchangeDropboxAuthCode(code, state) {
  const config = getSyncConfig();
  const authState = readSyncAuthState();
  if (!authState?.verifier || !authState?.state) {
    throw new Error("Dropbox sign-in expired. Start the connection again.");
  }
  if (authState.state !== state) {
    throw new Error("Dropbox sign-in state mismatch. Start the connection again.");
  }
  const payload = await requestDropboxToken({
    client_id: config.dropboxAppKey,
    code,
    grant_type: "authorization_code",
    code_verifier: authState.verifier,
    redirect_uri: authState.redirectUrl || getSyncRedirectUrl(),
  });
  const account = await fetchDropboxAccount(payload.access_token);
  clearSyncAuthState();
  return writeSyncSession({
    access_token: payload.access_token,
    refresh_token: payload.refresh_token,
    expires_in: payload.expires_in,
    account,
  });
}

async function refreshScenarioSyncSession(session) {
  const config = getSyncConfig();
  if (!session?.refreshToken) return null;
  try {
    const payload = await requestDropboxToken({
      client_id: config.dropboxAppKey,
      grant_type: "refresh_token",
      refresh_token: session.refreshToken,
    });
    return writeSyncSession({
      access_token: payload.access_token,
      refresh_token: session.refreshToken,
      expires_in: payload.expires_in,
      account: session.account,
    });
  } catch {
    clearSyncSession();
    return null;
  }
}

async function ensureScenarioSyncSession() {
  const authParams = readSyncAuthParamsFromUrl();
  if (authParams.code) {
    try {
      const sessionFromUrl = await exchangeDropboxAuthCode(authParams.code, authParams.state);
      clearSyncAuthParamsFromUrl();
      return sessionFromUrl;
    } catch (error) {
      clearSyncAuthParamsFromUrl();
      clearSyncAuthState();
      throw error;
    }
  }
  if (authParams.error) {
    clearSyncAuthParamsFromUrl();
    clearSyncAuthState();
    throw new Error(authParams.error);
  }

  const session = readSyncSession();
  if (!session) return null;
  if (!session.expiresAt || session.expiresAt > Date.now() + SYNC_STATUS_REFRESH_SKEW_MS) {
    return session;
  }
  return refreshScenarioSyncSession(session);
}

async function getScenarioSyncAccount(session) {
  if (session?.account?.email || session?.account?.name || session?.account?.id) return session.account;
  if (!session?.accessToken) return null;
  try {
    const account = await fetchDropboxAccount(session.accessToken);
    return writeSyncSession({ ...session, account })?.account || account;
  } catch {
    return null;
  }
}

async function dropboxApiRequest(url, { accessToken = "", headers = {}, body, responseType = "json", allowNotFound = false } = {}) {
  const requestHeaders = {
    ...headers,
  };
  if (accessToken) {
    requestHeaders.Authorization = `Bearer ${accessToken}`;
  }
  const response = await fetch(url, {
    method: "POST",
    headers: requestHeaders,
    body,
  });
  if (!response.ok) {
    if (allowNotFound && response.status === 409) return null;
    throw new Error(await readSyncError(response));
  }
  if (responseType === "text") return response.text();
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function buildSyncScenarioBundle(scenarios = readNamedScenarios()) {
  const sanitizedScenarios = {};
  Object.entries(scenarios || {}).forEach(([name, scenario]) => {
    if (!name || !scenario?.state || typeof scenario.state !== "object") return;
    sanitizedScenarios[name] = {
      savedAt: String(scenario.savedAt || new Date().toISOString()),
      state: scenario.state,
      linkedWeightOverrides: sanitizeLinkedWeightOverrides(scenario.linkedWeightOverrides || {}),
    };
  });
  return {
    type: SYNC_SCENARIO_BUNDLE_TYPE,
    version: SYNC_SCENARIO_BUNDLE_VERSION,
    appVersion: APP_VERSION,
    exportedAt: new Date().toISOString(),
    scenarios: sanitizedScenarios,
  };
}

function parseSyncScenarioBundle(rawText) {
  const payload = JSON.parse(rawText);
  if (
    payload?.type !== SYNC_SCENARIO_BUNDLE_TYPE ||
    payload?.version !== SYNC_SCENARIO_BUNDLE_VERSION ||
    !payload?.scenarios ||
    typeof payload.scenarios !== "object"
  ) {
    throw new Error("Invalid Dropbox sync file");
  }
  const scenarios = {};
  Object.entries(payload.scenarios).forEach(([name, scenario]) => {
    if (!name || !scenario?.state || typeof scenario.state !== "object") return;
    scenarios[name] = {
      savedAt: String(scenario.savedAt || new Date().toISOString()),
      state: scenario.state,
      linkedWeightOverrides: sanitizeLinkedWeightOverrides(scenario.linkedWeightOverrides || {}),
    };
  });
  return scenarios;
}

async function downloadDropboxScenarioBundle(session) {
  const config = getSyncConfig();
  const dbx = createDropboxClient(session);
  try {
    const response = await dbx.filesDownload({ path: config.dropboxSyncFilePath });
    const blob =
      response?.result?.fileBlob ||
      response?.fileBlob ||
      response?.result?.fileBinary ||
      response?.fileBinary ||
      null;
    if (!blob) {
      throw new Error("Dropbox download returned no file content");
    }
    const text = typeof blob === "string" ? blob : await blob.text();
    return parseSyncScenarioBundle(text);
  } catch (error) {
    const summary =
      String(error?.error?.error_summary || error?.error_summary || error?.message || "").trim();
    if (summary.includes("not_found")) return {};
    throw error;
  }
}

async function uploadDropboxScenarioBundle(session, scenarios) {
  const config = getSyncConfig();
  const payload = JSON.stringify(buildSyncScenarioBundle(scenarios), null, 2);
  const dbx = createDropboxClient(session);
  await dbx.filesUpload({
    path: config.dropboxSyncFilePath,
    mode: "overwrite",
    contents: payload,
  });
}

async function pullNamedScenariosFromSync(session) {
  const localScenarios = readNamedScenarios();
  const remoteScenarios = await downloadDropboxScenarioBundle(session);
  const mergedScenarios = mergeNamedScenarioMaps(localScenarios, remoteScenarios);
  writeNamedScenarios(mergedScenarios);
  return {
    localCount: Object.keys(localScenarios).length,
    remoteCount: Object.keys(remoteScenarios).length,
    mergedCount: Object.keys(mergedScenarios).length,
    mergedScenarios,
  };
}

async function pushNamedScenariosToSync(session) {
  const localScenarios = readNamedScenarios();
  await uploadDropboxScenarioBundle(session, localScenarios);
  return {
    pushedCount: Object.keys(localScenarios).length,
    localScenarios,
  };
}

function sanitizeLinkedWeightOverrides(raw) {
  const next = {};
  if (!raw || typeof raw !== "object") return next;
  LINKED_START_WEIGHT_FIELD_IDS.forEach((id) => {
    if (raw[id]) next[id] = true;
  });
  return next;
}

function readLinkedWeightOverrides() {
  try {
    const raw = localStorage.getItem(LINKED_WEIGHT_OVERRIDE_STORAGE_KEY);
    if (!raw) return {};
    return sanitizeLinkedWeightOverrides(JSON.parse(raw));
  } catch {
    return {};
  }
}

function writeLinkedWeightOverrides(overrides) {
  try {
    localStorage.setItem(
      LINKED_WEIGHT_OVERRIDE_STORAGE_KEY,
      JSON.stringify(sanitizeLinkedWeightOverrides(overrides)),
    );
  } catch {
    // Ignore storage failures and keep the app usable.
  }
}

function setLinkedWeightOverride(fieldId, overridden) {
  if (!LINKED_START_WEIGHT_FIELD_IDS.includes(fieldId)) return;
  if (overridden) {
    linkedWeightOverrides[fieldId] = true;
  } else {
    delete linkedWeightOverrides[fieldId];
  }
  writeLinkedWeightOverrides(linkedWeightOverrides);
}

function replaceLinkedWeightOverrides(overrides) {
  linkedWeightOverrides = sanitizeLinkedWeightOverrides(overrides);
  writeLinkedWeightOverrides(linkedWeightOverrides);
}

function getTripFuelEstimatedStartWeightT() {
  const gnmEl = document.querySelector("#trip-gnm");
  const windModeEl = document.querySelector("#trip-wind-mode");
  const windEl = document.querySelector("#trip-wind");
  const weightModeEl = document.querySelector("#trip-weight-mode");
  const weightEl = document.querySelector("#trip-weight");
  if (!gnmEl || !windModeEl || !windEl || !weightModeEl || !weightEl) return NaN;
  if (fieldIsBlank(gnmEl.value) || fieldIsBlank(weightEl.value)) return NaN;

  try {
    const gnm = parseNum(gnmEl.value);
    const windMode = String(windModeEl.value || "wind");
    const wind =
      windMode === "time"
        ? solveTripFuelWindFromTime(gnm, parseHoursDecimalMinutes(windEl.value, "Time")).resolvedWindKt
        : parseNumOrDefault(windEl.value, 0);
    const inputWeightT = parseNum(weightEl.value);
    const perfAdjust = getGlobalPerfAdjust();
    if (String(weightModeEl.value || "landing") === "current") {
      return solveTripFuelLandingWeightFromCurrentWeight(gnm, wind, inputWeightT, perfAdjust).currentWeightT;
    }
    const tripCore = calculateTripFuelBase(gnm, wind, inputWeightT, perfAdjust);
    return inputWeightT + tripCore.flightFuelKg / 1000;
  } catch {
    return NaN;
  }
}

function syncLinkedStartWeights(startWeightT = getTripFuelEstimatedStartWeightT()) {
  if (!Number.isFinite(startWeightT) || startWeightT <= 0) return;
  const formatted = formatInputNumber(startWeightT, 1);
  LINKED_START_WEIGHT_FIELD_IDS.forEach((fieldId) => {
    const el = document.querySelector(`#${fieldId}`);
    if (!el) return;
    if (linkedWeightOverrides[fieldId]) return;
    el.value = formatted;
  });
}

function bindLinkedStartWeightFields() {
  LINKED_START_WEIGHT_FIELD_IDS.forEach((fieldId) => {
    const el = document.querySelector(`#${fieldId}`);
    if (!el) return;

    el.addEventListener("input", () => {
      if (!fieldIsBlank(el.value)) {
        setLinkedWeightOverride(fieldId, true);
      }
    });

    el.addEventListener("change", () => {
      const cleared = fieldIsBlank(el.value);
      setLinkedWeightOverride(fieldId, !cleared);
      if (cleared) {
        syncLinkedStartWeights();
        const form = el.closest("form");
        if (form) {
          form.dispatchEvent(new Event("submit"));
        }
      }
    });
  });
}

function setModeInputState(modeEl, valueEl) {
  const mode = String(modeEl.value || "kg");
  const isAuto = mode === "auto";
  valueEl.disabled = isAuto;
  valueEl.classList.toggle("auto-derived", isAuto);
  valueEl.placeholder = isAuto ? "Auto" : mode;
  if (isAuto) {
    valueEl.value = "";
  }
}

function bindModePills(form, modeEl) {
  const pillGroup = form.querySelector(`[data-mode-for="${modeEl.id}"]`);
  if (!pillGroup) return null;
  const buttons = Array.from(pillGroup.querySelectorAll("button[data-mode-value]"));
  const syncButtons = () => {
    const currentMode = String(modeEl.value || "");
    buttons.forEach((button) => {
      const isActive = button.dataset.modeValue === currentMode;
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
  };
  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      const nextMode = String(button.dataset.modeValue || "");
      if (!nextMode || nextMode === modeEl.value) return;
      modeEl.value = nextMode;
      modeEl.dispatchEvent(new Event("change", { bubbles: true }));
    });
  });
  syncButtons();
  return syncButtons;
}

function getHoldFuelFlowKgHr(weightT, altitudeFt, perfAdjust) {
  return lookupHoldMetric(weightT, altitudeFt, "ffEng") * (1 + perfAdjust) * 2;
}

function resolveKgInput(label, el) {
  const value = parseNumOrDefault(el.value, 0);
  if (!Number.isFinite(value)) {
    throw new Error(`${label} is invalid`);
  }
  if (value < 0) {
    throw new Error(`${label} must be >= 0`);
  }
  if (fieldIsBlank(el.value)) {
    el.value = formatInputNumber(0, 0);
  }
  return value;
}

function resolveMixedEntryKg({ label, modeEl, valueEl, minuteFuelFlowKgHr, autoKg = NaN }) {
  const mode = String(modeEl.value || "kg");
  if (mode === "auto") {
    return autoKg;
  }

  const inputValue = parseNumOrDefault(valueEl.value, 0);
  if (!Number.isFinite(inputValue)) {
    throw new Error(`${label} is invalid`);
  }
  if (inputValue < 0) {
    throw new Error(`${label} must be >= 0`);
  }
  if (fieldIsBlank(valueEl.value)) {
    valueEl.value = formatInputNumber(0, 0);
  }
  return mode === "min" ? minuteFuelFlowKgHr * (inputValue / 60) : inputValue;
}

function installInputStatePersistence() {
  const onFieldEvent = (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (!target.matches("input[id], select[id], textarea[id]")) return;
    persistInputState();
  };

  document.addEventListener("input", onFieldEvent, true);
  document.addEventListener("change", onFieldEvent, true);
  document.addEventListener(
    "submit",
    () => {
      setTimeout(persistInputState, 0);
    },
    true,
  );
}

function isClickToClearInput(el) {
  if (!(el instanceof HTMLInputElement)) return false;
  if (el.disabled || el.readOnly) return false;
  const type = (el.type || "").toLowerCase();
  return ![
    "checkbox",
    "radio",
    "button",
    "submit",
    "reset",
    "file",
    "hidden",
    "range",
    "color",
  ].includes(type);
}

function installClickToClearInputs() {
  const clickPending = new WeakSet();

  const markClickPending = (event) => {
    const target = event.target;
    if (isClickToClearInput(target)) {
      clickPending.add(target);
    }
  };

  document.addEventListener("pointerdown", markClickPending, true);
  document.addEventListener("mousedown", markClickPending, true);
  document.addEventListener("touchstart", markClickPending, true);

  document.addEventListener(
    "focusin",
    (event) => {
      const target = event.target;
      if (!isClickToClearInput(target)) return;
      const focusedFromInput = isClickToClearInput(event.relatedTarget);
      const focusedByTap = clickPending.has(target);
      if (!focusedByTap && !focusedFromInput) return;
      if (focusedByTap) clickPending.delete(target);
      if (target.value === "") return;
      target.value = "";
      persistInputState();
    },
    true,
  );
}

function installCollapsiblePanels() {
  const collapseState = (() => {
    try {
      const raw = localStorage.getItem(PANEL_COLLAPSE_STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  })();

  const persistCollapseState = () => {
    try {
      localStorage.setItem(PANEL_COLLAPSE_STORAGE_KEY, JSON.stringify(collapseState));
    } catch {
      // Ignore storage failures.
    }
  };

  const updatePanelState = (panel, toggle, panelId, open) => {
    panel.classList.toggle("panel-collapsed", !open);
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    toggle.setAttribute("aria-label", open ? "Collapse module" : "Expand module");
    toggle.textContent = open ? "−" : "+";
    collapseState[panelId] = open;
  };

  Array.from(document.querySelectorAll("section.panel")).forEach((panel, index) => {
    const heading = panel.querySelector(":scope > h2");
    if (!heading) return;
    if (heading.querySelector(".panel-toggle")) return;

    const panelId = panel.id || heading.id || `module-${index + 1}`;
    const isOpen = panelId in collapseState ? !!collapseState[panelId] : true;

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "panel-toggle";

    updatePanelState(panel, toggle, panelId, isOpen);
    toggle.addEventListener("click", () => {
      const nextOpen = panel.classList.contains("panel-collapsed");
      updatePanelState(panel, toggle, panelId, nextOpen);
      persistCollapseState();
    });

    heading.appendChild(toggle);
  });
}

function bindTripFuel() {
  const form = document.querySelector("#trip-fuel-form");
  const out = document.querySelector("#trip-fuel-out");
  if (!form || !out) return;

  const gnmEl = document.querySelector("#trip-gnm");
  const windModeEl = document.querySelector("#trip-wind-mode");
  const windEl = document.querySelector("#trip-wind");
  const weightModeEl = document.querySelector("#trip-weight-mode");
  const weightEl = document.querySelector("#trip-weight");
  const taxiEl = document.querySelector("#trip-taxi");
  const plannedAddEl = document.querySelector("#trip-planned-add");
  const appEl = document.querySelector("#trip-app");
  const arrivalFuelModeEl = document.querySelector("#trip-arrival-fuel-mode");
  const arrivalFuelEl = document.querySelector("#trip-arrival-fuel");
  const wxHoldModeEl = document.querySelector("#trip-wx-hold-mode");
  const wxHoldEl = document.querySelector("#trip-wx-hold");
  const divnNdaModeEl = document.querySelector("#trip-divn-nda-mode");
  const divnNdaEl = document.querySelector("#trip-divn-nda");
  const divHoldModeEl = document.querySelector("#trip-div-hold-mode");
  const divHoldEl = document.querySelector("#trip-div-hold");
  const contModeEl = document.querySelector("#trip-cont-mode");
  const contEl = document.querySelector("#trip-cont");
  const frfModeEl = document.querySelector("#trip-frf-mode");
  const frfEl = document.querySelector("#trip-frf");
  const reqAdditionalModeEl = document.querySelector("#trip-req-additional-mode");
  const reqAdditionalEl = document.querySelector("#trip-req-additional");
  let suppressAutoSubmit = false;

  if (
    !gnmEl ||
    !windModeEl ||
    !windEl ||
    !weightModeEl ||
    !weightEl ||
    !taxiEl ||
    !plannedAddEl ||
    !appEl ||
    !arrivalFuelModeEl ||
    !arrivalFuelEl ||
    !wxHoldModeEl ||
    !wxHoldEl ||
    !divnNdaModeEl ||
    !divnNdaEl ||
    !divHoldModeEl ||
    !divHoldEl ||
    !contModeEl ||
    !contEl ||
    !frfModeEl ||
    !frfEl ||
    !reqAdditionalModeEl ||
    !reqAdditionalEl
  ) {
    return;
  }

  const autoRecalculate = (sourceEl = null) => {
    if (suppressAutoSubmit || shouldDeferLiveSubmitForInput(sourceEl)) return;
    form.dispatchEvent(new Event("submit"));
  };

  const syncModeUi = () => {
    setModeInputState(contModeEl, contEl);
    setModeInputState(frfModeEl, frfEl);
    syncModeButtons.forEach((syncButtons) => syncButtons());
    const windMode = String(windModeEl.value || "wind");
    const windLabelEl = document.querySelector("#trip-wind-label");
    if (windLabelEl) {
      windLabelEl.textContent = windMode === "time" ? "Time (H:MM.m)" : "Wind +/-";
    }
    windEl.type = windMode === "time" ? "text" : "number";
    windEl.inputMode = windMode === "time" ? "text" : "decimal";
    windEl.placeholder = windMode === "time" ? "e.g. 1:14.9" : "";
    if (windMode === "wind") {
      windEl.step = "1";
    } else {
      windEl.removeAttribute("step");
    }
    const isCurrentWeightMode = String(weightModeEl.value || "landing") === "current";
    const weightLabelEl = document.querySelector("#trip-weight-label");
    if (weightLabelEl) {
      weightLabelEl.textContent = isCurrentWeightMode ? "T/O or G/A Wt (t)" : "Landing Weight (t)";
    }
  };

  const modeEls = [
    windModeEl,
    weightModeEl,
    arrivalFuelModeEl,
    wxHoldModeEl,
    divnNdaModeEl,
    divHoldModeEl,
    contModeEl,
    frfModeEl,
    reqAdditionalModeEl,
  ];
  const syncModeButtons = modeEls.map((modeEl) => bindModePills(form, modeEl)).filter(Boolean);

  modeEls.forEach((modeEl) => {
    modeEl.addEventListener("change", () => {
      syncModeUi();
      autoRecalculate();
    });
  });

  [
    gnmEl,
    windEl,
    weightEl,
    taxiEl,
    plannedAddEl,
    appEl,
    arrivalFuelEl,
    wxHoldEl,
    divnNdaEl,
    divHoldEl,
    contEl,
    frfEl,
    reqAdditionalEl,
  ].forEach((el) => {
    el.addEventListener("input", () => autoRecalculate(el));
    el.addEventListener("change", () => autoRecalculate(el));
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (
      missingFieldsBanner(out, [
        fieldIsBlank(gnmEl.value) ? "Ground Distance (GNM)" : "",
        fieldIsBlank(weightEl.value)
          ? String(weightModeEl.value || "landing") === "current"
            ? "T/O or G/A Wt"
            : "Landing Weight"
          : "",
        String(windModeEl.value || "wind") === "time" && fieldIsBlank(windEl.value) ? "Time" : "",
      ])
    ) {
      return;
    }
    try {
      suppressAutoSubmit = true;
      const gnm = parseNum(gnmEl.value);
      const windMode = String(windModeEl.value || "wind");
      const timeInputMin = windMode === "time" ? parseHoursDecimalMinutes(windEl.value, "Time") : NaN;
      const windResolution =
        windMode === "time"
          ? solveTripFuelWindFromTime(gnm, timeInputMin)
          : { resolvedWindKt: parseNumOrDefault(windEl.value, 0), timeBase: null };
      const wind = windResolution.resolvedWindKt;
      const inputWeightT = parseNum(weightEl.value);
      const weightMode = String(weightModeEl.value || "landing");
      const perfAdjust = getGlobalPerfAdjust();
      const tripWeightContext =
        weightMode === "current"
          ? solveTripFuelLandingWeightFromCurrentWeight(gnm, wind, inputWeightT, perfAdjust)
          : {
              currentWeightT: NaN,
              solvedLandingWeightT: inputWeightT,
              impliedFlightFuelBurnKg: NaN,
              core: null,
            };
      const landingWeightT = tripWeightContext.solvedLandingWeightT;

      const taxiKg = resolveKgInput("Taxi Fuel", taxiEl);
      const plannedAddKg = resolveKgInput("Planned Add", plannedAddEl);
      const appKg = resolveKgInput("Approach Fuel", appEl);

      const frfFuelFlowKgHr = getHoldFuelFlowKgHr(landingWeightT, FRF_HOLD_ALTITUDE_FT, perfAdjust);
      const hold20000FuelFlowKgHr = getHoldFuelFlowKgHr(landingWeightT, ADDITIONAL_HOLD_ALTITUDE_FT, perfAdjust);
      const autoBase = calculateTripFuelEnhanced({
        gnm,
        wind,
        weight: landingWeightT,
        perfAdjust,
        taxiKg,
        plannedAddKg,
        appKg,
      });
      const arrivalFuelKg = resolveMixedEntryKg({
        label: "Arrival Fuel",
        modeEl: arrivalFuelModeEl,
        valueEl: arrivalFuelEl,
        minuteFuelFlowKgHr: frfFuelFlowKgHr,
      });

      const wxHoldKg = resolveMixedEntryKg({
        label: "Wx Hold",
        modeEl: wxHoldModeEl,
        valueEl: wxHoldEl,
        minuteFuelFlowKgHr: hold20000FuelFlowKgHr,
      });
      const divnNdaKg = resolveMixedEntryKg({
        label: "Divn/NDA",
        modeEl: divnNdaModeEl,
        valueEl: divnNdaEl,
        minuteFuelFlowKgHr: frfFuelFlowKgHr,
      });
      const divHoldKg = resolveMixedEntryKg({
        label: "Div Hold",
        modeEl: divHoldModeEl,
        valueEl: divHoldEl,
        minuteFuelFlowKgHr: hold20000FuelFlowKgHr,
      });
      const contingencyKg = resolveMixedEntryKg({
        label: "Cont",
        modeEl: contModeEl,
        valueEl: contEl,
        minuteFuelFlowKgHr: NaN,
        autoKg: autoBase.contingencyAutoKg,
      });
      const frfKg = resolveMixedEntryKg({
        label: "FRF",
        modeEl: frfModeEl,
        valueEl: frfEl,
        minuteFuelFlowKgHr: frfFuelFlowKgHr,
        autoKg: autoBase.frfAutoKg,
      });
      const reqAdditionalKg = resolveMixedEntryKg({
        label: "Rqd Additional",
        modeEl: reqAdditionalModeEl,
        valueEl: reqAdditionalEl,
        minuteFuelFlowKgHr: hold20000FuelFlowKgHr,
      });

      const result = calculateTripFuelEnhanced({
        gnm,
        wind,
        weight: landingWeightT,
        perfAdjust,
        taxiKg,
        appKg,
        arrivalFuelKg,
        wxHoldKg,
        divnNdaKg,
        divHoldKg,
        contingencyKg,
        frfKg,
        reqAdditionalKg,
        plannedAddKg,
      });
      syncLinkedStartWeights(weightMode === "current" ? tripWeightContext.currentWeightT : landingWeightT + result.flightFuelKg / 1000);

      if (windMode === "wind" && fieldIsBlank(windEl.value)) {
        windEl.value = formatInputNumber(0, 0);
      } else if (windMode === "time") {
        windEl.value = formatHoursDecimalMinutes(timeInputMin);
      }

      const rows = [
        ["Air Distance (ANM)", `${format(result.anmDisplay, 0)} nm`],
        ...(windMode === "time" ? [["Resolved Wind", `${format(wind, 1)} kt`]] : []),
        ...(weightMode === "current"
          ? [
              ["Current Weight", `${format(tripWeightContext.currentWeightT, 1)} t`],
              ["Solved Landing Weight", `${format(tripWeightContext.solvedLandingWeightT, 1)} t`],
              ["__spacer__", ""],
            ]
          : []),
        ["Flight Fuel", `${format(result.flightFuelKg, 0)} kg`],
        ["Approach Fuel", `${format(result.appKg, 0)} kg`],
        ["Arrival Fuel", `${format(result.arrivalFuelKg, 0)} kg`],
        ["Wx/TRF Hold", `${format(result.wxHoldKg, 0)} kg`],
        ["Divn/NDA", `${format(result.divnNdaKg, 0)} kg`],
        ["Div Hold", `${format(result.divHoldKg, 0)} kg`],
        ["Cont", `${format(result.contingencyKg, 0)} kg`],
        ["FRF", `${format(result.frfKg, 0)} kg`],
        ["Rqd Additional", `${format(result.reqAdditionalKg, 0)} kg`],
        ["Taxi Fuel", `${format(result.taxiKg, 0)} kg`],
        ["Planned Add", `${format(result.plannedAddKg, 0)} kg`],
        ["Total Fuel Required", `${format(result.totalFuelKg, 0)} kg`],
        ["Time", formatMinutes(result.timeMinutes)],
      ];

      if (result.anmDisplay < 800 && Number.isFinite(result.suggestedAltFt)) {
        rows.splice(rows.length - 1, 0, ["Suggested Alt", `${format(result.suggestedAltFt, 0)} ft`]);
      }

      if (result.longGuidance) {
        const guidance = result.longGuidance;
        const climbPlanText = guidance.stepClimbs.length
          ? guidance.stepClimbs
              .map((step) => {
                const etaText = Number.isFinite(step.etaMin) ? ` (${formatMinutes(step.etaMin)})` : "";
                return `FL${format(step.altitudeFt / 100, 0)} @ ${format(step.triggerWeightT, 1)} t${etaText}`;
              })
              .join(" -> ")
          : "No step climb trigger within trip burn";

        rows.push(
          ["__spacer__", ""],
          ["__section__", "Estimated Long-Sector Altitude (ISA+10)"],
          ["Estimated Start Weight (Landing + Flight Fuel)", `${format(guidance.startWeightEstimatedT, 1)} t`],
          [
            "Estimated Optimum Altitude (Start / Landing)",
            `${format(guidance.startOptimumAltFt, 0)} / ${format(guidance.landingOptimumAltFt, 0)} ft (FL${format(guidance.startOptimumAltFt / 100, 0)} / FL${format(guidance.landingOptimumAltFt / 100, 0)})`,
          ],
          [
            "Recommended Cruise Band (Start Optimum \u00b12000)",
            `${format(guidance.startBandLowFt, 0)}-${format(guidance.startBandHighFt, 0)} ft`,
          ],
          ["Estimated Step Climb Triggers", climbPlanText],
        );

        if (guidance.clampedWeights) {
          rows.push([
            "__warning__",
            "Altitude estimate uses clamped weight at LRC altitude-table limits",
          ]);
        }
      }

      renderRows(out, rows);
    } catch (error) {
      renderError(out, error.message);
    } finally {
      suppressAutoSubmit = false;
    }
  });

  syncModeUi();
  autoRecalculate();
}

function bindDpaCalculator() {
  const form = document.querySelector("#dpa-form");
  const out = document.querySelector("#dpa-out");
  if (!form || !out) return;

  const weightEl = document.querySelector("#dpa-weight");
  const ffEl = document.querySelector("#dpa-ff");
  const appEl = document.querySelector("#dpa-app");
  const arrivalEl = document.querySelector("#dpa-arrival");
  const holdingWxModeEl = document.querySelector("#dpa-holding-wx-mode");
  const holdingWxEl = document.querySelector("#dpa-holding-wx");
  const holdingSngRwyModeEl = document.querySelector("#dpa-holding-sng-rwy-mode");
  const holdingSngRwyEl = document.querySelector("#dpa-holding-sng-rwy");
  const divnNdaModeEl = document.querySelector("#dpa-divn-nda-mode");
  const divnNdaEl = document.querySelector("#dpa-divn-nda");
  const diversionHoldModeEl = document.querySelector("#dpa-diversion-hold-mode");
  const diversionHoldEl = document.querySelector("#dpa-diversion-hold");
  const frfModeEl = document.querySelector("#dpa-frf-mode");
  const frfEl = document.querySelector("#dpa-frf");
  const reqAdditionalModeEl = document.querySelector("#dpa-req-additional-mode");
  const reqAdditionalEl = document.querySelector("#dpa-req-additional");
  let suppressAutoSubmit = false;

  if (
    !weightEl ||
    !ffEl ||
    !appEl ||
    !arrivalEl ||
    !holdingWxModeEl ||
    !holdingWxEl ||
    !holdingSngRwyModeEl ||
    !holdingSngRwyEl ||
    !divnNdaModeEl ||
    !divnNdaEl ||
    !diversionHoldModeEl ||
    !diversionHoldEl ||
    !frfModeEl ||
    !frfEl ||
    !reqAdditionalModeEl ||
    !reqAdditionalEl
  ) {
    return;
  }

  const autoRecalculate = (sourceEl = null) => {
    if (suppressAutoSubmit || shouldDeferLiveSubmitForInput(sourceEl)) return;
    form.dispatchEvent(new Event("submit"));
  };

  const syncModeUi = () => {
    setModeInputState(frfModeEl, frfEl);
    syncModeButtons.forEach((syncButtons) => syncButtons());
  };

  const modeEls = [
    holdingWxModeEl,
    holdingSngRwyModeEl,
    divnNdaModeEl,
    diversionHoldModeEl,
    frfModeEl,
    reqAdditionalModeEl,
  ];
  const syncModeButtons = modeEls.map((modeEl) => bindModePills(form, modeEl)).filter(Boolean);

  modeEls.forEach((modeEl) => {
    modeEl.addEventListener("change", () => {
      syncModeUi();
      autoRecalculate();
    });
  });

  [
    weightEl,
    ffEl,
    appEl,
    arrivalEl,
    holdingWxEl,
    holdingSngRwyEl,
    divnNdaEl,
    diversionHoldEl,
    frfEl,
    reqAdditionalEl,
  ].forEach((el) => {
    el.addEventListener("input", () => autoRecalculate(el));
    el.addEventListener("change", () => autoRecalculate(el));
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    const weightRequired =
      String(holdingWxModeEl.value) === "min" ||
      String(holdingSngRwyModeEl.value) === "min" ||
      String(divnNdaModeEl.value) === "min" ||
      String(diversionHoldModeEl.value) === "min" ||
      String(frfModeEl.value) === "auto" ||
      String(reqAdditionalModeEl.value) === "min";

    if (
      missingFieldsBanner(out, [weightRequired && fieldIsBlank(weightEl.value) ? "Weight" : ""])
    ) {
      return;
    }

    try {
      suppressAutoSubmit = true;
      const perfAdjust = getGlobalPerfAdjust();
      const weightT = fieldIsBlank(weightEl.value) ? NaN : parseNum(weightEl.value);
      if (weightRequired) {
        if (!Number.isFinite(weightT) || weightT <= 0) {
          throw new Error("Weight must be > 0 t");
        }
      }

      const ffKg = resolveKgInput("FF", ffEl);
      const appKg = resolveKgInput("App", appEl);

      const frfFuelFlowKgHr = weightRequired ? getHoldFuelFlowKgHr(weightT, FRF_HOLD_ALTITUDE_FT, perfAdjust) : NaN;
      const hold20000FuelFlowKgHr = weightRequired
        ? getHoldFuelFlowKgHr(weightT, ADDITIONAL_HOLD_ALTITUDE_FT, perfAdjust)
        : NaN;
      const frfAutoKg = weightRequired ? frfFuelFlowKgHr * 0.5 : 0;

      if (!fieldIsBlank(weightEl.value) && Number.isFinite(weightT)) {
        weightEl.value = formatInputNumber(weightT, 1);
      }

      const arrivalKg = resolveKgInput("Arrival", arrivalEl);
      const holdingWxKg = resolveMixedEntryKg({
        label: "Wx/TRF Hold",
        modeEl: holdingWxModeEl,
        valueEl: holdingWxEl,
        minuteFuelFlowKgHr: hold20000FuelFlowKgHr,
      });
      const holdingSngRwyKg = resolveMixedEntryKg({
        label: "SNG RWY Hold",
        modeEl: holdingSngRwyModeEl,
        valueEl: holdingSngRwyEl,
        minuteFuelFlowKgHr: frfFuelFlowKgHr,
      });
      const divnNdaKg = resolveMixedEntryKg({
        label: "Divn/NDA",
        modeEl: divnNdaModeEl,
        valueEl: divnNdaEl,
        minuteFuelFlowKgHr: frfFuelFlowKgHr,
      });
      const diversionHoldKg = resolveMixedEntryKg({
        label: "Div Hold",
        modeEl: diversionHoldModeEl,
        valueEl: diversionHoldEl,
        minuteFuelFlowKgHr: hold20000FuelFlowKgHr,
      });
      const contKg = clamp(ffKg * 0.05, MIN_CONTINGENCY_KG, MAX_CONTINGENCY_KG);
      const frfKg = resolveMixedEntryKg({
        label: "FRF",
        modeEl: frfModeEl,
        valueEl: frfEl,
        minuteFuelFlowKgHr: frfFuelFlowKgHr,
        autoKg: frfAutoKg,
      });
      const reqAdditionalKg = resolveMixedEntryKg({
        label: "Rqd Additional/Other Hold",
        modeEl: reqAdditionalModeEl,
        valueEl: reqAdditionalEl,
        minuteFuelFlowKgHr: hold20000FuelFlowKgHr,
      });

      const rows = [
        ["FF", `${format(ffKg, 0)} kg`],
        ["App", `${format(appKg, 0)} kg`],
        ["Arrival", `${format(arrivalKg, 0)} kg`],
        ["Wx/TRF Hold", `${format(holdingWxKg, 0)} kg`],
        ["SNG RWY Hold", `${format(holdingSngRwyKg, 0)} kg`],
        ["Divn/NDA", `${format(divnNdaKg, 0)} kg`],
        ["Div Hold", `${format(diversionHoldKg, 0)} kg`],
        ["Cont", `${format(contKg, 0)} kg`],
        ["FRF", `${format(frfKg, 0)} kg`],
        ["Rqd Additional/Other Hold", `${format(reqAdditionalKg, 0)} kg`],
        [
          "DPA Total",
          `${format(
            ffKg +
              appKg +
              arrivalKg +
              holdingWxKg +
              holdingSngRwyKg +
              divnNdaKg +
              diversionHoldKg +
              contKg +
              frfKg +
              reqAdditionalKg,
            0,
          )} kg`,
        ],
      ];
      renderRows(out, rows);
    } catch (error) {
      renderError(out, error.message);
    } finally {
      suppressAutoSubmit = false;
    }
  });

  syncModeUi();
  autoRecalculate();
}

function bindLrcAltitudeLimits() {
  const form = document.querySelector("#lrc-altitude-form");
  const out = document.querySelector("#lrc-altitude-out");
  if (!form || !out) return;

  const isaDevEl = document.querySelector("#lrc-alt-isa-dev");
  const tempEl = document.querySelector("#lrc-alt-temp");
  const currentAltEl = document.querySelector("#lrc-alt-current");
  const targetAltEl = document.querySelector("#lrc-alt-target");
  let lastTempSource = "isa-dev";
  isaDevEl.addEventListener("input", () => {
    lastTempSource = "isa-dev";
  });
  tempEl.addEventListener("input", () => {
    lastTempSource = "temp";
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const targetAltRaw = String(targetAltEl.value ?? "").trim();
    const hasTargetOptimum = targetAltRaw !== "";
    if (
      missingFieldsBanner(out, [
        fieldIsBlank(document.querySelector("#lrc-alt-weight").value) ? "Weight" : "",
        hasTargetOptimum && fieldIsBlank(currentAltEl.value) ? "Current Alt/FL" : "",
      ])
    ) {
      return;
    }
    if (fieldIsBlank(isaDevEl.value) && fieldIsBlank(tempEl.value)) {
      renderValidation(out, "Missing required input: ISA Deviation or Temperature");
      return;
    }
    try {
      const weightT = parseNum(document.querySelector("#lrc-alt-weight").value);
      const currentAltRaw = String(currentAltEl.value ?? "").trim();
      const hasCurrentAlt = currentAltRaw !== "";
      const currentAltInput = hasCurrentAlt ? parseAltOrFlInput(currentAltRaw, "Current Alt/FL") : null;
      const targetAltInput = hasTargetOptimum
        ? parseAltOrFlInput(targetAltRaw, "New Optimum Altitude")
        : null;
      const currentFl = currentAltInput ? currentAltInput.flightLevel : 400;
      const currentAltitudeFt = currentAltInput ? currentAltInput.altitudeFt : 40000;
      const targetOptimumAltFt = targetAltInput ? targetAltInput.altitudeFt : NaN;
      const perfAdjust = getGlobalPerfAdjust();
      const temperaturePair = resolveTemperaturePair({
        isaDeviationRaw: isaDevEl.value,
        temperatureRaw: tempEl.value,
        lastSource: lastTempSource,
        pressureAltitudeFt: currentAltitudeFt,
        label: "LRC Altitude Limits temperature",
      });
      const isaDeviationCInput = temperaturePair.isaDeviationC;

      const limits = evaluateLrcAltitudeLimits(weightT, isaDeviationCInput);
      const driftdownRanges = getDriftdownRanges();
      const eoWeightUsedT = clamp(weightT, driftdownRanges.minWeightT, driftdownRanges.maxWeightT);
      const seLrcCapability = singleEngineLrcCapabilityAltitude(eoWeightUsedT, isaDeviationCInput);
      const driftLevelOff = evaluateDriftdownLevelOff(eoWeightUsedT, isaDeviationCInput);
      const eoWarnings = [];
      if (eoWeightUsedT !== weightT) {
        eoWarnings.push(`Engine inop weight clamped to ${format(eoWeightUsedT, 1)} t`);
      }

      if (currentAltInput && !currentAltInput.isThreeDigitFl) {
        currentAltEl.value = formatInputNumber(currentFl, 0);
      }
      if (targetAltInput && targetAltInput.isThreeDigitFl) {
        targetAltEl.value = formatInputNumber(targetOptimumAltFt, 0);
      }
      isaDevEl.value = formatInputNumber(temperaturePair.isaDeviationC, 1);
      tempEl.value = formatInputNumber(temperaturePair.temperatureC, 1);
      applyTemperatureFieldStyle({
        sourceUsed: temperaturePair.sourceUsed,
        isaDeviationEl: isaDevEl,
        temperatureEl: tempEl,
      });
      lastTempSource = temperaturePair.sourceUsed;

      const rows = [
        ["__section__", "Baseline Limits"],
        ["Optimum Altitude", `${format(limits.optimumAltFt, 0)} ft (FL${format(limits.optimumAltFt / 100, 0)})`],
        [
          "LRC Maximum Altitude / Thrust Limited",
          `${format(limits.maxAltFt, 0)} ft (FL${format(limits.maxAltFt / 100, 0)}) / ${limits.thrustLimited ? "Yes" : "No"}`,
        ],
        [
          "Engine Inoperative Maximum Altitude - SE LRC Altitude Capability (100 fpm)",
          `${format(seLrcCapability.altitudeFt, 0)} ft (FL${format(seLrcCapability.altitudeFt / 100, 0)})`,
        ],
        [
          "Driftdown Altitude",
          `${format(driftLevelOff.levelOffAltFt, 0)} ft (FL${format(driftLevelOff.levelOffAltFt / 100, 0)})`,
        ],
      ];

      if (hasTargetOptimum) {
        const targetWeightT = weightForNominatedOptimumAltitude(targetOptimumAltFt, limits.isaDeviationCUsed);
        const cruiseWeightAxis = (LRC_CRUISE_TABLE?.records || [])
          .map((record) => record.weightT)
          .filter(Number.isFinite)
          .sort((a, b) => a - b);
        const minCruiseWeightT = cruiseWeightAxis[0];
        const maxCruiseWeightT = cruiseWeightAxis[cruiseWeightAxis.length - 1];
        if (
          !Number.isFinite(minCruiseWeightT) ||
          !Number.isFinite(maxCruiseWeightT) ||
          weightT < minCruiseWeightT ||
          weightT > maxCruiseWeightT
        ) {
          throw new Error(
            `Current weight out of range for LRC fuel-flow lookup (${format(minCruiseWeightT, 1)}-${format(maxCruiseWeightT, 1)} t)`,
          );
        }

        const burnKgToTarget = Math.max(0, (weightT - targetWeightT) * 1000);
        let cruiseFuelFlowText = "Unavailable for this altitude";
        let timeText = burnKgToTarget > 0 ? "Unavailable for this altitude" : "Already reached";
        let climbPlanText = burnKgToTarget > 0 ? "Unavailable for this altitude" : "No climb required";
        try {
          const stepClimb = simulateStepClimbFuelToTargetWeight({
            startWeightT: weightT,
            targetWeightT,
            startFlightLevel: currentFl,
            targetOptimumAltFt,
            isaDeviationCUsed: limits.isaDeviationCUsed,
            perfAdjust,
          });
          cruiseFuelFlowText =
            burnKgToTarget > 0
              ? `${format(stepClimb.averageFuelFlowKgHr, 0)} kg/h avg (start ${format(stepClimb.initialFuelFlowKgHr, 0)} @ FL${format(currentFl, 0)})`
              : `${format(stepClimb.initialFuelFlowKgHr, 0)} kg/h @ FL${format(currentFl, 0)}`;
          if (burnKgToTarget > 0) {
            timeText = `${format(stepClimb.timeMinutes, 1)} min (${formatMinutes(stepClimb.timeMinutes)})`;
            climbPlanText = stepClimb.stepClimbs.length
              ? stepClimb.stepClimbs
                  .map((step) => `FL${format(step.altitudeFt / 100, 0)} @ ${format(step.atWeightT, 1)} t`)
                  .join(" -> ")
              : "No step climb before target weight";
          }
        } catch (error) {
          if (!String(error?.message || "").startsWith("LRC FL out of range")) {
            throw error;
          }
        }

        rows.push(
          ["__spacer__", ""],
          ["__section__", "New Optimum Altitude (optional)"],
          [
            "New Optimum Altitude",
            `${format(targetOptimumAltFt, 0)} ft (FL${format(targetOptimumAltFt / 100, 0)})`,
          ],
          ["Equivalent Weight", `${format(targetWeightT, 1)} t`],
          ["Current LRC Fuel Flow", cruiseFuelFlowText],
          ["Step Climb Plan", climbPlanText],
          ["Fuel to Burn to Equivalent Weight", `${format(burnKgToTarget, 0)} kg`],
          ["Time to Reach New Optimum Altitude", timeText],
          ["__spacer__", ""],
        );
      }

      if (limits.clampedToIsa10) {
        rows.push([
          "__warning__",
          `Maximum altitude note: ISA deviation floored to ISA+${format(limits.isaDeviationCUsed, 0)} (input ISA+${format(limits.isaDeviationCInput, 0)})`,
        ]);
      }
      if (eoWarnings.length) {
        rows.push(["__warning__", `Input warning: ${eoWarnings.join(" | ")}`]);
      }

      renderRows(out, rows);
    } catch (error) {
      renderError(out, error.message);
    }
  });

  applyTemperatureFieldStyle({
    sourceUsed: lastTempSource,
    isaDeviationEl: isaDevEl,
    temperatureEl: tempEl,
  });
  form.dispatchEvent(new Event("submit"));
}

function bindEngineOut() {
  const driftForm = document.querySelector("#engine-out-drift-form");
  const driftOut = document.querySelector("#engine-out-drift-out");
  const diversionForm = document.querySelector("#engine-out-diversion-form");
  const diversionOut = document.querySelector("#engine-out-diversion-out");

  if (driftForm && driftOut) {
    const weightEl = document.querySelector("#eo-weight");
    const isaDevEl = document.querySelector("#eo-isa-dev");
    const driftGnmEl = document.querySelector("#eo-drift-gnm");
    const driftWindEl = document.querySelector("#eo-drift-wind");
    const autoRecalculate = (sourceEl = null) => {
      if (shouldDeferLiveSubmitForInput(sourceEl)) return;
      driftForm.dispatchEvent(new Event("submit"));
    };

    [weightEl, isaDevEl, driftGnmEl, driftWindEl].forEach((el) => {
      el.addEventListener("input", () => autoRecalculate(el));
      el.addEventListener("change", () => autoRecalculate(el));
    });

    driftForm.addEventListener("submit", (event) => {
      event.preventDefault();
      if (
        missingFieldsBanner(driftOut, [
          fieldIsBlank(weightEl.value) ? "Start Weight" : "",
          fieldIsBlank(isaDevEl.value) ? "ISA Deviation" : "",
          fieldIsBlank(driftGnmEl.value) ? "Engine out Cruise Distance" : "",
        ])
      ) {
        return;
      }

      try {
        const weightInputT = parseNum(weightEl.value);
        const isaDeviationCInput = parseNum(isaDevEl.value);
        const driftGnmInput = parseNum(driftGnmEl.value);
        const driftWindInputKt = parseNumOrDefault(driftWindEl.value, 0);
        const perfAdjust = getGlobalPerfAdjust();

        if (!Number.isFinite(weightInputT) || weightInputT <= 0) {
          throw new Error("Start weight must be > 0 t");
        }
        if (!Number.isFinite(isaDeviationCInput)) {
          throw new Error("ISA deviation is invalid");
        }
        if (!Number.isFinite(driftGnmInput)) {
          throw new Error("Engine out Cruise Distance is invalid");
        }
        if (fieldIsBlank(driftWindEl.value)) driftWindEl.value = formatInputNumber(0, 0);

        const driftdownRanges = getDriftdownRanges();
        const weightUsedT = clamp(weightInputT, driftdownRanges.minWeightT, driftdownRanges.maxWeightT);
        const driftGnmUsed = clamp(driftGnmInput, driftdownRanges.minGnm, driftdownRanges.maxGnm);
        const driftWindUsedKt = clamp(driftWindInputKt, driftdownRanges.minWindKt, driftdownRanges.maxWindKt);

        const warnings = [];
        if (weightUsedT !== weightInputT) {
          warnings.push(`Start weight clamped to ${format(weightUsedT, 1)} t`);
        }
        if (driftGnmUsed !== driftGnmInput) {
          warnings.push(`Engine out Cruise Distance clamped to ${format(driftGnmUsed, 0)} NM`);
        }
        if (driftWindUsedKt !== driftWindInputKt) {
          warnings.push(`Driftdown wind clamped to ${format(driftWindUsedKt, 0)} kt`);
        }

        const driftLevelOff = evaluateDriftdownLevelOff(weightUsedT, isaDeviationCInput);
        const driftAnm = driftdownAnmFromGnm(driftGnmUsed, driftWindUsedKt);
        const driftFuelTime = driftdownFuelAndTime(driftAnm, weightUsedT, perfAdjust);
        const seLrcCapability = singleEngineLrcCapabilityAltitude(weightUsedT, isaDeviationCInput);
        if (driftLevelOff.clampedToIsa10) {
          warnings.push(`ISA deviation floored to ISA+${format(driftLevelOff.isaDeviationCUsed, 0)}`);
        }
        const uniqueWarnings = [...new Set(warnings)];

        renderRows(driftOut, [
          ...(uniqueWarnings.length ? [["__warning__", `Input warning: ${uniqueWarnings.join(" | ")}`]] : []),
          [
            "SE LRC Altitude Capability (100 fpm)",
            `${format(seLrcCapability.altitudeFt, 0)} ft (FL${format(seLrcCapability.altitudeFt / 100, 0)})`,
          ],
          ["Driftdown Start Weight", `${format(weightUsedT, 1)} t`],
          ["Driftdown Level Off Weight", `${format(driftLevelOff.levelOffWeightT, 1)} t`],
          ["Optimum Driftdown Speed", `${format(driftLevelOff.optimumDriftdownKias, 0)} kt`],
          [
            "Driftdown Level Off Altitude",
            `${format(driftLevelOff.levelOffAltFt, 0)} ft (FL${format(driftLevelOff.levelOffAltFt / 100, 0)})`,
          ],
          ["Driftdown + Cruise Fuel", `${format(driftFuelTime.fuelKg, 0)} kg`],
          ["Driftdown + Cruise Time", `${format(driftFuelTime.timeMinutes, 1)} min (${formatMinutes(driftFuelTime.timeMinutes)})`],
          ["__spacer__", ""],
        ]);
      } catch (error) {
        renderError(driftOut, error.message);
      }
    });

    autoRecalculate();
  }

  if (diversionForm && diversionOut) {
    const eoDiversionWeightEl = document.querySelector("#eo-div-weight");
    const eoDiversionGnmEl = document.querySelector("#eo-div-gnm");
    const eoDiversionWindEl = document.querySelector("#eo-div-wind");
    const eoDiversionAltEl = document.querySelector("#eo-div-alt");
    const autoRecalculate = (sourceEl = null) => {
      if (shouldDeferLiveSubmitForInput(sourceEl)) return;
      diversionForm.dispatchEvent(new Event("submit"));
    };

    [eoDiversionWeightEl, eoDiversionGnmEl, eoDiversionWindEl, eoDiversionAltEl].forEach((el) => {
      el.addEventListener("input", () => autoRecalculate(el));
      el.addEventListener("change", () => autoRecalculate(el));
    });

    diversionForm.addEventListener("submit", (event) => {
      event.preventDefault();
      if (
        missingFieldsBanner(diversionOut, [
          fieldIsBlank(eoDiversionWeightEl.value) ? "Start Weight" : "",
          fieldIsBlank(eoDiversionGnmEl.value) ? "EO LRC Diversion Distance" : "",
          fieldIsBlank(eoDiversionAltEl.value) ? "EO LRC Diversion Alt/FL" : "",
        ])
      ) {
        return;
      }

      try {
        const weightInputT = parseNum(eoDiversionWeightEl.value);
        const gnmInput = parseNum(eoDiversionGnmEl.value);
        const windInputKt = parseNumOrDefault(eoDiversionWindEl.value, 0);
        const eoDiversionAltInput = parseAltOrFlInput(eoDiversionAltEl.value, "EO LRC Diversion Alt/FL");
        const altitudeFt = eoDiversionAltInput.altitudeFt;
        const perfAdjust = getGlobalPerfAdjust();

        if (!Number.isFinite(weightInputT) || weightInputT <= 0) {
          throw new Error("Start weight must be > 0 t");
        }
        if (!Number.isFinite(gnmInput)) {
          throw new Error("EO LRC Diversion Distance is invalid");
        }
        if (fieldIsBlank(eoDiversionWindEl.value)) eoDiversionWindEl.value = formatInputNumber(0, 0);
        if (eoDiversionAltInput.isThreeDigitFl) {
          eoDiversionAltEl.value = formatInputNumber(altitudeFt, 0);
        }

        const eoDiversion = eoDiversionFuelTime(gnmInput, windInputKt, altitudeFt, weightInputT, perfAdjust);
        renderRows(diversionOut, [
          ...(eoDiversion.warnings.length ? [["__warning__", `Input warning: ${eoDiversion.warnings.join(" | ")}`]] : []),
          ["EO Diversion Air Distance (ANM)", `${format(eoDiversion.anm, 0)} nm`],
          ["EO Diversion Flight Fuel", `${format(eoDiversion.flightFuelKg, 0)} kg`],
          ["EO Diversion Time", `${format(eoDiversion.timeMinutes, 1)} min (${formatMinutes(eoDiversion.timeMinutes)})`],
        ]);
      } catch (error) {
        renderError(diversionOut, error.message);
      }
    });

    autoRecalculate();
  }
}

function bindDiversionModule({ bandKey, formSelector, outSelector, fieldIds, altLabel }) {
  const form = document.querySelector(formSelector);
  const out = document.querySelector(outSelector);
  if (!form || !out) return;

  const gnmEl = document.querySelector(fieldIds.gnm);
  const windEl = document.querySelector(fieldIds.wind);
  const altEl = document.querySelector(fieldIds.alt);
  const weightEl = document.querySelector(fieldIds.weight);
  const holdMinEl = document.querySelector(fieldIds.holdMin);
  const arrivalAllowanceEl = document.querySelector(fieldIds.arrivalMin);
  if (!gnmEl || !windEl || !altEl || !weightEl || !holdMinEl || !arrivalAllowanceEl) return;

  const autoRecalculate = (sourceEl = null) => {
    if (shouldDeferLiveSubmitForInput(sourceEl)) return;
    form.dispatchEvent(new Event("submit"));
  };

  [gnmEl, windEl, altEl, weightEl, holdMinEl, arrivalAllowanceEl].forEach((el) => {
    el.addEventListener("input", () => autoRecalculate(el));
    el.addEventListener("change", () => autoRecalculate(el));
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (
      missingFieldsBanner(out, [
        fieldIsBlank(gnmEl.value) ? "Ground Distance (GNM)" : "",
        fieldIsBlank(altEl.value) ? "Alt/FL" : "",
        fieldIsBlank(weightEl.value) ? "Start Weight" : "",
      ])
    ) {
      return;
    }
    try {
      const gnm = parseNum(gnmEl.value);
      const wind = parseNumOrDefault(windEl.value, 0);
      const altInput = parseAltOrFlInput(altEl.value, altLabel);
      const weightT = parseNum(weightEl.value);
      const holdingMin = parseNumOrDefault(holdMinEl.value, 0);
      const arrivalAllowanceMin = parseNumOrDefault(arrivalAllowanceEl.value, 0);
      const perfAdjust = getGlobalPerfAdjust();
      const result = diversionLrcFuelByBand(
        bandKey,
        gnm,
        wind,
        altInput.altitudeFt,
        weightT,
        perfAdjust,
        holdingMin,
        arrivalAllowanceMin,
      );

      gnmEl.value = formatInputNumber(result.usedInputs.gnm, 0);
      windEl.value = formatInputNumber(result.usedInputs.wind, 0);
      altEl.value = formatInputNumber(result.usedInputs.altitudeFt, 0);
      weightEl.value = formatInputNumber(result.usedInputs.weightT, 1);
      if (fieldIsBlank(holdMinEl.value)) {
        holdMinEl.value = formatInputNumber(0, 0);
      }
      if (fieldIsBlank(arrivalAllowanceEl.value)) {
        arrivalAllowanceEl.value = formatInputNumber(0, 0);
      }

      const rows = [
        ...(result.warnings.length ? [["__warning__", `Input warning: ${result.warnings.join(" | ")}`]] : []),
        ["Flight Fuel", `${format(result.adjustedFuel1000Kg * 1000, 0)} kg`],
        ["Est Landing Weight", `${format(result.reserveCalcWeightT, 1)} t`],
        ["FRF (30 min hold @ 1500 ft)", `${format(result.frfKg, 0)} kg`],
        ["Contingency Fuel (5%, min 350, max 1200)", `${format(result.contingencyKg, 0)} kg`],
        [`Additional Holding Fuel (${format(holdingMin, 1)} min)`, `${format(result.extraHoldingKg, 0)} kg`],
        [`Arrival Allowance (${format(arrivalAllowanceMin, 1)} min)`, `${format(result.arrivalAllowanceKg, 0)} kg`],
        ["Approach Fuel", `${format(result.fixedAllowanceKg, 0)} kg`],
        ["Total Fuel Required", `${format(result.totalFuelKg, 0)} kg`],
        ["Time", formatMinutes(result.timeMinutes)],
      ];
      renderRows(out, rows);
    } catch (error) {
      renderError(out, error.message);
    }
  });

  autoRecalculate();
}

function bindDiversion() {
  bindDiversionModule({
    bandKey: "low",
    formSelector: "#diversion-low-form",
    outSelector: "#diversion-low-out",
    fieldIds: {
      gnm: "#div-low-gnm",
      wind: "#div-low-wind",
      alt: "#div-low-alt",
      weight: "#div-low-weight",
      holdMin: "#div-low-hold-min",
      arrivalMin: "#div-low-arrival-min",
    },
    altLabel: "Diversion Low Alt/FL",
  });
  bindDiversionModule({
    bandKey: "high",
    formSelector: "#diversion-high-form",
    outSelector: "#diversion-high-out",
    fieldIds: {
      gnm: "#div-high-gnm",
      wind: "#div-high-wind",
      alt: "#div-high-alt",
      weight: "#div-high-weight",
      holdMin: "#div-high-hold-min",
      arrivalMin: "#div-high-arrival-min",
    },
    altLabel: "Diversion High Alt/FL",
  });
}

function bindHolding() {
  const form = document.querySelector("#holding-form");
  const out = document.querySelector("#holding-out");
  const totalHoldEl = document.querySelector("#hold-total-min");
  const inboundLegEl = document.querySelector("#hold-inbound-min");
  const timingIsaDevEl = document.querySelector("#hold-timing-isa-dev");
  const timingTempEl = document.querySelector("#hold-timing-temp");
  let lastTimingSource = totalHoldEl.value.trim() !== "" ? "total" : "inbound";
  let lastTempSource = "isa-dev";
  let suppressAutoSubmit = false;

  const autoRecalculate = (sourceEl = null) => {
    if (suppressAutoSubmit || shouldDeferLiveSubmitForInput(sourceEl)) return;
    form.dispatchEvent(new Event("submit"));
  };

  function chooseTimingSource(source) {
    if (source === "total" && totalHoldEl.value.trim() !== "") {
      inboundLegEl.value = "";
      lastTimingSource = "total";
    } else if (source === "inbound" && inboundLegEl.value.trim() !== "") {
      totalHoldEl.value = "";
      lastTimingSource = "inbound";
    }
  }

  totalHoldEl.addEventListener("input", () => {
    chooseTimingSource("total");
    autoRecalculate(totalHoldEl);
  });
  totalHoldEl.addEventListener("change", () => {
    chooseTimingSource("total");
    autoRecalculate(totalHoldEl);
  });
  inboundLegEl.addEventListener("input", () => {
    chooseTimingSource("inbound");
    autoRecalculate(inboundLegEl);
  });
  inboundLegEl.addEventListener("change", () => {
    chooseTimingSource("inbound");
    autoRecalculate(inboundLegEl);
  });
  timingIsaDevEl.addEventListener("input", () => {
    lastTempSource = "isa-dev";
    autoRecalculate(timingIsaDevEl);
  });
  timingTempEl.addEventListener("input", () => {
    lastTempSource = "temp";
    autoRecalculate(timingTempEl);
  });

  [
    "#hold-weight",
    "#hold-alt",
    "#fuel-available",
    "#hold-inbound-course",
    "#hold-wind-dir",
    "#hold-wind-speed",
    "#hold-timing-ias",
    "#hold-bank-limit",
  ].forEach((selector) => {
    const el = document.querySelector(selector);
    if (!el) return;
    el.addEventListener("input", () => autoRecalculate(el));
    el.addEventListener("change", () => autoRecalculate(el));
  });

  [document.querySelector("#hold-side"), timingIsaDevEl, timingTempEl].forEach((el) => {
    if (!el) return;
    el.addEventListener("change", () => autoRecalculate(el));
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const totalHoldRaw = String(totalHoldEl.value || "").trim();
    const inboundLegRaw = String(inboundLegEl.value || "").trim();
    if (
      missingFieldsBanner(out, [
        fieldIsBlank(document.querySelector("#hold-weight").value) ? "Weight" : "",
        fieldIsBlank(document.querySelector("#hold-alt").value) ? "Alt/FL" : "",
        fieldIsBlank(document.querySelector("#fuel-available").value) ? "Fuel Available" : "",
        fieldIsBlank(document.querySelector("#hold-inbound-course").value) ? "Inbound Course" : "",
      ])
    ) {
      return;
    }
    if (totalHoldRaw === "" && inboundLegRaw === "") {
      renderValidation(out, "Missing required input: Total Hold Required or Inbound Leg Time");
      return;
    }
    if (fieldIsBlank(timingIsaDevEl.value) && fieldIsBlank(timingTempEl.value)) {
      renderValidation(out, "Missing required input: ISA Deviation or Temperature");
      return;
    }
    try {
      suppressAutoSubmit = true;
      const weight = parseNum(document.querySelector("#hold-weight").value);
      const holdAltEl = document.querySelector("#hold-alt");
      const holdAltInput = parseAltOrFlInput(holdAltEl.value, "Alt/FL");
      const altitude = holdAltInput.altitudeFt;
      const fuelAvailable = parseNum(document.querySelector("#fuel-available").value);
      const perfAdjust = getGlobalPerfAdjust();
      const holdSide = String(document.querySelector("#hold-side").value || "R").toUpperCase();
      const inboundCourseDeg = parseNum(document.querySelector("#hold-inbound-course").value);
      const windDirEl = document.querySelector("#hold-wind-dir");
      const windSpeedEl = document.querySelector("#hold-wind-speed");
      const windFromDeg = parseNumOrDefault(windDirEl.value, 0);
      const windSpeedKt = parseNumOrDefault(windSpeedEl.value, 0);
      const timingIasRaw = String(document.querySelector("#hold-timing-ias").value || "").trim();
      const bankLimitRaw = String(document.querySelector("#hold-bank-limit").value || "").trim();
      const temperaturePair = resolveTemperaturePair({
        isaDeviationRaw: timingIsaDevEl.value,
        temperatureRaw: timingTempEl.value,
        lastSource: lastTempSource,
        pressureAltitudeFt: altitude,
        label: "Holding timing temperature",
      });
      const timingIsaDevC = temperaturePair.isaDeviationC;

      if (holdAltInput.isThreeDigitFl) {
        holdAltEl.value = formatInputNumber(altitude, 0);
      }
      timingIsaDevEl.value = formatInputNumber(temperaturePair.isaDeviationC, 1);
      timingTempEl.value = formatInputNumber(temperaturePair.temperatureC, 1);
      applyTemperatureFieldStyle({
        sourceUsed: temperaturePair.sourceUsed,
        isaDeviationEl: timingIsaDevEl,
        temperatureEl: timingTempEl,
      });
      lastTempSource = temperaturePair.sourceUsed;

      if (!Number.isFinite(weight) || weight <= 0) {
        throw new Error("Weight must be > 0 t");
      }
      if (FLAPS_UP_TABLE && Array.isArray(FLAPS_UP_TABLE.altitudesFt) && FLAPS_UP_TABLE.altitudesFt.length > 1) {
        const minAlt = FLAPS_UP_TABLE.altitudesFt[0];
        const maxAlt = FLAPS_UP_TABLE.altitudesFt[FLAPS_UP_TABLE.altitudesFt.length - 1];
        if (altitude < minAlt || altitude > maxAlt) {
          throw new Error(`Altitude out of range (${format(minAlt, 0)}-${format(maxAlt, 0)} ft)`);
        }
      }
      if (!Number.isFinite(fuelAvailable) || fuelAvailable < 0) {
        throw new Error("Fuel available must be >= 0 kg");
      }
      if (!Number.isFinite(inboundCourseDeg) || inboundCourseDeg < 0) {
        throw new Error("Inbound course must be >= 0 deg");
      }
      if (!Number.isFinite(windFromDeg) || windFromDeg < 0) {
        throw new Error("Wind direction must be >= 0 deg");
      }
      if (!Number.isFinite(windSpeedKt) || windSpeedKt < 0) {
        throw new Error("Wind speed must be >= 0 kt");
      }
      if (fieldIsBlank(windDirEl.value)) windDirEl.value = formatInputNumber(0, 0);
      if (fieldIsBlank(windSpeedEl.value)) windSpeedEl.value = formatInputNumber(0, 0);

      let timingMode;
      if (totalHoldRaw !== "" && inboundLegRaw !== "") {
        if (lastTimingSource === "inbound") {
          totalHoldEl.value = "";
          timingMode = "given-inbound";
        } else {
          inboundLegEl.value = "";
          timingMode = "given-total";
        }
      } else if (totalHoldRaw !== "") {
        timingMode = "given-total";
        lastTimingSource = "total";
      } else if (inboundLegRaw !== "") {
        timingMode = "given-inbound";
        lastTimingSource = "inbound";
      } else {
        throw new Error("Enter Total hold required or Inbound leg time");
      }

      const totalHoldMin = timingMode === "given-total" ? parseNum(totalHoldEl.value) : NaN;
      const inboundLegMin = timingMode === "given-inbound" ? parseNum(inboundLegEl.value) : NaN;
      const bankLimitDeg = bankLimitRaw === "" ? DEFAULT_HOLD_BANK_DEG : parseNum(bankLimitRaw);
      if (!Number.isFinite(bankLimitDeg) || bankLimitDeg <= 0 || bankLimitDeg >= 90) {
        throw new Error("Bank limit must be > 0 and < 90 deg");
      }

      if (timingMode === "given-total") {
        if (!Number.isFinite(totalHoldMin) || totalHoldMin < 0) {
          throw new Error("Total hold required must be >= 0 min");
        }
      } else if (timingMode === "given-inbound") {
        if (!Number.isFinite(inboundLegMin) || inboundLegMin <= 0) {
          throw new Error("Inbound leg time must be > 0 min");
        }
      } else {
        throw new Error("Unknown hold timing mode");
      }

      const hold = holdingAt(weight, altitude, 0, perfAdjust);
      const useManualTimingIas = timingIasRaw !== "";
      const timingIasKt = useManualTimingIas ? parseNum(timingIasRaw) : hold.kias;

      const endurance = (fuelAvailable / hold.fuelHr) * 60;
      const rows = [
        ["Hold Command IAS (table)", `${format(hold.kias, 0)} kt`],
        ["Hold Fuel Flow", `${format(hold.fuelHr, 0)} kg/h`],
        ["Hold less 5%", `${format(hold.lessFivePct, 0)} kg/h`],
        ["Hold Endurance", formatMinutes(endurance)],
      ];

      if (timingMode === "given-total" && totalHoldMin === 0) {
        renderRows(out, rows);
        return;
      }

      const timing = calculateHoldTiming({
        mode: timingMode,
        totalHoldMin,
        inboundLegMin,
        holdSide,
        inboundCourseDeg,
        windFromDeg,
        windSpeedKt,
        pressureAltitudeFt: altitude,
        iasKt: timingIasKt,
        isaDeviationC: timingIsaDevC,
        bankLimitDeg,
      });

      rows.push(
        ["__spacer__", ""],
        ["Hold Timing Input Mode", timingMode === "given-total" ? "Given Total Hold Time" : "Given Inbound Leg Time to Fix"],
        [
          "Inbound Leg Time",
          `${format(timing.inboundLegMin, 2)} min (${formatMinutes(timing.inboundLegMin)})`,
        ],
        ["Outbound Leg (wind-corrected)", `${format(timing.outboundLegMin, 2)} min`],
        [
          "Total Hold Time",
          `${format(timing.totalHoldMin, 1)} min (${formatMinutes(timing.totalHoldMin)})`,
        ],
        ["Timing IAS / TAS / Mach", `${format(timing.iasKt, 0)} / ${format(timing.tasKt, 0)} kt / ${format(timing.mach, 3)}`],
        ["Inbound / Outbound Track", `${format(timing.inboundTrackDeg, 0)}° / ${format(timing.outboundTrackDeg, 0)}°`],
        ["Inbound / Outbound Heading", `${format(timing.inboundHeadingDeg, 0)}° / ${format(timing.outboundHeadingDeg, 0)}°`],
        [
          "Inbound / Outbound GS",
          `${format(timing.inboundGroundSpeedKt, 0)} / ${format(timing.outboundGroundSpeedKt, 0)} kt`,
        ],
        ["Leg Distance", `${format((timing.inboundLegNm + timing.outboundLegNm) / 2, 2)} NM`],
        [
          "Outbound Turn / Inbound Turn",
          `${format(timing.outboundTurnMin, 2)} min @ ${format(timing.outboundTurnBankDeg, 1)}° bank / ${format(timing.inboundTurnMin, 2)} min @ ${format(timing.inboundTurnBankDeg, 1)}° bank`,
        ],
        ["Turn Total", `${format(timing.totalTurnMin, 2)} min`],
        ["Turn Radius (common)", `${format(timing.turnRadiusNm, 2)} NM`],
      );
      renderRows(out, rows);
    } catch (error) {
      renderError(out, error.message);
    } finally {
      suppressAutoSubmit = false;
    }
  });

  chooseTimingSource("total");
  applyTemperatureFieldStyle({
    sourceUsed: lastTempSource,
    isaDeviationEl: timingIsaDevEl,
    temperatureEl: timingTempEl,
  });
  autoRecalculate();
}

function bindLoseTime() {
  const form = document.querySelector("#lose-time-form");
  const out = document.querySelector("#lose-time-out");
  const levelModeEl = document.querySelector("#lt-level-change-mode");
  const changeAfterEl = document.querySelector("#lt-change-after-min");
  const newFlEl = document.querySelector("#lt-new-fl");
  const todDistanceEl = document.querySelector("#lt-tod-distance");
  const descentIasEl = document.querySelector("#lt-descent-ias");
  const optionDIsaDevEl = document.querySelector("#lt-optiond-isa-dev");
  const optionDTempEl = document.querySelector("#lt-optiond-temp");
  let lastOptionDTempSource = "isa-dev";

  function toggleInputs() {
    const levelNone = levelModeEl.value === "none";
    changeAfterEl.disabled = levelNone;
    newFlEl.disabled = levelNone;
  }

  levelModeEl.addEventListener("change", () => {
    toggleInputs();
    form.dispatchEvent(new Event("submit"));
  });
  optionDIsaDevEl?.addEventListener("input", () => {
    lastOptionDTempSource = "isa-dev";
  });
  optionDTempEl?.addEventListener("input", () => {
    lastOptionDTempSource = "temp";
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (
      missingFieldsBanner(out, [
        fieldIsBlank(document.querySelector("#lt-distance").value) ? "Distance to Fix" : "",
        fieldIsBlank(document.querySelector("#lt-weight").value) ? "Current Weight" : "",
        fieldIsBlank(document.querySelector("#lt-fl").value) ? "Current Alt/FL" : "",
        fieldIsBlank(document.querySelector("#lt-delay").value) ? "Required Delay" : "",
      ])
    ) {
      return;
    }
    if (levelModeEl.value !== "none") {
      if (
        missingFieldsBanner(out, [
          fieldIsBlank(changeAfterEl.value) ? "Change After (min)" : "",
          fieldIsBlank(newFlEl.value) ? "New Alt/FL" : "",
        ])
      ) {
        return;
      }
    }

    try {
      const distanceNm = parseNum(document.querySelector("#lt-distance").value);
      const startWeightT = parseNum(document.querySelector("#lt-weight").value);
      const startFlEl = document.querySelector("#lt-fl");
      const startFlInput = parseAltOrFlInput(startFlEl.value, "Current Alt/FL");
      const startFl = startFlInput.flightLevel;
      const requiredDelayMin = parseNum(document.querySelector("#lt-delay").value);
      const ltWindEl = document.querySelector("#lt-wind");
      const windKt = parseNumOrDefault(ltWindEl.value, 0);
      const perfAdjust = getGlobalPerfAdjust();
      const levelChangeMode = levelModeEl.value;
      const newFl =
        levelChangeMode === "none"
          ? startFl
          : parseAltOrFlInput(newFlEl.value, "New Alt/FL").flightLevel;
      validateLrcFlightLevelRange(startFl, "Current Alt/FL");
      if (levelChangeMode !== "none") {
        validateLrcFlightLevelRange(newFl, "New Alt/FL");
      }

      if (!startFlInput.isThreeDigitFl) {
        startFlEl.value = formatInputNumber(startFl, 0);
      }
      if (levelChangeMode !== "none") {
        const newFlInput = parseAltOrFlInput(newFlEl.value, "New Alt/FL");
        if (!newFlInput.isThreeDigitFl) {
          newFlEl.value = formatInputNumber(newFl, 0);
        }
      }
      if (fieldIsBlank(ltWindEl.value)) ltWindEl.value = formatInputNumber(0, 0);

      const levelChange = {
        mode: levelChangeMode,
        afterMin: parseNum(changeAfterEl.value),
        newFl,
      };
      const levelChangeSummary =
        levelChangeMode === "none"
          ? "None"
          : `${levelChangeMode === "climb" ? "Climb" : "Descent"} to FL${format(levelChange.newFl, 0)} after ${format(levelChange.afterMin, 0)} min`;

      const comparison = buildLoseTimeComparison({
        distanceNm,
        startWeightT,
        startFl,
        requiredDelayMin,
        cruiseWindKt: windKt,
        holdWindKt: windKt,
        levelChange,
        perfAdjust,
      });

      const hasOptionDInputs =
        todDistanceEl &&
        descentIasEl &&
        !fieldIsBlank(todDistanceEl.value) &&
        !fieldIsBlank(descentIasEl.value);

      let optionDRows = [];
      if (hasOptionDInputs) {
        try {
          const distanceToTodNm = parseNum(todDistanceEl.value);
          const optionDSpeedInput = parseLoseTimeOptionDSpeedInput(descentIasEl.value);
          const optionDTemperaturePair = resolveTemperaturePair({
            isaDeviationRaw: optionDIsaDevEl?.value ?? "",
            temperatureRaw: optionDTempEl?.value ?? "",
            lastSource: lastOptionDTempSource,
            pressureAltitudeFt: startFl * 100,
            label: "Option D temperature",
          });
          lastOptionDTempSource = optionDTemperaturePair.sourceUsed;
          if (optionDIsaDevEl) optionDIsaDevEl.value = formatInputNumber(optionDTemperaturePair.isaDeviationC, 1);
          if (optionDTempEl) optionDTempEl.value = formatInputNumber(optionDTemperaturePair.temperatureC, 1);
          applyTemperatureFieldStyle({
            sourceUsed: optionDTemperaturePair.sourceUsed,
            isaDeviationEl: optionDIsaDevEl,
            temperatureEl: optionDTempEl,
          });
          const optionD = buildLoseTimeCruiseDescentOption({
            distanceNm,
            startWeightT,
            startFl,
            requiredDelayMin,
            cruiseWindKt: windKt,
            distanceToTodNm,
            descentIasKt: optionDSpeedInput.descentIasKt,
            fixedCruiseMach: optionDSpeedInput.mach,
            speedInputMode: optionDSpeedInput.mode,
            perfAdjust,
            isaDeviationC: optionDTemperaturePair.isaDeviationC,
            temperatureC: optionDTemperaturePair.temperatureC,
          });
          const optionDLevelChangeNote =
            levelChangeMode === "none"
              ? ""
              : "Option D uses Distance to TOD and estimated fix crossing altitude from the descent table, and does not apply the Level Change inputs";
          const optionDTimeMin = optionD.solution.totalTimeMin + optionD.residualHoldMin;
          const optionDDelayAchievedMin = optionDTimeMin - optionD.baseline.totalTimeMin;
          const optionDConstraintNote = optionD.limitedByMaxMach
            ? `Option D has no exact solution for the selected descent IAS. The target is ${format(requiredDelayMin, 2)} min delay, but the minimum achievable delay at LRC Mach is ${format(optionDDelayAchievedMin, 2)} min`
            : optionD.limitedByMinIas
              ? `Option D has no exact solution for the selected cruise Mach. The target is ${format(requiredDelayMin, 2)} min delay, but the maximum achievable delay down to ${format(LOSE_TIME_MIN_OPTION_D_DESCENT_IAS_KT, 0)} kt descent IAS is ${format(optionDDelayAchievedMin, 2)} min`
              : "";
          const hasDescentSegment = optionD.solution.descentDistanceNm > 0.001;
          optionDRows = [
            ["__spacer__", ""],
            ["__section__", "Option D (Cruise + Descent)"],
            ["Option D Speed Input", optionDSpeedInput.displayText],
            ["Option D Baseline Time to Fix", formatMinutes(optionD.baseline.totalTimeMin)],
            ["Option D Time to Fix (target)", formatMinutes(optionD.targetTimeMin)],
            [
              optionD.limitedByMaxMach
                ? "Option D Minimum Achievable Time"
                : optionD.limitedByMinIas
                  ? "Option D Maximum Achievable Time"
                  : "Option D Time",
              formatMinutes(optionDTimeMin),
            ],
            [
              optionD.limitedByMaxMach
                ? "Option D Minimum Achievable Delay"
                : optionD.limitedByMinIas
                  ? "Option D Maximum Achievable Delay"
                  : "Option D Delay Achieved",
              `${format(optionDDelayAchievedMin, 2)} min`,
            ],
            ["Option D Estimated Fix Crossing Altitude", `${format(optionD.solution.fixCrossingAltitudeFt, 0)} ft`],
            [
              optionD.inputMode === "mach"
                ? "Option D Cruise / Initial Descent Mach"
                : optionD.limitedByMaxMach
                  ? "Option D Minimum-Delay Cruise / Initial Descent Mach"
                  : "Option D Cruise / Initial Descent Mach",
              format(optionD.requiredMach, 3),
            ],
            ...(hasDescentSegment
              ? [
                  [
                    optionD.inputMode === "mach"
                      ? optionD.limitedByMinIas
                        ? "Option D Maximum-Delay Descent IAS (>10000 / <=10000)"
                        : "Option D Required Descent IAS (>10000 / <=10000)"
                      : "Option D Descent IAS (>10000 / <=10000)",
                    `${format(optionD.solution.descentIasAbove10kKt, 0)} / ${format(optionD.solution.descentIasBelow10kKt, 0)} kt`,
                  ],
                  ["Option D Mach/IAS Crossover Altitude", `${format(optionD.solution.crossoverAltitudeFt, 0)} ft`],
                  [
                    "Option D Cruise Distance / Descent Distance",
                    `${format(optionD.solution.cruiseDistanceNm, 1)} / ${format(optionD.solution.descentDistanceNm, 1)} NM`,
                  ],
                  [
                    "Option D Cruise Time / Descent Time",
                    `${format(optionD.solution.cruiseTimeMin, 1)} / ${format(optionD.solution.descentTimeMin, 1)} min`,
                  ],
                  [
                    "Option D Reference Descent Distance / Time",
                    `${format(optionD.solution.referenceDescentDistanceNm, 1)} NM / ${format(optionD.solution.referenceDescentTimeMin, 1)} min`,
                  ],
                ]
              : []),
            ["Option D Residual Hold at Fix", `${format(optionD.residualHoldMin, 2)} min`],
            ...(optionDConstraintNote ? [["__warning__", optionDConstraintNote]] : []),
            ...(optionDLevelChangeNote ? [["__warning__", optionDLevelChangeNote]] : []),
          ];
        } catch (optionDError) {
          optionDRows = [
            ["__spacer__", ""],
            ["__section__", "Option D (Cruise + Descent)"],
            ["Option D Solution", String(optionDError?.message || "Unable to compute cruise + descent option")],
          ];
        }
      } else if (
        todDistanceEl &&
        descentIasEl &&
        [todDistanceEl.value, descentIasEl.value].some((value) => !fieldIsBlank(value))
      ) {
        optionDRows = [
          ["__spacer__", ""],
          ["__section__", "Option D (Cruise + Descent)"],
          ["Option D Solution", "Enter Distance to TOD and Option D speed to enable Option D"],
        ];
      }

      const switchInfo = comparison.optionB.switchInfo;
      const switchText = switchInfo
        ? `${formatMinutes(switchInfo.atElapsedMin)} elapsed, ${format(switchInfo.remainingNmAtSwitch, 1)} NM to fix`
        : "No enroute speed reduction needed";
      const optionCRows = comparison.optionC
        ? [
            ["Time to Fix (target)", formatMinutes(comparison.targetFixTime)],
            ["Required Average Ground Speed", `${format(comparison.optionC.requiredGsKt, 0)} kt`],
            [
              "Required IAS / Mach",
              `${format(comparison.optionC.requiredIasKt, 0)} kt / ${format(comparison.optionC.requiredMach, 3)}`,
            ],
          ]
        : [["Required Speed Solution", comparison.optionCError || "Unable to compute required speed"]];

      renderRows(out, [
        ["Required Delay", `${format(requiredDelayMin, 2)} min`],
        ["Baseline LRC Time to Fix", formatMinutes(comparison.baseline.timeToFixMin)],
        ["Baseline LRC Fuel to Fix", `${format(comparison.baseline.fuelBurnKg, 0)} kg`],
        ["__spacer__", ""],
        ["Option A Time (LRC + Hold at Fix)", formatMinutes(comparison.optionA.totalTimeMin)],
        ["Option A Fuel Burn", `${format(comparison.optionA.fuelBurnKg, 0)} kg`],
        ["Option A Delay Achieved", `${format(comparison.optionA.totalTimeMin - comparison.baseline.timeToFixMin, 2)} min`],
        ["__spacer__", ""],
        ["Option B Time (Reduce to Hold Speed enroute)", formatMinutes(comparison.optionB.totalTimeMin)],
        ["Option B Fuel Burn", `${format(comparison.optionB.fuelBurnKg, 0)} kg`],
        ["Option B Delay Achieved", `${format(comparison.optionB.totalTimeMin - comparison.baseline.timeToFixMin, 2)} min`],
        ["Option B Speed Reduction Start", switchText],
        ["Option B Residual Hold at Fix", `${format(comparison.residualHoldMin, 2)} min`],
        ["__spacer__", ""],
        ...optionCRows,
        ...optionDRows,
        ["__spacer__", ""],
        ["Fuel Difference (A - B)", `${format(comparison.optionA.fuelBurnKg - comparison.optionB.fuelBurnKg, 0)} kg`],
        ["Final Weight Option A / B", `${format(comparison.optionA.finalWeightT, 2)} / ${format(comparison.optionB.finalWeightT, 2)} t`],
      ]);
    } catch (error) {
      renderError(out, error.message);
    }
  });

  toggleInputs();
  applyTemperatureFieldStyle({
    sourceUsed: lastOptionDTempSource,
    isaDeviationEl: optionDIsaDevEl,
    temperatureEl: optionDTempEl,
  });
  form.dispatchEvent(new Event("submit"));
}

function bindConversion() {
  const form = document.querySelector("#conversion-form");
  const out = document.querySelector("#conversion-out");
  const iasEl = document.querySelector("#conv-ias");
  const machEl = document.querySelector("#conv-mach");
  const tasEl = document.querySelector("#conv-tas");
  const flEl = document.querySelector("#conv-fl");
  const oatEl = document.querySelector("#conv-oat");
  const isaDevEl = document.querySelector("#conv-isa-dev");
  let lastTempSource = "temp";
  let lastSpeedSource = "ias";
  let suppressAutoSubmit = false;

  function autoRecalculate(sourceEl = null) {
    if (suppressAutoSubmit || shouldDeferLiveSubmitForInput(sourceEl)) return;
    form.dispatchEvent(new Event("submit"));
  }

  function setActiveSpeedSource(source) {
    lastSpeedSource = source;
    iasEl.classList.toggle("input-derived", source !== "ias");
    machEl.classList.toggle("input-derived", source !== "mach");
    tasEl.classList.toggle("input-derived", source !== "tas");
  }

  [
    [iasEl, "ias"],
    [machEl, "mach"],
    [tasEl, "tas"],
  ].forEach(([el, source]) => {
    el.addEventListener("focus", () => setActiveSpeedSource(source));
    el.addEventListener("input", () => {
      setActiveSpeedSource(source);
      autoRecalculate(el);
    });
    el.addEventListener("change", () => {
      setActiveSpeedSource(source);
      autoRecalculate(el);
    });
  });
  isaDevEl.addEventListener("input", () => {
    lastTempSource = "isa-dev";
    autoRecalculate(isaDevEl);
  });
  isaDevEl.addEventListener("change", () => autoRecalculate(isaDevEl));
  oatEl.addEventListener("input", () => {
    lastTempSource = "temp";
    autoRecalculate(oatEl);
  });
  oatEl.addEventListener("change", () => autoRecalculate(oatEl));
  flEl.addEventListener("input", () => autoRecalculate(flEl));
  flEl.addEventListener("change", () => autoRecalculate(flEl));

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (fieldIsBlank(flEl.value)) {
      renderValidation(out, "Missing required input: Alt/FL");
      return;
    }
    if (fieldIsBlank(isaDevEl.value) && fieldIsBlank(oatEl.value)) {
      renderValidation(out, "Missing required input: ISA Deviation or Temperature");
      return;
    }
    const sourceEl =
      lastSpeedSource === "ias" ? iasEl : lastSpeedSource === "mach" ? machEl : tasEl;
    const sourceLabel = lastSpeedSource === "ias" ? "IAS" : lastSpeedSource === "mach" ? "Mach" : "TAS";
    if (fieldIsBlank(sourceEl.value)) {
      renderValidation(out, `Missing required input: ${sourceLabel}`);
      return;
    }
    try {
      suppressAutoSubmit = true;
      const flInput = parseAltOrFlInput(flEl.value, "Alt/FL");
      const fl = flInput.flightLevel;
      const pressureAltitudeFt = fl * 100;
      const temperaturePair = resolveTemperaturePair({
        isaDeviationRaw: isaDevEl.value,
        temperatureRaw: oatEl.value,
        lastSource: lastTempSource,
        pressureAltitudeFt,
        label: "IAS/Mach/TAS temperature",
      });
      lastTempSource = temperaturePair.sourceUsed;
      isaDevEl.value = formatInputNumber(temperaturePair.isaDeviationC, 1);
      oatEl.value = formatInputNumber(temperaturePair.temperatureC, 1);
      applyTemperatureFieldStyle({
        sourceUsed: temperaturePair.sourceUsed,
        isaDeviationEl: isaDevEl,
        temperatureEl: oatEl,
      });

      if (!flInput.isThreeDigitFl) {
        flEl.value = formatInputNumber(fl, 0);
      }
      const atmosphere = atmosphereFromPressureAltitude({
        pressureAltitudeFt,
        tempMode: temperaturePair.sourceUsed === "temp" ? "oat" : "isa-dev",
        oatC: temperaturePair.temperatureC,
        isaDeviationC: temperaturePair.isaDeviationC,
      });

      let result;
      if (lastSpeedSource === "ias") {
        result = iasToMachTas({
          iasKt: parseNum(iasEl.value),
          pressurePa: atmosphere.pressurePa,
          speedOfSoundMps: atmosphere.speedOfSoundMps,
        });
      } else if (lastSpeedSource === "mach") {
        result = machToIasTas({
          mach: parseNum(machEl.value),
          pressurePa: atmosphere.pressurePa,
          speedOfSoundMps: atmosphere.speedOfSoundMps,
        });
      } else {
        result = tasToIasMach({
          tasKt: parseNum(tasEl.value),
          pressurePa: atmosphere.pressurePa,
          speedOfSoundMps: atmosphere.speedOfSoundMps,
        });
      }

      iasEl.value = formatInputNumber(result.iasKt, 0);
      machEl.value = formatInputNumber(result.mach, 3);
      tasEl.value = formatInputNumber(result.tasKt, 0);

      out.innerHTML = "";
    } catch (error) {
      renderError(out, error.message);
    } finally {
      suppressAutoSubmit = false;
    }
  });

  setActiveSpeedSource(lastSpeedSource);
  applyTemperatureFieldStyle({
    sourceUsed: lastTempSource,
    isaDeviationEl: isaDevEl,
    temperatureEl: oatEl,
  });
  autoRecalculate();
}

function bindGoAround() {
  const form = document.querySelector("#go-around-form");
  const out = document.querySelector("#go-around-out");
  if (!form || !out) return;

  const flapEl = document.querySelector("#go-around-flap");
  const oatEl = document.querySelector("#go-around-oat");
  const elevationEl = document.querySelector("#go-around-elevation");
  const weightEl = document.querySelector("#go-around-weight");
  const targetGradientEl = document.querySelector("#go-around-target-gradient");
  const speedEl = document.querySelector("#go-around-speed");
  const antiIceEl = document.querySelector("#go-around-anti-ice");
  const icingPenaltyEl = document.querySelector("#go-around-icing-penalty");
  let suppressAutoSubmit = false;

  const autoRecalculate = (sourceEl = null) => {
    if (suppressAutoSubmit || shouldDeferLiveSubmitForInput(sourceEl)) return;
    form.dispatchEvent(new Event("submit"));
  };

  const setRangeText = (selector, text) => {
    const el = document.querySelector(selector);
    if (el) el.textContent = text;
  };

  const updateFlapDependentUi = () => {
    const config = getGoAroundConfig(flapEl.value);
    const ranges = getGoAroundRanges(config);

    setRangeText("#go-around-oat-range", `(${format(ranges.minOatC, 0)}-${format(ranges.maxOatC, 0)})`);
    setRangeText("#go-around-elev-range", `(${format(ranges.minAltitudeFt, 0)}-${format(ranges.maxAltitudeFt, 0)})`);
    setRangeText("#go-around-weight-range", `(${format(ranges.minWeightT, 0)}-${format(ranges.maxWeightT, 0)})`);

    const previousSpeed = speedEl.value;
    const speedOptions = config.speedAdjustment.rows.map((row) => row.speed);
    speedEl.innerHTML = speedOptions.map((speed) => `<option value="${speed}">${speed}</option>`).join("");
    if (speedOptions.includes(previousSpeed)) {
      speedEl.value = previousSpeed;
    } else {
      const preferred = speedOptions.find((speed) => speed.includes("+5")) || speedOptions[0];
      speedEl.value = preferred;
    }
  };

  flapEl.addEventListener("change", () => {
    updateFlapDependentUi();
    autoRecalculate(flapEl);
  });

  const chooseInputMode = (source) => {
    if (source === "target" && targetGradientEl.value.trim() !== "") {
      weightEl.value = "";
    } else if (source === "weight" && weightEl.value.trim() !== "") {
      targetGradientEl.value = "";
    }
  };

  weightEl.addEventListener("input", () => {
    chooseInputMode("weight");
    autoRecalculate(weightEl);
  });
  weightEl.addEventListener("change", () => autoRecalculate(weightEl));
  targetGradientEl.addEventListener("input", () => {
    chooseInputMode("target");
    autoRecalculate(targetGradientEl);
  });
  targetGradientEl.addEventListener("change", () => autoRecalculate(targetGradientEl));
  [oatEl, elevationEl].forEach((el) => {
    el.addEventListener("input", () => autoRecalculate(el));
    el.addEventListener("change", () => autoRecalculate(el));
  });
  [speedEl, antiIceEl, icingPenaltyEl].forEach((el) => {
    el.addEventListener("change", () => autoRecalculate(el));
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (
      missingFieldsBanner(out, [
        fieldIsBlank(oatEl.value) ? "Landing Temp" : "",
        fieldIsBlank(elevationEl.value) ? "Airport Elevation" : "",
      ])
    ) {
      return;
    }
    if (fieldIsBlank(weightEl.value) && fieldIsBlank(targetGradientEl.value)) {
      renderValidation(out, "Missing required input: Landing Weight or Target Gradient");
      return;
    }
    try {
      suppressAutoSubmit = true;
      const oatText = oatEl.value.trim();
      const elevationText = elevationEl.value.trim();
      const weightText = weightEl.value.trim();
      const targetText = targetGradientEl.value.trim();

      const result = calculateGoAroundGradient({
        flapSelection: flapEl.value,
        oatCInput: oatText === "" ? NaN : parseNum(oatText),
        elevationFtInput: elevationText === "" ? NaN : parseNum(elevationText),
        landingWeightTInput: weightText === "" ? NaN : parseNum(weightText),
        targetGradientPctInput: targetText === "" ? NaN : parseNum(targetText),
        speedLabel: speedEl.value,
        antiIceMode: antiIceEl.value,
        applyIcingPenalty: icingPenaltyEl.value === "on",
      });

      oatEl.value = formatInputNumber(result.inputsUsed.oatC, 1);
      elevationEl.value = formatInputNumber(result.inputsUsed.elevationFt, 0);
      if (result.mode === "weight") {
        weightEl.value = formatInputNumber(result.inputsUsed.landingWeightT, 1);
      } else {
        targetGradientEl.value = formatInputNumber(result.targetGradientPct, 1);
      }

      const rows = [
        ...(result.warnings.length ? [["__warning__", `Input warning: ${result.warnings.join(" | ")}`]] : []),
        ["Flap / Speed", `${result.flapLabel} / ${result.inputsUsed.speedLabel}`],
        ["Landing Temp / Airport Elevation Used", `${format(result.inputsUsed.oatC, 1)} °C / ${format(result.inputsUsed.elevationFt, 0)} ft`],
        ["Anti-Ice Band Applied", result.antiIceBand],
        ...(result.mode === "target"
          ? [
              ["Target Gradient", `${format(result.targetGradientPct, 1)} %`],
              ["Required Weight", `${format(result.inputsUsed.landingWeightT, 1)} t`],
            ]
          : []),
        ["Reference Gradient", `${format(result.referenceGradientPct, 1)} %`],
        ["Weight Adjustment", `${format(result.weightAdjustmentPct, 1)} %`],
        ["Speed Adjustment", `${format(result.speedAdjustmentPct, 1)} %`],
        ["Anti-Ice Adjustment", `${format(result.antiIceAdjustmentPct, 1)} %`],
        ["Icing Penalty", `${format(result.icingPenaltyPct, 1)} %`],
        ["Final Go-Around Gradient", `${format(result.finalGradientPct, 1)} %`],
      ];
      renderRows(out, rows);
    } catch (error) {
      renderError(out, error.message);
    } finally {
      suppressAutoSubmit = false;
    }
  });

  updateFlapDependentUi();
  autoRecalculate();
}

function calculateCogLimit(grossWeight1000Kg) {
  if (!Number.isFinite(grossWeight1000Kg) || grossWeight1000Kg <= 0) {
    throw new Error("Gross weight must be > 0");
  }

  const minWeight = COG_LIMIT_WEIGHT_AXIS_1000KG[0];
  const maxWeight = COG_LIMIT_WEIGHT_AXIS_1000KG[COG_LIMIT_WEIGHT_AXIS_1000KG.length - 1];
  const usedWeight = clamp(grossWeight1000Kg, minWeight, maxWeight);
  const warnings = [];
  if (usedWeight !== grossWeight1000Kg) {
    warnings.push(`Gross weight clamped to ${format(usedWeight, 1)} (1000 kg)`);
  }

  return {
    requestedWeight1000Kg: grossWeight1000Kg,
    usedWeight1000Kg: usedWeight,
    cgLimitPctMac: linear(COG_LIMIT_WEIGHT_AXIS_1000KG, COG_LIMIT_VALUES_PCT_MAC, usedWeight),
    warnings,
  };
}

function bindCogLimit() {
  const form = document.querySelector("#cog-limit-form");
  const out = document.querySelector("#cog-limit-out");
  const weightEl = document.querySelector("#cog-weight");
  if (!form || !out || !weightEl) return;

  const autoRecalculate = (sourceEl = null) => {
    if (shouldDeferLiveSubmitForInput(sourceEl)) return;
    form.dispatchEvent(new Event("submit"));
  };

  weightEl.addEventListener("input", () => autoRecalculate(weightEl));
  weightEl.addEventListener("change", () => autoRecalculate(weightEl));

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (missingFieldsBanner(out, [fieldIsBlank(weightEl.value) ? "Gross Weight (1000 kg)" : ""])) {
      return;
    }
    try {
      const grossWeight1000Kg = parseNum(weightEl.value);
      const result = calculateCogLimit(grossWeight1000Kg);
      weightEl.value = formatInputNumber(result.usedWeight1000Kg, 1);

      const rows = [
        ...(result.warnings.length ? [["__warning__", `Input warning: ${result.warnings.join(" | ")}`]] : []),
        ["CG Limit", `${format(result.cgLimitPctMac, 1)} %MAC`],
      ];
      renderRows(out, rows);
    } catch (error) {
      renderError(out, error.message);
    }
  });

  autoRecalculate();
}

function bindGlobalSettings() {
  const globalPerfEl = document.querySelector("#global-perf-adjust");
  const themeEl = document.querySelector("#theme-mode");
  if (!globalPerfEl) return;

  globalPerfEl.addEventListener("change", recalculateAllForms);

  if (themeEl) {
    themeEl.value = readThemeMode();
    themeEl.addEventListener("change", () => {
      const mode = sanitizeThemeMode(themeEl.value);
      writeThemeMode(mode);
      applyTheme(mode);
    });
  }
}

function bindThemeAutoUpdates() {
  const mediaQuery = window.matchMedia?.("(prefers-color-scheme: dark)");
  if (!mediaQuery) return;

  const syncAutoTheme = () => {
    if (readThemeMode() === "auto") {
      applyTheme("auto");
    }
  };

  if (typeof mediaQuery.addEventListener === "function") {
    mediaQuery.addEventListener("change", syncAutoTheme);
  } else if (typeof mediaQuery.addListener === "function") {
    mediaQuery.addListener(syncAutoTheme);
  }
}

function bindNamedScenarios() {
  const nameEl = document.querySelector("#scenario-name");
  const selectEl = document.querySelector("#scenario-select");
  const saveBtn = document.querySelector("#scenario-save");
  const loadBtn = document.querySelector("#scenario-load");
  const exportBtn = document.querySelector("#scenario-export");
  const importBtn = document.querySelector("#scenario-import");
  const importFileEl = document.querySelector("#scenario-import-file");
  const deleteBtn = document.querySelector("#scenario-delete");
  const statusEl = document.querySelector("#scenario-status");
  const syncSignInBtn = document.querySelector("#sync-sign-in");
  const syncPullBtn = document.querySelector("#sync-pull");
  const syncPushBtn = document.querySelector("#sync-push");
  const syncSignOutBtn = document.querySelector("#sync-sign-out");
  const syncAutoPullEl = document.querySelector("#sync-auto-pull");
  const syncAutoPushSaveEl = document.querySelector("#sync-auto-push-save");
  const syncAccountEl = document.querySelector("#sync-account");
  const syncMetaEl = document.querySelector("#sync-meta");
  const syncStatusEl = document.querySelector("#sync-status");
  if (
    !nameEl ||
    !selectEl ||
    !saveBtn ||
    !loadBtn ||
    !exportBtn ||
    !importBtn ||
    !importFileEl ||
    !deleteBtn ||
    !statusEl ||
    !syncSignInBtn ||
    !syncPullBtn ||
    !syncPushBtn ||
    !syncSignOutBtn ||
    !syncAutoPullEl ||
    !syncAutoPushSaveEl ||
    !syncAccountEl ||
    !syncMetaEl ||
    !syncStatusEl
  ) {
    return;
  }

  const setMessage = (el, message = "", tone = "") => {
    el.textContent = message;
    if (tone) el.dataset.tone = tone;
    else delete el.dataset.tone;
  };
  const setStatus = (message = "", tone = "") => setMessage(statusEl, message, tone);
  const setSyncStatus = (message = "", tone = "") => setMessage(syncStatusEl, message, tone);
  const setSyncAccount = (message = "", tone = "") => setMessage(syncAccountEl, message, tone);
  const setSyncMeta = (message = "", tone = "") => setMessage(syncMetaEl, message, tone);
  const refreshSyncMeta = () => setSyncMeta(buildSyncActivityMessage(readSyncActivity()), "");

  const populateScenarioOptions = (selectedName = "") => {
    const scenarios = readNamedScenarios();
    const names = Object.entries(scenarios)
      .sort(([, a], [, b]) => String(b?.savedAt || "").localeCompare(String(a?.savedAt || "")))
      .map(([name]) => name);

    selectEl.innerHTML = '<option value="">Select saved scenario</option>';
    names.forEach((name) => {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      if (name === selectedName) option.selected = true;
      selectEl.appendChild(option);
    });
  };

  const getSelectedScenarioName = () => String(selectEl.value || nameEl.value || "").trim();
  const sanitizeScenarioFileName = (name) =>
    String(name || "scenario")
      .trim()
      .replace(/[^a-z0-9-_]+/gi, "-")
      .replace(/^-+|-+$/g, "") || "scenario";

  const isValidScenarioRecord = (scenario) =>
    !!scenario &&
    typeof scenario === "object" &&
    scenario.state &&
    typeof scenario.state === "object";

  const refreshSyncUi = async (sessionOverride) => {
    const configured = isSyncConfigured();
    const session = sessionOverride === undefined ? readSyncSession() : sessionOverride;
    syncPullBtn.disabled = !configured || !session;
    syncPushBtn.disabled = !configured || !session;
    syncSignOutBtn.disabled = !configured || !session;
    if (!configured) {
      setSyncAccount("Dropbox sync not configured. Add your Dropbox app key to sync-config.js.", "");
      return;
    }
    const account = await getScenarioSyncAccount(session);
    if (account?.email || account?.name || account?.id) {
      const identity = account.email || account.name || account.id;
      setSyncAccount(`Connected to Dropbox as ${identity}`, "success");
      return;
    }
    setSyncAccount("Not connected. Connect Dropbox to sync scenarios across devices.", "");
  };

  const pullScenariosNow = async ({ showStatus = true } = {}) => {
    if (!isSyncConfigured()) {
      if (showStatus) setSyncStatus("Dropbox sync not configured. Add your Dropbox app key to sync-config.js.", "error");
      await refreshSyncUi(null);
      return null;
    }
    const session = await ensureScenarioSyncSession();
    if (!session) {
      if (showStatus) setSyncStatus("Connect Dropbox first to load scenarios.", "error");
      await refreshSyncUi(null);
      return null;
    }
    if (showStatus) setSyncStatus("Loading scenarios from Dropbox...", "");
    const selectedBeforeSync = String(selectEl.value || "").trim();
    const result = await pullNamedScenariosFromSync(session);
    populateScenarioOptions(selectedBeforeSync);
    writeSyncActivityRecord("pull", result.remoteCount);
    refreshSyncMeta();
    await refreshSyncUi(session);
    if (showStatus) setSyncStatus(`Loaded ${result.remoteCount} Dropbox scenarios. ${result.mergedCount} scenarios are now available locally.`, "success");
    return result;
  };

  saveBtn.addEventListener("click", async () => {
    const name = String(nameEl.value || "").trim();
    if (!name) {
      setStatus("Enter a scenario name first.", "error");
      return;
    }
    const scenarios = readNamedScenarios();
    scenarios[name] = {
      savedAt: new Date().toISOString(),
      state: captureInputState(),
      linkedWeightOverrides,
    };
    writeNamedScenarios(scenarios);
    populateScenarioOptions(name);
    selectEl.value = name;
    setStatus(`Saved scenario: ${name}`, "success");

    if (!isSyncConfigured()) return;
    if (!syncAutoPushSaveEl.checked) {
      setSyncStatus("Saved locally. Use Save to Dropbox when you want to update the shared sync file.", "");
      return;
    }

    try {
      const session = await ensureScenarioSyncSession();
      if (!session) {
        setSyncStatus("Saved locally. Connect Dropbox to enable auto-save.", "");
        await refreshSyncUi(null);
        return;
      }
      setSyncStatus("Saved locally. Saving to Dropbox...", "");
      const result = await pushNamedScenariosToSync(session);
      writeSyncActivityRecord("push", result.pushedCount);
      refreshSyncMeta();
      await refreshSyncUi(session);
      setSyncStatus(`Saved locally and to Dropbox (${result.pushedCount} scenarios).`, "success");
    } catch (error) {
      setSyncStatus(describeSyncError(error, "Saved locally, but Dropbox save failed"), "error");
    }
  });

  loadBtn.addEventListener("click", () => {
    const name = String(selectEl.value || "").trim();
    if (!name) {
      setStatus("Choose a saved scenario to load.", "error");
      return;
    }
    const scenario = readNamedScenarios()[name];
    if (!scenario?.state) {
      setStatus(`Scenario not found: ${name}`, "error");
      populateScenarioOptions();
      return;
    }
    applyCapturedInputState(scenario.state);
    replaceLinkedWeightOverrides(scenario.linkedWeightOverrides || {});
    persistInputState();
    recalculateAllForms();
    nameEl.value = name;
    setStatus(`Loaded scenario: ${name}`, "success");
  });

  exportBtn.addEventListener("click", () => {
    const name = getSelectedScenarioName();
    if (!name) {
      setStatus("Choose a saved scenario to export.", "error");
      return;
    }
    const scenario = readNamedScenarios()[name];
    if (!isValidScenarioRecord(scenario)) {
      setStatus(`Scenario not found: ${name}`, "error");
      populateScenarioOptions();
      return;
    }

    const exportPayload = {
      type: SYNC_SCENARIO_FILE_TYPE,
      version: SYNC_SCENARIO_FILE_VERSION,
      appVersion: APP_VERSION,
      exportedAt: new Date().toISOString(),
      scenario: {
        name,
        savedAt: scenario.savedAt || "",
        state: scenario.state,
        linkedWeightOverrides: sanitizeLinkedWeightOverrides(scenario.linkedWeightOverrides || {}),
      },
    };

    try {
      const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${sanitizeScenarioFileName(name)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setStatus(`Exported scenario: ${name}`, "success");
    } catch {
      setStatus("Unable to export scenario.", "error");
    }
  });

  importBtn.addEventListener("click", () => {
    importFileEl.click();
  });

  importFileEl.addEventListener("change", async () => {
    const [file] = Array.from(importFileEl.files || []);
    if (!file) return;

    try {
      const raw = await file.text();
      const payload = JSON.parse(raw);
      const importedScenario = payload?.scenario;
      const importedName = String(importedScenario?.name || "").trim();
      if (
        payload?.type !== SYNC_SCENARIO_FILE_TYPE ||
        payload?.version !== SYNC_SCENARIO_FILE_VERSION ||
        !importedName ||
        !isValidScenarioRecord(importedScenario)
      ) {
        throw new Error("Invalid scenario file");
      }

      const scenarios = readNamedScenarios();
      scenarios[importedName] = {
        savedAt: importedScenario.savedAt || new Date().toISOString(),
        state: importedScenario.state,
        linkedWeightOverrides: sanitizeLinkedWeightOverrides(importedScenario.linkedWeightOverrides || {}),
      };
      writeNamedScenarios(scenarios);
      populateScenarioOptions(importedName);
      selectEl.value = importedName;
      nameEl.value = importedName;
      setStatus(`Imported scenario: ${importedName}`, "success");
      if (isSyncConfigured()) {
        setSyncStatus("Imported locally. Use Save to Dropbox when you want to update the shared sync file.", "");
      }
    } catch (error) {
      setStatus(error?.message === "Invalid scenario file" ? error.message : "Unable to import scenario file.", "error");
    } finally {
      importFileEl.value = "";
    }
  });

  deleteBtn.addEventListener("click", () => {
    const name = String(selectEl.value || nameEl.value || "").trim();
    if (!name) {
      setStatus("Choose a saved scenario to delete.", "error");
      return;
    }
    const scenarios = readNamedScenarios();
    if (!(name in scenarios)) {
      setStatus(`Scenario not found: ${name}`, "error");
      populateScenarioOptions();
      return;
    }
    delete scenarios[name];
    writeNamedScenarios(scenarios);
    populateScenarioOptions();
    if (nameEl.value.trim() === name) nameEl.value = "";
    setStatus(`Deleted scenario: ${name}`, "success");
    if (isSyncConfigured()) {
      setSyncStatus("Deleted locally. Use Save to Dropbox when you want to update the shared sync file.", "");
    }
  });

  selectEl.addEventListener("change", () => {
    if (selectEl.value) nameEl.value = selectEl.value;
    setStatus("");
  });

  syncSignInBtn.addEventListener("click", async () => {
    if (!isSyncConfigured()) {
      setSyncStatus("Dropbox sync not configured. Add your Dropbox app key to sync-config.js.", "error");
      await refreshSyncUi(null);
      return;
    }
    try {
      setSyncStatus("Redirecting to Dropbox...", "");
      await startDropboxAuthFlow();
    } catch (error) {
      setSyncStatus(describeSyncError(error, "Unable to connect Dropbox"), "error");
    }
  });

  syncPullBtn.addEventListener("click", async () => {
    try {
      await pullScenariosNow({ showStatus: true });
    } catch (error) {
      setSyncStatus(describeSyncError(error, "Unable to pull scenarios from Dropbox"), "error");
    }
  });

  syncPushBtn.addEventListener("click", async () => {
    if (!isSyncConfigured()) {
      setSyncStatus("Dropbox sync not configured. Add your Dropbox app key to sync-config.js.", "error");
      await refreshSyncUi(null);
      return;
    }
    try {
      const session = await ensureScenarioSyncSession();
      if (!session) {
        setSyncStatus("Connect Dropbox first to save scenarios.", "error");
        await refreshSyncUi(null);
        return;
      }
      setSyncStatus("Saving scenarios to Dropbox...", "");
      const result = await pushNamedScenariosToSync(session);
      await refreshSyncUi(session);
      writeSyncActivityRecord("push", result.pushedCount);
      refreshSyncMeta();
      setSyncStatus(`Saved ${result.pushedCount} scenarios to Dropbox.`, "success");
    } catch (error) {
      setSyncStatus(describeSyncError(error, "Unable to push scenarios to Dropbox"), "error");
    }
  });

  syncSignOutBtn.addEventListener("click", async () => {
    clearSyncAuthState();
    clearSyncSession();
    await refreshSyncUi(null);
    setSyncStatus("Disconnected Dropbox sync on this device.", "success");
  });

  populateScenarioOptions();
  refreshSyncMeta();
  void (async () => {
    try {
      const session = await ensureScenarioSyncSession();
      await refreshSyncUi(session);
      if (session) {
        if (syncAutoPullEl.checked) {
          await pullScenariosNow({ showStatus: false });
          setSyncStatus("Dropbox connected. Shared scenarios loaded automatically.", "success");
        } else {
          setSyncStatus("Dropbox connected. Load or save scenarios when you are ready.", "success");
        }
      } else {
        setSyncStatus("", "");
      }
    } catch (error) {
      clearSyncAuthState();
      clearSyncSession();
      await refreshSyncUi(null);
      setSyncStatus(describeSyncError(error, "Unable to initialize Dropbox sync"), "error");
    }
  })();
}

function setAltFlRangeLabels() {
  const setRangeText = (selector, text) => {
    const el = document.querySelector(selector);
    if (el) el.textContent = text;
  };

  const formatFlRange = (minFl, maxFl) => {
    if (!Number.isFinite(minFl) || !Number.isFinite(maxFl)) return "";
    return `(FL${format(minFl, 0)}-${format(maxFl, 0)})`;
  };

  const holdAltAxis = FLAPS_UP_TABLE?.altitudesFt;
  if (Array.isArray(holdAltAxis) && holdAltAxis.length > 1) {
    const minFl = holdAltAxis[0] / 100;
    const maxFl = holdAltAxis[holdAltAxis.length - 1] / 100;
    setRangeText("#hold-alt-range", formatFlRange(minFl, maxFl));
  }

  const formatDiversionLimits = (ranges) => {
    if (
      !Number.isFinite(ranges.minGnm) ||
      !Number.isFinite(ranges.maxGnm) ||
      !Number.isFinite(ranges.minWindKt) ||
      !Number.isFinite(ranges.maxWindKt) ||
      !Number.isFinite(ranges.minAltitudeFt) ||
      !Number.isFinite(ranges.maxAltitudeFt) ||
      !Number.isFinite(ranges.minWeightT) ||
      !Number.isFinite(ranges.maxWeightT)
    ) {
      return "";
    }
    return `Limits: GNM ${format(ranges.minGnm, 0)}-${format(ranges.maxGnm, 0)} | Wind ${format(ranges.minWindKt, 0)} to +${format(ranges.maxWindKt, 0)} kt | Alt ${format(ranges.minAltitudeFt, 0)}-${format(ranges.maxAltitudeFt, 0)} ft (FL${format(ranges.minAltitudeFt / 100, 0)}-${format(ranges.maxAltitudeFt / 100, 0)}) | Weight ${format(ranges.minWeightT, 1)}-${format(ranges.maxWeightT, 1)} t`;
  };
  setRangeText("#div-low-limits", formatDiversionLimits(getDiversionBandRanges("low")));
  setRangeText("#div-high-limits", formatDiversionLimits(getDiversionBandRanges("high")));

  const { minFl, maxFl } = getLrcTableFlRange();
  const lrcRangeText = formatFlRange(minFl, maxFl);
  setRangeText("#lt-fl-range", lrcRangeText);
  setRangeText("#lt-new-fl-range", lrcRangeText);
  setRangeText("#lrc-alt-current-range", lrcRangeText);

  const altLimitRanges = getLrcAltitudeLimitsRanges();
  if (Number.isFinite(altLimitRanges.minOptimumAltFt) && Number.isFinite(altLimitRanges.maxOptimumAltFt)) {
    setRangeText(
      "#lrc-alt-target-range",
      formatFlRange(altLimitRanges.minOptimumAltFt / 100, altLimitRanges.maxOptimumAltFt / 100),
    );
  }

  const driftdownRanges = getDriftdownRanges();
  if (Number.isFinite(driftdownRanges.minGnm) && Number.isFinite(driftdownRanges.maxGnm)) {
    setRangeText("#eo-drift-gnm-range", `(${format(driftdownRanges.minGnm, 0)}-${format(driftdownRanges.maxGnm, 0)})`);
  }
  if (Number.isFinite(driftdownRanges.minWindKt) && Number.isFinite(driftdownRanges.maxWindKt)) {
    setRangeText(
      "#eo-drift-wind-range",
      `(${format(driftdownRanges.minWindKt, 0)} to +${format(driftdownRanges.maxWindKt, 0)})`,
    );
  }

  const eoDiversionRanges = getEoDiversionRanges();
  if (Number.isFinite(eoDiversionRanges.minGnm) && Number.isFinite(eoDiversionRanges.maxGnm)) {
    setRangeText("#eo-div-gnm-range", `(${format(eoDiversionRanges.minGnm, 0)}-${format(eoDiversionRanges.maxGnm, 0)})`);
  }
  if (Number.isFinite(eoDiversionRanges.minWindKt) && Number.isFinite(eoDiversionRanges.maxWindKt)) {
    setRangeText(
      "#eo-div-wind-range",
      `(${format(eoDiversionRanges.minWindKt, 0)} to +${format(eoDiversionRanges.maxWindKt, 0)})`,
    );
  }
  if (Number.isFinite(eoDiversionRanges.minAltitudeFt) && Number.isFinite(eoDiversionRanges.maxAltitudeFt)) {
    setRangeText(
      "#eo-div-alt-range",
      formatFlRange(eoDiversionRanges.minAltitudeFt / 100, eoDiversionRanges.maxAltitudeFt / 100),
    );
  }

  const maxGeopotentialM = ISA_LAYER_BASES_M[ISA_LAYER_BASES_M.length - 1];
  const maxGeometricM = (EARTH_RADIUS_M * maxGeopotentialM) / (EARTH_RADIUS_M - maxGeopotentialM);
  const maxIsaFl = (maxGeometricM * M_TO_FT) / 100;
  setRangeText("#conv-fl-range", `(>0 to FL${format(maxIsaFl, 0)})`);
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  if (!window.isSecureContext) return;
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });

  navigator.serviceWorker
    .register("./sw.js")
    .then((registration) => {
      registration.update().catch(() => {});

      const activateWaitingWorker = () => {
        if (registration.waiting) {
          registration.waiting.postMessage({ type: "SKIP_WAITING" });
        }
      };

      activateWaitingWorker();
      registration.addEventListener("updatefound", () => {
        const installing = registration.installing;
        if (!installing) return;
        installing.addEventListener("statechange", () => {
          if (installing.state === "installed" && navigator.serviceWorker.controller) {
            activateWaitingWorker();
          }
        });
      });
    })
    .catch(() => {});
}

function setAppVersionLabel() {
  const versionEl = document.querySelector("#app-version");
  if (versionEl) {
    versionEl.textContent = `Version ${APP_VERSION}`;
  }
}

applyTheme();
setAppVersionLabel();
setAltFlRangeLabels();
installCollapsiblePanels();
restorePersistedInputState();
installInputStatePersistence();
installClickToClearInputs();
bindLinkedStartWeightFields();
bindTripFuel();
bindDpaCalculator();
bindLrcAltitudeLimits();
bindEngineOut();
bindDiversion();
bindGoAround();
bindHolding();
bindLoseTime();
bindConversion();
bindCogLimit();
bindGlobalSettings();
bindThemeAutoUpdates();
bindNamedScenarios();
registerServiceWorker();

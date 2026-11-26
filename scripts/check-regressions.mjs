import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

class StubElement {
  constructor() {
    this.value = "";
    this.disabled = false;
    this.readOnly = false;
    this.innerHTML = "";
    this.textContent = "";
    this.type = "number";
    this.checked = false;
    this.dataset = {};
    this.style = {};
    this.children = [];
    this.classList = {
      toggle() {},
      add() {},
      remove() {},
      contains() {
        return false;
      },
    };
  }

  addEventListener() {}

  dispatchEvent() {
    return true;
  }

  querySelector() {
    return null;
  }

  querySelectorAll() {
    return [];
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  setAttribute() {}

  matches() {
    return false;
  }
}

function buildRuntimeContext() {
  const elements = new Map();
  const getElement = (selector) => {
    if (!elements.has(selector)) {
      elements.set(selector, new StubElement());
    }
    return elements.get(selector);
  };

  getElement("#hold-total-min").value = "";
  getElement("#hold-inbound-min").value = "1";

  const context = {
    window: { isSecureContext: false },
    document: {
      querySelector: (selector) => getElement(selector),
      querySelectorAll: () => [],
      addEventListener() {},
      createElement: () => new StubElement(),
    },
    navigator: {},
    localStorage: {
      getItem: () => null,
      setItem() {},
      removeItem() {},
    },
    console,
    setTimeout: (fn) => fn(),
    clearTimeout() {},
    Event: function Event(type, options = {}) {
      this.type = type;
      this.bubbles = !!options.bubbles;
    },
    Response,
    URL,
    Math,
    Number,
    String,
    Array,
    Object,
    JSON,
    Date,
    isFinite,
    parseFloat,
    parseInt,
    Element: StubElement,
    HTMLInputElement: StubElement,
  };

  vm.createContext(context);
  return context;
}

function loadApp(context) {
  const dataFiles = [
    "data.js",
    "lrc_data.js",
    "lrc_altitude_limits_data.js",
    "driftdown_data.js",
    "eo_diversion_data.js",
    "flaps_up_data.js",
    "diversion_data.js",
    "go_around_data.js",
    "brake_cooling_data.js",
    "brake_cooling.js",
  ];

  for (const file of dataFiles) {
    vm.runInContext(fs.readFileSync(file, "utf8"), context, { filename: file });
  }

  vm.runInContext(fs.readFileSync("app.js", "utf8"), context, { filename: "app.js" });
}

function assertApprox(actual, expected, tolerance, message) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${message}: expected ${expected} +/- ${tolerance}, got ${actual}`,
  );
}

const context = buildRuntimeContext();
loadApp(context);

const trip = context.calculateTripFuel(599, 60, 172.9, 0, 0, 0);
assertApprox(trip.flightFuelKg, 6528.4, 1e-6, "Trip fuel flight fuel");
assertApprox(trip.frfKg, 2135.45, 1e-6, "Trip fuel FRF");
assertApprox(trip.contingencyKg, 338.65, 1e-9, "Trip fuel contingency");
assertApprox(trip.totalFuelKg, 9202.5, 1e-6, "Trip fuel total fuel");
assertApprox(trip.timeMinutes, 74.8968, 1e-6, "Trip fuel time");
assert.equal(trip.suggestedAltFt, 39710, "Trip fuel suggested altitude");

const tripTimeBase = context.calculateTripTimeBase(599, 60);
assertApprox(tripTimeBase.timeMinutes, 74.8968, 1e-6, "Trip time base");
const resolvedWind = context.solveTripFuelWindFromTime(599, tripTimeBase.timeMinutes);
assertApprox(resolvedWind.resolvedWindKt, 60, 0.01, "Trip time-to-wind resolution");
assert.equal(context.formatHoursDecimalMinutes(tripTimeBase.timeMinutes), "1:14.9", "Trip time input format");

const tripCurrentWeight = context.solveTripFuelLandingWeightFromCurrentWeight(2000, 10, 200, 0);
assertApprox(tripCurrentWeight.solvedLandingWeightT, 178.504638671875, 1e-9, "Trip current-weight solved landing weight");
assertApprox(tripCurrentWeight.impliedFlightFuelBurnKg, 21495.412384033207, 1e-6, "Trip current-weight implied flight fuel");

const tripCurrentWeightLong = context.solveTripFuelLandingWeightFromCurrentWeight(7800, -10, 239.3, 0);
assertApprox(tripCurrentWeightLong.solvedLandingWeightT, 154.43115234375, 1e-9, "Trip current-weight long solved landing weight");
assertApprox(tripCurrentWeightLong.impliedFlightFuelBurnKg, 84868.72490692139, 1e-6, "Trip current-weight long implied flight fuel");

const loseTimeCruiseDescent = context.buildLoseTimeCruiseDescentOption({
  distanceNm: 160,
  startWeightT: 161,
  startFl: 400,
  requiredDelayMin: 2,
  cruiseWindKt: 0,
  distanceToTodNm: 80,
  descentIasKt: 280,
  perfAdjust: 0,
});
assertApprox(loseTimeCruiseDescent.baseline.totalTimeMin, 21.125938259130756, 1e-9, "Lose time option D baseline");
assertApprox(loseTimeCruiseDescent.targetTimeMin, 23.125938259130756, 1e-9, "Lose time option D target");
assertApprox(loseTimeCruiseDescent.solution.totalTimeMin, 23.125938259211466, 1e-9, "Lose time option D solution");
assertApprox(loseTimeCruiseDescent.requiredMach, 0.7353207804741569, 1e-9, "Lose time option D required Mach");
assertApprox(loseTimeCruiseDescent.solution.descentIasBelow10kKt, 250, 1e-9, "Lose time option D low IAS cap");
assertApprox(
  loseTimeCruiseDescent.solution.fixCrossingAltitudeFt,
  17553.191489361703,
  1e-9,
  "Lose time option D estimated fix crossing altitude",
);
assert.equal(loseTimeCruiseDescent.limitedByMaxMach, false, "Lose time option D normal solution");

const loseTimeCruiseDescentSlow = context.buildLoseTimeCruiseDescentOption({
  distanceNm: 160,
  startWeightT: 161,
  startFl: 400,
  requiredDelayMin: 2,
  cruiseWindKt: 0,
  distanceToTodNm: 80,
  descentIasKt: 220,
  perfAdjust: 0,
});
assertApprox(loseTimeCruiseDescentSlow.solution.descentIasBelow10kKt, 220, 1e-9, "Lose time option D low IAS match");
assertApprox(loseTimeCruiseDescentSlow.solution.totalTimeMin, 25.930443877329978, 1e-9, "Lose time option D slow solution");
assert.equal(loseTimeCruiseDescentSlow.limitedByMaxMach, false, "Lose time option D slow normal solution");

const diversionLow = context.diversionLrcFuelByBand("low", 400, -50, 28000, 180, 0, 0, 0);
assertApprox(diversionLow.adjustedFuelKg, 4639.375, 1e-6, "Low diversion flight fuel");
assertApprox(diversionLow.reserveCalcWeightT, 175.160625, 1e-6, "Low diversion landing weight");
assertApprox(diversionLow.frfKg, 2159.1865625, 1e-6, "Low diversion FRF");
assertApprox(diversionLow.contingencyKg, 342.7944791666667, 1e-6, "Low diversion contingency");
assertApprox(diversionLow.totalFuelKg, 7341.356041666668, 1e-6, "Low diversion total fuel");
assertApprox(diversionLow.timeMinutes, 68.775, 1e-6, "Low diversion time");

const diversionHigh = context.diversionLrcFuelByBand("high", 400, -50, 31000, 180, 0, 0, 0);
assertApprox(diversionHigh.adjustedFuelKg, 3975.1875, 1e-6, "High diversion flight fuel");
assertApprox(diversionHigh.reserveCalcWeightT, 175.8248125, 1e-6, "High diversion landing weight");
assertApprox(diversionHigh.frfKg, 2166.16053125, 1e-6, "High diversion FRF");
assertApprox(diversionHigh.contingencyKg, 344.01215625, 1e-6, "High diversion contingency");
assertApprox(diversionHigh.totalFuelKg, 6685.3601874999995, 1e-6, "High diversion total fuel");
assertApprox(diversionHigh.timeMinutes, 64.69375, 1e-6, "High diversion time");

const diversionHighAnmClamped = context.diversionLrcFuelByBand("high", 8400, -100, 31000, 220, 0, 0, 0);
assertApprox(diversionHighAnmClamped.anm, 10918, 1e-9, "High diversion headwind ANM");
assert.ok(
  diversionHighAnmClamped.warnings.some((warning) =>
    warning.includes("Air distance 10,918 ANM outside fuel/time table range") &&
    warning.includes("fuel/time clamped to 8,400 ANM")
  ),
  "High diversion warns when ANM exceeds fuel/time table",
);

const diversionHighManualContingency = context.diversionLrcFuelByBand("high", 400, -50, 31000, 180, 0, 0, 0, 500);
assertApprox(
  diversionHighManualContingency.contingencyKg,
  500,
  1e-9,
  "High diversion manual contingency override",
);
assertApprox(
  diversionHighManualContingency.totalFuelKg,
  diversionHigh.totalFuelKg + (500 - diversionHigh.contingencyKg),
  1e-6,
  "High diversion manual contingency total fuel",
);

const eoDiversion = context.eoDiversionFuelTime(120, 0, 25000, 200, 0);
assertApprox(eoDiversion.anm, 200, 1e-9, "EO diversion ANM");
assertApprox(eoDiversion.flightFuelKg, 1625, 1e-6, "EO diversion fuel");
assertApprox(eoDiversion.timeMinutes, 34.25, 1e-6, "EO diversion time");

const cog = context.calculateCogLimit(170.5);
assertApprox(cog.cgLimitPctMac, 31.0075, 1e-6, "CoG limit");
assert.equal(cog.warnings.length, 0, "CoG limit warnings");

// Brake cooling: published chart points, interpolation, corrections and chart boundaries.
const ref = context.brakeReferenceEnergy;
assert.equal(ref(270, 0, 120, 0), 50);
assert.equal(ref(150, 20, 120, 10000), 42.5, "Overlapping 10,000 ft column");
assert.equal(ref(110, 40, 200, 14000), 88.8);
assert.equal(ref(230, 40, 180, 12000), 143.4, "Exact point adjacent to a blank");
assert.equal(ref(190, 15, 140, 5000), 58.3);
assert.equal(ref(130, 20, 140, 10000), 48.5, "Exact point beside obscured cell");
assert.throws(() => ref(130, 20, 140, 12000), /obscured/);
assert.throws(() => ref(129, 18, 137, 12500), /obscured/);
assert.throws(() => ref(230, 40, 180, 12500), /blank/);
assert.throws(() => ref(270, 15, 180, 10000), /blank/);
assert.throws(() => ref(270, 15, 120, 14001), /pressure altitude/);
assert.throws(() => ref(109, 15, 120, 0), /aircraft weight/);
assert.throws(() => ref(190, -1, 120, 0), /OAT/);
// Midpoint on all four axes: arithmetic mean of the 16 surrounding chart entries.
const corners = [27, 30.8, 36.8, 42.4, 27.9, 31.9, 38.1, 43.9,
  29.2, 33.5, 40.1, 46.3, 30.2, 34.7, 41.5, 47.9];
assertApprox(ref(200, 5, 110, 2500), corners.reduce((a, b) => a + b) / 16, 1e-10, "4D interpolation");
assertApprox(ref(110, 0, 100, 11000), 23.75, 1e-10, "10,000–12,000 ft interval");
assertApprox(ref(110, 0, 100, 13000), 25.1, 1e-10, "12,000–14,000 ft interval");

const brakeInput = {
  weight: 270, speed: 120, basis: "ias", wind: 0, oat: 0, altitude: 0,
  event: "ab4", reverse: "two", taxi: 0, deactivated: 0, residual: 0,
};
const stop = (changes = {}) => context.calculateBrakeEvent({ ...brakeInput, ...changes });
const nominalStop = stop();
assert.equal(nominalStop.reference, 50);
assert.equal(nominalStop.eventEnergy, 24.9);
assertApprox(nominalStop.schedule.ground, 30.92, 1e-10, "Landing cooling on ground");
assertApprox(nominalStop.schedule.airborne, 3.092, 1e-10, "Landing cooling in flight");
assert.equal(stop({ wind: 20, speed: 130 }).reference, 50);
assert.equal(stop({ wind: -10, speed: 105 }).reference, 50);
assert.throws(() => stop({ speed: 100, wind: 2 }), /table entry speed/);
assert.equal(stop({ basis: "gs", wind: NaN, altitude: NaN, oat: NaN }).reference, 52.5);
assert.equal(stop({ event: "rto", speed: 200, oat: 40 }).total, 133.4);
assert.throws(() => stop({ speed: 200, oat: 40 }), /landing table covers 20–120/);
assert.throws(() => stop({ weight: 110, speed: 100 }), /landing table covers 20–120/);
assert.throws(() => stop({ residual: -2 }), /residual energy/);
assert.throws(() => stop({ taxi: NaN }), /taxi distance/);
assert.equal(stop({ event: "rto", weight: 110, speed: 100 }).schedule.zone, "No special procedure required");
for (const [reverse, energies] of Object.entries({
  none: [43.7, 40.7, 38.5, 36.6, 34.8, 31.6],
  two: [39.6, 31.6, 24.9, 18.9, 13.9, 9.5],
})) {
  ["manual", "auto", "ab4", "ab3", "ab2", "ab1"].forEach((event, i) => {
    assert.equal(stop({ event, reverse }).eventEnergy, energies[i]);
  });
}
for (const [count, factor] of [[0, 1], [1, 1.15], [2, 1.34]]) {
  assertApprox(stop({ taxi: 2, residual: 3, deactivated: count }).total, 3 + 26.9 * factor, 1e-10, "Total energy");
}
for (const [energy, indication, ground, airborne] of [
  [20, 2.4, 13, 1.3], [21, 2.6, 20, 2], [26, 3.1, 34, 3.4],
  [30, 3.7, 49, 4.9], [35, 4.3, 62, 6.2], [39, 4.8, 71, 7.1], [40, 4.9, 73, 7.3],
]) {
  for (const [value, basis] of [[energy, "energy"], [indication, "indication"]]) {
    const entry = context.brakeSchedule(value, basis);
    assertApprox(entry.ground, ground, 1e-10, "Ground cooling column");
    assertApprox(entry.airborne, airborne, 1e-10, "Gear-down cooling column");
  }
}
for (const [basis, cases] of Object.entries({
  energy: [[19, "No special procedure required"], [19.01, "Cooling required"], [40.01, "Caution zone"],
    [41, "Caution zone"], [56, "Caution zone"], [56.01, "Fuse plug melt zone"], [57, "Fuse plug melt zone"]],
  indication: [[2.3, "No special procedure required"], [5, "Caution zone"], [7, "Caution zone"], [7.1, "Fuse plug melt zone"]],
})) {
  for (const [value, expected] of cases) assert.equal(context.brakeSchedule(value, basis).zone, expected);
}
assert.equal(context.brakeSchedule(2.5, "indication").ground, 16.5);
assert.throws(() => context.brakeSchedule(4.91, "indication"), /decimal place/);

console.log("Regression checks passed.");

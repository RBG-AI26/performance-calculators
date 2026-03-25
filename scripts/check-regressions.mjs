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
assertApprox(trip.contingencyKg, 350, 1e-9, "Trip fuel contingency");
assertApprox(trip.totalFuelKg, 9213.85, 1e-6, "Trip fuel total fuel");
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

const diversionLow = context.diversionLrcFuelByBand("low", 400, -50, 28000, 180, 0, 0, 0);
assertApprox(diversionLow.adjustedFuelKg, 4639.375, 1e-6, "Low diversion flight fuel");
assertApprox(diversionLow.reserveCalcWeightT, 175.160625, 1e-6, "Low diversion landing weight");
assertApprox(diversionLow.frfKg, 2159.1865625, 1e-6, "Low diversion FRF");
assertApprox(diversionLow.totalFuelKg, 7348.5615625, 1e-6, "Low diversion total fuel");
assertApprox(diversionLow.timeMinutes, 68.775, 1e-6, "Low diversion time");

const diversionHigh = context.diversionLrcFuelByBand("high", 400, -50, 31000, 180, 0, 0, 0);
assertApprox(diversionHigh.adjustedFuelKg, 3916.875, 1e-6, "High diversion flight fuel");
assertApprox(diversionHigh.reserveCalcWeightT, 175.883125, 1e-6, "High diversion landing weight");
assertApprox(diversionHigh.frfKg, 2166.7728125, 1e-6, "High diversion FRF");
assertApprox(diversionHigh.totalFuelKg, 6633.6478125, 1e-6, "High diversion total fuel");
assertApprox(diversionHigh.timeMinutes, 64.69375, 1e-6, "High diversion time");

const eoDiversion = context.eoDiversionFuelTime(120, 0, 25000, 200, 0);
assertApprox(eoDiversion.anm, 200, 1e-9, "EO diversion ANM");
assertApprox(eoDiversion.flightFuelKg, 1625, 1e-6, "EO diversion fuel");
assertApprox(eoDiversion.timeMinutes, 34.25, 1e-6, "EO diversion time");

const cog = context.calculateCogLimit(170.5);
assertApprox(cog.cgLimitPctMac, 31.0075, 1e-6, "CoG limit");
assert.equal(cog.warnings.length, 0, "CoG limit warnings");

console.log("Regression checks passed.");

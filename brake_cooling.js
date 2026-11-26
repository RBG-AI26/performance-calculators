const BRAKE_WEIGHTS = [110, 130, 150, 170, 190, 210, 230, 270];
const BRAKE_OATS = [0, 10, 15, 20, 30, 40];
const BRAKE_SPEEDS = [100, 120, 140, 160, 180, 200];
const BRAKE_ALTITUDES = [0, 5000, 10000, 12000, 14000];

function checkedBrakeNumber(value, label, min = 0, max = Infinity) {
  if (!Number.isFinite(value)) throw new Error(`Enter ${label}.`);
  if (value < min || value > max) {
    const range = Number.isFinite(max) ? `between ${min} and ${max}` : `at least ${min}`;
    throw new Error(`Enter ${label} ${range}.`);
  }
  return value;
}

function brakeReferenceEnergy(weight, oat, speed, altitude) {
  const axes = [BRAKE_WEIGHTS, BRAKE_OATS, BRAKE_SPEEDS, BRAKE_ALTITUDES];
  const values = [weight, oat, speed, altitude];
  const labels = ["aircraft weight (t)", "OAT (°C)", "table entry speed (kt)", "pressure altitude (ft)"];
  const brackets = axes.map((axis, i) => {
    checkedBrakeNumber(values[i], labels[i], axis[0], axis[axis.length - 1]);
    return findBracket(axis, values[i]);
  });

  // Visit only the corners contributing to the interpolation. An exact chart
  // point remains usable even if the neighbouring speed or altitude is blank.
  function lookup(indices) {
    if (indices.length === brackets.length) {
      const [w, o, s, a] = indices;
      const cell = BRAKE_REFERENCE[BRAKE_WEIGHTS[w]][o][s * BRAKE_ALTITUDES.length + a];
      if (!Number.isFinite(cell)) {
        const reason = cell === null ? "blank" : "obscured";
        throw new Error(`Table 1 cell is ${reason} at ${BRAKE_WEIGHTS[w]} t, ${BRAKE_OATS[o]} °C, ${BRAKE_SPEEDS[s]} kt and ${format(BRAKE_ALTITUDES[a], 0)} ft. This lookup requires that cell.`);
      }
      return cell;
    }
    const { i0, i1, t } = brackets[indices.length];
    if (t === 1) return lookup([...indices, i1]);
    const lower = lookup([...indices, i0]);
    if (t === 0) return lower;
    const upper = lookup([...indices, i1]);
    return lower + t * (upper - lower);
  }
  return lookup([]);
}

function brakeSchedule(value, basis) {
  const temperature = basis === "indication";
  checkedBrakeNumber(value, temperature ? "the hottest brake indication" : "total brake energy");
  if (temperature && !Number.isInteger(value * 10)) {
    throw new Error("Enter the MFD indication to one decimal place.");
  }
  if (temperature ? value < 2.4 : value <= 19) return { zone: "No special procedure required" };
  // Enter the higher published column in the gaps between whole-energy bands.
  if (temperature ? value >= 7.1 : value > 56) return { zone: "Fuse plug melt zone" };
  if (temperature ? value >= 5.0 : value > 40) return { zone: "Caution zone" };
  const axis = BRAKE_COOLING[basis];
  const entry = Math.max(axis[0], value);
  return {
    zone: "Cooling required",
    ground: linear(axis, BRAKE_COOLING.ground, entry),
    airborne: linear(axis, BRAKE_COOLING.airborne, entry),
  };
}

const BRAKE_ENERGY_FACTORS = [1, 1.15, 1.34];

function calculateBrakeEvent({ weight, speed, basis, wind, oat, altitude, event, reverse, taxi, deactivated, residual }) {
  checkedBrakeNumber(speed, "brakes-on speed (kt)");
  let tableSpeed = speed;
  if (basis === "gs") {
    altitude = 0;
    oat = 15;
  } else if (basis === "ias") {
    checkedBrakeNumber(wind, "wind component (kt)", -Infinity);
    tableSpeed -= wind * (wind >= 0 ? 0.5 : 1.5);
  } else {
    throw new Error("Select a speed basis.");
  }
  const reference = brakeReferenceEnergy(weight, oat, tableSpeed, altitude);
  let eventEnergy = reference;
  if (event !== "rto") {
    const landingRow = BRAKE_LANDING[reverse]?.[event];
    if (!Array.isArray(landingRow)) throw new Error("Select a landing brake setting and reverse thrust.");
    if (reference < 20 || reference > 120) {
      throw new Error(`Reference energy is ${format(reference, 3)} million ft·lbf per brake. The landing table covers 20–120.`);
    }
    eventEnergy = linear(BRAKE_EVENT_AXIS, landingRow, reference);
  }
  checkedBrakeNumber(taxi, "taxi distance (statute miles)");
  checkedBrakeNumber(residual, "residual energy per operating brake");
  const multiplier = BRAKE_ENERGY_FACTORS[deactivated];
  if (!Number.isFinite(multiplier)) throw new Error("Select the number of deactivated brakes.");
  const added = (eventEnergy + taxi) * multiplier;
  const total = residual + added;
  // Normalise floating-point noise at exact chart boundaries.
  const schedule = brakeSchedule(Number(total.toFixed(10)), "energy");
  return { tableSpeed, oat, altitude, reference, eventEnergy, added, total, schedule };
}

function bindBrakeCooling() {
  const form = document.querySelector("#brake-cooling-form");
  const out = document.querySelector("#brake-cooling-out");
  const note = document.querySelector("#bc-note");
  if (!form || !out) return;
  const field = (id) => document.querySelector(`#bc-${id}`);
  const number = (id) => field(id).valueAsNumber;
  function update() {
    const isEvent = field("method").value === "energy";
    const isIas = field("basis").value === "ias";
    const event = field("event").value;
    const visible = { event: isEvent, indication: !isEvent, landing: isEvent && event !== "rto", ias: isEvent && isIas };
    form.querySelectorAll("[data-brake-field]").forEach((label) => {
      label.hidden = !visible[label.dataset.brakeField];
      label.querySelector("input, select").disabled = label.hidden;
    });
    if (!isEvent) {
      note.textContent = "Use the hottest MFD indication 10–15 minutes after a complete stop, or in flight with the gear retracted.";
    } else {
      note.textContent = isIas
        ? "Table 1 entry speed is brakes-on KIAS minus half the headwind or plus 1.5 times the tailwind."
        : "Groundspeed enters Table 1 at sea level and 15 °C. Wind is ignored.";
    }
    try {
      const rows = [];
      let schedule;
      let entryNote;
      if (isEvent) {
        if (missingFieldsBanner(out, [
          fieldIsBlank(field("weight").value) ? "Aircraft weight" : "",
          fieldIsBlank(field("speed").value) ? "Brakes-on speed" : "",
        ])) return;
        const taxi = number("taxi");
        const residual = number("residual");
        const deactivated = Number(field("deactivated").value);
        const r = calculateBrakeEvent({
          weight: number("weight"), speed: number("speed"), basis: field("basis").value,
          wind: number("wind"), altitude: number("altitude"), oat: number("oat"),
          event, reverse: field("reverse").value, taxi, residual, deactivated,
        });
        schedule = r.schedule;
        const energy = Number(r.total.toFixed(10));
        if ((energy > 19 && energy < 20) || (energy > 40 && energy < 41) || (energy > 56 && energy < 57)) {
          entryNote = "Total energy falls between published bands. The higher band is shown.";
        }
        rows.push(
          ["Table 1 entry", `${format(r.tableSpeed)} kt · ${format(r.altitude)} ft · ${format(r.oat)} °C`],
          ["Reference energy per brake", format(r.reference, 3)],
          ["Event-adjusted energy per brake", format(r.eventEnergy, 3)],
        );
        if (taxi || deactivated || residual) {
          rows.push(["Energy added per operating brake", `(${format(r.eventEnergy, 3)} + ${format(taxi, 3)}) × ${BRAKE_ENERGY_FACTORS[deactivated]} = ${format(r.added, 3)}`]);
        }
        rows.push(["Total energy per operating brake", residual ? `${format(residual, 3)} + ${format(r.added, 3)} = ${format(r.total, 3)}` : format(r.total, 3)]);
      } else {
        if (missingFieldsBanner(out, [fieldIsBlank(field("indication").value) ? "Hottest brake indication" : ""])) return;
        schedule = brakeSchedule(number("indication"), "indication");
      }
      const result = [["Cooling schedule", schedule.zone]];
      if (schedule.ground !== undefined) {
        // Round cooling times upwards to the precision shown in Table 3.
        result.push(
          ["Ground cooling", `${Math.ceil(Number(schedule.ground.toFixed(10)))} min`],
          ["Gear down in flight", `${Math.ceil(Number((schedule.airborne * 10).toFixed(10))) / 10} min`],
        );
      }
      if (schedule.zone === "Caution zone") {
        result.push(["__warning__", "Wheel fuse plugs may melt. Delay take-off and inspect after one hour. If overheat occurs after take-off, extend the gear soon for at least 8 minutes."]);
      }
      if (schedule.zone === "Fuse plug melt zone") {
        result.push(["__warning__", "Clear the runway immediately. Unless required, do not set the parking brake. Do not approach the gear or attempt to taxi for one hour. Tyre, wheel and brake replacement may be required. If overheat occurs after take-off, extend the gear soon for at least 12 minutes."]);
      }
      if (!isEvent && number("indication") === 2.4) {
        entryNote = "Table 3 lists 2.4 in two columns. The longer cooling schedule is shown.";
      }
      if (entryNote) result.push(["__warning__", entryNote]);
      renderRows(out, [...result, ...rows]);
    } catch (error) {
      renderValidation(out, error.message);
    }
  }
  form.addEventListener("input", update);
  form.addEventListener("change", update);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    update();
  });
  update();
}

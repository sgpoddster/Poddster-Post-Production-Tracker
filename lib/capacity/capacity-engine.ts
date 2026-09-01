/**
 * Studio capacity engine.
 *
 * Pure, dependency-free, config-driven. Every scheduling rule lives in StudioConfig,
 * not in the code, so a what-if scenario is a different config object and nothing else.
 *
 * The same engine is meant to serve two callers:
 *   1. the live booking form  — canPlace() decides whether a requested slot is legal
 *   2. the capacity dashboard — analyseRange() / compareScenarios() for the what-if UI
 *
 * Keeping both on this module is the point: the rules can never drift apart.
 */

/* ------------------------------------------------------------------ types */

/** "HH:MM", 24-hour. */
export type Time = string;
/** "YYYY-MM-DD". */
export type IsoDate = string;

export interface RoomDef {
  id: string;
  label: string;
  /** Set names that live in this room. Only one may be used at a time. */
  sets: string[];
}

/** Two rooms that cannot run simultaneously (e.g. noise bleed). */
export interface Exclusion {
  rooms: [string, string];
  /** Minutes of clear air required between a booking in one and a booking in the other. */
  gapMinutes: number;
}

export interface OperatorLeave {
  date: IsoDate;
  operator: string;
}

export interface StudioConfig {
  rooms: RoomDef[];
  exclusions: Exclusion[];
  /** Changeover either side of a shoot. The operator is held for this window too. */
  buffers: { beforeMinutes: number; afterMinutes: number };
  operators: { names: string[]; leave: OperatorLeave[] };
  hours: {
    open: Time;
    close: Time;
    /** ISO weekdays that are bookable: 1 = Mon … 7 = Sun. */
    days: number[];
  };
  /** Granularity of the analysis grid, in minutes. 30 matches how the diary is kept. */
  slotMinutes: number;
}

export interface Booking {
  id: string;
  date: IsoDate;
  start: Time;
  end: Time;
  /** Set name — maps to a room via config.rooms[].sets. */
  set: string;
  client?: string;
  seats?: number;
}

export interface OpenSlot {
  roomId: string;
  start: Time;
  end: Time;
  /** Operators still free for the whole of this booking's engaged window. */
  operatorsSpare: number;
}

export interface DayAnalysis {
  date: IsoDate;
  weekday: number;
  /** Operators actually on shift after leave. */
  operators: number;
  operatorsOff: string[];
  bookings: Booking[];
  /** Grid times inside opening hours, e.g. ["10:00","10:30",…]. */
  slotTimes: Time[];
  /** Per room, per slot: is the room engaged (recording or in changeover)? */
  engaged: Record<string, boolean[]>;
  /** Rooms engaged per slot === operators required per slot. */
  demand: number[];
  /** Slots where demand has reached the operator count — nothing more can be sold. */
  atCapacity: Time[];
  /** Slots where demand exceeds the operators on shift. Should always be empty; a non-empty
   *  array means the diary has been oversold and someone has to move. */
  overCapacity: Time[];
  /** Bookable start times by duration, keyed by minutes: { "60": OpenSlot[], "120": … }. */
  openSlots: Record<string, OpenSlot[]>;
  /** Existing bookings that already breach the rules. Empty on a healthy diary. */
  conflicts: Conflict[];
}

export interface Conflict {
  a: Booking;
  b: Booking;
  reason: string;
}

export interface PlacementResult {
  ok: boolean;
  reasons: string[];
}

export interface ScenarioDiff {
  baseline: ScenarioTotals;
  variant: ScenarioTotals;
  delta: ScenarioTotals;
}

export interface ScenarioTotals {
  openStarts1h: number;
  openStarts2h: number;
  atCapacityHalfHours: number;
  daysWithNoOpenHour: number;
}

/* -------------------------------------------------------------- time utils */

export const toMinutes = (t: Time): number => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

export const toTime = (mins: number): Time =>
  `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;

/** ISO weekday, 1 = Mon … 7 = Sun. Parsed as UTC so it never shifts by timezone. */
export const isoWeekday = (d: IsoDate): number => {
  const day = new Date(`${d}T00:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
};

/* --------------------------------------------------------- config helpers */

export function roomOf(config: StudioConfig, setName: string): string {
  const needle = setName.trim().toLowerCase();
  const room = config.rooms.find((r) => r.sets.some((s) => s.toLowerCase() === needle));
  if (!room) throw new Error(`Unknown set "${setName}" — add it to a room in StudioConfig.rooms`);
  return room.id;
}

/**
 * Minutes of clear air required between two bookings, given the rooms they occupy.
 * Returns null when the two rooms are independent and may run at the same time.
 *
 * Same room: the gap is max(before, after) rather than before + after, because one
 * changeover serves both — the reset after A *is* the prep before B.
 */
export function gapRequired(config: StudioConfig, roomA: string, roomB: string): number | null {
  if (roomA === roomB) {
    return Math.max(config.buffers.beforeMinutes, config.buffers.afterMinutes);
  }
  const ex = config.exclusions.find(
    (e) => (e.rooms[0] === roomA && e.rooms[1] === roomB) || (e.rooms[0] === roomB && e.rooms[1] === roomA),
  );
  return ex ? ex.gapMinutes : null;
}

export function operatorsOff(config: StudioConfig, date: IsoDate): string[] {
  return config.operators.leave.filter((l) => l.date === date).map((l) => l.operator);
}

export function operatorsOn(config: StudioConfig, date: IsoDate): number {
  const off = new Set(operatorsOff(config, date));
  return config.operators.names.filter((n) => !off.has(n)).length;
}

/**
 * Rooms bound together by exclusions form one resource group.
 *
 * This matters for operator counting and is the subtlest rule in the whole model.
 * Studio 3 and Studio 4 can never run at the same time, so the pair only ever needs
 * ONE operator — and the half hour where Core is being reset while Nova is being
 * prepped is a single changeover, not two people. Count demand per room and that
 * half hour reads as two operators, which wrongly flags legal days as oversold.
 *
 * Remove the exclusion in a what-if and the two rooms split into separate groups,
 * so the model correctly starts asking for a fourth operator. That is the honest
 * answer to "what if 3 and 4 ran together" and it falls out of this function.
 */
export function resourceGroups(config: StudioConfig): string[][] {
  const parent = new Map(config.rooms.map((r) => [r.id, r.id]));
  const find = (x: string): string => {
    let cur = x;
    while (parent.get(cur) !== cur) {
      parent.set(cur, parent.get(parent.get(cur)!)!);
      cur = parent.get(cur)!;
    }
    return cur;
  };
  for (const e of config.exclusions) {
    const a = find(e.rooms[0]);
    const b = find(e.rooms[1]);
    if (a !== b) parent.set(a, b);
  }
  const groups = new Map<string, string[]>();
  for (const r of config.rooms) {
    const root = find(r.id);
    groups.set(root, [...(groups.get(root) ?? []), r.id]);
  }
  return [...groups.values()];
}

/**
 * The most shoots that could ever run at once: one per resource group, capped by the
 * operators on shift. Useful for explaining *why* a day is full.
 */
export function theoreticalCeiling(config: StudioConfig, date: IsoDate): number {
  return Math.min(resourceGroups(config).length, operatorsOn(config, date));
}

/* -------------------------------------------------------------- the engine */

interface Placed extends Booking {
  roomId: string;
  startMin: number;
  endMin: number;
}

const place = (config: StudioConfig, b: Booking): Placed => ({
  ...b,
  roomId: roomOf(config, b.set),
  startMin: toMinutes(b.start),
  endMin: toMinutes(b.end),
});

/** Window during which the room is unusable and an operator is held. */
const engagedWindow = (config: StudioConfig, b: Placed): [number, number] => [
  b.startMin - config.buffers.beforeMinutes,
  b.endMin + config.buffers.afterMinutes,
];

export function analyseDay(bookings: Booking[], config: StudioConfig, date: IsoDate): DayAnalysis {
  const { beforeMinutes: bef, afterMinutes: aft } = config.buffers;
  const open = toMinutes(config.hours.open);
  const close = toMinutes(config.hours.close);
  const step = config.slotMinutes;

  const placed = bookings.filter((b) => b.date === date).map((b) => place(config, b)).sort((x, y) => x.startMin - y.startMin);

  // Grid runs wider than opening hours so buffers that spill outside are still counted.
  const grid: number[] = [];
  for (let t = open - bef; t < close + aft; t += step) grid.push(t);
  const inDay = grid.map((t, i) => [t, i] as const).filter(([t]) => t >= open && t < close).map(([, i]) => i);

  const engaged: Record<string, boolean[]> = {};
  for (const room of config.rooms) {
    engaged[room.id] = grid.map((t) =>
      placed.some((b) => {
        if (b.roomId !== room.id) return false;
        const [s, e] = engagedWindow(config, b);
        return s <= t && t < e;
      }),
    );
  }

  // Demand is counted per resource group, not per room — see resourceGroups().
  const groups = resourceGroups(config);
  const groupOf = new Map<string, string[]>();
  for (const g of groups) for (const id of g) groupOf.set(id, g);
  const demandAll = grid.map((_, i) => groups.reduce((n, g) => n + (g.some((id) => engaged[id][i]) ? 1 : 0), 0));
  const nops = operatorsOn(config, date);

  const canPlaceHere = (roomId: string, s: number, e: number): string[] => {
    const reasons: string[] = [];
    for (const b of placed) {
      const gap = gapRequired(config, roomId, b.roomId);
      if (gap === null) continue;
      const clear = e + gap <= b.startMin || b.endMin + gap <= s;
      if (!clear) {
        reasons.push(
          b.roomId === roomId
            ? `${b.set} ${b.start}–${b.end} needs ${gap} min clear either side`
            : `${b.set} ${b.start}–${b.end} in ${b.roomId} cannot overlap ${roomId} (${gap} min gap required)`,
        );
      }
    }
    for (let i = 0; i < grid.length; i++) {
      const t = grid[i];
      if (t < s - bef || t >= e + aft) continue;
      const group = groupOf.get(roomId)!;
      const extra = group.some((id) => engaged[id][i]) ? 0 : 1;
      if (demandAll[i] + extra > nops) {
        reasons.push(`No operator free at ${toTime(t)} — ${nops} on shift, ${demandAll[i]} already committed`);
        break;
      }
    }
    return reasons;
  };

  const openSlots: Record<string, OpenSlot[]> = {};
  for (const dur of [60, 120]) {
    const found: OpenSlot[] = [];
    for (const room of config.rooms) {
      for (let s = open; s + dur <= close; s += step) {
        if (canPlaceHere(room.id, s, s + dur).length) continue;
        let spare = nops;
        for (let i = 0; i < grid.length; i++) {
          if (grid[i] >= s && grid[i] < s + dur) spare = Math.min(spare, nops - demandAll[i]);
        }
        found.push({ roomId: room.id, start: toTime(s), end: toTime(s + dur), operatorsSpare: spare });
      }
    }
    openSlots[String(dur)] = found;
  }

  const conflicts: Conflict[] = [];
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      const a = placed[i];
      const b = placed[j];
      const gap = gapRequired(config, a.roomId, b.roomId);
      if (gap === null) continue;
      if (a.endMin + gap <= b.startMin || b.endMin + gap <= a.startMin) continue;
      const overlapping = !(a.endMin <= b.startMin || b.endMin <= a.startMin);
      conflicts.push({
        a,
        b,
        reason:
          a.roomId === b.roomId
            ? overlapping
              ? `Two bookings overlap in ${a.roomId}`
              : `Less than ${gap} min changeover in ${a.roomId}`
            : `${a.roomId} and ${b.roomId} cannot run together (${gap} min gap required)`,
      });
    }
  }

  return {
    date,
    weekday: isoWeekday(date),
    operators: nops,
    operatorsOff: operatorsOff(config, date),
    bookings: placed,
    slotTimes: inDay.map((i) => toTime(grid[i])),
    engaged: Object.fromEntries(config.rooms.map((r) => [r.id, inDay.map((i) => engaged[r.id][i])])),
    demand: inDay.map((i) => demandAll[i]),
    atCapacity: inDay.filter((i) => demandAll[i] >= nops && nops > 0).map((i) => toTime(grid[i])),
    overCapacity: inDay.filter((i) => demandAll[i] > nops).map((i) => toTime(grid[i])),
    openSlots,
    conflicts,
  };
}

export function analyseRange(
  bookings: Booking[],
  config: StudioConfig,
  from: IsoDate,
  to: IsoDate,
): DayAnalysis[] {
  const out: DayAnalysis[] = [];
  for (let d = new Date(`${from}T00:00:00Z`); d <= new Date(`${to}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
    const iso = d.toISOString().slice(0, 10);
    if (!config.hours.days.includes(isoWeekday(iso))) continue;
    out.push(analyseDay(bookings, config, iso));
  }
  return out;
}

/** Would this booking be legal? Used by the booking form; explains itself when it says no. */
export function canPlace(
  bookings: Booking[],
  config: StudioConfig,
  candidate: { date: IsoDate; start: Time; end: Time; set: string },
): PlacementResult {
  const roomId = roomOf(config, candidate.set);
  const day = analyseDay(bookings, config, candidate.date);
  const match = day.openSlots[String(toMinutes(candidate.end) - toMinutes(candidate.start))];
  if (match) {
    const hit = match.some((s) => s.roomId === roomId && s.start === candidate.start);
    if (hit) return { ok: true, reasons: [] };
  }
  // Re-derive the reasons for a bespoke duration or a rejection.
  const probe = analyseDay(bookings, config, candidate.date);
  const reasons: string[] = [];
  if (!config.hours.days.includes(isoWeekday(candidate.date))) reasons.push("Outside bookable days");
  if (toMinutes(candidate.start) < toMinutes(config.hours.open) || toMinutes(candidate.end) > toMinutes(config.hours.close))
    reasons.push(`Outside ${config.hours.open}–${config.hours.close}`);
  for (const b of probe.bookings as Placed[]) {
    const gap = gapRequired(config, roomId, b.roomId);
    if (gap === null) continue;
    const s = toMinutes(candidate.start);
    const e = toMinutes(candidate.end);
    if (!(e + gap <= b.startMin || b.endMin + gap <= s)) {
      reasons.push(`Clashes with ${b.set} ${b.start}–${b.end} (${gap} min gap required)`);
    }
  }
  return { ok: reasons.length === 0, reasons };
}

/** Run two configs over the same bookings and diff what changes. This is the what-if. */
export function compareScenarios(
  bookings: Booking[],
  baseline: StudioConfig,
  variant: StudioConfig,
  from: IsoDate,
  to: IsoDate,
): ScenarioDiff {
  const totals = (cfg: StudioConfig): ScenarioTotals => {
    const days = analyseRange(bookings, cfg, from, to);
    return {
      openStarts1h: days.reduce((n, d) => n + d.openSlots["60"].length, 0),
      openStarts2h: days.reduce((n, d) => n + d.openSlots["120"].length, 0),
      atCapacityHalfHours: days.reduce((n, d) => n + d.atCapacity.length, 0),
      daysWithNoOpenHour: days.filter((d) => d.bookings.length > 0 && d.openSlots["60"].length === 0).length,
    };
  };
  const b = totals(baseline);
  const v = totals(variant);
  return {
    baseline: b,
    variant: v,
    delta: {
      openStarts1h: v.openStarts1h - b.openStarts1h,
      openStarts2h: v.openStarts2h - b.openStarts2h,
      atCapacityHalfHours: v.atCapacityHalfHours - b.atCapacityHalfHours,
      daysWithNoOpenHour: v.daysWithNoOpenHour - b.daysWithNoOpenHour,
    },
  };
}

/* ------------------------------------------------------- the live config */

/** Poddster Singapore as it actually runs today. Seed the DB from this. */
export const PODDSTER_CONFIG: StudioConfig = {
  rooms: [
    { id: "S1", label: "Studio 1", sets: ["Exec", "Nest"] },
    { id: "S2", label: "Studio 2", sets: ["Iris", "Club"] },
    { id: "S3", label: "Studio 3", sets: ["Nova"] },
    { id: "S4", label: "Studio 4", sets: ["Core", "Cove"] },
  ],
  exclusions: [{ rooms: ["S3", "S4"], gapMinutes: 30 }],
  buffers: { beforeMinutes: 30, afterMinutes: 30 },
  operators: {
    names: ["Josiah", "Syafiq", "Sufi"],
    leave: [
      { date: "2026-10-16", operator: "Sufi" },
      { date: "2026-10-21", operator: "Syafiq" },
      { date: "2026-10-22", operator: "Syafiq" },
      { date: "2026-10-23", operator: "Syafiq" },
      { date: "2026-10-26", operator: "Syafiq" },
      { date: "2026-10-27", operator: "Syafiq" },
      { date: "2026-10-28", operator: "Syafiq" },
      { date: "2026-10-29", operator: "Sufi" },
    ],
  },
  hours: { open: "10:00", close: "18:00", days: [1, 2, 3, 4, 5] },
  slotMinutes: 30,
};

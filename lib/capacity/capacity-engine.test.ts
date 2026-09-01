import { describe, it, expect } from "vitest";
import fixtures from "./fixtures.json";
import {
  analyseDay,
  analyseRange,
  canPlace,
  compareScenarios,
  gapRequired,
  resourceGroups,
  theoreticalCeiling,
  PODDSTER_CONFIG,
  type Booking,
  type StudioConfig,
} from "./capacity-engine";

/**
 * The expectations below are golden fixtures generated from Poddster's real forward
 * diary (113 active bookings from 1 Sept 2026) and hand-checked against the raw
 * bookings. If a change to the engine breaks one of these, the engine is wrong —
 * do not edit the fixture to make the test pass without re-deriving it by hand.
 */

const config = fixtures.config as StudioConfig;
const bookings = fixtures.bookings as Booking[];

describe("config plumbing", () => {
  it("maps sets to rooms, case-insensitively", () => {
    const day = analyseDay(bookings, config, "2026-09-01");
    expect(day.bookings.find((b) => b.set === "Core")).toBeTruthy();
  });

  it("groups rooms bound by an exclusion", () => {
    const groups = resourceGroups(config).map((g) => g.sort().join("+")).sort();
    expect(groups).toEqual(["S1", "S2", "S3+S4"]);
  });

  it("splits the group again when the exclusion is lifted", () => {
    const unlocked: StudioConfig = { ...config, exclusions: [] };
    expect(resourceGroups(unlocked)).toHaveLength(4);
  });

  it("requires 30 min between two bookings in the same room, not 60", () => {
    // The reset after A is the prep before B — one changeover, not two.
    expect(gapRequired(config, "S1", "S1")).toBe(30);
  });

  it("requires the exclusion gap across Studio 3 and 4, and nothing across 1 and 2", () => {
    expect(gapRequired(config, "S3", "S4")).toBe(30);
    expect(gapRequired(config, "S1", "S2")).toBeNull();
  });

  it("caps the ceiling at the resource groups, not the room count", () => {
    expect(theoreticalCeiling(config, "2026-09-01")).toBe(3);
    // 21 Oct: Syafiq on leave, so people bind before rooms do.
    expect(theoreticalCeiling(config, "2026-10-21")).toBe(2);
  });
});

describe.each(fixtures.expected)("$date", (expected) => {
  const day = () => analyseDay(bookings, config, expected.date);

  it("counts the operators on shift after leave", () => {
    expect(day().operators).toBe(expected.operators);
  });

  it("matches the golden operator demand across the day", () => {
    expect(day().demand).toEqual(expected.demand);
  });

  it("matches the golden at-capacity windows", () => {
    expect(day().atCapacity).toEqual(expected.atCapacity);
  });

  it("never reports the diary as oversold", () => {
    expect(day().overCapacity).toEqual([]);
  });

  it("finds no rule breaches in the real diary", () => {
    expect(day().conflicts).toEqual([]);
  });

  it("matches the golden bookable 1-hour starts, per room", () => {
    const byRoom: Record<string, string[]> = {};
    for (const s of day().openSlots["60"]) (byRoom[s.roomId] ??= []).push(s.start);
    for (const [roomId, starts] of Object.entries(expected.openSlots["60"])) {
      expect(byRoom[roomId] ?? []).toEqual(starts);
    }
  });
});

describe("the 30-minute changeover rule", () => {
  const oneBooking: Booking[] = [
    { id: "x", date: "2026-09-01", start: "12:00", end: "13:00", set: "Core" },
  ];

  it("accepts a booking that ends exactly 30 min before the next starts", () => {
    expect(canPlace(oneBooking, config, {
      date: "2026-09-01", start: "10:30", end: "11:30", set: "Core",
    }).ok).toBe(true);
  });

  it("rejects one that leaves only 29 minutes", () => {
    const r = canPlace(oneBooking, config, {
      date: "2026-09-01", start: "13:00", end: "14:00", set: "Core",
    });
    expect(r.ok).toBe(false);
    expect(r.reasons.join(" ")).toContain("gap required");
  });

  it("accepts one starting exactly 30 min after the last ends", () => {
    expect(canPlace(oneBooking, config, {
      date: "2026-09-01", start: "13:30", end: "14:30", set: "Core",
    }).ok).toBe(true);
  });
});

describe("the Studio 3 / Studio 4 noise lock", () => {
  const core: Booking[] = [
    { id: "x", date: "2026-09-01", start: "12:00", end: "13:00", set: "Core" },
  ];

  it("blocks Nova while Core is running", () => {
    expect(canPlace(core, config, {
      date: "2026-09-01", start: "12:00", end: "13:00", set: "Nova",
    }).ok).toBe(false);
  });

  it("still blocks Nova inside the changeover", () => {
    expect(canPlace(core, config, {
      date: "2026-09-01", start: "13:00", end: "14:00", set: "Nova",
    }).ok).toBe(false);
  });

  it("allows Iris to run alongside Core — different rooms, no exclusion", () => {
    expect(canPlace(core, config, {
      date: "2026-09-01", start: "12:00", end: "13:00", set: "Iris",
    }).ok).toBe(true);
  });

  it("allows Nova alongside Core once the lock is lifted", () => {
    const unlocked: StudioConfig = { ...config, exclusions: [] };
    expect(canPlace(core, unlocked, {
      date: "2026-09-01", start: "12:00", end: "13:00", set: "Nova",
    }).ok).toBe(true);
  });
});

describe("operator leave", () => {
  it("drops the ceiling to two concurrent shoots while Syafiq is away", () => {
    const day = analyseDay([], config, "2026-10-21");
    expect(day.operators).toBe(2);
    expect(day.operatorsOff).toEqual(["Syafiq"]);
  });

  it("refuses a third overlapping booking on a two-operator day", () => {
    const two: Booking[] = [
      { id: "a", date: "2026-10-21", start: "12:00", end: "13:00", set: "Exec" },
      { id: "b", date: "2026-10-21", start: "12:00", end: "13:00", set: "Iris" },
    ];
    const r = canPlaceStrict(two, config, { date: "2026-10-21", start: "12:00", end: "13:00", set: "Nova" });
    expect(r).toBe(false);
  });

  it("allows that same third booking when everyone is in", () => {
    const two: Booking[] = [
      { id: "a", date: "2026-10-20", start: "12:00", end: "13:00", set: "Exec" },
      { id: "b", date: "2026-10-20", start: "12:00", end: "13:00", set: "Iris" },
    ];
    expect(canPlaceStrict(two, config, { date: "2026-10-20", start: "12:00", end: "13:00", set: "Nova" })).toBe(true);
  });
});

/** canPlace() reports room clashes; the operator ceiling shows up in openSlots. */
function canPlaceStrict(
  bookings: Booking[],
  config: StudioConfig,
  c: { date: string; start: string; end: string; set: string },
): boolean {
  const day = analyseDay(bookings, config, c.date);
  const roomId = config.rooms.find((r) => r.sets.includes(c.set))!.id;
  return day.openSlots["60"].some((s) => s.roomId === roomId && s.start === c.start);
}

describe("scenario comparison — the what-if", () => {
  it("quantifies lifting the Studio 3 / 4 noise lock", () => {
    const unlocked: StudioConfig = { ...PODDSTER_CONFIG, exclusions: [] };
    const diff = compareScenarios(bookings, PODDSTER_CONFIG, unlocked, "2026-09-01", "2026-09-07");
    expect(diff.delta.openStarts1h).toBeGreaterThan(0);
  });

  it("reports no change when the variant is identical to the baseline", () => {
    const diff = compareScenarios(bookings, config, { ...config }, "2026-09-01", "2026-09-07");
    expect(diff.delta.openStarts1h).toBe(0);
    expect(diff.delta.atCapacityHalfHours).toBe(0);
  });
});

describe("analyseRange", () => {
  it("skips days outside the bookable weekdays", () => {
    const days = analyseRange(bookings, config, "2026-09-01", "2026-09-07");
    expect(days.map((d) => d.date)).not.toContain("2026-09-05"); // Saturday
    expect(days.map((d) => d.date)).not.toContain("2026-09-06"); // Sunday
  });
});

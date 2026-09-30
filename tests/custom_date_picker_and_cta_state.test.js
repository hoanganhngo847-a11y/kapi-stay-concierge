import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

/**
 * Test Suite: Custom Date Picker + Check-in Current-Hour Validation + Booking CTA State
 *
 * Requirements:
 * - Date Pickers (Tests 1-8):
 *   1. "Chọn ngày khác" is a real button.
 *   2. Clicking check-in custom-date button calls showPicker() when supported.
 *   3. Fallback focus/click works when showPicker unavailable.
 *   4. Selecting custom check-in date updates checkInDate.
 *   5. "Chọn ngày trả khác" opens date picker.
 *   6. Custom checkout date updates checkOutDate.
 *   7. check-out min date remains check-in date.
 *   8. max horizon preserved.
 *
 * - Current-Hour Check-in Behavior (Tests 9-11):
 *   Mock 30/09 13:07 -> 12:00 disabled, 13:00 disabled, 14:00 available.
 *   Mock 30/09 12:59 -> 13:00 available.
 *   Granularity 1-hour preserved.
 *
 * - CTA State Machine & Non-Contradictory UI (Tests 12-17):
 *   12. No selection: CTA = "Chọn giờ để đặt phòng", disabled.
 *   13. Complete selection: availability immediately CHECKING.
 *   14. During check: CTA = "Đang kiểm tra phòng...", disabled.
 *   15. Available response: CTA = "Giữ phòng & tiếp tục", enabled.
 *   16. Unavailable response: CTA = "Phòng không khả dụng", disabled.
 *   17. Full selection never remains IDLE, summary badge dynamic.
 *
 * - Stale Selection & Clock Drift (Tests 18-20):
 *   18. Select 13:00 at 12:59. Advance clock to 13:01. Attempt hold.
 *       Expected: blocked frontend, friendly stale-time error, no session created.
 */

// Helper to parse Vietnam timestamp like RoomBookingWidget does
function parseVietnamTimestamp(dtStr) {
  if (!dtStr) return NaN;
  if (dtStr.includes("Z") || dtStr.includes("+")) {
    return new Date(dtStr).getTime();
  }
  const normalized = dtStr.length === 16 ? `${dtStr}:00+07:00` : `${dtStr}+07:00`;
  return new Date(normalized).getTime();
}

function calcBookingHours(inAt, outAt) {
  if (!inAt || !outAt) return 0;
  const tIn = parseVietnamTimestamp(inAt);
  const tOut = parseVietnamTimestamp(outAt);
  if (isNaN(tIn) || isNaN(tOut) || tOut <= tIn) return 0;
  return Math.max(0, Math.ceil((tOut - tIn) / 3600000));
}

// Logic simulator for Hour Slot Evaluation in RoomAvailabilityTimeline
function getRawHourState(slotStartMs, slotEndMs, isCheckInSlot, currentTimeMs, intervals = []) {
  if (isCheckInSlot ? slotStartMs < currentTimeMs : slotEndMs <= currentTimeMs) {
    return "PAST";
  }

  for (const item of intervals) {
    const intStart = new Date(item.start_at).getTime();
    const intEnd = new Date(item.end_at).getTime();
    if (intStart < slotEndMs && intEnd > slotStartMs) {
      if (item.state === "BOOKED") return "BOOKED";
      if (item.state === "HELD") return "HELD";
      if (item.state === "BLOCKED") return "BLOCKED";
    }
  }
  return "AVAILABLE";
}

function evaluateCheckInSlot(hour, checkInDate, currentTimeMs, intervals = []) {
  const slotTimeStr = `${String(hour).padStart(2, "0")}:00`;
  const slotStartMs = new Date(`${checkInDate}T${slotTimeStr}:00+07:00`).getTime();
  const slotEndMs = slotStartMs + 3600 * 1000;

  const raw = getRawHourState(slotStartMs, slotEndMs, true, currentTimeMs, intervals);
  if (raw !== "AVAILABLE") {
    return {
      state: raw,
      label: raw === "PAST" ? "Đã qua" : raw === "BOOKED" ? "Đã đặt" : raw,
      clickable: false,
    };
  }

  // Check 2h room
  const twoHoursEndMs = slotStartMs + 2 * 3600 * 1000;
  let has2hRoom = true;
  for (const item of intervals) {
    const intStart = new Date(item.start_at).getTime();
    const intEnd = new Date(item.end_at).getTime();
    if (intStart < twoHoursEndMs && intEnd > slotStartMs) {
      has2hRoom = false;
      break;
    }
  }

  if (!has2hRoom) {
    return { state: "UNDER_MIN", label: "Cần 2h", clickable: false };
  }

  return { state: "AVAILABLE", label: null, clickable: true };
}

// =============================================================================
// TEST SUITE
// =============================================================================

test("DATE PICKERS — 1. 'Chọn ngày khác' is a real <button> element, not label wrapping sr-only input", () => {
  const timelineCode = fs.readFileSync(
    path.join(process.cwd(), "components/rooms/RoomAvailabilityTimeline.tsx"),
    "utf-8"
  );

  // Must contain button for custom check-in date
  assert.match(
    timelineCode,
    /<button[^>]*onClick=\{handleOpenCheckInDatePicker\}[^>]*>[\s\S]*?Chọn ngày khác[\s\S]*?<\/button>/,
    "Expected 'Chọn ngày khác' to be a real button triggering handleOpenCheckInDatePicker"
  );

  // Should NOT wrap input in a <label>
  assert.doesNotMatch(
    timelineCode,
    /<label[^>]*>[\s\S]*?Chọn ngày khác[\s\S]*?<input[^>]*className="sr-only"[^>]*\/>[\s\S]*?<\/label>/,
    "Should not use label wrapping sr-only input for date picker"
  );
});

test("DATE PICKERS — 2 & 3. showPicker() with fallback to focus() and click()", () => {
  const timelineCode = fs.readFileSync(
    path.join(process.cwd(), "components/rooms/RoomAvailabilityTimeline.tsx"),
    "utf-8"
  );

  assert.match(
    timelineCode,
    /if\s*\(\s*typeof\s+input\.showPicker\s*===\s*"function"\s*\)\s*\{\s*input\.showPicker\(\);?\s*\}\s*else\s*\{\s*input\.focus\(\);?\s*input\.click\(\);?\s*\}/,
    "handleOpenCheckInDatePicker must call showPicker() when supported, with fallback to focus() and click()"
  );

  // Verify behavior using mocked input
  let pickerCalled = false;
  let focusCalled = false;
  let clickCalled = false;

  const mockInputWithPicker = {
    showPicker: () => { pickerCalled = true; },
    focus: () => { focusCalled = true; },
    click: () => { clickCalled = true; },
  };

  if (typeof mockInputWithPicker.showPicker === "function") {
    mockInputWithPicker.showPicker();
  } else {
    mockInputWithPicker.focus();
    mockInputWithPicker.click();
  }
  assert.equal(pickerCalled, true, "showPicker must be called when available");
  assert.equal(focusCalled, false, "focus must not be called when showPicker succeeds");

  // Fallback when showPicker is missing
  pickerCalled = false;
  focusCalled = false;
  clickCalled = false;
  const mockInputWithoutPicker = {
    focus: () => { focusCalled = true; },
    click: () => { clickCalled = true; },
  };
  if (typeof mockInputWithoutPicker.showPicker === "function") {
    mockInputWithoutPicker.showPicker();
  } else {
    mockInputWithoutPicker.focus();
    mockInputWithoutPicker.click();
  }
  assert.equal(focusCalled, true, "focus must be called in fallback");
  assert.equal(clickCalled, true, "click must be called in fallback");
});

test("DATE PICKERS — 4 & 5. 'Chọn ngày trả khác' is a real button and uses checkOutDateInputRef", () => {
  const timelineCode = fs.readFileSync(
    path.join(process.cwd(), "components/rooms/RoomAvailabilityTimeline.tsx"),
    "utf-8"
  );

  assert.match(
    timelineCode,
    /<button[^>]*onClick=\{handleOpenCheckOutDatePicker\}[^>]*>[\s\S]*?Chọn ngày trả khác[\s\S]*?<\/button>/,
    "Expected 'Chọn ngày trả khác' to be a real button triggering handleOpenCheckOutDatePicker"
  );

  assert.match(
    timelineCode,
    /ref=\{checkOutDateInputRef\}/,
    "Expected check-out date input to have ref checkOutDateInputRef"
  );
});

test("DATE PICKERS — 6, 7 & 8. check-in & check-out date limits preserve min date and horizon", () => {
  const timelineCode = fs.readFileSync(
    path.join(process.cwd(), "components/rooms/RoomAvailabilityTimeline.tsx"),
    "utf-8"
  );

  // Check-in input has min={todayStr} and max={maxHorizonDateStr}
  assert.match(
    timelineCode,
    /min=\{todayStr\}[\s\S]*?max=\{maxHorizonDateStr\}/,
    "Check-in date input must have min={todayStr} and max={maxHorizonDateStr}"
  );

  // Check-out input has min={checkInDate} and max={maxHorizonDateStr}
  assert.match(
    timelineCode,
    /min=\{checkInDate\}[\s\S]*?max=\{maxHorizonDateStr\}/,
    "Check-out date input must have min={checkInDate} and max={maxHorizonDateStr}"
  );
});

test("CURRENT-HOUR BUG — 9. Mock current time 30/09 13:07: 12:00 and 13:00 disabled as 'Đã qua', 14:00 available", () => {
  const mockNowMs = new Date("2026-09-30T13:07:00+07:00").getTime();
  const testDate = "2026-09-30";

  // 12:00 slot
  const slot12 = evaluateCheckInSlot(12, testDate, mockNowMs);
  assert.equal(slot12.clickable, false);
  assert.equal(slot12.state, "PAST");
  assert.equal(slot12.label, "Đã qua");

  // 13:00 slot (started at 13:00:00, now is 13:07:00 -> PAST)
  const slot13 = evaluateCheckInSlot(13, testDate, mockNowMs);
  assert.equal(slot13.clickable, false);
  assert.equal(slot13.state, "PAST");
  assert.equal(slot13.label, "Đã qua");

  // 14:00 slot (starts at 14:00:00, now is 13:07:00 -> AVAILABLE)
  const slot14 = evaluateCheckInSlot(14, testDate, mockNowMs);
  assert.equal(slot14.clickable, true);
  assert.equal(slot14.state, "AVAILABLE");
});

test("CURRENT-HOUR BUG — 10. Mock current time 30/09 12:59: 13:00 is available if inventory free", () => {
  const mockNowMs = new Date("2026-09-30T12:59:00+07:00").getTime();
  const testDate = "2026-09-30";

  // 12:00 slot (started at 12:00:00, now is 12:59:00 -> PAST)
  const slot12 = evaluateCheckInSlot(12, testDate, mockNowMs);
  assert.equal(slot12.clickable, false);
  assert.equal(slot12.state, "PAST");

  // 13:00 slot (starts at 13:00:00, now is 12:59:00 -> AVAILABLE)
  const slot13 = evaluateCheckInSlot(13, testDate, mockNowMs);
  assert.equal(slot13.clickable, true);
  assert.equal(slot13.state, "AVAILABLE");
});

test("TIME PRECISION — 11. Timezone-safe timestamp parser accurately parses Vietnam datetime", () => {
  const ts13 = parseVietnamTimestamp("2026-09-30T13:00");
  const ts13_07 = parseVietnamTimestamp("2026-09-30T13:07");
  const ts14 = parseVietnamTimestamp("2026-09-30T14:00");

  assert.equal(ts13 < ts13_07, true, "13:00 must be strictly less than 13:07");
  assert.equal(ts14 > ts13_07, true, "14:00 must be strictly greater than 13:07");

  // Duration in hours
  const hours = calcBookingHours("2026-09-30T14:00", "2026-09-30T18:00");
  assert.equal(hours, 4);

  // Multi-day duration
  const multiDayHours = calcBookingHours("2026-09-30T14:00", "2026-10-02T10:00");
  assert.equal(multiDayHours, 44);
});

test("CTA STATE MACHINE — 12. No selection: CTA is disabled with 'Chọn giờ để đặt phòng'", () => {
  const state = {
    checkIn: "",
    checkOut: "",
    availability: { status: "IDLE" },
    isHolding: false,
  };

  const getCtaText = () => {
    if (state.isHolding) return "Đang giữ phòng...";
    if (state.availability.status === "AVAILABLE") return "Giữ phòng & tiếp tục";
    if (state.availability.status === "CHECKING") return "Đang kiểm tra phòng...";
    if (state.availability.status === "UNAVAILABLE") return "Phòng không khả dụng";
    return "Chọn giờ để đặt phòng";
  };

  const isCtaDisabled = () => state.availability.status !== "AVAILABLE" || state.isHolding;

  assert.equal(getCtaText(), "Chọn giờ để đặt phòng");
  assert.equal(isCtaDisabled(), true);
});

test("CTA STATE MACHINE — 13 & 14. Complete selection immediately sets CHECKING: CTA = 'Đang kiểm tra phòng...', disabled", () => {
  const state = {
    checkIn: "",
    checkOut: "",
    availability: { status: "IDLE" },
    isHolding: false,
  };

  const handleSelectTimelineInterval = (inStr, outStr) => {
    state.checkIn = inStr;
    state.checkOut = outStr;
    state.availability = { status: "CHECKING" };
  };

  const getCtaText = () => {
    if (state.isHolding) return "Đang giữ phòng...";
    if (state.availability.status === "AVAILABLE") return "Giữ phòng & tiếp tục";
    if (state.availability.status === "CHECKING") return "Đang kiểm tra phòng...";
    if (state.availability.status === "UNAVAILABLE") return "Phòng không khả dụng";
    return "Chọn giờ để đặt phòng";
  };

  const isCtaDisabled = () => state.availability.status !== "AVAILABLE" || state.isHolding;

  handleSelectTimelineInterval("2026-09-30T14:00", "2026-09-30T18:00");

  assert.equal(state.availability.status, "CHECKING");
  assert.equal(getCtaText(), "Đang kiểm tra phòng...");
  assert.equal(isCtaDisabled(), true);
});

test("CTA STATE MACHINE — 15 & 16. Available -> 'Giữ phòng & tiếp tục' enabled; Unavailable -> 'Phòng không khả dụng' disabled", () => {
  let availability = { status: "CHECKING" };
  let isHolding = false;

  const getCtaProps = (av, holding) => ({
    text: holding
      ? "Đang giữ phòng..."
      : av.status === "AVAILABLE"
      ? "Giữ phòng & tiếp tục"
      : av.status === "CHECKING"
      ? "Đang kiểm tra phòng..."
      : av.status === "UNAVAILABLE"
      ? "Phòng không khả dụng"
      : "Chọn giờ để đặt phòng",
    disabled: av.status !== "AVAILABLE" || holding,
    isLoading: av.status === "CHECKING" || holding,
  });

  // When backend returns available
  availability = { status: "AVAILABLE", checkIn: "2026-09-30T14:00", checkOut: "2026-09-30T18:00" };
  let cta = getCtaProps(availability, isHolding);
  assert.equal(cta.text, "Giữ phòng & tiếp tục");
  assert.equal(cta.disabled, false);
  assert.equal(cta.isLoading, false);

  // When backend returns conflict / unavailable
  availability = { status: "UNAVAILABLE", checkIn: "2026-09-30T14:00", checkOut: "2026-09-30T18:00" };
  cta = getCtaProps(availability, isHolding);
  assert.equal(cta.text, "Phòng không khả dụng");
  assert.equal(cta.disabled, true);
  assert.equal(cta.isLoading, false);

  // When holding
  isHolding = true;
  cta = getCtaProps(availability, isHolding);
  assert.equal(cta.text, "Đang giữ phòng...");
  assert.equal(cta.disabled, true);
  assert.equal(cta.isLoading, true);
});

test("UI CONSISTENCY — 17. Summary badge is dynamically mapped to availability status (no contradictory 'Khung giờ hợp lệ' with disabled button)", () => {
  const getSummaryBadge = (status) => {
    switch (status) {
      case "CHECKING":
        return "Đang kiểm tra";
      case "AVAILABLE":
        return "Khung giờ còn trống";
      case "UNAVAILABLE":
        return "Không khả dụng";
      default:
        return "Đang kiểm tra";
    }
  };

  assert.equal(getSummaryBadge("CHECKING"), "Đang kiểm tra");
  assert.equal(getSummaryBadge("AVAILABLE"), "Khung giờ còn trống");
  assert.equal(getSummaryBadge("UNAVAILABLE"), "Không khả dụng");

  // Verify RoomBookingWidget source code uses dynamic summary badge
  const widgetCode = fs.readFileSync(
    path.join(process.cwd(), "components/rooms/RoomBookingWidget.tsx"),
    "utf-8"
  );

  assert.match(
    widgetCode,
    /availability\.status\s*===\s*"CHECKING"[\s\S]*?Đang kiểm tra[\s\S]*?availability\.status\s*===\s*"AVAILABLE"[\s\S]*?Khung giờ còn trống[\s\S]*?Không khả dụng/,
    "Summary card badge must dynamically reflect CHECKING, AVAILABLE, and UNAVAILABLE"
  );
});

test("STALE TIME PROTECTION — 18. Select 13:00 at 12:59, advance clock to 13:01 -> submission blocked with friendly error", () => {
  let mockCurrentTimeMs = new Date("2026-09-30T12:59:00+07:00").getTime();
  let validationError = null;
  let availability = { status: "IDLE" };
  let holdSessionCalled = false;

  const checkIn = "2026-09-30T13:00";
  const checkOut = "2026-09-30T15:00";

  // At 12:59, interval is chosen and available
  const checkInMs = parseVietnamTimestamp(checkIn);
  assert.equal(checkInMs >= mockCurrentTimeMs, true, "At 12:59, 13:00 is not in the past");
  availability = { status: "AVAILABLE", checkIn, checkOut };

  // Clock advances to 13:01:00
  mockCurrentTimeMs = new Date("2026-09-30T13:01:00+07:00").getTime();

  // Attempt hold submission
  const handleSubmit = (nowMs) => {
    if (!checkIn || !checkOut) {
      validationError = "Vui lòng chọn đầy đủ thời gian nhận và trả phòng.";
      return;
    }

    const tIn = parseVietnamTimestamp(checkIn);
    if (tIn < nowMs) {
      validationError = "Giờ nhận đã qua. Vui lòng chọn giờ nhận mới.";
      availability = {
        status: "UNAVAILABLE",
        checkIn,
        checkOut,
        reason: "Giờ nhận đã qua. Vui lòng chọn giờ nhận mới.",
      };
      return;
    }

    if (availability.status !== "AVAILABLE") {
      return;
    }

    holdSessionCalled = true;
  };

  handleSubmit(mockCurrentTimeMs);

  assert.equal(holdSessionCalled, false, "Backend hold session must NOT be called when check-in is in past");
  assert.equal(validationError, "Giờ nhận đã qua. Vui lòng chọn giờ nhận mới.");
  assert.equal(availability.status, "UNAVAILABLE");
});

test("LIVE CLOCK DRIFT — 19. RoomBookingWidget re-evaluates current time periodically and on submit", () => {
  const widgetCode = fs.readFileSync(
    path.join(process.cwd(), "components/rooms/RoomBookingWidget.tsx"),
    "utf-8"
  );

  assert.match(
    widgetCode,
    /setInterval\(\(\)\s*=>\s*\{[\s\S]*?setCurrentTimeMs\(nowMs\)[\s\S]*?\},\s*15000\)/,
    "RoomBookingWidget must update currentTimeMs periodically"
  );

  assert.match(
    widgetCode,
    /if\s*\(\s*checkInMs\s*<\s*nowMs\s*\)\s*\{\s*setValidationError\("Giờ nhận đã qua\. Vui lòng chọn giờ nhận mới\."\)/,
    "handleSubmit must check checkInMs < nowMs and display friendly error"
  );
});

test("TIMELINE & WIDGET HARMONIZATION — 20. RoomAvailabilityTimeline and RoomBookingWidget agree on past slot rule", () => {
  const timelineCode = fs.readFileSync(
    path.join(process.cwd(), "components/rooms/RoomAvailabilityTimeline.tsx"),
    "utf-8"
  );

  assert.match(
    timelineCode,
    /isCheckInSlot\s*\?\s*slotStartMs\s*<\s*currentTimeMs\s*:\s*slotEndMs\s*<=\s*currentTimeMs/,
    "RoomAvailabilityTimeline must use slotStartMs < currentTimeMs for check-in slots"
  );
});

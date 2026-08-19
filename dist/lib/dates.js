"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calendarDateInShopTz = calendarDateInShopTz;
const config_1 = require("../config");
/** Calendar date YYYY-MM-DD in the shop timezone. */
function calendarDateInShopTz(at = new Date()) {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: config_1.env.CHECKIN_CALENDAR_TZ,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(at);
}
//# sourceMappingURL=dates.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizePhone = normalizePhone;
const libphonenumber_js_1 = require("libphonenumber-js");
const config_1 = require("../config");
function normalizePhone(input) {
    const trimmed = input.trim();
    const phone = (0, libphonenumber_js_1.parsePhoneNumberFromString)(trimmed, config_1.env.DEFAULT_PHONE_COUNTRY);
    if (!phone || !phone.isValid()) {
        return null;
    }
    return phone.format("E.164");
}
//# sourceMappingURL=phone.js.map
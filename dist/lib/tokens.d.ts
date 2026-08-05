export declare function hashOpaqueToken(raw: string): string;
export declare function generateOpaqueToken(): string;
export declare function generateOtpCode(): string;
export declare function hashOtpCode(code: string): Promise<string>;
export declare function verifyOtpCode(code: string, hash: string): Promise<boolean>;
export type AccessTokenPayload = {
    sub: string;
    typ: "access";
};
export type StaffTokenPayload = {
    typ: "staff";
    sid: string;
};
export declare function signAccessToken(memberId: string): string;
export declare function verifyAccessToken(token: string): AccessTokenPayload;
export declare function signStaffToken(): string;
export declare function verifyStaffToken(token: string): StaffTokenPayload;
export declare function refreshExpiryDate(): Date;

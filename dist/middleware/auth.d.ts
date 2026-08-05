import { Request, Response, NextFunction } from "express";
export type AuthedRequest = Request & {
    memberId?: string;
    staffSessionId?: string;
};
export declare function requireMemberAuth(req: AuthedRequest, res: Response, next: NextFunction): void;
export declare function requireStaffAuth(req: AuthedRequest, res: Response, next: NextFunction): void;

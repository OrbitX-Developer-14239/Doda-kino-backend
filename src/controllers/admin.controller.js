import { AdminService } from "../services/admin.service.js";
import { catchAsync } from "../utils/catchAsync.js";

export const AdminController = {
    login: catchAsync(async (req, res) => {
        const data = await AdminService.login(req.body);

        if (data.verifyRequired) {
            return res.status(403).json({ success: false, ...data });
        }

        res.cookie('refreshToken', data.refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            maxAge: 15 * 24 * 60 * 60 * 1000
        });

        delete data.refreshToken;

        res.status(200).json({ success: true, data });
    }),

    createAdmin: catchAsync(async (req, res) => {
        const data = await AdminService.createAdmin(req.body);
        res.status(201).json({ success: true, data });
    }),

    verifyAdmin: catchAsync(async (req, res) => {
        const { token } = req.params;
        const contactData = req.body || {};
        const data = await AdminService.verifyAdmin(token, contactData);

        if (data.refreshToken) {
            res.cookie('refreshToken', data.refreshToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === "production",
                maxAge: 15 * 24 * 60 * 60 * 1000
            });
            delete data.refreshToken;
        }

        res.status(200).json({ success: true, data });
    }),

    verifyAdminByBot: catchAsync(async (req, res) => {
        const { verifyToken, telegramId, telegramUsername, phoneNumber, firstName, lastName } = req.body || {};
        const data = await AdminService.verifyAdmin(verifyToken, {
            telegramId,
            telegramUsername,
            phoneNumber,
            firstName,
            lastName,
        });

        res.status(200).json({ success: true, data });
    }),

    requestTelegramLogin: catchAsync(async (req, res) => {
        const body = req.body || {};
        const hasTelegramIdentity = Boolean(
            body.phoneNumber || body.phone_number
        );

        const data = hasTelegramIdentity
            ? await AdminService.createTelegramLoginLinkForContact(body)
            : await AdminService.requestTelegramLogin(req.admin?._id);

        res.status(200).json({ success: true, data });
    }),

    requestTelegramLoginByContact: catchAsync(async (req, res) => {
        const data = await AdminService.createTelegramLoginLinkForContact(req.body || {});
        res.status(200).json({ success: true, data });
    }),

    telegramAuth: catchAsync(async (req, res) => {
        const token = req.body?.token || req.query?.token;
        const data = await AdminService.authenticateAdminByTelegramToken(token);

        res.cookie('refreshToken', data.refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            maxAge: 15 * 24 * 60 * 60 * 1000
        });

        delete data.refreshToken;

        res.status(200).json({ success: true, data });
    }),

    updateAdmin: catchAsync(async (req, res) => {
        const data = await AdminService.updateAdmin(req.params.id, req.admin, req.body);
        res.status(200).json({ success: true, data });
    }),

    deleteAdmin: catchAsync(async (req, res) => {
        const data = await AdminService.deleteAdmin(req.params.id);
        res.status(200).json({ success: true, data });
    }),

    refresh: catchAsync(async (req, res) => {
        const cookieHeader = req.headers.cookie || "";
        const match = cookieHeader.match(/refreshToken=([^;]+)/);
        const refreshToken = match ? match[1] : null;

        const data = await AdminService.refresh(refreshToken);
        res.status(200).json({ success: true, data });
    }),

    logout: catchAsync(async (req, res) => {
        res.clearCookie('refreshToken');
        const data = await AdminService.logout(req.admin._id);
        res.status(200).json({ success: true, data });
    })
}

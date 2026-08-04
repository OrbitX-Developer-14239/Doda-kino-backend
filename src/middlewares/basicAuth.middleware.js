import crypto from "crypto";

const safeEqual = (a, b) => {
    const bufA = crypto.createHash("sha256").update(String(a)).digest();
    const bufB = crypto.createHash("sha256").update(String(b)).digest();
    return crypto.timingSafeEqual(bufA, bufB);
};

/**
 * HTTP Basic auth — brauzer o'zi login/parol oynasini chiqaradi.
 *
 * Swagger UI sahifasi uchun ataylab Bearer JWT emas, Basic ishlatiladi:
 * brauzer statik HTML so'roviga Authorization header qo'sha olmaydi,
 * shuning uchun JWT bilan himoyalangan /api-docs ochilmay qolardi.
 */
export const basicAuth = ({ user, password, realm = "Restricted" }) => {
    return (req, res, next) => {
        const header = req.headers.authorization || "";
        const [scheme, encoded] = header.split(" ");

        if (scheme?.toLowerCase() === "basic" && encoded) {
            const [reqUser, ...rest] = Buffer.from(encoded, "base64").toString("utf8").split(":");
            const reqPassword = rest.join(":");

            if (safeEqual(reqUser, user) && safeEqual(reqPassword, password)) {
                return next();
            }
        }

        res.set("WWW-Authenticate", `Basic realm="${realm}", charset="UTF-8"`);
        return res.status(401).json({ success: false, message: "Avtorizatsiya talab qilinadi" });
    };
};

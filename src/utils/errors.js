/**
 * Mongo ning unique-index xatosini (E11000) foydalanuvchiga tushunarli 409 ga aylantiradi.
 * Oldindan tekshiruv (findOne) poyga sharti tufayli o'tkazib yuborishi mumkin —
 * bu yerda esa bazaning o'zi yakuniy hakam bo'ladi.
 */
export const duplicateKeyError = (err, message) => {
    if (err?.code === 11000) {
        const conflict = new Error(message);
        conflict.status = 409;
        return conflict;
    }
    return err;
};

export const httpError = (message, status) => Object.assign(new Error(message), { status });

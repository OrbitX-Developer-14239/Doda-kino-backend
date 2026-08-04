/**
 * Zod sxemasi bo'yicha so'rovni tekshiradi va TOZALANGAN qiymatlarni qaytarib qo'yadi.
 *
 * Express 5 da `req.query` — prototipdagi getter, shuning uchun unga oddiy
 * `Object.assign(req.query, ...)` hech qanday ta'sir qilmaydi (qiymat jimgina
 * yo'qoladi). Shu sababli bu yerda `defineProperty` bilan ustidan yoziladi —
 * aks holda validatsiya coercion va strip natijalari controllerga yetib bormaydi.
 */
const overrideRequestProperty = (req, key, value) => {
    Object.defineProperty(req, key, {
        value,
        writable: true,
        enumerable: true,
        configurable: true
    });
};

export const validate = (schema) =>
    (req, res, next) => {
        try {
            const validated = schema.parse({
                body: req.body,
                query: req.query,
                params: req.params
            });

            if (validated.body !== undefined) req.body = validated.body;
            if (validated.query !== undefined) overrideRequestProperty(req, "query", validated.query);
            if (validated.params !== undefined) overrideRequestProperty(req, "params", validated.params);

            next()
        } catch (error) {
            if (error.name === 'ZodError') {
                return res.status(400).json({
                    success: false,
                    message: "Ma'lumotlarni to'ldirishda xatolik",
                    errors: error.issues.map(e => ({
                        field: e.path.join("."),
                        message: e.message
                    }))
                })
            }

            next(error)
        }
    }

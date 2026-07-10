export const validate = (schema) =>
    (req, res, next) => {
        try {
            const validated = schema.parse({
                body: req.body,
                query: req.query,
                params: req.params
            });
            req.body = validated.body;
            req.query = validated.query;
            req.params = validated.params;
            next()
        } catch (error) {
            if (error.name === 'ZodError') {
                return res.status(400).json({
                    success: false,
                    message: "Ma'lumotlarni to'ldirishda xatolik. Xayrulla body ni to'g'ri yozsangchi!!!",
                    errors: error.issues.map(e => ({
                        field: e.path.join("."),
                        message: e.message
                    }))
                })
            }

            next(error)
        }
    }

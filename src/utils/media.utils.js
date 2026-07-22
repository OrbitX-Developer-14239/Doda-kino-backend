/**
 * Normalizes media ID inputs into either { channelId, msgId } object or string fileId.
 * 
 * @param {any} val 
 * @returns {{ channelId: string, msgId: number } | string}
 */
export function normalizeMediaId(val) {
    if (!val) return null;

    let obj = val;
    if (typeof val === 'string') {
        try {
            obj = JSON.parse(val);
        } catch (e) { }
    }

    if (typeof obj === 'object' && obj !== null) {
        const chan = obj.channelId || obj.chatId;
        const msg = obj.msgId || obj.messageId;
        if (chan && msg) {
            return {
                channelId: String(chan).replace("-100", "").trim(),
                msgId: Number(msg)
            };
        }
    }

    const str = String(val).trim();
    const matchNamed = str.match(/channelId:?\s*(-?\d+)\D+msgId:?\s*(\d+)/i);
    if (matchNamed) {
        return {
            channelId: String(matchNamed[1]).replace("-100", "").trim(),
            msgId: Number(matchNamed[2])
        };
    }

    if (str.includes(":")) {
        const parts = str.split(":");
        if (parts.length === 2 && parts[0] && /^\d+$/.test(parts[1].trim())) {
            return {
                channelId: parts[0].trim().replace("-100", ""),
                msgId: Number(parts[1].trim())
            };
        }
    }

    if (/^\d+$/.test(str)) {
        const defaultChannel = process.env.CHANNEL_ID ? String(process.env.CHANNEL_ID).replace("-100", "") : "3831468244";
        return {
            channelId: defaultChannel,
            msgId: Number(str)
        };
    }

    return null;
}

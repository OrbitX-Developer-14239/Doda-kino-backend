import { ChannelService } from "../services/channel.service.js";
import { DiscoveredChatService } from "../services/discovered-chat.service.js";
import { catchAsync } from "../utils/catchAsync.js";

export const ChannelController = {
    /**
     * Bot a'zo bo'lgan kanal/guruhlar ro'yxati — har biri uchun
     * bot admin yoki yo'qligi va telegram ID si bilan.
     * Yangi kanal shu ro'yxatdan tanlab qo'shiladi.
     */
    getAvailableChats: catchAsync(async (req, res) => {
        // ?refresh=false — Telegramga bormasdan, faqat bazadagi holat
        const refresh = req.query.refresh !== "false";
        const data = await DiscoveredChatService.listAvailable({ refresh });

        res.status(200).json({ success: true, data });
    }),

    /** Bot `my_chat_member` hodisasida chaqiradi */
    syncDiscoveredChat: catchAsync(async (req, res) => {
        const data = await DiscoveredChatService.upsertFromBot(req.body);

        res.status(200).json({ success: true, data });
    }),

    createChannel: catchAsync(async (req, res) => {
        const data = await ChannelService.createChannel(req.body)

        res.status(201).json({ success: true, data })
    }),

    getChannels: catchAsync(async (req, res) => {
        const data = await ChannelService.getChannels()

        res.status(200).json({ success: true, data })
    }),

    getChannelById: catchAsync(async (req, res) => {
        const data = await ChannelService.getChannelById(req.params.id)

        res.status(200).json({ success: true, data })
    }),

    updateChannel: catchAsync(async (req, res) => {
        const data = await ChannelService.updateChannel(req.params.id, req.body)

        res.status(200).json({ success: true, data })
    }),

    deleteChannel: catchAsync(async (req, res) => {
        const data = await ChannelService.deleteChannel(req.params.id)

        res.status(200).json({ success: true })
    })
}
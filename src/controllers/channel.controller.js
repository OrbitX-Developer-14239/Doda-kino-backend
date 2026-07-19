import { ChannelService } from "../services/channel.service.js";
import { catchAsync } from "../utils/catchAsync.js";

export const ChannelController = {
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

    deleteChannel: catchAsync(async (req, res) => {
        const data = await ChannelService.deleteChannel(req.params.id)

        res.status(200).json({ success: true })
    })
}
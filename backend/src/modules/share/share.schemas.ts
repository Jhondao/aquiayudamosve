import { z } from "zod";

export const SHARE_CHANNEL_VALUES = ["whatsapp", "web_share", "copy_link", "save_image"] as const;
export type ShareChannelValue = (typeof SHARE_CHANNEL_VALUES)[number];

export const shareEventSchema = z.object({
  channel: z.enum(SHARE_CHANNEL_VALUES),
});

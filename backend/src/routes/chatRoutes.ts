import { Router } from "express";
import { deleteChatPresenceHandler, getChatMessages, getChatOnlineUsers, getChatStatus, postChatClear, postChatMaintenance, postChatMessage, postChatPresence, deleteChatMessage } from "../controllers/chatController.js";
import { requireAdmin, requireAuth } from "../middleware/auth.js";
import {
  banUserHandler,
  getUserModerationStatusHandler,
  getUserWarningsHandler,
  getUserCassierHandler,
  listAllWarningsHandler,
  muteUserHandler,
  unmuteUserHandler,
  unbanUserHandler,
  warnUserHandler
} from "../controllers/chatModerationController.js";

export const chatRoutes = Router();

// Routes de chat existantes
chatRoutes.get("/messages", getChatMessages);
chatRoutes.post("/messages", requireAuth, postChatMessage);
chatRoutes.delete("/messages/:messageId", requireAuth, requireAdmin, deleteChatMessage);
chatRoutes.post("/presence", requireAuth, postChatPresence);
chatRoutes.delete("/presence", requireAuth, deleteChatPresenceHandler);
chatRoutes.get("/online", getChatOnlineUsers);
chatRoutes.post("/clear", requireAuth, requireAdmin, postChatClear);
chatRoutes.get("/status", getChatStatus);
chatRoutes.post("/maintenance", requireAuth, requireAdmin, postChatMaintenance);

// Routes de modération (admin uniquement)
chatRoutes.post("/moderation/ban", requireAuth, requireAdmin, banUserHandler);
chatRoutes.post("/moderation/unban", requireAuth, requireAdmin, unbanUserHandler);
chatRoutes.post("/moderation/mute", requireAuth, requireAdmin, muteUserHandler);
chatRoutes.post("/moderation/unmute", requireAuth, requireAdmin, unmuteUserHandler);
chatRoutes.post("/moderation/warn", requireAuth, requireAdmin, warnUserHandler);
chatRoutes.get("/moderation/cassier", requireAuth, getUserCassierHandler);
chatRoutes.get("/moderation/warnings/all", requireAuth, requireAdmin, listAllWarningsHandler);
chatRoutes.get("/moderation/warnings", requireAuth, requireAdmin, getUserWarningsHandler);
chatRoutes.post("/moderation/warnings", requireAuth, requireAdmin, getUserWarningsHandler);
chatRoutes.get("/moderation/status/:userId", requireAuth, requireAdmin, getUserModerationStatusHandler);

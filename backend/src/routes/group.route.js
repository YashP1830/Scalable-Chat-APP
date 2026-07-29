import express from "express";
import {
  createGroup,
  getMyGroups,
  getGroupById,
  getGroupMessages,
  sendGroupMessage,
  addMember,
} from "../controllers/group.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";
import { arcjetProtection } from "../middleware/arcjet.middleware.js";

const router = express.Router();

router.use(arcjetProtection, protectRoute);

router.post("/", createGroup);
router.get("/", getMyGroups);
router.get("/:id", getGroupById);
router.get("/:id/messages", getGroupMessages);
router.post("/:id/send", sendGroupMessage);
router.post("/:id/members", addMember);

export default router;

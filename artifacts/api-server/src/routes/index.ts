import { Router, type IRouter } from "express";
import healthRouter from "./health";
import conversationsRouter from "./conversations";
import subscriptionsRouter from "./subscriptions";
import telegramRouter from "./telegram";

const router: IRouter = Router();

router.use(healthRouter);
router.use(conversationsRouter);
router.use(subscriptionsRouter);
router.use(telegramRouter);

export default router;

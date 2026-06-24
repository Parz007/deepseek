import { Router, type IRouter } from "express";
import healthRouter from "./health";
import adminRouter from "./admin";
import conversationsRouter from "./conversations";
import subscriptionsRouter from "./subscriptions";
import telegramRouter from "./telegram";
import imageRouter from "./image";
import shareRouter from "./share";          // NEW

const router: IRouter = Router();

router.use(healthRouter);
router.use(adminRouter);
router.use(conversationsRouter);
router.use(subscriptionsRouter);
router.use(telegramRouter);
router.use(imageRouter);
router.use(shareRouter);                    // NEW

export default router;

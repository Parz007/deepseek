import { Router, type IRouter } from "express";
import healthRouter from "./health";
import openrouterRouter from "./openrouter";

const router: IRouter = Router();

router.use(healthRouter);
router.use(openrouterRouter);

export default router;

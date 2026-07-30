import { Router } from "express";
import healthRouter from "./health";
import userRouter from "./user";
import analysesRouter from "./analyses";
import uploadRouter from "./upload";
import paymentsRouter from "./payments";

const router = Router();

router.use(healthRouter);
router.use(userRouter);
router.use(analysesRouter);
router.use(uploadRouter);
router.use(paymentsRouter);

export default router;

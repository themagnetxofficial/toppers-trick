import { Router } from "express";
import healthRouter from "./health";
import userRouter from "./user";
import analysesRouter from "./analyses";
import uploadRouter from "./upload";
import paymentsRouter from "./payments";
import contactRouter from "./contact";
import adminRouter from "./admin";
import blogPublicRouter from "./blog-public";

const router = Router();

router.use(healthRouter);
router.use(userRouter);
router.use(analysesRouter);
router.use(uploadRouter);
router.use(paymentsRouter);
router.use(contactRouter);
router.use(blogPublicRouter);
router.use(adminRouter);

export default router;

import { Router } from "express";
import { swap } from "../controller/meteora.controller";

const meteoraRouter = Router();

meteoraRouter.post("/swap", swap);

export default meteoraRouter;
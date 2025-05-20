import { Router } from "express";
import { swapAmm } from "../controller/raydium.controller";

const raydiumRouter = Router();

raydiumRouter.post("/swapAmm", swapAmm);

export default raydiumRouter;
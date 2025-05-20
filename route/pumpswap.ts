import { Router } from "express";
import { swap } from "../controller/pumpswap.controller";

const pumpswapRouter = Router();

pumpswapRouter.post("/swap", swap);

export default pumpswapRouter;
import { Router } from "express";
import { swap } from "../controller/pumpfun.controller";

const pumpfunRouter = Router();

pumpfunRouter.post("/swap", swap);

export default pumpfunRouter;
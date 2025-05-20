import { Router } from "express";
import { solTransfer } from "../controller/transfer.controller";

const transferRouter = Router();

transferRouter.post("/sol-wsol", solTransfer);

export default transferRouter;
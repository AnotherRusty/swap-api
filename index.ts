import express, { Request, Response } from "express";
const app = express();

import dotenv from "dotenv"
dotenv.config()
const port = process.env.PORT || 5001;

import bodyParser from "body-parser";
import raydiumRouter from "./route/raydium";
import pumpfunRouter from "./route/pumpfun";
import pumpswapRouter from "./route/pumpswap";
import meteoraRouter from "./route/meteora";
import transferRouter from "./route/transfer";


app.get("/", async (req, res) => {
    res.json("Success!!");
  });

app.use(bodyParser.json());
app.use(express.json());
app.use(express.urlencoded({extended: true}));

app.use("/raydium", raydiumRouter);
app.use("/pumpfun", pumpfunRouter);
app.use("/pumpswap", pumpswapRouter);
app.use("/meteora", meteoraRouter);
app.use("/transfer", transferRouter);

const start = async () => {
    try {
        // only connect to server if successfully-connected to DB
        app.listen(port, () =>
            console.log(`Server is listening on http://localhost:${port}`)
        );
    } catch (error) {
        console.log(error);
    }
};
start();


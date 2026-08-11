import { NextFunction, Request, Response } from "express";
import { AnyZodObject, ZodError } from "zod";

export function validateBody(schema: AnyZodObject) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        return res.status(400).json({ error: "Datos inválidos.", details: err.flatten() });
      }
      next(err);
    }
  };
}

export function validateQuery(schema: AnyZodObject) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      req.query = schema.parse(req.query) as unknown as Request["query"];
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        return res.status(400).json({ error: "Parámetros inválidos.", details: err.flatten() });
      }
      next(err);
    }
  };
}

import express from "express";

declare global {
  namespace Express {
    export interface Request {
      decoded?: Record<string, any>;
    }
  }
}

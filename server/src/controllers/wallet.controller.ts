import { Response } from "express";
import { Prisma } from "@prisma/client";
import prisma from "../config/prisma";
import { AuthenticatedRequest } from "../middleware/auth.middleware";
import { businessRules } from "../config/business-rules";

export async function getBalance(req: AuthenticatedRequest, res: Response) {
  const userId = req.userId as string;

  const user = await prisma.user.findUnique({ where: { id: userId } });

  if (!user) {
    return res.status(404).json({
      success: false,
      error: "USER_NOT_FOUND",
      message: "Authenticated user no longer exists.",
    });
  }

  return res.status(200).json({
    success: true,
    data: {
      userId: user.id,
      email: user.email,
      balance: user.balance,
      currency: businessRules.currencyCode,
    },
  });
}

export async function transfer(req: AuthenticatedRequest, res: Response) {
  const senderId = req.userId as string;
  const { receiverId, amount } = req.body;

  if (!receiverId || typeof receiverId !== "string") {
    return res.status(400).json({
      success: false,
      error: "MISSING_RECEIVER",
      message: "'receiverId' is required.",
    });
  }

  if (typeof amount !== "number" || Number.isNaN(amount)) {
    return res.status(400).json({
      success: false,
      error: "INVALID_AMOUNT",
      message: "'amount' must be a valid number.",
    });
  }

  if (amount < businessRules.minTransferAmount) {
    return res.status(400).json({
      success: false,
      error: "INVALID_AMOUNT",
      message: `Transfer amount must be at least ${businessRules.minTransferAmount}.`,
    });
  }

  if (senderId === receiverId && !businessRules.allowSelfTransfer) {
    return res.status(400).json({
      success: false,
      error: "SELF_TRANSFER_NOT_ALLOWED",
      message: "Sender and receiver cannot be the same account.",
    });
  }

  try {
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const sender = await tx.user.findUnique({ where: { id: senderId } });
      const receiver = await tx.user.findUnique({ where: { id: receiverId } });

      if (!receiver) {
        throw new AppError(404, "RECEIVER_NOT_FOUND", "Receiver account does not exist.");
      }

      if (!sender) {
        throw new AppError(404, "SENDER_NOT_FOUND", "Sender account does not exist.");
      }

      if (sender.balance < amount) {
        throw new AppError(
          400,
          "INSUFFICIENT_BALANCE",
          `Insufficient balance. Available: ${sender.balance}, requested: ${amount}.`
        );
      }

      const updatedSender = await tx.user.update({
        where: { id: senderId },
        data: { balance: { decrement: amount } },
      });

      const updatedReceiver = await tx.user.update({
        where: { id: receiverId },
        data: { balance: { increment: amount } },
      });

      const transaction = await tx.transaction.create({
        data: {
          senderId,
          receiverId,
          amount,
          status: "SUCCESS",
        },
      });

      return { updatedSender, updatedReceiver, transaction };
    });

    return res.status(200).json({
      success: true,
      data: {
        transactionId: result.transaction.id,
        senderBalance: result.updatedSender.balance,
        receiverBalance: result.updatedReceiver.balance,
        currency: businessRules.currencyCode,
        status: result.transaction.status,
        createdAt: result.transaction.createdAt,
      },
    });
  } catch (err) {
    if (err instanceof AppError) {
      return res.status(err.statusCode).json({
        success: false,
        error: err.code,
        message: err.message,
      });
    }

    console.error("Unexpected transfer error:", err);
    return res.status(500).json({
      success: false,
      error: "INTERNAL_ERROR",
      message: "An unexpected error occurred while processing the transfer.",
    });
  }
}

class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string
  ) {
    super(message);
    this.name = "AppError";
  }
}

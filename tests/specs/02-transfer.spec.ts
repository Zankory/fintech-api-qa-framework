import { test, expect } from "@playwright/test";
import { faker } from "@faker-js/faker";
import { WalletService } from "../services/wallet.service";
import { loginAsPrimary, loginAsSecondary } from "../helpers/auth.helper";

test.describe("Wallet - Transfer Happy Path", () => {
  test("transfers a valid amount and updates both balances correctly", async ({ request }) => {
    const walletService = new WalletService(request);
    const sender = await loginAsPrimary(request);
    const receiver = await loginAsSecondary(request);

    const senderBalanceBefore = await walletService.getBalance(sender.token);
    const senderBalanceBeforeBody = await senderBalanceBefore.json();

    const receiverBalanceBefore = await walletService.getBalance(receiver.token);
    const receiverBalanceBeforeBody = await receiverBalanceBefore.json();

    const transferAmount = 50;

    const transferResponse = await walletService.transfer(sender.token, {
      receiverId: receiver.userId,
      amount: transferAmount,
    });
    const transferBody = await transferResponse.json();

    expect(transferResponse.status()).toBe(200);
    expect(transferBody.success).toBe(true);
    expect(transferBody.data.status).toBe("SUCCESS");
    expect(transferBody.data.senderBalance).toBe(
      senderBalanceBeforeBody.data.balance - transferAmount
    );
    expect(transferBody.data.receiverBalance).toBe(
      receiverBalanceBeforeBody.data.balance + transferAmount
    );

    const senderBalanceAfter = await walletService.getBalance(sender.token);
    const senderBalanceAfterBody = await senderBalanceAfter.json();

    const receiverBalanceAfter = await walletService.getBalance(receiver.token);
    const receiverBalanceAfterBody = await receiverBalanceAfter.json();

    expect(senderBalanceAfterBody.data.balance).toBe(
      senderBalanceBeforeBody.data.balance - transferAmount
    );
    expect(receiverBalanceAfterBody.data.balance).toBe(
      receiverBalanceBeforeBody.data.balance + transferAmount
    );
  });

  test("transfers the exact available balance leaving zero remaining", async ({ request }) => {
    const walletService = new WalletService(request);
    const sender = await loginAsPrimary(request);
    const receiver = await loginAsSecondary(request);

    const senderBalanceBefore = await walletService.getBalance(sender.token);
    const senderBalanceBeforeBody = await senderBalanceBefore.json();
    const fullBalance = senderBalanceBeforeBody.data.balance;

    const transferResponse = await walletService.transfer(sender.token, {
      receiverId: receiver.userId,
      amount: fullBalance,
    });
    const transferBody = await transferResponse.json();

    expect(transferResponse.status()).toBe(200);
    expect(transferBody.data.senderBalance).toBe(0);

    const senderBalanceAfter = await walletService.getBalance(sender.token);
    const senderBalanceAfterBody = await senderBalanceAfter.json();

    expect(senderBalanceAfterBody.data.balance).toBe(0);

    const refundResponse = await walletService.transfer(receiver.token, {
      receiverId: sender.userId,
      amount: fullBalance,
    });
    expect(refundResponse.status()).toBe(200);
  });

  test("transfers a random valid amount within the sender's balance and keeps totals conserved", async ({ request }) => {
    const walletService = new WalletService(request);
    const sender = await loginAsPrimary(request);
    const receiver = await loginAsSecondary(request);

    const senderBalanceBefore = await walletService.getBalance(sender.token);
    const senderBalanceBeforeBody = await senderBalanceBefore.json();

    const receiverBalanceBefore = await walletService.getBalance(receiver.token);
    const receiverBalanceBeforeBody = await receiverBalanceBefore.json();

    const totalBefore = senderBalanceBeforeBody.data.balance + receiverBalanceBeforeBody.data.balance;

    const randomAmount = faker.number.int({
      min: 1,
      max: Math.max(1, Math.floor(senderBalanceBeforeBody.data.balance)),
    });

    const transferResponse = await walletService.transfer(sender.token, {
      receiverId: receiver.userId,
      amount: randomAmount,
    });
    const transferBody = await transferResponse.json();

    expect(transferResponse.status()).toBe(200);
    expect(transferBody.data.senderBalance).toBe(
      senderBalanceBeforeBody.data.balance - randomAmount
    );
    expect(transferBody.data.receiverBalance).toBe(
      receiverBalanceBeforeBody.data.balance + randomAmount
    );

    const totalAfter = transferBody.data.senderBalance + transferBody.data.receiverBalance;
    expect(totalAfter).toBe(totalBefore);
  });
});

test.describe("Wallet - Transfer Edge Cases", () => {
  test("rejects a transfer with a negative amount", async ({ request }) => {
    const walletService = new WalletService(request);
    const sender = await loginAsPrimary(request);
    const receiver = await loginAsSecondary(request);

    const response = await walletService.transfer(sender.token, {
      receiverId: receiver.userId,
      amount: -50,
    });
    const body = await response.json();

    expect(response.status()).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toBe("INVALID_AMOUNT");
  });

  test("rejects a transfer with a zero amount", async ({ request }) => {
    const walletService = new WalletService(request);
    const sender = await loginAsPrimary(request);
    const receiver = await loginAsSecondary(request);

    const response = await walletService.transfer(sender.token, {
      receiverId: receiver.userId,
      amount: 0,
    });
    const body = await response.json();

    expect(response.status()).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toBe("INVALID_AMOUNT");
  });

  test("rejects a transfer with a non numeric amount", async ({ request }) => {
    const walletService = new WalletService(request);
    const sender = await loginAsPrimary(request);
    const receiver = await loginAsSecondary(request);

    const response = await walletService.transferRaw(sender.token, {
      receiverId: receiver.userId,
      amount: "fifty",
    });
    const body = await response.json();

    expect(response.status()).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toBe("INVALID_AMOUNT");
  });

  test("rejects a transfer when the sender has insufficient balance", async ({ request }) => {
    const walletService = new WalletService(request);
    const sender = await loginAsPrimary(request);
    const receiver = await loginAsSecondary(request);

    const senderBalance = await walletService.getBalance(sender.token);
    const senderBalanceBody = await senderBalance.json();
    const excessiveAmount = senderBalanceBody.data.balance + 1000000;

    const response = await walletService.transfer(sender.token, {
      receiverId: receiver.userId,
      amount: excessiveAmount,
    });
    const body = await response.json();

    expect(response.status()).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toBe("INSUFFICIENT_BALANCE");
  });

  test("rejects a self transfer to the same account", async ({ request }) => {
    const walletService = new WalletService(request);
    const sender = await loginAsPrimary(request);

    const response = await walletService.transfer(sender.token, {
      receiverId: sender.userId,
      amount: 10,
    });
    const body = await response.json();

    expect(response.status()).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toBe("SELF_TRANSFER_NOT_ALLOWED");
  });

  test("rejects a transfer to a nonexistent receiver account", async ({ request }) => {
    const walletService = new WalletService(request);
    const sender = await loginAsPrimary(request);

    const response = await walletService.transfer(sender.token, {
      receiverId: "00000000-0000-0000-0000-000000000000",
      amount: 10,
    });
    const body = await response.json();

    expect(response.status()).toBe(404);
    expect(body.success).toBe(false);
    expect(body.error).toBe("RECEIVER_NOT_FOUND");
  });

  test("rejects a transfer with a missing receiverId field", async ({ request }) => {
    const walletService = new WalletService(request);
    const sender = await loginAsPrimary(request);

    const response = await walletService.transferRaw(sender.token, {
      amount: 10,
    });
    const body = await response.json();

    expect(response.status()).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toBe("MISSING_RECEIVER");
  });

  test("rejects a transfer with a missing amount field", async ({ request }) => {
    const walletService = new WalletService(request);
    const sender = await loginAsPrimary(request);
    const receiver = await loginAsSecondary(request);

    const response = await walletService.transferRaw(sender.token, {
      receiverId: receiver.userId,
    });
    const body = await response.json();

    expect(response.status()).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toBe("INVALID_AMOUNT");
  });

  test("rejects a transfer request without authentication", async ({ request }) => {
    const walletService = new WalletService(request);
    const receiver = await loginAsSecondary(request);

    const response = await walletService.transferWithHeaders(
      {},
      { receiverId: receiver.userId, amount: 10 }
    );
    const body = await response.json();

    expect(response.status()).toBe(401);
    expect(body.success).toBe(false);
    expect(body.error).toBe("UNAUTHORIZED");
  });

  test("does not change balances when a transfer is rejected", async ({ request }) => {
    const walletService = new WalletService(request);
    const sender = await loginAsPrimary(request);

    const balanceBefore = await walletService.getBalance(sender.token);
    const balanceBeforeBody = await balanceBefore.json();

    const rejectedResponse = await walletService.transfer(sender.token, {
      receiverId: sender.userId,
      amount: 25,
    });
    expect(rejectedResponse.status()).toBe(400);

    const balanceAfter = await walletService.getBalance(sender.token);
    const balanceAfterBody = await balanceAfter.json();

    expect(balanceAfterBody.data.balance).toBe(balanceBeforeBody.data.balance);
  });
});

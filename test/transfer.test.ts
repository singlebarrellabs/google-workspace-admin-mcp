import { OAuth2Client } from "google-auth-library";
import nock from "nock";
import { afterEach, describe, expect, it } from "vitest";
import { TransferService } from "../src/services/transfer.js";

function service(): TransferService {
  const auth = new OAuth2Client({
    clientId: "client-id.apps.googleusercontent.com",
    clientSecret: "placeholder",
  });
  auth.setCredentials({ access_token: "test-token", expiry_date: Date.now() + 3_600_000 });
  return new TransferService(auth);
}

const transfersPath = "/admin/datatransfer/v1/transfers";

afterEach(() => {
  nock.cleanAll();
});

describe("data transfers", () => {
  it("lists transfers filtered by status", async () => {
    const scope = nock("https://admin.googleapis.com")
      .get(transfersPath)
      .query((query) => {
        expect(query.status).toBe("inProgress");
        return true;
      })
      .reply(200, {
        dataTransfers: [
          {
            id: "t1",
            oldOwnerUserId: "old@example.com",
            newOwnerUserId: "new@example.com",
            overallTransferStatusCode: "inProgress",
            applicationDataTransfers: [
              {
                applicationId: "mail",
                applicationTransferStatus: "inProgress",
                applicationTransferParams: [{ key: "transfer_mail", value: ["true"] }],
              },
            ],
          },
        ],
        nextPageToken: "page-2",
      });

    const result = await service().listTransfers({ status: "inProgress" });

    expect(scope.isDone()).toBe(true);
    expect(result.items[0]).toEqual({
      id: "t1",
      oldOwnerUserId: "old@example.com",
      newOwnerUserId: "new@example.com",
      overallTransferStatusCode: "inProgress",
      applications: [
        {
          applicationId: "mail",
          status: "inProgress",
          params: { transfer_mail: ["true"] },
        },
      ],
    });
    expect(result.nextPageToken).toBe("page-2");
  });

  it("gets one transfer with per-application status", async () => {
    nock("https://admin.googleapis.com")
      .get(`${transfersPath}/t1`)
      .query(true)
      .reply(200, {
        id: "t1",
        overallTransferStatusCode: "completed",
        applicationDataTransfers: [
          { applicationId: "mail", applicationTransferStatus: "completed" },
          { applicationId: "drive", applicationTransferStatus: "failed" },
        ],
      });

    const transfer = await service().getTransfer("t1");

    expect(transfer.overallTransferStatusCode).toBe("completed");
    expect(transfer.applications).toEqual([
      { applicationId: "mail", status: "completed" },
      { applicationId: "drive", status: "failed" },
    ]);
  });

  it("builds the insert body from the requested applications", async () => {
    const scope = nock("https://admin.googleapis.com")
      .post(transfersPath, {
        oldOwnerUserId: "old@example.com",
        newOwnerUserId: "new@example.com",
        applicationDataTransfers: [
          {
            applicationId: "mail",
            applicationTransferParams: [{ key: "transfer_mail", value: ["true"] }],
          },
          { applicationId: "calendar" },
        ],
      })
      .query(true)
      .reply(200, { id: "t2", overallTransferStatusCode: "inProgress" });

    const transfer = await service().insertTransfer({
      oldOwnerUserId: "old@example.com",
      newOwnerUserId: "new@example.com",
      applications: [
        { applicationId: "mail", parameters: { transfer_mail: ["true"] } },
        { applicationId: "calendar" },
      ],
    });

    expect(scope.isDone()).toBe(true);
    expect(transfer.id).toBe("t2");
  });

  it("maps a 400 for an invalid old owner to invalid_request", async () => {
    nock("https://admin.googleapis.com")
      .post(transfersPath)
      .query(true)
      .reply(400, {
        error: { code: 400, message: "Invalid old owner user id." },
      });

    await expect(
      service().insertTransfer({
        oldOwnerUserId: "not-a-user",
        newOwnerUserId: "new@example.com",
        applications: [{ applicationId: "mail" }],
      }),
    ).rejects.toMatchObject({ category: "invalid_request" });
  });

  it("maps a 404 on get to not_found", async () => {
    nock("https://admin.googleapis.com")
      .get(`${transfersPath}/missing`)
      .query(true)
      .reply(404, { error: { code: 404, message: "Transfer not found" } });

    await expect(service().getTransfer("missing")).rejects.toMatchObject({
      category: "not_found",
    });
  });
});
